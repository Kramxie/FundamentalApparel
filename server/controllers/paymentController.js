const CustomOrder = require('../models/CustomOrder');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const User = require('../models/User');
const WebhookEvent = require('../models/WebhookEvent');
const crypto = require('crypto');
const mongoose = require('mongoose');

// PayMongo API configuration
// Use environment variables for production
const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY || 'sk_test_your_secret_key_here';
const PAYMONGO_PUBLIC_KEY = process.env.PAYMONGO_PUBLIC_KEY || 'pk_test_your_public_key_here';
const PAYMONGO_API_URL = 'https://api.paymongo.com/v1';

const BASE_URL = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5000}`;

/**
 * Create PayMongo Checkout Session
 * @route   POST /api/payments/create
 * @access  Private
 */
exports.createPaymentSession = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      orderId,
      orderReference,
      serviceType,
      amount,
      baseAmount,
      deliveryFee,
      paymentOption,
      shippingMethod,
      shippingAddress,
      customerInfo,
      serviceData,
      successUrl,
      cancelUrl
    } = req.body;

    console.log('[PayMongo] Creating checkout session for user:', userId);
    console.log('[PayMongo] Payment option:', paymentOption);
    console.log('[PayMongo] Shipping method:', shippingMethod);
    console.log('[PayMongo] Delivery fee:', deliveryFee);

    // Validation
    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        msg: 'Invalid payment amount'
      });
    }

    if (!customerInfo || !customerInfo.email || !customerInfo.name) {
      return res.status(400).json({
        success: false,
        msg: 'Customer information is required'
      });
    }
    
    // Validate shipping address if Standard Delivery (skip for remaining-balance payments)
    if (shippingMethod === 'Standard' && paymentOption !== 'balance' && (!shippingAddress || !shippingAddress.street)) {
      return res.status(400).json({
        success: false,
        msg: 'Shipping address is required for Standard Delivery'
      });
    }

    // Convert amount to centavos (PayMongo expects integer in cents)
    const amountInCents = Math.round(amount * 100);
    
    // Determine payment description based on payment option
    const normalizedOption = (paymentOption === 'balance') ? 'full' : (paymentOption || 'full');
    const paymentDesc = paymentOption === 'downpayment' 
      ? '50% Downpayment' 
      : (paymentOption === 'balance' ? 'Remaining Balance' : '100% Full Payment');

    // Prepare line items for PayMongo
    // IMPORTANT: Our `amount` already represents the total charge for the whole order
    // (including downpayment/balance logic and delivery if applicable).
    // PayMongo expects `amount` to be per-item when `quantity > 1`.
    // To avoid unintended multiplication, we force quantity to 1 and include
    // the actual order quantity in the item name for clarity.
    const lineItems = [{
      currency: 'PHP',
      amount: amountInCents,
      name: `${serviceData?.serviceName || 'Custom Jersey Service'} - ${paymentDesc}`,
      quantity: 1,
      description: `Total charge for custom service — ${serviceType || 'customize-jersey'} — Ref: ${orderReference || 'PENDING'} — ${shippingMethod || 'Standard'} Delivery`
    }];

    // Create or update CustomOrder
    let order;
    if (orderId) {
      // Update existing order
      order = await CustomOrder.findById(orderId);
      if (!order) {
        return res.status(404).json({
          success: false,
          msg: 'Order not found'
        });
      }
      
      if (order.user.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          msg: 'Not authorized to access this order'
        });
      }

      // Update order with payment intent and shipping info
      // IMPORTANT: Don't change status here - preserve current status (e.g., 'Pending Balance' for final payments)
      order.paymentStatus = 'pending';
      order.totalPrice = baseAmount || amount;
      order.paymentOption = normalizedOption;
      order.shippingMethod = shippingMethod || 'Standard';
      order.shippingAddress = shippingAddress || null;
      order.deliveryFee = deliveryFee || 0;
      // Preserve existing status - don't overwrite (especially for 'Pending Balance')
      // order.status stays as-is
      order.quotePayload = {
        ...order.quotePayload,
        ...serviceData,
        customerInfo
      };
    } else {
      // Create new order
      order = new CustomOrder({
        user: userId,
        serviceType: serviceType || 'customize-jersey',
        customType: 'Template',
        productName: serviceData?.serviceName || 'Custom Service',
        garmentType: serviceData?.garmentType || 't-shirt',
        selectedLocation: serviceData?.selectedLocation || 'Front',
        quantity: serviceData?.quantity || 1,
        totalPrice: baseAmount || amount,
        paymentOption: normalizedOption,
        shippingMethod: shippingMethod || 'Standard',
        shippingAddress: shippingAddress || null,
        deliveryFee: deliveryFee || 0,
        status: 'Pending Quote',
        paymentStatus: 'pending',
        quotePayload: {
          ...serviceData,
          customerInfo
        }
      });
    }

    await order.save();

    // Build success and cancel URLs with order reference and payment type
    const orderRef = order._id.toString().slice(-8).toUpperCase();
    const paymentTypeParam = paymentOption === 'balance' ? 'balance' : (paymentOption === 'downpayment' ? 'downpayment' : 'full');
    const finalSuccessUrl = successUrl || `${BASE_URL}/client/payment-success.html?ref=${orderRef}&type=${paymentTypeParam}`;
    const finalCancelUrl = cancelUrl || `${BASE_URL}/client/payment-cancel.html?ref=${orderRef}&type=${paymentTypeParam}`;

    // PayMongo Checkout Session payload
    const checkoutPayload = {
      data: {
        attributes: {
          line_items: lineItems,
          payment_method_types: ['card', 'gcash', 'grab_pay', 'paymaya'],
          description: `Order #${orderRef} - ${serviceType}`,
          success_url: finalSuccessUrl,
          cancel_url: finalCancelUrl,
          billing: {
            name: customerInfo.name,
            email: customerInfo.email,
            phone: customerInfo.phone || ''
          },
          reference_number: orderRef,
          send_email_receipt: true
        }
      }
    };

    console.log('[PayMongo] Checkout payload:', JSON.stringify(checkoutPayload, null, 2));

    // Call PayMongo API to create checkout session
    const paymongoResponse = await fetch(`${PAYMONGO_API_URL}/checkout_sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64')}`
      },
      body: JSON.stringify(checkoutPayload)
    });

    const paymongoData = await paymongoResponse.json();

    if (!paymongoResponse.ok) {
      console.error('[PayMongo] API Error:', paymongoData);
      throw new Error(
        paymongoData.errors?.[0]?.detail || 
        'Failed to create payment session'
      );
    }

    console.log('[PayMongo] Checkout session created:', paymongoData.data.id);

    // Store payment intent ID in order
    order.paymentIntentId = paymongoData.data.id;
    await order.save();

    // NOTE: Voucher consumption is handled after payment confirmation (webhook)

    // Return checkout URL to client
    res.status(201).json({
      success: true,
      msg: 'Payment session created successfully',
      data: {
        checkoutUrl: paymongoData.data.attributes.checkout_url,
        sessionId: paymongoData.data.id,
        orderId: order._id,
        orderReference: orderRef
      }
    });

  } catch (error) {
    console.error('[PayMongo] Create session error:', error);
    res.status(500).json({
      success: false,
      msg: 'Failed to create payment session',
      error: error.message
    });
  }
};

