/**
 * Project Gutenberg source — uses the Gutendex REST API (no scraping)
 * Generates ISBN: PG-{gutenbergId}
 */

const API_BASE = 'https://gutendex.com/books/';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function normalizeAuthor(a) {
    if (!a?.name) return 'Unknown';
    if (a.name.includes(',')) {
        const [last, first] = a.name.split(',', 2);
        return `${first.trim()} ${last.trim()}`;
    }
    return a.name;
}

function extractGenres(subjects = []) {
    const genres = [];
    for (const s of subjects.slice(0, 8)) {
        const clean = s.split('--')[0].split('(')[0].trim();
        if (clean && clean.length < 40) genres.push(clean);
    }
    return [...new Set(genres)].slice(0, 5);
}

export function transform(book) {
    const authors = book.authors || [];
    const author  = authors.length ? normalizeAuthor(authors[0]) : 'Unknown';
    const formats = book.formats || {};
    const image   = formats['image/jpeg'] ||
                    `https://www.gutenberg.org/cache/epub/${book.id}/pg${book.id}.cover.medium.jpg`;
    const genres  = extractGenres(book.subjects);
    const birth   = authors[0]?.birth_year;
    const publishYear = birth ? birth + 35 : 1900;

    return {
        ISBN: `PG-${book.id}`,
        title: book.title,
        author,
        description: `A classic public domain work from Project Gutenberg (circa ${publishYear}).`,
        genre: genres.length ? genres : ['Classic', 'Literature'],
        image,
        publishYear,
        averageRating: 0,
        ratingsCount: book.download_count || 0,
        numberOfEditions: 1,
        reviewCount: 0,
        source: 'gutenberg',
        sourceUrl: `https://www.gutenberg.org/ebooks/${book.id}`,
    };
}

async function fetchPage(page) {
    const res = await fetch(`${API_BASE}?languages=en&page=${page}`, {
        signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) { console.warn(`    [WARN] Gutendex ${res.status} page ${page}`); return null; }
    return res.json();
}

export async function fetchAll(pages = 5) {
    const results = [];
    for (let page = 1; page <= pages; page++) {
        console.log(`    Fetching Gutendex page ${page}/${pages}…`);
        const data = await fetchPage(page);
        if (!data?.results) break;
        const books = data.results.filter(b => b.title && b.authors?.length).map(transform);
        results.push(...books);
        console.log(`    Got ${books.length} books`);
        if (!data.next) break;
        await sleep(500);
    }
    return results;
}
