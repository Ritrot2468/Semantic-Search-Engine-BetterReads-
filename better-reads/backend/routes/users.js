import express from 'express';
import Users from '../model/users.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();
import mongoose from "mongoose";
import axios from 'axios';
import {isStrongPassword, isValidUsername} from "./utils.js";
import { userValidationRules, validateRequest, sanitizeInput, paramValidation } from '../middleware/validators.js';
import { param } from 'express-validator';
import crypto from 'crypto';
import { protect } from '../middleware/authentification.js';
import { storeInRedis, getFromRedis, deleteFromRedis } from '../services/redisClient.js';
import { getRecommendations } from '../services/recommendations.js';


const router = express.Router();
const isProd = process.env.NODE_ENV === 'production';
//TODO: add pagination?
// GET all users (for admin/testing)
router.get('/', protect, async (req, res) => {
    try {
        const users = await Users.find().select('-password'); // Exclude passwords
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch users', details: err.message });
    }
});

/// PUBLIC endpoint routes

// GET /users/:id - get public profile by username (safe fields only)
router.get('/get-user/:username', param('username').customSanitizer(sanitizeInput), validateRequest, async (req, res) => {
    try {
        const user = await Users.findOne({ username: req.params.username })
            .select('username avatarUrl favoriteGenres join_time');
        if (!user) return res.status(404).json({ error: 'User not found' });

        res.json(user);
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve user', details: err.message });
    }
});

// POST /signup - register new user
router.post('/signup', userValidationRules.signup, validateRequest, async (req, res) => {
    try {
        const { username, password, avatarUrl, favoriteGenres, wishList } = req.body;
        if (!username || !password || !favoriteGenres ) return res.status(400).json({ error: 'Username and password required' });

        if (!isStrongPassword(password)) {
            return res.status(400).json({
                error: 'Password must be at least 12 characters and include uppercase, lowercase, number, and symbol.'
            });
        }

        if (!isValidUsername(username)) {
            return res.status(400).json({
                error: 'The username must be between 3 and 20 characters long and may include letters, numbers, underscores (_), periods (.), or hyphens (-).'
            });
        }
        const existing = await Users.findOne({ username });
        if (existing) return res.status(409).json({ error: 'Username already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new Users({
            username,
            password: hashedPassword,
            avatarUrl,
            favoriteGenres,
            reviews: [],
            wishList: wishList || [],
            join_time: new Date()
        });

        await newUser.save();
        const fingerprint = crypto.randomBytes(50).toString('hex');
        const fingerprintHash = crypto.createHash('sha256').update(fingerprint).digest('hex');

        const token = jwt.sign({ id: newUser._id, username, fgp: fingerprintHash }, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRY || '7d'
        });

        res.cookie(isProd ? '__Secure-Fp' : 'fp', fingerprint, {
            httpOnly: true,
            secure: isProd,       // false on localhost
            sameSite: isProd ? 'none' : 'lax', // 'none' requires secure: true
            path: '/',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
        // Update the recommender matrix to include the new user
        try {
            await axios.post(`${process.env.RECOMMENDER_URL}/update-matrix`);
            console.log('Recommender matrix updated after new user signup');
        } catch (updateError) {
            console.error('Failed to update recommender matrix:', updateError.message);
            // Don't fail the signup if matrix update fails
        }
        
        const userObject = newUser.toObject();
        delete userObject.password;
        res.status(201).json({ message: 'User created', userId: newUser._id, token, user: userObject });
    } catch (err) {
        res.status(400).json({ error: 'Failed to create user', details: err.message });
    }
});


// POST /login - basic login
router.post('/login', userValidationRules.login, validateRequest, async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

        const user = await Users.findOne({ username });
        if (!user) {
            return res.status(401).json({ error: 'This username does not exist. Please make sure username is correct and try again.' });
        }
        const match = await bcrypt.compare(password, user.password);

        if (!match ) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }
        /// Generate a secure random fingerprint and hash it
        const fingerprint = crypto.randomBytes(50).toString('hex');
        const fingerprintHash = crypto.createHash('sha256').update(fingerprint).digest('hex');
       
        // Check if this fingerprint hash is blacklisted (e.g., from a previous logout)
        const isBlacklisted = await getFromRedis(`blacklist:fp:${fingerprintHash}`);
        if (isBlacklisted) {
            // Force a new fingerprint if there's a collision
            return res.status(500).json({ error: "Security collision, try again." });
        }

        // Create JWT with user ID, username, and fingerprint hash
        const token = jwt.sign({ id: user._id, username, fgp: fingerprintHash }, process.env.JWT_SECRET, {
            expiresIn: process.env.JWT_EXPIRY
        });
        const userObject = user.toObject();
        delete userObject.password;
        
        res.cookie(isProd ? '__Secure-Fp' : 'fp', fingerprint, {
            httpOnly: true,
            secure: isProd,       // false on localhost
            sameSite: isProd ? 'none' : 'lax', // 'none' requires secure: true
            path: '/',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
        res.json({token, user: userObject});
        getRecommendations(username).catch(err => {
            console.error("Non-blocking Cache Warming Error:", err.message);
        });
    } catch (err) {
        res.status(500).json({ error: 'Login failed', details: err.message });
    }
});