/**
 * Create PayMongo Checkout Session for Product Orders
 * @route   POST /api/payments/create-order
 * @access  Private
 */

// --- PATCH: Add voucher support ---
exports.createOrderPaymentSession = async (req, res) => {
  try {
    const userId = req.user._id;
    let {
      items,
      shippingAddress,
      amount,
      paymentMethod,
      shippingMethod,
      deliveryFee = 0,
      comment,
      voucherCode
    } = req.body;

    console.log('[PayMongo] Creating checkout session for product order, user:', userId);


    // Validation
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, msg: 'Order items are required' });
    }
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, msg: 'Invalid payment amount' });
    }
    if (!shippingAddress || !shippingAddress.fullName || !shippingAddress.address) {
      return res.status(400).json({ success: false, msg: 'Shipping address is required' });
    }
    if (!paymentMethod || !['gcash', 'card'].includes(paymentMethod)) {
      return res.status(400).json({ success: false, msg: 'Payment method must be either gcash or card' });
    }


    // --- Voucher logic ---
    let appliedVoucher = null;
    let discount = 0;
    if (voucherCode && typeof voucherCode === 'string' && voucherCode.trim()) {
      const user = await require('../models/User').findById(userId);
      if (user) {
        const v = user.vouchers.find(v => v.code.toLowerCase() === voucherCode.trim().toLowerCase());
        if (v) {
          appliedVoucher = v;
          const subtotal = items.reduce((s, it) => s + (it.price * it.quantity), 0);
          if (v.type === 'percentage') {
            discount = Math.floor(subtotal * (v.value / 100));
          } else if (v.type === 'fixed') {
            discount = Math.min(subtotal, v.value);
          } else if (v.type === 'free_shipping') {
            discount = 0;
            deliveryFee = 0;
          }
        }
      }
    }
    // Compute subtotal and delivery fee number
    const subtotal = items.reduce((s, it) => s + (it.price * it.quantity), 0);
    const deliveryFeeNumber = Number(deliveryFee) || 0;

    // Cap discount so total is never less than 1 (₱1)
    let maxDiscount = subtotal + deliveryFeeNumber - 1; // keep at least ₱1
    if (discount > maxDiscount) {
      discount = maxDiscount;
    }

    // Authoritative server-side amount: subtotal + delivery - discount
    amount = Math.max(1, subtotal + deliveryFeeNumber - discount);

    // Convert amount to centavos (PayMongo expects integer in cents)
    const amountInCents = Math.round(amount * 100);



    // Prepare line items for PayMongo (NO negative discount line item)
    const lineItems = items.map(item => ({
      currency: 'PHP',
      amount: Math.round((item.price || 0) * (item.quantity || 1) * 100),
      name: item.name || 'Product',
      quantity: item.quantity || 1,
      description: `Product ID: ${item.productId || 'N/A'}`
    }));
    // Append delivery fee as a separate line item if any
    if (deliveryFeeNumber > 0) {
      lineItems.push({
        currency: 'PHP',
        amount: Math.round(deliveryFeeNumber * 100),
        name: 'Delivery Fee',
        quantity: 1,
        description: `${shippingMethod || 'Standard'} Delivery`
      });
    }

    // Normalize payment method to match Order schema enum
    const normalizedPaymentMethod = paymentMethod === 'gcash' ? 'GCash' : paymentMethod;


    // Create new Order
    const order = new Order({
      user: userId,
      orderItems: items.map(item => ({
        product: item.productId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        size: item.size || null,
        imageUrl: item.image || item.imageUrl || 'https://placehold.co/80x80'
      })),
      totalPrice: amount,
      shippingAddress: {
        street: shippingAddress.address || shippingAddress.street,
        province: shippingAddress.province,
        city: shippingAddress.city,
        zip: shippingAddress.zipCode || shippingAddress.zip,
        phone: shippingAddress.phone
      },
      shippingMethod: (shippingMethod === 'Pick-Up' ? 'Pick-Up' : 'Standard'),
      deliveryFee: deliveryFeeNumber,
      comment: comment || '',
      paymentMethod: normalizedPaymentMethod,
      paymentStatus: 'Pending',
      status: 'Processing',
      voucher: appliedVoucher ? {
        code: appliedVoucher.code,
        type: appliedVoucher.type,
        value: appliedVoucher.value,
        description: appliedVoucher.description
      } : undefined,
      discount: discount > 0 ? discount : undefined
    });

    await order.save();

    // Build success and cancel URLs with order reference
    const orderRef = order._id.toString().slice(-8).toUpperCase();
    // Include full orderId and session placeholder (will be replaced after session creation)
    const pendingSuccessParams = `ref=${orderRef}&type=order&oid=${order._id}`;
    const finalSuccessUrl = `${BASE_URL}/client/payment-success.html?${pendingSuccessParams}`;
    const finalCancelUrl = `${BASE_URL}/client/payment-cancel.html?${pendingSuccessParams}`;

    // Determine payment method types based on selection
    const paymentMethodTypes = paymentMethod === 'card' 
      ? ['card'] 
      : ['gcash'];

    // For PayMongo display, use a single summary line item equal to the final payable amount.
    // Sending individual product line items would sum to the pre-discount subtotal and not reflect the applied voucher.
    const summaryLineItems = [{
      currency: 'PHP',
      amount: amountInCents,
      name: `Order #${orderRef}`,
      quantity: 1,
      description: `Final charge for order ${orderRef}`
    }];

    // PayMongo Checkout Session payload
    const checkoutPayload = {
      data: {
        attributes: {
          line_items: summaryLineItems,
          payment_method_types: paymentMethodTypes,
          description: `Order #${orderRef}`,
          success_url: finalSuccessUrl,
          cancel_url: finalCancelUrl,
          billing: {
            name: shippingAddress.fullName,
            email: req.user.email || '',
            phone: shippingAddress.phone || ''
          },
          reference_number: orderRef,
          send_email_receipt: true
        }
      }
    };

    console.log('[PayMongo] Order checkout payload:', JSON.stringify(checkoutPayload, null, 2));

    // Call PayMongo API to create checkout session
    const paymongoResponse = await fetch(`${PAYMONGO_API_URL}/checkout_sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64')}`
      },
      body: JSON.stringify(checkoutPayload)
    });

    const paymongoData = await paymongoResponse.json();

    if (!paymongoResponse.ok) {
      console.error('[PayMongo] API Error:', paymongoData);
      
      // Delete the order if payment session creation fails
      await Order.findByIdAndDelete(order._id);
      
      throw new Error(
        paymongoData.errors?.[0]?.detail || 
        'Failed to create payment session'
      );
    }

    console.log('[PayMongo] Order checkout session created:', paymongoData.data.id);

    // Store payment intent ID in order
    order.paymentIntentId = paymongoData.data.id;
    await order.save();

    // Append session id to success URL for more reliable lookup (optional)
    const successUrlWithSession = `${finalSuccessUrl}&sid=${paymongoData.data.id}`;
    const cancelUrlWithSession = `${finalCancelUrl}&sid=${paymongoData.data.id}`;

    // Return checkout URL to client
    res.status(201).json({
      success: true,
      msg: 'Payment session created successfully',
      data: {
        checkoutUrl: paymongoData.data.attributes.checkout_url,
        sessionId: paymongoData.data.id,
        orderId: order._id,
        orderReference: orderRef
      }
    });

  } catch (error) {
    console.error('[PayMongo] Create order session error:', error);
    res.status(500).json({
      success: false,
      msg: 'Failed to create payment session',
      error: error.message
    });
  }
};

