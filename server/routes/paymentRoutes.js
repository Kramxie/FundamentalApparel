const express = require('express');
const router = express.Router();

const {
  createPaymentSession,
  createOrderPaymentSession,
  createExistingOrderPaymentSession,
  handlePaymongoWebhook,
  getRecentWebhooks,
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
// We capture raw bytes in `server.js` (express.json verify) and attach
// them to `req.rawBody`. Use that for verification in the controller.
router.post('/webhook', (req, res, next) => {
  // If route-level body parser produced a Buffer, use it
  if (!req.rawBody && req.body && Buffer.isBuffer(req.body)) {
    req.rawBody = req.body;
  }
  return handlePaymongoWebhook(req, res, next);
});

// TEMPORARY: Manual webhook test endpoint
router.post('/webhook-test', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, msg: 'sessionId required' });
    }

    // Find order
    let order = await require('../models/Order').findOne({ paymentIntentId: sessionId });
    if (!order) {
      order = await require('../models/CustomOrder').findOne({ paymentIntentId: sessionId });
    }

    if (!order) {
      return res.status(404).json({ success: false, msg: 'Order not found' });
    }

    // Simulate webhook event
    const eventData = {
      id: sessionId,
      attributes: {
        reference_number: order._id.toString().slice(-8).toUpperCase()
      }
    };

    await require('../controllers/paymentController').handlePaymentSuccess(eventData);

    return res.status(200).json({ success: true, msg: 'Manual processing completed', orderId: order._id });
  } catch (error) {
    console.error('Manual webhook test error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

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
