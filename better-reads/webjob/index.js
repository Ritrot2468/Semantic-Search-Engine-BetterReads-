/**
 * BetterReads — Azure WebJob: Book Fetcher
 *
 * Runs on a cron schedule (see settings.job).
 * Fetches books from the Google Books API by genre, transforms them
 * to the BetterReads schema, and upserts into MongoDB by ISBN.
 *
 * Exit codes:
 *   0 — success (Azure WebJob marks run as successful)
 *   1 — fatal error (Azure WebJob marks run as failed)
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { fetchAll as fetchRoyalRoad }  from './sources/royalroad.js';
import { fetchAll as fetchScribbleHub } from './sources/scribblehub.js';
import { fetchAll as fetchGutenberg }  from './sources/gutenberg.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
    console.error('[FATAL] MONGO_URI environment variable is not set.');
    process.exit(1);
}

const API_KEY = process.env.GOOGLE_BOOKS_API_KEY || '';
const MAX_GENRES = parseInt(process.env.MAX_GENRES || '15', 10);
const PAGES_PER_GENRE = parseInt(process.env.PAGES_PER_GENRE || '5', 10);
const PAGE_SIZE = 40; // Google Books API max per request

/**
 * Genres to cycle through. Each becomes a `subject:<genre>` query.
 * Broad terms yield the most results; narrow terms add niche coverage.
 */
const GENRES = [
    'Fiction',
    'Science Fiction',
    'Fantasy',
    'Mystery',
    'Thriller',
    'Romance',
    'Horror',
    'Historical Fiction',
    'Biography',
    'History',
    'Science',
    'Self Help',
    'Young Adult',
    'Classic Literature',
    'Graphic Novels',
];

// ─── Mongoose Book Model ──────────────────────────────────────────────────────

const BookSchema = new mongoose.Schema({
    author:           { type: String, required: true },
    averageRating:    { type: Number, required: true, default: 0 },
    description:      { type: String, required: true },
    genre:            { type: [String], required: true },
    image:            { type: String, required: true },
    ISBN:             { type: String, required: true, unique: true },
    numberOfEditions: { type: Number, required: true, default: 1 },
    publishYear:      { type: Number, required: true },
    ratingsCount:     { type: Number, required: true, default: 0 },
    reviewCount:      { type: Number, required: true, default: 0 },
    title:            { type: String, required: true },
    source:           { type: String, default: 'published' },
    sourceUrl:        { type: String, default: null },
}, { timestamps: true });

BookSchema.index({ ISBN: 1 });
BookSchema.index({ title: 'text', author: 'text' });

const Book = mongoose.models.Book || mongoose.model('Book', BookSchema, 'books');

// ─── Google Books API helpers ─────────────────────────────────────────────────

/**
 * Build the Google Books API URL for a genre + page.
 */
function buildUrl(genre, page) {
    const startIndex = page * PAGE_SIZE;
    const params = new URLSearchParams({
        q: `subject:${genre}`,
        maxResults: String(PAGE_SIZE),
        startIndex: String(startIndex),
        orderBy: 'relevance',
        printType: 'books',
        langRestrict: 'en',
    });
    if (API_KEY) params.set('key', API_KEY);
    return `https://www.googleapis.com/books/v1/volumes?${params}`;
}

/**
 * Fetch one page of results for a genre. Returns an array of raw volume items.
 * Retries once on transient network errors.
 */
async function fetchPage(genre, page) {
    const url = buildUrl(genre, page);
    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const res = await fetch(url);
            if (res.status === 429) {
                console.warn(`  [WARN] Rate limited on attempt ${attempt}. Waiting 10s…`);
                await sleep(10_000);
                continue;
            }
            if (!res.ok) {
                console.warn(`  [WARN] Google Books API returned ${res.status} for genre "${genre}" page ${page}`);
                return [];
            }
            const data = await res.json();
            return data.items || [];
        } catch (err) {
            if (attempt === 2) {
                console.error(`  [ERROR] Network error fetching genre "${genre}" page ${page}:`, err.message);
                return [];
            }
            await sleep(3_000);
        }
    }
    return [];
}

// ─── Transform ────────────────────────────────────────────────────────────────

/**
 * Map a Google Books volume item to the BetterReads Book schema.
 * Returns null if any required field is missing.
 */