// POST /logout
router.post('/logout', async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];

    // Blacklist the token
    if (token) await storeInRedis(`blacklist:token:${token}`, { status: 'revoked' }, 3600);

    // Blacklist the fingerprint
    const fp = req.cookies['__Secure-Fp'] || req.cookies['fp'];
    if (fp) {
        const fpHash = crypto.createHash('sha256').update(fp).digest('hex');
        await storeInRedis(`blacklist:fp:${fpHash}`, { status: 'revoked' }, 3600);
    }

    // Clear user-specific cache keys
    if (token) {
        try {
            const decoded = jwt.decode(token); // decode only — already blacklisted above
            if (decoded?.username) {
                const { username } = decoded;
                await Promise.all([
                    deleteFromRedis(`ml:rec:${username}:recent`),
                    deleteFromRedis(`ml:rec:${username}:favorites`),
                    deleteFromRedis(`recs:user:${username}`),
                ]);
            }
        } catch (_) { /* malformed token, skip cache clear */ }
    }

    res.clearCookie('__Secure-Fp');
    res.clearCookie('fp');
    res.status(200).json({ message: 'Logged out' });
});
// retrieve userImageURL by busername// GET /avatarUrl/:username - Retrieve avatar URL by username
router.get('/avatarUrl/:username', param('username').escape().customSanitizer(sanitizeInput), validateRequest, protect, async (req, res) => {
    try {
        const user = await Users.findOne({ username: req.params.username }).select('avatarUrl');

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json( user.avatarUrl );
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch avatar URL', details: err.message });
    }
});


//// private endpoints