/**
 * Create PayMongo Checkout Session for an existing Order
 * Reuses an existing order and attaches a new checkout session.
 * @route   POST /api/payments/create-order-existing/:orderId
 * @access  Private
 */
exports.createExistingOrderPaymentSession = async (req, res) => {
  try {
    const userId = req.user._id;
    const { orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({ success: false, msg: 'orderId is required' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, msg: 'Order not found' });
    }
    if (order.user.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, msg: 'Not authorized to access this order' });
    }

    if (order.paymentStatus && ['Received', 'paid', 'Paid'].includes(order.paymentStatus)) {
      return res.status(400).json({ success: false, msg: 'Order is already paid' });
    }

    // Prepare line items consistent with createOrderPaymentSession
    const lineItems = (order.orderItems || []).map(item => ({
      currency: 'PHP',
      amount: Math.round((item.price || 0) * (item.quantity || 1) * 100),
      name: item.name || 'Product',
      quantity: item.quantity || 1,
      description: `Product ID: ${item.product || 'N/A'}`
    }));

    // Add delivery fee if present on the order
    const deliveryFeeNumber = Number(order.deliveryFee) || 0;
    if (deliveryFeeNumber > 0) {
      lineItems.push({
        currency: 'PHP',
        amount: Math.round(deliveryFeeNumber * 100),
        name: 'Delivery Fee',
        quantity: 1,
        description: `${order.shippingMethod || 'Standard'} Delivery`
      });
    }

    if (!lineItems.length) {
      return res.status(400).json({ success: false, msg: 'Order has no items' });
    }

    const orderRef = order._id.toString().slice(-8).toUpperCase();
    const pendingParams = `ref=${orderRef}&type=order&oid=${order._id}`;
    const finalSuccessUrl = `${BASE_URL}/client/payment-success.html?${pendingParams}`;
    const finalCancelUrl = `${BASE_URL}/client/payment-cancel.html?${pendingParams}`;

    const pm = (order.paymentMethod || '').toString().toLowerCase();
    const paymentMethodTypes = pm === 'card' ? ['card'] : ['gcash'];

    const checkoutPayload = {
      data: {
        attributes: {
          line_items: lineItems,
          payment_method_types: paymentMethodTypes,
          description: `Order #${orderRef}`,
          success_url: finalSuccessUrl,
          cancel_url: finalCancelUrl,
          billing: {
            name: req.user.name || 'Customer',
            email: req.user.email || '',
            phone: order.shippingAddress?.phone || ''
          },
          reference_number: orderRef,
          send_email_receipt: true
        }
      }
    };

    const paymongoResponse = await fetch(`${PAYMONGO_API_URL}/checkout_sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64')}`
      },
      body: JSON.stringify(checkoutPayload)
    });

    const paymongoData = await paymongoResponse.json();

    if (!paymongoResponse.ok) {
      console.error('[PayMongo] API Error:', paymongoData);
      return res.status(500).json({ success: false, msg: paymongoData.errors?.[0]?.detail || 'Failed to create payment session' });
    }

    order.paymentIntentId = paymongoData.data.id;
    // ensure pending status for unpaid order
    order.paymentStatus = 'Pending';
    await order.save();

    const successUrlWithSession = `${finalSuccessUrl}&sid=${paymongoData.data.id}`;
    const cancelUrlWithSession = `${finalCancelUrl}&sid=${paymongoData.data.id}`;

    return res.status(201).json({
      success: true,
      msg: 'Payment session created successfully',
      data: {
        checkoutUrl: paymongoData.data.attributes.checkout_url,
        sessionId: paymongoData.data.id,
        orderId: order._id,
        orderReference: orderRef
      }
    });
  } catch (error) {
    console.error('[PayMongo] Create existing order session error:', error);
    return res.status(500).json({ success: false, msg: 'Failed to create payment session', error: error.message });
  }
};

