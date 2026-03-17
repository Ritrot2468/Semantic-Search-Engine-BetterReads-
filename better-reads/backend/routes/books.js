import express from 'express';
import mongoose from 'mongoose';
import Books from '../model/books.js';
import Reviews from '../model/reviews.js';
import Users from "../model/users.js";
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { protect } from '../middleware/authentification.js';
import { validateRequest, queryValidation, paramValidation, reviewValidationRules } from '../middleware/validators.js';
import { getFromRedis, storeInRedis, deleteFromRedis } from '../services/redisClient.js';
const router = express.Router();
import { handleGenreSearch } from '../services/bookService.js';

// Recalculate a book's averageRating, ratingsCount, and reviewCount from live review data.
async function recalcBookRating(bookId) {
    const result = await Reviews.aggregate([
        { $match: { bookId: new mongoose.Types.ObjectId(bookId) } },
        { $group: { _id: '$bookId', avg: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);
    const avg = result[0]?.avg ?? 0;
    const count = result[0]?.count ?? 0;
    await Books.findByIdAndUpdate(bookId, {
        averageRating: Math.round(avg * 10) / 10,
        ratingsCount: count,
        reviewCount: count
    });
}

/////// public routes (ALL GET endpoints) ////

// retrieve books via a generic main.py query
router.get('/search', queryValidation.search, validateRequest, async (req, res) => {
    try {
        const { q } = req.query;
        let query = {};

        if (q && q.trim() !== "") {
            // Search across title, author, and description fields
            query = {
                $or: [
                    { title: { $regex: q, $options: 'i' } },
                    { author: { $regex: q, $options: 'i' } },
                    { description: { $regex: q, $options: 'i' } }
                ]
            };
        }

        const books = await Books.find(query);
        res.json(books);
    } catch (err) {
        res.status(500).json({ error: 'Search failed', details: err.message });
    }
});

// GET /books/genres - Get all genre tags in db
router.get('/genre-tags', async (req, res) => {
    try {
        const cached = await getFromRedis('general:genre-tags');
        if (cached) return res.json(cached);

        const genres = await Books.aggregate([
            { $unwind: '$genre' },
            { $group: { _id: '$genre' } },
            { $sort: { _id: 1 } }
        ]);

        const payload = { genres: genres.map(g => g._id) };
        await storeInRedis('general:genre-tags', payload, 86400); // 24h
        res.json(payload);
    } catch (err) {
        console.error('Failed to fetch genres:', err.message);
        res.status(500).json({ error: 'Failed to fetch genres', details: err.message });
    }
});

router.get('/genre-search', queryValidation.search, validateRequest, async (req, res) => {
    try {
        const { q, genre, page, limit, min_year, max_year } = req.query;

        const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
        const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
        const skip = (parsedPage - 1) * parsedLimit;

        const query = {};

        // Text search
        if (q && q.trim()) {
            query.$or = [
                { title: { $regex: q, $options: 'i' } },
                { author: { $regex: q, $options: 'i' } },
                { description: { $regex: q, $options: 'i' } }
            ];
        }

        // Soft genre match: at least one genre matches
        if (genre) {
            const genreList = Array.isArray(genre)
                ? genre
                : genre.split(',').map((g) => g.trim());

            if (genreList.length > 0) {
                query.genre = { $in: genreList };
            }
        }

        // Year range filter
        if (min_year || max_year) {
            query.publishYear = {};
            if (min_year) query.publishYear.$gte = min_year;
            if (max_year) query.publishYear.$lte = max_year;
        }

        const [books, totalCount] = await Promise.all([
            Books.find(query).skip(skip).limit(parsedLimit),
            Books.countDocuments(query)
        ]);

        res.json({
            page: parsedPage,
            limit: parsedLimit,
            totalPages: Math.ceil(totalCount / parsedLimit),
            totalResults: totalCount,
            results: books
        });
    } catch (err) {
        res.status(500).json({ error: 'Search failed', details: err.message });
    }
});

router.get('/popular', async (req, res) => {
    try {
        const cached = await getFromRedis('general:popular');
        if (cached) return res.json(cached);

        const books = await Books.find().sort({ averageRating: -1 }).limit(20);
        await storeInRedis('general:popular', books, 21600); // 6h
        res.json(books);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch popular books', details: err.message });
    }
});

router.get('/search-gateway', queryValidation.search, validateRequest, async (req, res) => {
    const { q } = req.query;

    // 1. If no semantic query, use the local MongoDB Regex/Genre engine
    if (!q?.trim()) {
        try {
            return res.json(await handleGenreSearch(req.query));
        } catch (err) {
            return res.status(500).json({ error: 'Search failed', details: err.message });
        }
    }
     // 2. If semantic query exists, redirect to the NLP search microservice which will handle both semantic and genre searching
    try {
        const response = await axios.get(process.env.PYTHON_API_NLPTEXTSEARCH_URL, {
            params: req.query,
            headers: { Authorization: req.headers.authorization }
        });
        return res.json(response.data);
    } catch (err) {
        return res.status(502).json({ error: 'NLP service unavailable', details: err.message });
    }
   
});

// retrieve a book by bookId
router.get('/:bookId', paramValidation.bookId, validateRequest, async (req, res) => {
    try {
        const book = await Books.findById(req.params.bookId);
        if (!book) return res.status(404).json({ error: 'Book not found' });
        res.json(book);

        // Soft-auth: track recently viewed books without blocking response
        const token = req.headers.authorization?.split(' ')[1];
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const recentKey = `ml:rec:${decoded.username}:recent`;
                const recent = (await getFromRedis(recentKey)) || [];
                const bookIdStr = book._id.toString();
                const updated = [bookIdStr, ...recent.filter(id => id !== bookIdStr)].slice(0, 20);
                await storeInRedis(recentKey, updated, 604800); // 7 days
            } catch (_) { /* invalid/expired token, skip */ }
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch book', details: err.message });
    }
});

// GET /books/:id/reviews - Get all reviews for a book
router.get('/:bookId/reviews', async (req, res) => {
    try {
        const { bookId: bookId } = req.params;
        const reviews = await Reviews.find({ bookId }).populate('userId', 'username avatarUrl').sort({ createdAt: -1 });
        res.json(reviews);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch reviews', details: err.message });
    }
});

//////////// POST endpoints ///////////

// POST /books/:id/reviews - Create or update a review for a book
router.post('/:bookId/reviews', protect, [paramValidation.bookId, ...reviewValidationRules.create], validateRequest, async (req, res) => {
    try {
        const { bookId } = req.params;
        const { rating, description } = req.body;
        const username = req.user.username;

        const user = await Users.findOne({ username });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        const userId = user._id;

        const updateFields = {};
        if (rating !== undefined) updateFields.rating = rating;
        if (description !== undefined) updateFields.description = description;

        const existingReview = !!(await Reviews.findOne({ bookId, userId}));

        if (existingReview) {
            // Update the existing review
            const updated = await Reviews.findOneAndUpdate(
                { bookId, userId},
                { ...updateFields, updatedAt: new Date() },
                { new: true, upsert: true, runValidators: true }
            ).populate('userId', 'username avatarUrl');
            
            // Recalculate book rating and update recommender matrix
            try {
                await recalcBookRating(bookId);
                await deleteFromRedis(`recs:user:${username}`);
                await deleteFromRedis(`ml:rec:${username}:recent`);
                await deleteFromRedis(`ml:rec:${username}:favorites`);
                await axios.post(`${process.env.RECOMMENDER_URL}/update-matrix`);
            } catch (updateError) {
                console.error('Failed to recalc rating or update recommender:', updateError.message);
            }

            return res.status(200).json(updated);
        }

        // Create a new review if none exists
        const newReview = new Reviews({
            bookId,
            userId,
            ...updateFields,
            createdAt: new Date(),
        });

        const savedReview = await newReview.save();

        const book = await Books.findById(bookId);
        if (!book) throw new Error('Book not found');


        //  Add review to user if not already included
        user.reviews.push(savedReview._id);
        await user.save();

        // Recalculate book rating and update recommender matrix
        try {
            await recalcBookRating(bookId);
            await deleteFromRedis(`recs:user:${username}`);
            await axios.post(`${process.env.RECOMMENDER_URL}/update-matrix`);
        } catch (updateError) {
            console.error('Failed to recalc rating or update recommender:', updateError.message);
        }
        const populatedReview = await Reviews.findById(savedReview._id).populate('userId', 'username avatarUrl');
        
        res.status(201).json(populatedReview);
    } catch (err) {
        res.status(500).json({ error: 'Failed to create or update review', details: err.message });
    }
});


// add book to wishlist
router.post('/:bookId/wishlist', protect, async (req, res) => {
    try {
        const userId = req.user.id;
        const username = req.user.username;

        const updatedUser = await Users.findByIdAndUpdate(
            userId,
            { $addToSet: { wishList: req.params.bookId } },
            { new: true }
        );

        if (!updatedUser) return res.status(404).json({ error: 'User not found' });
        res.json(updatedUser.wishList);

        // Update favorites cache after response
        try {
            const favIds = updatedUser.wishList.map(id => id.toString());
            await storeInRedis(`ml:rec:${username}:favorites`, favIds, 604800); // 7 days
        } catch (_) { /* non-blocking */ }
    } catch (err) {
        res.status(500).json({ error: 'Failed to add to wishlist', details: err.message });
    }
});

router.delete('/:bookId/wishlist', protect, async (req, res) => {
    try {
        const userId = req.user.id;
        const username = req.user.username;

        const updatedUser = await Users.findByIdAndUpdate(
            userId,
            { $pull: { wishList: req.params.bookId } },
            { new: true }
        );

        if (!updatedUser) return res.status(404).json({ error: 'User not found' });
        res.json(updatedUser.wishList);

        // Update favorites cache after response
        try {
            const favIds = updatedUser.wishList.map(id => id.toString());
            await storeInRedis(`ml:rec:${username}:favorites`, favIds, 604800); // 7 days
        } catch (_) { /* non-blocking */ }
    } catch (err) {
        res.status(500).json({ error: 'Failed to remove from wishlist', details: err.message });
    }
});
export default router;