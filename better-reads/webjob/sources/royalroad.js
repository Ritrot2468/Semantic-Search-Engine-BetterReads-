/**
 * Royal Road source — scrapes best-rated fiction list
 * Politely delays between pages. Generates ISBN: RR-{fictionId}
 */
import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.royalroad.com';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; BetterReads-Bot/1.0; +https://github.com/betterreads)',
    'Accept': 'text/html,application/xhtml+xml',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPage(page = 1) {
    const url = `${BASE_URL}/fictions/best-rated?page=${page}`;
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) { console.warn(`    [WARN] Royal Road ${res.status} on page ${page}`); return null; }
    return res.text();
}

function parseCards(html) {
    const $ = cheerio.load(html);
    const fictions = [];

    $('.fiction-list-item').each((_, el) => {
        try {
            const $el = $(el);

            const titleLink = $el.find('h2.fiction-title a').first();
            const href = titleLink.attr('href') || '';
            const idMatch = href.match(/\/fiction\/(\d+)\//);
            if (!idMatch) return;

            const fictionId = idMatch[1];
            const title = titleLink.text().trim();
            if (!title) return;

            const author = $el.find('.author a').first().text().trim() || 'Unknown';
            const image  = $el.find('img').first().attr('src') || '';

            const genres = [];
            $el.find('.tags .label, .tags .fiction-tag').each((_, t) => genres.push($(t).text().trim()));

            const descEl = $el.find('.description');
            const description = descEl.text().trim().slice(0, 1000);

            // Rating is often in a <span> with title="Score: X.XX /5.00"
            let rating = 0;
            const ratingEl = $el.find('[title*="Score:"]').first();
            if (ratingEl.length) {
                const m = (ratingEl.attr('title') || '').match(/([\d.]+)/);
                if (m) rating = Math.min(parseFloat(m[1]), 5);
            }

            fictions.push({ fictionId, title, author, image, genres: genres.slice(0, 7), description, rating });
        } catch { /* skip malformed card */ }
    });

    return fictions;
}

export function transform(f) {
    return {
        ISBN: `RR-${f.fictionId}`,
        title: f.title,
        author: f.author,
        description: f.description || 'A web novel from Royal Road.',
        genre: f.genres.length ? f.genres : ['Web Novel', 'Fantasy'],
        image: f.image || 'https://via.placeholder.com/200x300?text=No+Cover',
        publishYear: new Date().getFullYear(),
        averageRating: f.rating,
        ratingsCount: 0,
        numberOfEditions: 1,
        reviewCount: 0,
        source: 'royal_road',
        sourceUrl: `${BASE_URL}/fiction/${f.fictionId}`,
    };
}

export async function fetchAll(pages = 3) {
    const results = [];
    for (let page = 1; page <= pages; page++) {
        console.log(`    Fetching Royal Road page ${page}/${pages}…`);
        const html = await fetchPage(page);
        if (!html) break;
        const cards = parseCards(html);
        console.log(`    Parsed ${cards.length} fictions`);
        results.push(...cards.map(transform));
        if (page < pages) await sleep(2_000);
    }
    return results;
}