/**
 * Handle PayMongo Webhook (for payment status updates)
 * @route   POST /api/payments/webhook
 * @access  Public (webhook endpoint)
 */
exports.handlePaymongoWebhook = async (req, res) => {
  try {
    // raw body is available at req.rawBody (set by route middleware)
    const rawBody = req.rawBody || req.body;
    let rawString = rawBody;
    if (Buffer.isBuffer(rawBody)) rawString = rawBody.toString('utf8');

    // Try parse JSON safely
    let event = null;
    try {
      event = typeof rawString === 'string' ? JSON.parse(rawString) : rawString;
    } catch (parseErr) {
      console.error('[PayMongo] Failed to parse webhook JSON:', parseErr.message);
      // Persist unverified event
      await WebhookEvent.create({ raw: rawString, verified: false, eventType: 'parse_error' });
      return res.status(400).send('Invalid payload');
    }

    const eventType = event.data?.type || event.type || 'unknown';
    const externalId = event.data?.id || event.id || null;

    console.log('[PayMongo] Webhook received:', eventType, 'id:', externalId);

    // Signature verification
    const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
    const sigHeaderName = (process.env.PAYMONGO_SIGNATURE_HEADER || 'paymongo-signature').toLowerCase();
    const headerSig = req.headers[sigHeaderName] || req.headers[sigHeaderName.toLowerCase()] || req.headers['paymongo-signature'] || req.headers['x-paymongo-signature'];

    console.log('[PayMongo] Webhook debug - Secret present:', !!webhookSecret, 'Header present:', !!headerSig);
    console.log('[PayMongo] Webhook debug - Header name:', sigHeaderName, 'Header value length:', headerSig ? headerSig.length : 0);

    let verified = false;
    if (!webhookSecret) {
      console.warn('[PayMongo] PAYMONGO_WEBHOOK_SECRET not set; skipping signature verification (not recommended)');
    } else if (!headerSig) {
      console.warn('[PayMongo] No signature header present on webhook');
    } else {
      try {
        // Prefer the raw Buffer captured by the body parser (`server.js` verify)
        // Falls back to other representations only as last resort.
        let rawBuffer;
        if (req.rawBody && Buffer.isBuffer(req.rawBody)) {
          rawBuffer = req.rawBody;
        } else if (Buffer.isBuffer(rawString)) {
          rawBuffer = rawString;
        } else if (typeof rawString === 'string') {
          rawBuffer = Buffer.from(rawString, 'utf8');
        } else {
          // Last resort: stringify the parsed event. Note: this may not match the
          // provider's original byte ordering and could cause a verification mismatch.
          rawBuffer = Buffer.from(JSON.stringify(event), 'utf8');
        }

        console.log('[PayMongo] Webhook debug - Raw buffer length:', rawBuffer.length);

        const expected = crypto.createHmac('sha256', webhookSecret).update(rawBuffer).digest('hex');
        const a = Buffer.from(expected, 'utf8');
        const b = Buffer.from(String(headerSig), 'utf8');

        console.log('[PayMongo] Webhook debug - Expected HMAC (first 8):', expected.substring(0, 8), '...');
        console.log('[PayMongo] Webhook debug - Received HMAC (first 8):', String(headerSig).substring(0, 8), '...');

        if (a.length === b.length && crypto.timingSafeEqual(a, b)) verified = true;
      } catch (sigErr) {
        console.error('[PayMongo] Signature verification error:', sigErr && sigErr.message ? sigErr.message : sigErr);
      }
    }

    // Persist webhook event for audit
    const webhookDoc = await WebhookEvent.create({
      provider: 'paymongo',
      externalId,
      eventType,
      raw: event,
      verified: Boolean(verified)
    });

    if (!verified) {
      console.warn('[PayMongo] Webhook signature NOT verified for event id:', externalId);
      // Record failed verification and respond 200 to avoid retries (configurable policy)
      // The webhook event is already persisted with verified=false
      return res.status(200).json({ success: false, msg: 'Signature verification failed - event recorded' });
    }

    // Idempotency: if we already processed this external event, ack
    if (externalId) {
      const existing = await WebhookEvent.findOne({ externalId, processed: true });
      if (existing) {
        console.log('[PayMongo] Event already processed, skipping. externalId:', externalId);
        return res.status(200).json({ received: true, skipped: true });
      }
    }

    // Route event types
    try {
      switch (eventType) {
        case 'checkout_session.payment.paid':
          console.log('[PayMongo] Processing checkout_session.payment.paid event');
          await handlePaymentSuccess(event.data);
          console.log('[PayMongo] handlePaymentSuccess completed');
          break;
        case 'checkout_session.payment.failed':
          await handlePaymentFailure(event.data);
          break;
        default:
          console.log('[PayMongo] Unhandled webhook type:', eventType);
      }

      // mark as processed
      webhookDoc.processed = true;
      webhookDoc.processedAt = new Date();
      webhookDoc.result = { processedBy: 'handlePaymongoWebhook', processedAt: new Date() };
      await webhookDoc.save();

      return res.status(200).json({ received: true });
    } catch (handlerErr) {
      console.error('[PayMongo] Error handling webhook event:', handlerErr);
      webhookDoc.result = { error: handlerErr.message };
      await webhookDoc.save();
      return res.status(500).json({ success: false, error: handlerErr.message });
    }

  } catch (error) {
    console.error('[PayMongo] Webhook top-level error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * Process successful payment
 */
async function handlePaymentSuccess(eventData) {
  try {
    const sessionId = eventData.id;
    const referenceNumber = eventData.attributes?.reference_number;

    console.log('[PayMongo] Processing payment success for:', referenceNumber, 'Session ID:', sessionId);

    // Find order by paymentIntentId (most reliable)
    // Note: reference_number is last 8 chars of _id, but searching by regex can match wrong orders
    let order = await CustomOrder.findOne({ paymentIntentId: sessionId });

    let isProductOrder = false;

    // If not found, try to find regular Order (products)
    if (!order) {
      order = await Order.findOne({ paymentIntentId: sessionId });
      isProductOrder = true;
    }

    if (!order) {
      console.error('[PayMongo] Order not found for session:', sessionId, 'Reference:', referenceNumber);
      return;
    }

    console.log('[PayMongo] Found order:', order._id, 'Type:', isProductOrder ? 'Product' : 'Custom', 'Current status:', order.status, 'Current paymentStatus:', order.paymentStatus);

    // Update order status based on type
    if (isProductOrder) {
      // Try to perform order update, stock deduction, voucher marking and cart clearing in a transaction
      let session = null;
      try {
        session = await mongoose.startSession();
        await session.withTransaction(async () => {
          // Reload order inside session
          const orderInSession = await Order.findById(order._id).session(session);
          if (!orderInSession) throw new Error('Order not found in transaction');

          orderInSession.paymentStatus = 'Received';
          orderInSession.status = 'Accepted';
          orderInSession.isPaid = true;
          orderInSession.paidAt = new Date();

          // Group per-inventory allocations for items that specify sizes
          const perInventorySizes = {};
          for (const item of orderInSession.orderItems) {
            if (!item.product) continue;
            const product = await Product.findById(item.product).session(session);
            if (!product) continue;

            if (item.size) {
              const invName = product.name || product._id.toString();
              perInventorySizes[invName] = perInventorySizes[invName] || {};
              perInventorySizes[invName][item.size] = (perInventorySizes[invName][item.size] || 0) + (Number(item.quantity) || 0);
            } else {
              const newStock = Math.max(0, product.countInStock - item.quantity);
              product.countInStock = newStock;
              await product.save({ session });
              console.log(`[Stock] Deducted ${item.quantity} from Product ${product.name}. New stock: ${newStock}`);

              const inventoryItem = await Inventory.findOne({ productId: product._id }).session(session);
              if (inventoryItem) {
                inventoryItem.quantity = newStock;
                await inventoryItem.save({ session });
                console.log(`[Stock] Synced Inventory for ${product.name}. New quantity: ${newStock}`);
              }
            }
          }

          // Perform atomic per-size allocations for each inventory group
          for (const [invName, sizesMap] of Object.entries(perInventorySizes)) {
            try {
              await require('../utils/inventory').allocateInventoryBySizes({ name: invName, sizesMap, orderId: order._id, session, note: 'Allocated by sizes on payment success' });
              // Sync linked Product.countInStock if inventory references a product
              try {
                const invAfter = await Inventory.findOne({ name: new RegExp('^' + invName + '$', 'i') }).session(session);
                if (invAfter && invAfter.productId) {
                  const prod = await Product.findById(invAfter.productId).session(session);
                  if (prod) { prod.countInStock = Number(invAfter.quantity || 0); await prod.save({ session }); }
                }
              } catch (syncErr) { console.warn('Failed to sync product after sizes allocation (webhook):', syncErr && syncErr.message); }
            } catch (allocErr) {
              console.error('[PayMongo] Failed to allocate inventory by sizes for', invName, allocErr && allocErr.message);
              throw allocErr;
            }
          }

          // Clear cart
          await Cart.findOneAndUpdate({ user: orderInSession.user }, { $set: { items: [] } }, { session });

          // Mark voucher as used if present
          if (orderInSession.voucher && orderInSession.voucher.code) {
            await User.updateOne(
              { _id: orderInSession.user, 'vouchers.code': orderInSession.voucher.code },
              { $set: { 'vouchers.$.used': true, 'vouchers.$.usedAt': new Date(), 'vouchers.$.usedByOrder': orderInSession._id.toString() } },
              { session }
            );
            console.log(`[Voucher] Marked voucher ${orderInSession.voucher.code} as used for user ${orderInSession.user}`);
          }

          // Save order changes
          await orderInSession.save({ session });
        });
        console.log('[PayMongo] Transaction completed successfully for order:', order._id);
      } catch (txErr) {
        console.warn('[PayMongo] Transactional update failed, falling back to non-transactional updates:', txErr.message);
        // Fallback to non-transactional behavior
        try {
          order.paymentStatus = 'Received';
          order.status = 'Accepted';
          order.isPaid = true;
          order.paidAt = new Date();

          // Group per-inventory allocations for items that specify sizes (fallback non-transactional)
          const perInventorySizesFallback = {};
          for (const item of order.orderItems) {
            if (!item.product) continue;
            const product = await Product.findById(item.product);
            if (!product) continue;

            if (item.size) {
              const invName = product.name || product._id.toString();
              perInventorySizesFallback[invName] = perInventorySizesFallback[invName] || {};
              perInventorySizesFallback[invName][item.size] = (perInventorySizesFallback[invName][item.size] || 0) + (Number(item.quantity) || 0);
            } else {
              const newStock = Math.max(0, product.countInStock - item.quantity);
              product.countInStock = newStock;
              await product.save();
              const inventoryItem = await Inventory.findOne({ productId: product._id });
              if (inventoryItem) {
                inventoryItem.quantity = newStock;
                await inventoryItem.save();
              }
            }
          }

          // Perform allocations for per-size groups (no session)
          for (const [invName, sizesMap] of Object.entries(perInventorySizesFallback)) {
            try {
              await require('../utils/inventory').allocateInventoryBySizes({ name: invName, sizesMap, orderId: order._id, note: 'Allocated by sizes on payment success (fallback)' });
              try {
                const invAfter = await Inventory.findOne({ name: new RegExp('^' + invName + '$', 'i') });
                if (invAfter && invAfter.productId) {
                  const prod = await Product.findById(invAfter.productId);
                  if (prod) { prod.countInStock = Number(invAfter.quantity || 0); await prod.save(); }
                }
              } catch (syncErr) { console.warn('Failed to sync product after sizes allocation (webhook fallback):', syncErr && syncErr.message); }
            } catch (allocErr) {
              console.error('[PayMongo] Fallback allocation failed for', invName, allocErr && allocErr.message);
            }
          }

          await Cart.findOneAndUpdate({ user: order.user }, { $set: { items: [] } }, { new: true });

          if (order.voucher && order.voucher.code) {
            await User.updateOne(
              { _id: order.user, 'vouchers.code': order.voucher.code },
              { $set: { 'vouchers.$.used': true, 'vouchers.$.usedAt': new Date(), 'vouchers.$.usedByOrder': order._id.toString() } }
            );
            console.log(`[Voucher] Marked voucher ${order.voucher.code} as used for user ${order.user}`);
          }
        } catch (fallbackErr) {
          console.error('[PayMongo] Fallback update failed:', fallbackErr);
        }
      } finally {
        if (session) session.endSession();
      }
      console.log('[PayMongo] Order updated successfully:', order._id, 'New status:', order.status, 'New paymentStatus:', order.paymentStatus);
    } else {
      // Service order - check payment option
        order.paymentStatus = 'paid';

        // Derive actual paid amount from PayMongo event line items
        const lineItems = Array.isArray(eventData.attributes?.line_items) ? eventData.attributes.line_items : [];
        const totalPaidCents = lineItems.reduce((sum, li) => sum + (Number(li.amount) || 0), 0);
        const paidAmount = totalPaidCents / 100;

        // Compute configured totals for comparison
        const itemsAmount = Number(order.price || order.totalPrice || 0);
        const deliveryFee = Number(order.deliveryFee || 0);
        const totalAmount = itemsAmount + deliveryFee;

        console.log('[PayMongo] Webhook payment analysis:', {
          orderId: order._id,
          currentStatus: order.status,
          downPaymentPaid: order.downPaymentPaid,
          balancePaid: order.balancePaid,
          paidAmount,
          totalAmount,
          itemsAmount,
          deliveryFee
        });

        // Decide payment type based on current status and amount
        const epsilon = 0.01; // floating safety
        const halfAmount = totalAmount * 0.5;
        
        // Check payment scenarios in CORRECT order:
        // IMPORTANT: Payments should be VERIFIED by admin, not auto-approved!
        
        // 1. Downpayment (50%) - check by status first
        // Keep at 'Pending Downpayment' so admin can verify
        if (order.status === 'Pending Downpayment' && !order.downPaymentPaid) {
          console.log('[PayMongo] Detected 50% downpayment - awaiting admin verification');
          // Don't change status! Admin must verify via "Verify Downpayment" button
          // order.status stays 'Pending Downpayment'
          order.downPaymentPaid = true; // Mark as paid so admin can verify
          order.paymentAmount = paidAmount;
          order.paymentType = 'downpayment';
        }
        // 2. Full payment in one go (100%) - check if amount matches total
        // Keep at 'Pending Downpayment' so admin can verify and skip to completion
        else if (!order.downPaymentPaid && Math.abs(paidAmount - totalAmount) <= (totalAmount * 0.05 + epsilon)) {
          console.log('[PayMongo] Detected 100% full payment - awaiting admin verification');
          // Don't change status! Admin must verify via "Verify Downpayment" button
          // order.status stays 'Pending Downpayment'
          order.downPaymentPaid = true; // Mark as paid
          order.balancePaid = true; // Mark both as paid for 100%
          order.paymentAmount = paidAmount;
          order.paymentType = 'full';
        }
        // 3. Remaining balance payment (final 50%) - ONLY if status is 'Pending Balance'
        // Change to 'Pending Final Verification' so admin can verify
        else if (order.status === 'Pending Balance' && order.downPaymentPaid && !order.balancePaid) {
          console.log('[PayMongo] Detected remaining balance payment - awaiting admin verification');
          order.status = 'Pending Final Verification'; // This one DOES change status
          order.paymentAmount = paidAmount;
          order.paymentType = 'remaining';
          order.balancePaid = true;
        }
        // 4. Downpayment by amount (if status check failed but amount matches ~50%)
        else if (!order.downPaymentPaid && Math.abs(paidAmount - halfAmount) <= (totalAmount * 0.1)) {
          console.log('[PayMongo] Detected 50% downpayment by amount - awaiting admin verification');
          // Keep at current status for admin verification
          order.downPaymentPaid = true;
          order.paymentAmount = paidAmount;
          order.paymentType = 'downpayment';
        }
        // 5. Fallback: if downpayment already paid but balance not paid, treat as remaining
        // ONLY if status is 'Pending Balance' (not for Pending Downpayment!)
        else if (order.status === 'Pending Balance' && order.downPaymentPaid && !order.balancePaid) {
          console.log('[PayMongo] Detected remaining balance (fallback) - awaiting admin verification');
          order.status = 'Pending Final Verification';
          order.paymentAmount = paidAmount;
          order.paymentType = 'remaining';
          order.balancePaid = true;
        }
        else {
          // Last resort fallback - keep current status and just record payment info
          console.log('[PayMongo] Fallback: recording payment, keeping current status:', order.status);
          if (paidAmount) order.paymentAmount = paidAmount;
          if (!order.paymentType) order.paymentType = order.downPaymentPaid ? 'remaining' : 'downpayment';
        }

        // Determine payment method from PayMongo session attributes
        const paymentMethodUsed = eventData.attributes?.payment_method_used || 'card';
        order.paymentMethod = paymentMethodUsed;
    }

    await order.save();

    console.log('[PayMongo] Order updated successfully:', order._id, 'Type:', isProductOrder ? 'Product' : 'Service', 'Payment Option:', order.paymentOption);

    // TODO: Send confirmation email to customer

  } catch (error) {
    console.error('[PayMongo] Error processing payment success:', error);
  }
}

/**
 * Process failed payment
 */
async function handlePaymentFailure(eventData) {
  try {
    const sessionId = eventData.id;
    const referenceNumber = eventData.attributes?.reference_number;

    console.log('[PayMongo] Processing payment failure for:', referenceNumber);

    // Try to find CustomOrder first
    let order = await CustomOrder.findOne({
      $or: [
        { paymentIntentId: sessionId },
        { _id: { $regex: new RegExp(referenceNumber, 'i') } }
      ]
    });

    // If not found, try regular Order
    if (!order) {
      order = await Order.findOne({
        $or: [
          { paymentIntentId: sessionId },
          { _id: { $regex: new RegExp(referenceNumber, 'i') } }
        ]
      });
    }

    if (!order) {
      console.error('[PayMongo] Order not found for reference:', referenceNumber);
      return;
    }

    // Update order status
    order.paymentStatus = 'failed';
    await order.save();

    console.log('[PayMongo] Payment failure recorded for order:', order._id);

  } catch (error) {
    console.error('[PayMongo] Error processing payment failure:', error);
  }
}

/**
 * Verify payment status (for client-side confirmation)
 * @route   GET /api/payments/verify/:sessionId
 * @access  Private
 */
exports.verifyPaymentStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Call PayMongo API to retrieve checkout session
    const paymongoResponse = await fetch(`${PAYMONGO_API_URL}/checkout_sessions/${sessionId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64')}`
      }
    });

    const paymongoData = await paymongoResponse.json();

    if (!paymongoResponse.ok) {
      throw new Error('Failed to verify payment status');
    }

    res.status(200).json({
      success: true,
      data: {
        status: paymongoData.data.attributes.payment_intent?.attributes?.status || 'pending',
        paymentMethod: paymongoData.data.attributes.payment_method_used,
        amount: paymongoData.data.attributes.line_items?.[0]?.amount / 100
      }
    });

  } catch (error) {
    console.error('[PayMongo] Verify payment error:', error);
    res.status(500).json({
      success: false,
      msg: 'Failed to verify payment',
      error: error.message
    });
  }
};

