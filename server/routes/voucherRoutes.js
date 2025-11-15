const express = require('express');
const router = express.Router();

const { assignVoucher } = require('../controllers/voucherController');
const { protect, authorize } = require('../middleware/authMiddleware');


router.route('/assign')
    .post(protect, authorize('admin','employee'), assignVoucher);

module.exports = router;

