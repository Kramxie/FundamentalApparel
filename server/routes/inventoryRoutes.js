const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const {
    getAllInventory,
    getInventoryItem,
    createInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    bulkUpdateQuantities,
    getInventoryStats
} = require('../controllers/inventoryController');

const { protect, authorize } = require('../middleware/authMiddleware');

// Configure multer for product images
const productsDir = path.join(__dirname, '..', 'uploads', 'products');
fs.mkdirSync(productsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, productsDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
        cb(null, true);
    } else {
        cb(new Error('Only image files (JPEG, PNG, GIF, WEBP) are allowed'));
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB per file
});

// All routes require admin authentication
router.use(protect);
router.use(authorize('admin'));

// Get inventory statistics
router.get('/stats', getInventoryStats);

// Bulk update quantities
router.post('/bulk-update', bulkUpdateQuantities);

// CRUD operations
router.route('/')
    .get(getAllInventory)
    .post(upload.fields([
        { name: 'mainImage', maxCount: 1 },
        { name: 'galleryImages', maxCount: 10 }
    ]), createInventoryItem);

router.route('/:id')
    .get(getInventoryItem)
    .patch(upload.fields([
        { name: 'mainImage', maxCount: 1 },
        { name: 'galleryImages', maxCount: 10 }
    ]), updateInventoryItem)
    .delete(deleteInventoryItem);

module.exports = router;