/**
 * Verify and sync payment status (on-demand check)
 * @route   GET /api/payments/sync/:sessionId
 * @access  Private
 */
exports.syncPaymentStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;

    const paymongoResponse = await fetch(`${PAYMONGO_API_URL}/checkout_sessions/${sessionId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64')}`
      }
    });

    const paymongoData = await paymongoResponse.json();
    if (!paymongoResponse.ok) {
      return res.status(500).json({ success: false, msg: 'Failed to fetch checkout session' });
    }

    const piStatus = paymongoData.data.attributes.payment_intent?.attributes?.status;
    const ref = paymongoData.data.attributes.reference_number;

    // Find order by session id across both models
    let order = await Order.findOne({ paymentIntentId: sessionId });
    let orderType = 'product';
    if (!order) {
      order = await CustomOrder.findOne({ paymentIntentId: sessionId });
      orderType = 'service';
    }

    if (!order) {
      return res.status(404).json({ success: false, msg: 'Order not found for this session' });
    }

    let updated = false;
    if (orderType === 'product') {
      if (piStatus === 'succeeded' && order.paymentStatus !== 'Received') {
        order.paymentStatus = 'Received';
        order.status = 'Accepted';
        order.isPaid = true;
        order.paidAt = new Date();
        await order.save();
        // Clear cart as a safety (if webhook missed)
        await Cart.findOneAndUpdate({ user: order.user }, { $set: { items: [] } });
        updated = true;
      }
    } else {
      if (piStatus === 'succeeded' && order.paymentStatus !== 'paid') {
        order.paymentStatus = 'paid';
        order.status = 'In Production';
        order.downPaymentPaid = true;
        if (order.paymentOption === 'full') order.finalPaymentPaid = true;
        await order.save();
        updated = true;
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        updated,
        orderType,
        orderId: order._id,
        paymentStatus: order.paymentStatus,
        status: order.status,
        piStatus,
        reference: ref
      }
    });
  } catch (error) {
    console.error('[PayMongo] Sync payment error:', error);
    return res.status(500).json({ success: false, msg: 'Failed to sync payment', error: error.message });
  }
};

