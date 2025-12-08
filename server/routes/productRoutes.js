
const express = require('express');
const router = express.Router();

const { 
    addProduct, 
    getProducts, 
    getProductById,
    updateProduct,
    deleteProduct,
    addReview,
    checkPendingOrders
} = require('../controllers/productController');

const { protect, authorize } = require('../middleware/authMiddleware');
const { productUpload, reviewUpload } = require('../config/cloudinary');

// Use Cloudinary uploads (productUpload for products, reviewUpload for reviews)
const upload = productUpload;

router.route('/')
    .get(getProducts)
    .post(protect, authorize('admin','employee'), upload.fields([
        { name: 'image', maxCount: 1 },
        { name: 'gallery', maxCount: 8 },
        // support predesign front/back uploads
        { name: 'front', maxCount: 1 },
        { name: 'back', maxCount: 1 }
    ]), addProduct); 


router.route('/:id')
    .get(getProductById)
    .put(protect, authorize('admin','employee'), upload.fields([
        { name: 'mainImage', maxCount: 1 },
        { name: 'galleryImages', maxCount: 8 }
    ]), updateProduct)
    .delete(protect, authorize('admin','employee'), deleteProduct);

// Check pending orders for a product before deletion
router.get('/:id/pending', protect, authorize('admin','employee'), checkPendingOrders);

// Reviews - using Cloudinary reviewUpload from config
const reviewRateLimiter = require('../middleware/reviewRateLimiter');

// User review submission (rate limited)
router.post('/:id/reviews', protect, reviewRateLimiter, reviewUpload.array('reviewImages', 4), addReview);

module.exports = router;

