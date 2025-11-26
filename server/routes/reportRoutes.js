const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { protect, authorize } = require('../middleware/authMiddleware');

// All report routes are admin-only
router.get('/sales', protect, authorize('admin'), reportController.salesReport);
router.get('/orders', protect, authorize('admin'), reportController.orderListReport);
router.get('/inventory', protect, authorize('admin'), reportController.inventoryReport);
router.get('/top-products', protect, authorize('admin'), reportController.topProducts);
router.get('/revenue-by-category', protect, authorize('admin'), reportController.revenueByCategory);
router.get('/refunds', protect, authorize('admin'), reportController.refundsReport);
router.get('/sales-by-cohort', protect, authorize('admin'), reportController.salesByCohort);

module.exports = router;