/**
 * Admin: Get PayMongo payment details for a regular Order
 * @route   GET /api/payments/details/order/:orderId
 * @access  Private/Admin or Employee
 */
exports.getOrderPaymentDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId).populate('user','name email');
    if (!order) return res.status(404).json({ success: false, msg: 'Order not found' });
    if (!order.paymentIntentId) return res.status(400).json({ success: false, msg: 'No payment session linked to this order' });

    const paymongoResponse = await fetch(`${PAYMONGO_API_URL}/checkout_sessions/${order.paymentIntentId}`, {
      method: 'GET',
      headers: { 'Authorization': `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64')}` }
    });
    const data = await paymongoResponse.json();
    if (!paymongoResponse.ok) {
      return res.status(500).json({ success: false, msg: 'Failed to fetch PayMongo details', error: data });
    }
    const a = data.data.attributes;
    const lineItems = Array.isArray(a.line_items) ? a.line_items : [];
    const deliveryFeeCents = lineItems
      .filter(li => (li.name || '').toLowerCase().includes('delivery fee'))
      .reduce((s, li) => s + (li.amount || 0), 0);
    const totalCents = lineItems.reduce((s, li) => s + (li.amount || 0), 0);
    const itemsTotalCents = Math.max(0, totalCents - deliveryFeeCents);
    return res.status(200).json({
      success: true,
      data: {
        sessionId: data.data.id,
        referenceNumber: a.reference_number,
        paymentMethodUsed: a.payment_method_used,
        status: a.payment_intent?.attributes?.status,
        amount: totalCents / 100,
        itemsTotal: itemsTotalCents / 100,
        deliveryFee: deliveryFeeCents / 100,
        checkoutUrl: a.checkout_url,
        billing: a.billing,
        createdAt: a.created_at,
      }
    });
  } catch (error) {
    console.error('[PayMongo] Get order payment details error:', error);
    return res.status(500).json({ success: false, msg: 'Failed to get payment details', error: error.message });
  }
};

