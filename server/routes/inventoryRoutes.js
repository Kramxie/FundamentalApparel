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
    getInventoryStats,
    getPublicVariants
} = require('../controllers/inventoryController');
const { decrementStock } = require('../controllers/inventoryController');

const { protect, authorize } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/permissionMiddleware');

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

// Public route: list visible variants for customers (no auth)
router.get('/public/variants', getPublicVariants);

// All routes below require authentication; restrict per-route by role
router.use(protect);

// Get inventory statistics (requires inventory permission)
router.get('/stats', requirePermission('manage_inventory'), getInventoryStats);

// Get per-size availability (authenticated users: admin/employee/user)
router.get('/availability', authorize('admin','employee','user'), require('../controllers/inventoryController').getInventoryAvailability);

// Bulk update quantities (requires inventory permission)
router.post('/bulk-update', requirePermission('manage_inventory'), bulkUpdateQuantities);

// CRUD operations
router.route('/')
    .get(requirePermission('manage_inventory'), getAllInventory)
    .post(requirePermission('manage_inventory'), upload.fields([
        { name: 'mainImage', maxCount: 1 },
        { name: 'galleryImages', maxCount: 10 }
    ]), createInventoryItem);

router.route('/:id')
    .get(requirePermission('manage_inventory'), getInventoryItem)
    .patch(requirePermission('manage_inventory'), upload.fields([
        { name: 'mainImage', maxCount: 1 },
        { name: 'galleryImages', maxCount: 10 }
    ]), updateInventoryItem)
    .delete(requirePermission('manage_inventory'), deleteInventoryItem);

// Decrement stock (per-size or overall) after payment verification or order processing
router.post('/:id/decrement', requirePermission('manage_inventory'), decrementStock);

module.exports = router;
