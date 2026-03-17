import express from 'express';
import { getRecommendations } from '../services/recommendations.js';
import { protect } from '../middleware/authentification.js';

const router = express.Router();

/**
 * @route   GET /api/recommend/:username
 * @desc    Get book recommendations for a specific user
 * @access  Private
 */
router.get('/:username', protect, async (req, res) => {
  try {
    if (!req.params.username) {
      return res.status(400).json({ error: 'Username is required' });
    }
    
    const books = await getRecommendations(req.params.username);
    
    if (!books || books.length === 0) {
      return res.json({ 
        books: [],
        message: 'No recommendations found. Try rating more books to get personalized recommendations.'
      });
    }
    
    res.json({ 
      books,
      count: books.length,
      message: 'Recommendations retrieved successfully'
    });
  } catch (err) {
    console.error('Error in recommendations route:', err);
    res.status(500).json({ 
      error: err.message,
      message: 'Failed to retrieve recommendations. Please try again later.'
    });
  }
});

export default router;
