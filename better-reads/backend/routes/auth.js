import express from 'express';
import { protect } from '../middleware/authentification.js';
import {storeInRedis} from '../services/redisClient.js';

const router = express.Router();

router.get('/verify', protect, (req, res) => {
    res.json({valid: true, userId: req.user.id});
})



export default router;