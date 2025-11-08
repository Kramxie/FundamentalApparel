const express = require('express');
const router = express.Router();

// Import all functions from the controller
const { 
    getCart, 
    addToCart, 
    removeFromCart,
    updateItemQuantity,
    getCartPreview
} = require('../controllers/cartController');

const { protect } = require('../middleware/authMiddleware');

// Routes for getting and adding to the cart
router.route('/')
    .get(protect, getCart)
    .post(protect, addToCart);

router.route('/preview')
    .post(protect, getCartPreview);

router.route('/:itemId')
    .delete(protect, removeFromCart);

router.route('/:itemId/quantity')
    .put(protect, updateItemQuantity);

module.exports = router;

