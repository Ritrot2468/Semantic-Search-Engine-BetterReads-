import express from 'express';
import { protect } from '../middleware/authentification.js';
const router = express.Router();

router.get('/verify', protect, (req, res) => {
    res.json({valid: true, userId: req.user.id});
})

export default router;