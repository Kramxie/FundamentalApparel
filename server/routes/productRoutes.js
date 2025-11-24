
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();

const { 
    addProduct, 
    getProducts, 
    getProductById,
    updateProduct,
    deleteProduct,
    addReview 
} = require('../controllers/productController');

const { protect, authorize } = require('../middleware/authMiddleware');

const productsDir = path.join(__dirname, '..', 'uploads', 'products');
fs.mkdirSync(productsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, productsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const base = path.basename(file.originalname, ext).replace(/\s+/g, '-').toLowerCase();
        cb(null, `${Date.now()}-${base}${ext}`);
    }
});

const fileFilter = (req, file, cb) => {
    // Validate both extension and mimetype to avoid relying solely on filename
    const allowedExt = /\.(jpeg|jpg|png|webp|avif)$/i;
    const allowedMime = /^image\/(jpeg|png|webp|gif|avif)$/i;
    const originalName = file.originalname || '';
    const ext = path.extname(originalName).toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();

    if (allowedExt.test(ext) && allowedMime.test(mime)) {
        cb(null, true);
    } else {
        const msg = `Only image files are allowed (jpeg, jpg, png, webp). Received: name="${originalName}", mime="${mime}"`;
        cb(new Error(msg), false);
    }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024} });


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

// Reviews
router.post('/:id/reviews', protect, addReview);

module.exports = router;

