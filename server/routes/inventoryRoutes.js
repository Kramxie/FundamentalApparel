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
const { decrementStock } = require('../controllers/inventoryController');

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

// All routes require authentication; restrict per-route by role
router.use(protect);

// Get inventory statistics (read-only for admin and employee)
router.get('/stats', authorize('admin','employee'), getInventoryStats);

// Get per-size availability (authenticated users: admin/employee/user)
router.get('/availability', authorize('admin','employee','user'), require('../controllers/inventoryController').getInventoryAvailability);

// Bulk update quantities (admin and employee)
router.post('/bulk-update', authorize('admin','employee'), bulkUpdateQuantities);

// CRUD operations
router.route('/')
    .get(authorize('admin','employee'), getAllInventory)
    .post(authorize('admin','employee'), upload.fields([
        { name: 'mainImage', maxCount: 1 },
        { name: 'galleryImages', maxCount: 10 }
    ]), createInventoryItem);

router.route('/:id')
    .get(authorize('admin','employee'), getInventoryItem)
    .patch(authorize('admin','employee'), upload.fields([
        { name: 'mainImage', maxCount: 1 },
        { name: 'galleryImages', maxCount: 10 }
    ]), updateInventoryItem)
    .delete(authorize('admin','employee'), deleteInventoryItem);

// Decrement stock (per-size or overall) after payment verification or order processing
router.post('/:id/decrement', authorize('admin','employee'), decrementStock);

module.exports = router;