function transform(item) {
    const info = item?.volumeInfo;
    if (!info) return null;

    // ISBN — prefer ISBN_13, fall back to ISBN_10
    const identifiers = info.industryIdentifiers || [];
    const isbn13 = identifiers.find(i => i.type === 'ISBN_13')?.identifier;
    const isbn10 = identifiers.find(i => i.type === 'ISBN_10')?.identifier;
    const isbn = isbn13 || isbn10;

    // Required fields — skip books missing any of these
    if (!isbn)                return null;
    if (!info.title)          return null;
    if (!info.description)    return null;
    if (!info.imageLinks?.thumbnail) return null;
    if (!info.authors?.length) return null;

    // Publish year — extract 4-digit year from "2003-08-01" or "2003"
    const yearMatch = (info.publishedDate || '').match(/\d{4}/);
    if (!yearMatch) return null;
    const publishYear = parseInt(yearMatch[0], 10);

    // Clean up Google's thumbnail URL (remove edge=curl parameter for cleaner image)
    const image = info.imageLinks.thumbnail
        .replace(/&edge=curl/g, '')
        .replace(/^http:/, 'https:');

    return {
        ISBN:             isbn,
        title:            info.title.trim(),
        author:           info.authors[0].trim(),
        description:      info.description.trim(),
        genre:            info.categories || [],
        image,
        publishYear,
        averageRating:    typeof info.averageRating === 'number' ? info.averageRating : 0,
        ratingsCount:     typeof info.ratingsCount  === 'number' ? info.ratingsCount  : 0,
        numberOfEditions: 1,
        reviewCount:      0,
        source:           'published',
        sourceUrl:        null,
    };
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

/**
 * Bulk upsert a batch of transformed books into MongoDB.
 * - Updates averageRating and ratingsCount from the API (external data).
 * - Never overwrites reviewCount (managed internally).
 * - Never overwrites averageRating if internal reviews exist (reviewCount > 0).
 */
async function upsertBooks(books) {
    if (books.length === 0) return { upserted: 0, modified: 0 };

    const ops = books.map(book => ({
        updateOne: {
            filter: { ISBN: book.ISBN },
            update: {
                $setOnInsert: {
                    reviewCount: 0,
                },
                $set: {
                    title:            book.title,
                    author:           book.author,
                    description:      book.description,
                    genre:            book.genre,
                    image:            book.image,
                    publishYear:      book.publishYear,
                    numberOfEditions: book.numberOfEditions,
                    // Only sync ratings from Google if no internal reviews yet
                    // (handled via $setOnInsert + conditional in application logic,
                    //  here we always update external rating metadata)
                    ratingsCount:     book.ratingsCount,
                    source:           book.source ?? 'published',
                    sourceUrl:        book.sourceUrl ?? null,
                },
                // Only set averageRating on insert (don't overwrite user reviews)
                $setOnInsert: {
                    averageRating: book.averageRating,
                    reviewCount:   0,
                    ISBN:          book.ISBN,
                },
            },
            upsert: true,
        },
    }));

    const result = await Book.bulkWrite(ops, { ordered: false });
    return {
        upserted: result.upsertedCount,
        modified: result.modifiedCount,
    };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    const startTime = Date.now();
    console.log(`[${new Date().toISOString()}] BetterReads Book Fetcher starting…`);
    console.log(`  Genres: ${Math.min(MAX_GENRES, GENRES.length)}, Pages/genre: ${PAGES_PER_GENRE}, Books/page: ${PAGE_SIZE}`);
    console.log(`  API key: ${API_KEY ? 'set' : 'not set (1,000 req/day quota)'}`);

    // Connect to MongoDB
    console.log('\n[1/3] Connecting to MongoDB…');
    await mongoose.connect(MONGO_URI);
    console.log('  Connected.');

    // Fetch & upsert
    console.log('\n[2/3] Fetching books…');
    const genresToRun = GENRES.slice(0, MAX_GENRES);
    let totalFetched = 0, totalValid = 0, totalUpserted = 0, totalModified = 0;

    for (const genre of genresToRun) {
        console.log(`\n  Genre: "${genre}"`);
        const genreBooks = [];

        for (let page = 0; page < PAGES_PER_GENRE; page++) {
            const items = await fetchPage(genre, page);
            if (items.length === 0) break; // No more results for this genre

            const transformed = items.map(transform).filter(Boolean);
            genreBooks.push(...transformed);
            totalFetched += items.length;
            totalValid   += transformed.length;

            // Polite delay between pages to avoid rate limiting
            if (page < PAGES_PER_GENRE - 1) await sleep(300);
        }

        if (genreBooks.length > 0) {
            const { upserted, modified } = await upsertBooks(genreBooks);
            totalUpserted += upserted;
            totalModified += modified;
            console.log(`    → ${genreBooks.length} valid | ${upserted} inserted | ${modified} updated`);
        } else {
            console.log(`    → no valid books found`);
        }

        // Pause between genres to stay well within rate limits
        await sleep(500);
    }

    // ── Web novel & public domain sources ──────────────────────────────────────
    const webSources = [
        { name: 'Royal Road',     fn: () => fetchRoyalRoad(3) },
        { name: 'Scribble Hub',   fn: () => fetchScribbleHub() },
        { name: 'Project Gutenberg', fn: () => fetchGutenberg(5) },
    ];

    for (const src of webSources) {
        console.log(`\n  Source: "${src.name}"`);
        try {
            const books = await src.fn();
            if (books.length > 0) {
                const { upserted, modified } = await upsertBooks(books);
                totalUpserted += upserted;
                totalModified += modified;
                console.log(`    → ${books.length} fetched | ${upserted} inserted | ${modified} updated`);
            } else {
                console.log(`    → no books fetched`);
            }
        } catch (err) {
            console.error(`  [ERROR] ${src.name} ingestion failed:`, err.message);
        }
    }

    // Summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n[3/3] Summary');
    console.log(`  API items fetched : ${totalFetched}`);
    console.log(`  Valid after filter: ${totalValid}`);
    console.log(`  Inserted (new)   : ${totalUpserted}`);
    console.log(`  Updated (exist)  : ${totalModified}`);
    console.log(`  Duration         : ${elapsed}s`);
    console.log(`\n[${new Date().toISOString()}] Done.`);
}

run()
    .catch(err => {
        console.error('[FATAL]', err);
        process.exit(1);
    })
    .finally(() => mongoose.disconnect());
