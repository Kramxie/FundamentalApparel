const express = require('express');
const router = express.Router();

const {
  createPaymentSession,
  createOrderPaymentSession,
  createExistingOrderPaymentSession,
  handlePaymongoWebhook,
  verifyPaymentStatus,
  syncPaymentStatus,
  getOrderPaymentDetails,
  getCustomOrderPaymentDetails
} = require('../controllers/paymentController');

const { protect, authorize } = require('../middleware/authMiddleware');

// Create payment checkout session for services
router.route('/create')
  .post(protect, createPaymentSession);

// Create payment checkout session for product orders
router.route('/create-order')
  .post(protect, createOrderPaymentSession);

// Create payment checkout session for an existing product order
router.route('/create-order-existing/:orderId')
  .post(protect, createExistingOrderPaymentSession);

// PayMongo webhook endpoint (public - PayMongo will call this)
router.route('/webhook')
  .post(handlePaymongoWebhook);

// Verify payment status
router.route('/verify/:sessionId')
  .get(protect, verifyPaymentStatus);

// Sync payment status with PayMongo and update DB (fallback if webhook delayed/localhost testing)
router.route('/sync/:orderId')
  .post(protect, syncPaymentStatus);

// Admin payment details lookups
router.route('/details/order/:orderId')
  .get(protect, authorize('admin','employee'), getOrderPaymentDetails);

router.route('/details/custom/:orderId')
  .get(protect, authorize('admin','employee'), getCustomOrderPaymentDetails);

module.exports = router;
