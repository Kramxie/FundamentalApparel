const CustomOrder = require('../models/CustomOrder');
const Order = require('../models/Order');

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
    
    // Validate shipping address if Standard Delivery
    if (shippingMethod === 'Standard' && (!shippingAddress || !shippingAddress.street)) {
      return res.status(400).json({
        success: false,
        msg: 'Shipping address is required for Standard Delivery'
      });
    }

    // Convert amount to centavos (PayMongo expects integer in cents)
    const amountInCents = Math.round(amount * 100);
    
    // Determine payment description based on payment option
    const paymentDesc = paymentOption === 'downpayment' 
      ? '50% Downpayment' 
      : '100% Full Payment';

    // Prepare line items for PayMongo
    const lineItems = [{
      currency: 'PHP',
      amount: amountInCents,
      name: `${serviceData?.serviceName || 'Custom Jersey Service'} - ${paymentDesc}`,
      quantity: serviceData?.quantity || 1,
      description: `${serviceType || 'customize-jersey'} - Ref: ${orderReference || 'PENDING'} - ${shippingMethod || 'Standard'} Delivery`
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
      order.paymentStatus = 'pending';
      order.totalPrice = baseAmount || amount;
      order.paymentOption = paymentOption || 'full';
      order.shippingMethod = shippingMethod || 'Standard';
      order.shippingAddress = shippingAddress || null;
      order.deliveryFee = deliveryFee || 0;
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
        paymentOption: paymentOption || 'full',
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

    // Build success and cancel URLs with order reference
    const orderRef = order._id.toString().slice(-8).toUpperCase();
    const finalSuccessUrl = successUrl || `${BASE_URL}/client/payment-success.html?ref=${orderRef}`;
    const finalCancelUrl = cancelUrl || `${BASE_URL}/client/payment-cancel.html?ref=${orderRef}`;

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
exports.createOrderPaymentSession = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      items,
      shippingAddress,
      amount,
      paymentMethod
    } = req.body;

    console.log('[PayMongo] Creating checkout session for product order, user:', userId);

    // Validation
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        msg: 'Order items are required'
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        msg: 'Invalid payment amount'
      });
    }

    if (!shippingAddress || !shippingAddress.fullName || !shippingAddress.address) {
      return res.status(400).json({
        success: false,
        msg: 'Shipping address is required'
      });
    }

    // Validate payment method
    if (!paymentMethod || !['gcash', 'card'].includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        msg: 'Payment method must be either gcash or card'
      });
    }

    // Convert amount to centavos (PayMongo expects integer in cents)
    const amountInCents = Math.round(amount * 100);

    // Prepare line items for PayMongo
    const lineItems = items.map(item => ({
      currency: 'PHP',
      amount: Math.round((item.price || 0) * (item.quantity || 1) * 100),
      name: item.name || 'Product',
      quantity: item.quantity || 1,
      description: `Product ID: ${item.productId || 'N/A'}`
    }));

    // Create new Order
    const order = new Order({
      user: userId,
      orderItems: items.map(item => ({
        product: item.productId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        imageUrl: item.image || item.imageUrl || ''
      })),
      totalPrice: amount,
      shippingAddress: {
        street: shippingAddress.address || shippingAddress.street,
        province: shippingAddress.province,
        city: shippingAddress.city,
        zip: shippingAddress.zipCode || shippingAddress.zip,
        phone: shippingAddress.phone
      },
      paymentMethod: paymentMethod,
      paymentStatus: 'Pending',
      status: 'Processing'
    });

    await order.save();

    // Build success and cancel URLs with order reference
    const orderRef = order._id.toString().slice(-8).toUpperCase();
    const finalSuccessUrl = `${BASE_URL}/client/payment-success.html?ref=${orderRef}&type=order`;
    const finalCancelUrl = `${BASE_URL}/client/payment-cancel.html?ref=${orderRef}&type=order`;

    // Determine payment method types based on selection
    const paymentMethodTypes = paymentMethod === 'card' 
      ? ['card'] 
      : ['gcash'];

    // PayMongo Checkout Session payload
    const checkoutPayload = {
      data: {
        attributes: {
          line_items: lineItems,
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
 * Handle PayMongo Webhook (for payment status updates)
 * @route   POST /api/payments/webhook
 * @access  Public (webhook endpoint)
 */
exports.handlePaymongoWebhook = async (req, res) => {
  try {
    const event = req.body;
    
    console.log('[PayMongo] Webhook received:', event.data?.type);

    // Verify webhook signature (recommended for production)
    // Implementation depends on PayMongo's webhook signature verification

    switch (event.data?.type) {
      case 'checkout_session.payment.paid':
        await handlePaymentSuccess(event.data);
        break;
      
      case 'checkout_session.payment.failed':
        await handlePaymentFailure(event.data);
        break;

      default:
        console.log('[PayMongo] Unhandled webhook type:', event.data?.type);
    }

    res.status(200).json({ received: true });

  } catch (error) {
    console.error('[PayMongo] Webhook error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Process successful payment
 */
async function handlePaymentSuccess(eventData) {
  try {
    const sessionId = eventData.id;
    const referenceNumber = eventData.attributes?.reference_number;

    console.log('[PayMongo] Processing payment success for:', referenceNumber);

    // Try to find CustomOrder first (services)
    let order = await CustomOrder.findOne({
      $or: [
        { paymentIntentId: sessionId },
        { _id: { $regex: new RegExp(referenceNumber, 'i') } }
      ]
    });

    let isProductOrder = false;

    // If not found, try to find regular Order (products)
    if (!order) {
      order = await Order.findOne({
        $or: [
          { paymentIntentId: sessionId },
          { _id: { $regex: new RegExp(referenceNumber, 'i') } }
        ]
      });
      isProductOrder = true;
    }

    if (!order) {
      console.error('[PayMongo] Order not found for reference:', referenceNumber);
      return;
    }

    // Update order status based on type
    if (isProductOrder) {
      order.paymentStatus = 'Received';
      order.status = 'Processing'; // Move to processing
      order.isPaid = true;
      order.paidAt = new Date();
    } else {
      // Service order - check payment option
      order.paymentStatus = 'paid';
      
      if (order.paymentOption === 'downpayment') {
        // 50% downpayment paid
        order.status = 'In Production';
        order.downPaymentPaid = true;
      } else {
        // 100% full payment paid
        order.status = 'In Production';
        order.downPaymentPaid = true;
        order.finalPaymentPaid = true;
      }
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
