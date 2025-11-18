const express = require('express');
const router = express.Router();

const { assignVoucher, validateVoucher } = require('../controllers/voucherController');
const { getVoucherUsageHistory } = require('../controllers/voucherController');
const { protect, authorize } = require('../middleware/authMiddleware');


router.route('/assign')
    .post(protect, authorize('admin','employee'), assignVoucher);

// Validate voucher for logged-in user
router.get('/validate', protect, validateVoucher);
// Admin: voucher usage history
router.get('/history', protect, authorize('admin','employee'), getVoucherUsageHistory);

module.exports = router;

