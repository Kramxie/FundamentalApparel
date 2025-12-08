const express = require('express');
const router = express.Router();

const {
  listReturns,
  getReturn,
  approveReturn,
  rejectReturn,
  refundReturn,
  markReceived
} = require('../controllers/returnController');
const { listMyReturns } = require('../controllers/returnController');

const { protect, authorize } = require('../middleware/authMiddleware');
const { returnUpload } = require('../config/cloudinary');

// Use Cloudinary uploads for return media
const upload = returnUpload;

// All return routes are protected
router.use(protect);

// User endpoint: list current user's returns
router.get('/my', listMyReturns);

// Admin endpoints
router.get('/', authorize('admin','employee'), listReturns);
router.get('/:id', authorize('admin','employee'), getReturn);
router.put('/:id/approve', authorize('admin','employee'), approveReturn);
router.put('/:id/reject', authorize('admin','employee'), rejectReturn);
router.put('/:id/received', authorize('admin','employee'), markReceived);
router.post('/:id/refund', authorize('admin','employee'), refundReturn);

module.exports = router;
