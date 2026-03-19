/**
 * Scribble Hub source — parses top-favorites RSS feed + fetches cover images
 * Generates ISBN: SH-{seriesId}
 */
import * as cheerio from 'cheerio';

const RSS_URL  = 'https://www.scribblehub.com/rssfeed.php?type=topfave&uid=0';
const HEADERS  = {
    'User-Agent': 'Mozilla/5.0 (compatible; BetterReads-Bot/1.0; +https://github.com/betterreads)',
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function extractSeriesId(url) {
    const m = url.match(/\/series\/(\d+)\//);
    return m ? m[1] : null;
}

async function fetchRSS() {
    const res = await fetch(RSS_URL, { headers: HEADERS, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`Scribble Hub RSS ${res.status}`);
    return res.text();
}

function parseRSS(xml) {
    const $ = cheerio.load(xml, { xmlMode: true });
    const items = [];
    $('item').each((_, el) => {
        const $el = $(el);
        const title  = $el.find('title').first().text().trim();
        const link   = $el.find('link').first().text().trim() ||
                       $el.find('guid').first().text().trim();
        const desc   = cheerio.load($el.find('description').first().text())('body').text().trim().slice(0, 1000);
        const author = $el.find('dc\\:creator, creator').first().text().trim() || 'Unknown';
        const pubDate = $el.find('pubDate').first().text().trim();

        const genres = [];
        $el.find('category').each((_, c) => genres.push($(c).text().trim()));

        if (title && link) items.push({ title, link, desc, author, pubDate, genres: genres.slice(0, 6) });
    });
    return items;
}

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

export async function fetchAll() {
    console.log('    Fetching Scribble Hub RSS…');
    const xml   = await fetchRSS();
    const items = parseRSS(xml);
    console.log(`    Found ${items.length} entries`);

    const results = [];
    for (const item of items) {
        const seriesId = extractSeriesId(item.link);
        if (!seriesId) continue;
        const image = await getCover(item.link);
        const pubYear = item.pubDate ? new Date(item.pubDate).getFullYear() : new Date().getFullYear();
        results.push({
            ISBN: `SH-${seriesId}`,
            title: item.title,
            author: item.author,
            description: item.desc || 'A web novel from Scribble Hub.',
            genre: item.genres.length ? item.genres : ['Web Novel'],
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