/**
 * Manually sync payment status from PayMongo (for localhost testing without webhooks)
 * @route   POST /api/payments/sync/:orderId
 * @access  Private (Customer or Admin)
 */
exports.syncPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    // Try CustomOrder first
    let order = await CustomOrder.findById(orderId);
    let isCustomOrder = true;
    
    if (!order) {
      order = await Order.findById(orderId);
      isCustomOrder = false;
    }
    
    if (!order) {
      return res.status(404).json({ success: false, msg: 'Order not found' });
    }
    
    // Check authorization
    if (order.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, msg: 'Not authorized' });
    }
    
    if (!order.paymentIntentId) {
      return res.status(400).json({ success: false, msg: 'No payment session to sync' });
    }
    
    console.log('[Payment Sync] Manually checking PayMongo status for order:', orderId);
    
    // Fetch current payment status from PayMongo
    const paymongoResponse = await fetch(`${PAYMONGO_API_URL}/checkout_sessions/${order.paymentIntentId}`, {
      method: 'GET',
      headers: { 
        'Authorization': `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64')}` 
      }
    });
    
    const data = await paymongoResponse.json();
    
    if (!paymongoResponse.ok) {
      console.error('[Payment Sync] PayMongo API error:', data);
      return res.status(500).json({ 
        success: false, 
        msg: 'Failed to fetch payment status from PayMongo',
        error: data 
      });
    }
    
    const attributes = data.data.attributes;
    const paymentStatus = attributes.payment_intent?.attributes?.status;
    const payments = attributes.payment_intent?.attributes?.payments || [];
    
    console.log('[Payment Sync] PayMongo status:', paymentStatus, 'Payments:', payments.length);
    
    if (paymentStatus === 'succeeded' && payments.length > 0) {
      // Payment was successful - simulate webhook processing
      console.log('[Payment Sync] Payment succeeded, updating order...');
      
      // Construct event data similar to webhook
      const eventData = {
        id: order.paymentIntentId,
        attributes: {
          reference_number: attributes.reference_number,
          payment_method_used: attributes.payment_method_used || payments[0]?.attributes?.source?.type || 'card',
          line_items: attributes.line_items || []
        }
      };
      
      // Call the same handler as webhook
      await handlePaymentSuccess(eventData);
      
      // Fetch updated order
      if (isCustomOrder) {
        order = await CustomOrder.findById(orderId);
      } else {
        order = await Order.findById(orderId);
      }
      
      return res.status(200).json({
        success: true,
        msg: 'Payment status synced successfully',
        data: {
          status: order.status,
          paymentStatus: order.paymentStatus,
          paymentType: order.paymentType,
          paymentAmount: order.paymentAmount
        }
      });
    } else if (paymentStatus === 'failed') {
      return res.status(200).json({
        success: false,
        msg: 'Payment failed',
        data: { status: 'failed' }
      });
    } else {
      return res.status(200).json({
        success: false,
        msg: 'Payment still pending or not completed',
        data: { status: paymentStatus || 'pending' }
      });
    }
    
  } catch (error) {
    console.error('[Payment Sync] Error:', error);
    return res.status(500).json({ 
      success: false, 
      msg: 'Failed to sync payment status',
      error: error.message 
    });
  }
};

