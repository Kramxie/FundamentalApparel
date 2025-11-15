const express = require('express');
const router = express.Router();

const { getDashboardStats } = require('../controllers/dashboardController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Allow both admin and employee roles to view dashboard stats
router.use(protect, authorize('admin', 'employee'));

router.route('/stats').get(getDashboardStats);

module.exports = router;