// Get user details by ID or username
router.get('/details/:identifier', param('identifier').customSanitizer(sanitizeInput), validateRequest, protect, async (req, res) => {
    try {
        const { identifier } = req.params;
        let user;

        // Check if the identifier is a valid MongoDB ObjectId
        if (mongoose.Types.ObjectId.isValid(identifier)) {
            user = await Users.findById(identifier);
        } else {
            // If not a valid ID, assume it's a username
            user = await Users.findOne({ username: identifier });
        }

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Return essential, non-sensitive user data
        res.json({
            id: user._id,
            username: user.username,
            avatarUrl: user.avatarUrl
        });
    } catch (err) {
        res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// GET /users/:id - get profile
router.get('/:userId', paramValidation.userId, validateRequest, protect, async (req, res) => {
    try {
        if (req.user.id !== req.params.userId) {
            return res.status(403).json({ error: 'Forbidden: You can only access your own profile' });
        }

        const user = await Users.findById(req.params.userId).select('-password');
        if (!user) return res.status(404).json({ error: 'User not found' });

        res.json(user);
    } catch (err) {
        res.status(500).json({ error: 'Failed to retrieve user', details: err.message });
    }
});


router.post('/change-password', protect, async (req, res) => {
    try {
        const { username, currentPassword, newPassword } = req.body;

        if (!username || !currentPassword || !newPassword) {
            return res.status(400).json({
                error: 'Username, current password, and new password are required.'
            });
        }

        const user = await Users.findOne({ username });
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        if (!isStrongPassword(newPassword)) {
            return res.status(400).json({
                error: 'Password must be at least 12 characters and include uppercase, lowercase, number, and symbol.'
            });
        }

        if (currentPassword === newPassword) {
            return res.status(400).json({
                error: 'New password must be different from the current password.'
            });
        }

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Current password is incorrect.' });
        }


        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        user.password = hashedNewPassword;
        await user.save();

        res.json({ message: 'Password updated successfully.' });
    } catch (err) {
        console.error('Password change error:', err.message);
        res.status(500).json({ error: 'Failed to change password', details: err.message });
    }
});

// PUT /users/:id/genres/add-multiple
router.put('/:userId/genres/add-multiple', paramValidation.userId, validateRequest, protect, async (req, res) => {
    try {
        if (req.user.id !== req.params.userId) {
            return res.status(403).json({ error: 'Forbidden: You can only update your own genres' });
        }

        const { genres } = req.body;

        if (!Array.isArray(genres) || genres.length === 0) {
            return res.status(400).json({ error: 'An array of genres is required' });
        }

        const updated = await Users.findByIdAndUpdate(
            req.params.userId,
            { $addToSet: { favoriteGenres: { $each: genres } } },
            { new: true }
        );

        if (!updated) return res.status(404).json({ error: 'User not found' });
        const updatedSafe = updated.toObject();
        delete updatedSafe.password;
        res.json(updatedSafe);
    } catch (err) {
        res.status(400).json({ error: 'Failed to add genres', details: err.message });
    }
});

// PUT /users/:id - update a total user
router.put('/:userId', paramValidation.userId, validateRequest, protect, async (req, res) => {
    try {
        if (req.user.id !== req.params.userId) {
            return res.status(403).json({ error: 'Forbidden: You can only update your own account' });
        }

        // Whitelist updatable fields to avoid mass assignment
        const { avatarUrl, favoriteGenres } = req.body;
        const update = {};
        if (avatarUrl !== undefined) update.avatarUrl = avatarUrl;
        if (favoriteGenres !== undefined) update.favoriteGenres = favoriteGenres;

        const updated = await Users.findByIdAndUpdate(req.params.userId, update, { new: true });
        if (!updated) return res.status(404).json({ error: 'User not found' });

        const updatedSafe = updated.toObject();
        delete updatedSafe.password;
        res.json(updatedSafe);
    } catch (err) {
        res.status(400).json({ error: 'Failed to update user', details: err.message });
    }
});

// PATCH /users/update-wishlist/:id
router.patch('/update-wishlist/:userId', [paramValidation.userId, ...userValidationRules.addToBooklist], validateRequest, protect, async (req, res) => {
    try {
        if (req.user.id !== req.params.userId) {
            return res.status(403).json({ error: 'Forbidden: You can only update your own wishlist' });
        }

        const { bookId, operation } = req.body;
        if (!['add', 'remove'].includes(operation)) {
            return res.status(400).json({ error: 'Invalid operation' });
        }

        const user = await Users.findById(req.params.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const exists = user.wishList.some(id => id.toString() === bookId.toString());

        if (operation === 'add' && !exists) {
            user.wishList.push(bookId);
        }

        if (operation === 'remove' && exists) {
            user.wishList = user.wishList.filter(id => id.toString() !== bookId.toString());
        }

        await user.save();
        const userSafe = user.toObject();
        delete userSafe.password;
        res.json(userSafe);

        // Update favorites cache after response
        try {
            const favIds = user.wishList.map(id => id.toString());
            await storeInRedis(`ml:rec:${req.user.username}:favorites`, favIds, 604800); // 7 days
        } catch (_) { /* non-blocking */ }
    } catch (err) {
        res.status(400).json({ error: 'Failed to update wishlist', details: err.message });
    }
});


// ─── Reading Status ──────────────────────────────────────────────────────────

// GET /users/:userId/reading-status — return all book statuses for this user
router.get('/:userId/reading-status', paramValidation.userId, validateRequest, protect, async (req, res) => {
    try {
        if (req.user.id !== req.params.userId) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const user = await Users.findById(req.params.userId).select('readingStatus');
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user.readingStatus);
    } catch (err) {
        res.status(500).json({ error: 'Failed to get reading status', details: err.message });
    }
});

// PUT /users/:userId/reading-status — set or remove a book's reading status
// body: { bookId, status } — omit or null status to remove the entry
router.put('/:userId/reading-status', paramValidation.userId, validateRequest, protect, async (req, res) => {
    try {
        if (req.user.id !== req.params.userId) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const { bookId, status } = req.body;
        if (!bookId) return res.status(400).json({ error: 'bookId is required' });

        const validStatuses = ['want_to_read', 'reading', 'have_read'];
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({ error: 'Invalid status', valid: validStatuses });
        }

        const user = await Users.findById(req.params.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Remove existing entry for this book (if any)
        user.readingStatus = user.readingStatus.filter(
            entry => entry.bookId.toString() !== bookId.toString()
        );

        // Add new entry only if a status was provided
        if (status) {
            user.readingStatus.push({ bookId, status });
        }

        await user.save();
        res.json(user.readingStatus);
    } catch (err) {
        res.status(400).json({ error: 'Failed to update reading status', details: err.message });
    }
});

// ─── Custom Lists ─────────────────────────────────────────────────────────────

// POST /users/:userId/lists — create a new custom list
// body: { name }
router.post('/:userId/lists', paramValidation.userId, validateRequest, protect, async (req, res) => {
    try {
        if (req.user.id !== req.params.userId) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const { name } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: 'List name is required' });

        const user = await Users.findById(req.params.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.customLists.push({ name: name.trim(), books: [] });
        await user.save();

        res.status(201).json(user.customLists);
    } catch (err) {
        res.status(400).json({ error: 'Failed to create list', details: err.message });
    }
});

// PATCH /users/:userId/lists/:listId — add or remove a book from a custom list
// body: { bookId, operation: "add" | "remove" }
router.patch('/:userId/lists/:listId', paramValidation.userId, validateRequest, protect, async (req, res) => {
    try {
        if (req.user.id !== req.params.userId) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const { bookId, operation } = req.body;
        if (!bookId) return res.status(400).json({ error: 'bookId is required' });
        if (!['add', 'remove'].includes(operation)) {
            return res.status(400).json({ error: 'operation must be "add" or "remove"' });
        }

        const user = await Users.findById(req.params.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const list = user.customLists.id(req.params.listId);
        if (!list) return res.status(404).json({ error: 'List not found' });

        const alreadyIn = list.books.some(id => id.toString() === bookId.toString());
        if (operation === 'add' && !alreadyIn) {
            list.books.push(bookId);
        } else if (operation === 'remove') {
            list.books = list.books.filter(id => id.toString() !== bookId.toString());
        }

        await user.save();
        res.json(list);
    } catch (err) {
        res.status(400).json({ error: 'Failed to update list', details: err.message });
    }
});

// DELETE /users/:userId/lists/:listId — delete a custom list
router.delete('/:userId/lists/:listId', paramValidation.userId, validateRequest, protect, async (req, res) => {
    try {
        if (req.user.id !== req.params.userId) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        const user = await Users.findById(req.params.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const list = user.customLists.id(req.params.listId);
        if (!list) return res.status(404).json({ error: 'List not found' });

        list.deleteOne();
        await user.save();
        res.json(user.customLists);
    } catch (err) {
        res.status(400).json({ error: 'Failed to delete list', details: err.message });
    }
});

// DELETE /users/:id - delete user (optional/admin)
router.delete('/:userId', paramValidation.userId, validateRequest, protect, async (req, res) => {
    try {
        if (req.user.id !== req.params.userId) {
            return res.status(403).json({ error: 'Forbidden: You can only delete your own account' });
        }

        const deleted = await Users.findByIdAndDelete(req.params.userId);
        if (!deleted) return res.status(404).json({ error: 'User not found' });

        res.status(204).send();
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete user', details: err.message });
    }
});

export default router;
