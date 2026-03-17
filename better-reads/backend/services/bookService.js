import Books from '../model/books.js';
export async function handleGenreSearch(query) {
    const { q, genre, page, limit, min_year, max_year } = query;

    const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
    const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
    const skip = (parsedPage - 1) * parsedLimit;

    const dbQuery = {};

    // Text search
    if (q && q.trim()) {
        dbQuery.$or = [
            { title: { $regex: q, $options: 'i' } },
            { author: { $regex: q, $options: 'i' } },
            { description: { $regex: q, $options: 'i' } }
        ];
    }
    if (genre) {
        const genreList = Array.isArray(genre) ? genre : genre.split(',').map(g => g.trim());
        if (genreList.length > 0) dbQuery.genre = { $in: genreList };
    }

        // Year range filter
    if (min_year || max_year) {
        dbQuery.publishYear = {};
        if (min_year) dbQuery.publishYear.$gte = min_year;
        if (max_year) dbQuery.publishYear.$lte = max_year;
    }

    const [books, totalCount] = await Promise.all([
        Books.find(dbQuery).skip(skip).limit(parsedLimit),
        Books.countDocuments(dbQuery)
    ]);

    return { page: parsedPage, 
            limit: parsedLimit, 
            totalPages: Math.ceil(totalCount / parsedLimit), 
            totalResults: totalCount, 
            results: books };
}

