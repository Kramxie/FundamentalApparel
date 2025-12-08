const express = require('express');
const router = express.Router();

const {
    getAllInventory,
    getInventoryItem,
    createInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    bulkUpdateQuantities,
    getInventoryStats,
    getPublicVariants,
    restoreInventoryItem,
    permanentDeleteInventoryItem
} = require('../controllers/inventoryController');
const { decrementStock } = require('../controllers/inventoryController');

const { protect, authorize } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/permissionMiddleware');
const { productUpload } = require('../config/cloudinary');

// Use Cloudinary uploads for inventory product images
const upload = productUpload;

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

// Restore archived item
router.patch('/:id/restore', requirePermission('manage_inventory'), restoreInventoryItem);

// Permanently delete item
router.delete('/:id/permanent', requirePermission('manage_inventory'), permanentDeleteInventoryItem);

// Decrement stock (per-size or overall) after payment verification or order processing
router.post('/:id/decrement', requirePermission('manage_inventory'), decrementStock);

module.exports = router;
