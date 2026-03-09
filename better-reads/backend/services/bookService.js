import Books from '../model/books.js';
export async function handleGenreSearch(query) {
    const { genre, page, limit } = query;
    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
    const skip = (parsedPage - 1) * parsedLimit;

    const dbQuery = {};
    if (genre) {
        const genreList = Array.isArray(genre) ? genre : genre.split(',').map(g => g.trim());
        if (genreList.length > 0) dbQuery.genre = { $in: genreList };
    }

    const [books, totalCount] = await Promise.all([
        Books.find(dbQuery).skip(skip).limit(parsedLimit),
        Books.countDocuments(dbQuery)
    ]);

    return { page: parsedPage, limit: parsedLimit, totalPages: Math.ceil(totalCount / parsedLimit), totalResults: totalCount, results: books };
}
