
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
    deleteProduct  
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
    const allowed = /jpeg|jpg|png|webp/;
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.test(ext)){
        cb(null, true);
    }else {
        cb(new Error('Only image are allowed (jpeg, jpg, png, webp) '), false);
    }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024} });


router.route('/')
    .get(getProducts)
    .post(protect, authorize('admin','employee'), upload.fields([
        { name: 'image', maxCount: 1 },
        { name: 'gallery', maxCount: 8 }
    ]), addProduct); 


router.route('/:id')
    .get(getProductById)
    .put(protect, authorize('admin','employee'), upload.fields([
        { name: 'mainImage', maxCount: 1 },
        { name: 'galleryImages', maxCount: 8 }
    ]), updateProduct)
    .delete(protect, authorize('admin','employee'), deleteProduct);

module.exports = router;

