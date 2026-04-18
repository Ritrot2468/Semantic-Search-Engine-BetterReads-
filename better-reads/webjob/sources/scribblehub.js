/**
 * Scribble Hub source
 *
 * Strategy (in order):
 *   1. WordPress JSON API  — /wp-json/wp/v2/posts  (often Cloudflare-exempt)
 *   2. RSS feed            — rssfeed.php           (fallback)
 *
 * Scribble Hub uses Cloudflare. If both endpoints return 403 we log a clear
 * message and return [] rather than throwing, so the rest of the ingest
 * pipeline continues unaffected.
 *
 * Generates ISBN: SH-{seriesId}
 */
import * as cheerio from 'cheerio';

const BASE_URL  = 'https://www.scribblehub.com';
const WP_API    = `${BASE_URL}/wp-json/wp/v2/posts?per_page=50&orderby=date&order=desc`;
const RSS_URL   = `${BASE_URL}/rssfeed.php?type=topfave&uid=0`;

// Realistic browser headers to pass basic bot checks
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.scribblehub.com/',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function extractSeriesId(url = '') {
    const m = url.match(/\/series\/(\d+)\//);
    return m ? m[1] : null;
}

// ── WordPress JSON API ─────────────────────────────────────────────────────────

async function tryWpJson() {
    const res = await fetch(WP_API, {
        headers: { ...HEADERS, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(20_000),
    });

    if (res.status === 403 || res.status === 401) return null; // CF blocked
    if (!res.ok) throw new Error(`WP JSON API returned ${res.status}`);

    const posts = await res.json();
    if (!Array.isArray(posts) || posts.length === 0) return null;

    return posts.map(post => ({
        title:     post.title?.rendered?.replace(/&#\d+;/g, c => String.fromCharCode(parseInt(c.match(/\d+/)[0]))) || 'Unknown',
        link:      post.link || '',
        desc:      cheerio.load(post.excerpt?.rendered || '')('body').text().trim().slice(0, 1000),
        author:    'Unknown', // WP posts don't include author name without extra call
        pubDate:   post.date || '',
        genres:    [],
        image:     post.jetpack_featured_media_url || post._embedded?.['wp:featuredmedia']?.[0]?.source_url || '',
    }));
}

// ── RSS Feed ───────────────────────────────────────────────────────────────────

async function tryRSS() {
    const res = await fetch(RSS_URL, {
        headers: HEADERS,
        signal: AbortSignal.timeout(20_000),
    });

    if (res.status === 403 || res.status === 401) return null; // CF blocked
    if (!res.ok) throw new Error(`RSS feed returned ${res.status}`);

    const xml = await res.text();
    const $   = cheerio.load(xml, { xmlMode: true });
    const items = [];

    $('item').each((_, el) => {
        const $el    = $(el);
        const title  = $el.find('title').first().text().trim();
        const link   = $el.find('link').first().text().trim() || $el.find('guid').first().text().trim();
        const desc   = cheerio.load($el.find('description').first().text())('body').text().trim().slice(0, 1000);
        const author = $el.find('dc\\:creator, creator').first().text().trim() || 'Unknown';
        const pubDate = $el.find('pubDate').first().text().trim();

        const genres = [];
        $el.find('category').each((_, c) => genres.push($(c).text().trim()));

        if (title && link) items.push({ title, link, desc, author, pubDate, genres: genres.slice(0, 6), image: '' });
    });

    return items.length ? items : null;
}

// ── Cover scrape (best-effort) ─────────────────────────────────────────────────

async function getCover(url) {
    try {
        const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return '';
        const $ = cheerio.load(await res.text());
        return $('div.fic-header img').first().attr('src') ||
               $('img.lazy').first().attr('data-src') ||
               $('img[src*="scribblehub"]').first().attr('src') || '';
    } catch { return ''; }
}

// ── Main export ────────────────────────────────────────────────────────────────

export async function fetchAll() {
    // Try WP JSON API first, then RSS
    let items = null;

    console.log('    Trying Scribble Hub WP JSON API…');
    try { items = await tryWpJson(); } catch (e) { console.warn(`    WP API error: ${e.message}`); }

    if (!items) {
        console.log('    Falling back to Scribble Hub RSS…');
        try { items = await tryRSS(); } catch (e) { console.warn(`    RSS error: ${e.message}`); }
    }

    if (!items) {
        console.log('    [SKIP] Scribble Hub is Cloudflare-protected — both endpoints blocked. Skipping.');
        return [];
    }

    console.log(`    Got ${items.length} entries from Scribble Hub`);

    const results = [];
    for (const item of items) {
        const seriesId = extractSeriesId(item.link);
        if (!seriesId) continue;

        const image   = item.image || await getCover(item.link);
        const pubYear = item.pubDate ? new Date(item.pubDate).getFullYear() : new Date().getFullYear();

        results.push({
            ISBN: `SH-${seriesId}`,
            title: item.title,
            author: item.author,
            description: item.desc || 'A web novel from Scribble Hub.',
            genre: item.genres?.length ? item.genres : ['Web Novel'],
            image: image || 'https://via.placeholder.com/200x300?text=No+Cover',
            publishYear: isNaN(pubYear) ? new Date().getFullYear() : pubYear,
            averageRating: 0,
            ratingsCount: 0,
            numberOfEditions: 1,
            reviewCount: 0,
            source: 'scribble_hub',
            sourceUrl: item.link,
        });
        await sleep(1_500);
    }
    return results;
}