/**
 * Admin: Get PayMongo payment details for a CustomOrder
 * @route   GET /api/payments/details/custom/:orderId
 * @access  Private/Admin or Employee
 */
exports.getCustomOrderPaymentDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await CustomOrder.findById(orderId).populate('user','name email');
    if (!order) return res.status(404).json({ success: false, msg: 'Custom order not found' });
    if (!order.paymentIntentId) return res.status(400).json({ success: false, msg: 'No payment session linked to this custom order' });

    const paymongoResponse = await fetch(`${PAYMONGO_API_URL}/checkout_sessions/${order.paymentIntentId}`, {
      method: 'GET',
      headers: { 'Authorization': `Basic ${Buffer.from(PAYMONGO_SECRET_KEY + ':').toString('base64')}` }
    });
    const data = await paymongoResponse.json();
    if (!paymongoResponse.ok) {
      return res.status(500).json({ success: false, msg: 'Failed to fetch PayMongo details', error: data });
    }
    const a = data.data.attributes;
    const lineItems = Array.isArray(a.line_items) ? a.line_items : [];
    const deliveryFeeCents = lineItems
      .filter(li => (li.name || '').toLowerCase().includes('delivery fee'))
      .reduce((s, li) => s + (li.amount || 0), 0);
    const totalCents = lineItems.reduce((s, li) => s + (li.amount || 0), 0);
    const itemsTotalCents = Math.max(0, totalCents - deliveryFeeCents);
    return res.status(200).json({
      success: true,
      data: {
        sessionId: data.data.id,
        referenceNumber: a.reference_number,
        paymentMethodUsed: a.payment_method_used,
        status: a.payment_intent?.attributes?.status,
        amount: totalCents / 100,
        itemsTotal: itemsTotalCents / 100,
        deliveryFee: deliveryFeeCents / 100,
        checkoutUrl: a.checkout_url,
        billing: a.billing,
        createdAt: a.created_at,
      }
    });
  } catch (error) {
    console.error('[PayMongo] Get custom order payment details error:', error);
    return res.status(500).json({ success: false, msg: 'Failed to get payment details', error: error.message });
  }
};

/**
 * Admin: List recent webhook events (audit)
 * @route   GET /api/payments/webhooks/recent
 * @access  Private/Admin
 */
exports.getRecentWebhooks = async (req, res) => {
  try {
    const limitParam = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const filter = {};
    if (typeof req.query.verified !== 'undefined') {
      const v = String(req.query.verified).toLowerCase();
      filter.verified = (v === 'true' || v === '1');
    }
    if (typeof req.query.processed !== 'undefined') {
      const p = String(req.query.processed).toLowerCase();
      filter.processed = (p === 'true' || p === '1');
    }

    const docs = await WebhookEvent.find(filter)
      .sort({ createdAt: -1 })
      .limit(limitParam)
      .lean()
      .exec();

    return res.status(200).json({ success: true, count: docs.length, data: docs });
  } catch (error) {
    console.error('[PayMongo] Get recent webhooks error:', error);
    return res.status(500).json({ success: false, msg: 'Failed to fetch webhooks', error: error.message });
  }
};
