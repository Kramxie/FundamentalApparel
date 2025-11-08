const express = require('express');
const router = express.Router();

const { getDashboardStats } = require('../controllers/dashboardController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect, authorize('admin'));

router.route('/stats').get(getDashboardStats);

module.exports = router;