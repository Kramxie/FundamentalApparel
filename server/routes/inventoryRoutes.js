const express = require('express');
const router = express.Router();

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
    .post(createInventoryItem);

router.route('/:id')
    .get(getInventoryItem)
    .patch(updateInventoryItem)
    .delete(deleteInventoryItem);

module.exports = router;
