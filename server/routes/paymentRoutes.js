const express = require('express');
const router = express.Router();

const {
  createPaymentSession,
  createOrderPaymentSession,
  handlePaymongoWebhook,
  verifyPaymentStatus
} = require('../controllers/paymentController');

const { protect } = require('../middleware/authMiddleware');

// Create payment checkout session for services
router.route('/create')
  .post(protect, createPaymentSession);

// Create payment checkout session for product orders
router.route('/create-order')
  .post(protect, createOrderPaymentSession);

// PayMongo webhook endpoint (public - PayMongo will call this)
router.route('/webhook')
  .post(handlePaymongoWebhook);

// Verify payment status
router.route('/verify/:sessionId')
  .get(protect, verifyPaymentStatus);

module.exports = router;
