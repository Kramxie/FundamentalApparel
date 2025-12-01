const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { protect, authorize } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/permissionMiddleware');

// Report routes require report permission
router.get('/sales', protect, requirePermission('view_reports'), reportController.salesReport);
router.get('/sales/csv', protect, requirePermission('view_reports'), reportController.exportSalesCsv);
router.get('/sales/pdf', protect, requirePermission('view_reports'), reportController.exportSalesPdf);
router.get('/orders', protect, requirePermission('view_reports'), reportController.orderListReport);
router.get('/inventory', protect, requirePermission('view_reports'), reportController.inventoryReport);
router.get('/top-products', protect, requirePermission('view_reports'), reportController.topProducts);
router.get('/revenue-by-category', protect, requirePermission('view_reports'), reportController.revenueByCategory);
router.get('/refunds', protect, requirePermission('view_reports'), reportController.refundsReport);
router.get('/sales-by-cohort', protect, requirePermission('view_reports'), reportController.salesByCohort);

module.exports = router;
