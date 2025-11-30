const CustomOrder = require('../models/CustomOrder');
const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const User = require('../models/User');
const WebhookEvent = require('../models/WebhookEvent');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { allocateInventoryBySizes, allocateInventory, findInventoryByName } = require('../utils/inventory');
const deliveryRatesUtil = require('../utils/deliveryRates');
const Receipt = require('../models/Receipt');

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

    // Recompute authoritative amounts server-side for services
    // baseAmount is the service/item subtotal (without delivery or VAT)
    const base = Number(baseAmount || amount || 0);
    // Determine delivery fee from server config
    const cfg = deliveryRatesUtil.getRates();
    const DELIVERY_RATES = cfg.rates || {};
    const DEFAULT_RATE = cfg.defaultRate || 120;
    function getRateForProvince(prov) {
      if (!prov) return DEFAULT_RATE;
      const key = (prov || '').toString().toLowerCase().trim();
      if (key.includes('cavite')) return DELIVERY_RATES['cavite'] || DEFAULT_RATE;
      if (key.includes('laguna')) return DELIVERY_RATES['laguna'] || DEFAULT_RATE;
      if (key.includes('batangas')) return DELIVERY_RATES['batangas'] || DEFAULT_RATE;
      if (key.includes('metro') || key.includes('manila') || key.includes('quezon city') || key.includes('makati')) return DELIVERY_RATES['metro manila'] || DEFAULT_RATE;
      return DELIVERY_RATES[key] || DEFAULT_RATE;
    }

    let deliveryFeeNumber = 0;
    if ((shippingMethod || '').toString().toLowerCase() === 'pick-up') {
      deliveryFeeNumber = 0;
    } else {
      // Try to find province from shippingAddress
      const prov = (shippingAddress && (shippingAddress.province || shippingAddress.city)) || '';
      deliveryFeeNumber = getRateForProvince(prov);
    }

    // VAT applies to subtotal (base) only, not to delivery
    const taxable = Math.max(base, 0);
    const VAT_RATE = 0.12;
    const totalVat = Math.round((taxable * VAT_RATE + Number.EPSILON) * 100) / 100;

    // Adjust VAT for downpayment/balance options
    let vatForCharge = totalVat;
    let finalCharge = 0;
    // Preserve raw option for calculation (keep 'balance' to compute remaining correctly)
    const rawOption = (paymentOption === 'balance') ? 'balance' : (paymentOption || 'full');
    // For storing into the CustomOrder.paymentOption (enum), map 'balance' -> 'downpayment'
    const storeOption = rawOption === 'balance' ? 'downpayment' : rawOption;
    if (rawOption === 'downpayment') {
      finalCharge = Math.round(((taxable + deliveryFeeNumber + totalVat) * 0.5 + Number.EPSILON) * 100) / 100;
      vatForCharge = Math.round((totalVat * 0.5 + Number.EPSILON) * 100) / 100;
    } else if (rawOption === 'balance') {
      // For remaining balance, infer alreadyPaid from serviceData or provided fields
      let alreadyPaid = Number(serviceData?.alreadyPaidAmount || 0);
      if (!alreadyPaid || alreadyPaid <= 0) {
        alreadyPaid = (taxable + (serviceData?.previousDeliveryFee || 0)) * 0.5;
      }
      const totalWithDelivery = taxable + (serviceData?.previousDeliveryFee || 0);
      const remaining = Math.max(totalWithDelivery - alreadyPaid, 0);
      // Proportionally compute remaining VAT
      const denom = (totalWithDelivery) || 1;
      const proportionPaid = Math.min(Math.max(alreadyPaid / denom, 0), 1);
      const vatPaid = Math.round((totalVat * proportionPaid + Number.EPSILON) * 100) / 100;
      vatForCharge = Math.max(Math.round((totalVat - vatPaid + Number.EPSILON) * 100) / 100, 0);
      finalCharge = Math.round((remaining + vatForCharge + Number.EPSILON) * 100) / 100;
    } else {
      finalCharge = Math.round((taxable + deliveryFeeNumber + totalVat + Number.EPSILON) * 100) / 100;
      vatForCharge = totalVat;
    }

    // Convert amount to centavos (PayMongo expects integer in cents)
    const amountInCents = Math.round(finalCharge * 100);
    
    // Determine payment description based on payment option
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
      // Store full order total (including VAT and delivery) as authoritative totalPrice
      order.totalPrice = (base || 0) + (deliveryFeeNumber || 0) + (totalVat || 0);
      order.paymentOption = storeOption;
      order.shippingMethod = shippingMethod || 'Standard';
      order.shippingAddress = shippingAddress || null;
      order.deliveryFee = deliveryFeeNumber || 0;
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
        // Store full order total (including VAT + delivery)
        totalPrice: (base || 0) + (deliveryFeeNumber || 0) + (totalVat || 0),
        paymentOption: storeOption,
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
      // Return detailed info to client for debugging (502 Bad Gateway)
      return res.status(502).json({
        success: false,
        msg: paymongoData.errors?.[0]?.detail || 'Failed to create payment session',
        paymongo: paymongoData,
        status: paymongoResponse.status
      });
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
    // Compute subtotal
    const subtotal = items.reduce((s, it) => s + (it.price * it.quantity), 0);

    // Load authoritative delivery rates from server config
    const cfg = deliveryRatesUtil.getRates();
    const DELIVERY_RATES = cfg.rates || {};
    const DEFAULT_RATE = cfg.defaultRate || 120;
    function getRateForProvince(prov) {
      if (!prov) return DEFAULT_RATE;
      const key = (prov || '').toString().toLowerCase().trim();
      if (key.includes('cavite')) return DELIVERY_RATES['cavite'] || DEFAULT_RATE;
      if (key.includes('laguna')) return DELIVERY_RATES['laguna'] || DEFAULT_RATE;
      if (key.includes('batangas')) return DELIVERY_RATES['batangas'] || DEFAULT_RATE;
      if (key.includes('metro') || key.includes('manila') || key.includes('quezon city') || key.includes('makati')) return DELIVERY_RATES['metro manila'] || DEFAULT_RATE;
      return DELIVERY_RATES[key] || DEFAULT_RATE;
    }

    // Compute authoritative delivery fee based on shipping address and method
    let deliveryFeeNumber = 0;
    if ((shippingMethod || '').toString().toLowerCase() === 'pick-up') {
      deliveryFeeNumber = 0;
    } else {
      deliveryFeeNumber = getRateForProvince((shippingAddress && (shippingAddress.province || shippingAddress.city)) || '');
    }
    // Honor voucher-based free shipping
    if (appliedVoucher && appliedVoucher.type === 'free_shipping') {
      deliveryFeeNumber = 0;
    }

    // Cap discount so total is never less than 1 (₱1)
    let maxDiscount = subtotal + deliveryFeeNumber - 1; // keep at least ₱1
    if (discount > maxDiscount) {
      discount = maxDiscount;
    }

    // Authoritative server-side amount: apply discount, compute VAT on taxable (subtotal - discount), then add delivery
    const taxable = Math.max(subtotal - discount, 0);
    const VAT_RATE = 0.12;
    const vatAmount = Math.round((taxable * VAT_RATE + Number.EPSILON) * 100) / 100;
    amount = Math.max(1, Math.round((taxable + deliveryFeeNumber + vatAmount + Number.EPSILON) * 100) / 100);

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

    // Server-side validation: ensure size was provided when the linked Inventory has per-size stock
    try {
      for (const it of items) {
        if (!it.productId) continue;
        const prod = await Product.findById(it.productId);
        if (!prod) continue;
        const linkedInv = await Inventory.findOne({ productId: prod._id });
        const sizesInv = linkedInv?.sizesInventory || null;
        const hasPerSize = sizesInv && ((sizesInv instanceof Map && sizesInv.size > 0) || (typeof sizesInv === 'object' && Object.keys(sizesInv || {}).length > 0));
        if (hasPerSize && (!it.size || String(it.size).trim() === '')) {
          // remove the created order to avoid incomplete orders
          await Order.findByIdAndDelete(order._id);
          return res.status(400).json({ success: false, msg: `Size is required for product: ${it.name || prod.name}` });
        }
      }
    } catch (e) {
      console.warn('[Payment] Post-order size validation failed:', e && e.message);
    }

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

      // Return API error details to client to aid debugging
      return res.status(502).json({
        success: false,
        msg: paymongoData.errors?.[0]?.detail || 'Failed to create payment session',
        paymongo: paymongoData,
        status: paymongoResponse.status
      });
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
            const invNameToId = {};
          console.log('[PayMongo] Order items (for allocation):', JSON.stringify(orderInSession.orderItems || []));
          for (const item of orderInSession.orderItems) {
            if (!item.product) continue;
            const product = await Product.findById(item.product).session(session);
            if (!product) continue;

            // Prefer finding the Inventory document by productId so per-size
            // allocations target the correct inventory entry (avoids name mismatches).
            const linkedInventory = await Inventory.findOne({ productId: product._id }).session(session);

            if (item.size) {
              const invName = linkedInventory ? linkedInventory.name : (product.name || product._id.toString());
                if (linkedInventory && linkedInventory._id) invNameToId[invName] = linkedInventory._id.toString();
              perInventorySizes[invName] = perInventorySizes[invName] || {};
              perInventorySizes[invName][item.size] = (perInventorySizes[invName][item.size] || 0) + (Number(item.quantity) || 0);
            } else {
              const newStock = Math.max(0, product.countInStock - item.quantity);
              product.countInStock = newStock;
              await product.save({ session });
              console.log(`[Stock] Deducted ${item.quantity} from Product ${product.name}. New stock: ${newStock}`);

              const inventoryItem = linkedInventory || await Inventory.findOne({ productId: product._id }).session(session);
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
              console.log('[PayMongo] Allocating sizes for inventory:', invName, 'sizesMap:', JSON.stringify(sizesMap));
                const inventoryId = invNameToId[invName] || null;
                const allocResult = await require('../utils/inventory').allocateInventoryBySizes({ name: invName, inventoryId, sizesMap, orderId: order._id, session, note: 'Allocated by sizes on payment success' });
              console.log('[PayMongo] Allocation result for', invName, 'inventoryId:', allocResult && allocResult._id ? allocResult._id.toString() : '(unknown)');
              // Sync linked Product.countInStock if inventory references a product
              try {
                  let invAfter = null;
                  if (invNameToId[invName]) invAfter = await Inventory.findById(invNameToId[invName]).session(session);
                  if (!invAfter) invAfter = await Inventory.findOne({ name: new RegExp('^' + invName + '$', 'i') }).session(session);
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

          // Remove only the purchased items from the cart (match by product + size)
          try {
            const pullConds = (orderInSession.orderItems || []).map(it => {
              if (!it || !it.product) return null;
              return it.size ? { product: it.product, size: it.size } : { product: it.product, size: null };
            }).filter(Boolean);
            if (pullConds.length) {
              await Cart.updateOne(
                { user: orderInSession.user },
                { $pull: { items: { $or: pullConds } } },
                { session }
              );
            }
          } catch (pullErr) {
            console.warn('[PayMongo] Failed to remove purchased items from cart in transaction, falling back to clearing entire cart:', pullErr && pullErr.message);
            await Cart.findOneAndUpdate({ user: orderInSession.user }, { $set: { items: [] } }, { session });
          }

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
          const invNameToIdFallback = {};
          for (const item of order.orderItems) {
            if (!item.product) continue;
            const product = await Product.findById(item.product);
            if (!product) continue;

            // Try linked inventory by productId first
            const linkedInventory = await Inventory.findOne({ productId: product._id });

            if (item.size) {
              const invName = linkedInventory ? linkedInventory.name : (product.name || product._id.toString());
              if (linkedInventory && linkedInventory._id) invNameToIdFallback[invName] = linkedInventory._id.toString();
              perInventorySizesFallback[invName] = perInventorySizesFallback[invName] || {};
              perInventorySizesFallback[invName][item.size] = (perInventorySizesFallback[invName][item.size] || 0) + (Number(item.quantity) || 0);
            } else {
              const newStock = Math.max(0, product.countInStock - item.quantity);
              product.countInStock = newStock;
              await product.save();
              const inventoryItem = linkedInventory || await Inventory.findOne({ productId: product._id });
              if (inventoryItem) {
                inventoryItem.quantity = newStock;
                await inventoryItem.save();
              }
            }
          }

          // Perform allocations for per-size groups (no session)
          for (const [invName, sizesMap] of Object.entries(perInventorySizesFallback)) {
            try {
              console.log('[PayMongo] (fallback) Allocating sizes for inventory:', invName, 'sizesMap:', JSON.stringify(sizesMap));
              const inventoryId = invNameToIdFallback[invName] || null;
              const allocResultFallback = await require('../utils/inventory').allocateInventoryBySizes({ name: invName, inventoryId, sizesMap, orderId: order._id, note: 'Allocated by sizes on payment success (fallback)' });
              console.log('[PayMongo] (fallback) Allocation result for', invName, 'inventoryId:', allocResultFallback && allocResultFallback._id ? allocResultFallback._id.toString() : '(unknown)');
              try {
                let invAfter = null;
                if (invNameToIdFallback[invName]) invAfter = await Inventory.findById(invNameToIdFallback[invName]);
                if (!invAfter) invAfter = await Inventory.findOne({ name: new RegExp('^' + invName + '$', 'i') });
                if (invAfter && invAfter.productId) {
                  const prod = await Product.findById(invAfter.productId);
                  if (prod) { prod.countInStock = Number(invAfter.quantity || 0); await prod.save(); }
                }
              } catch (syncErr) { console.warn('Failed to sync product after sizes allocation (webhook fallback):', syncErr && syncErr.message); }
            } catch (allocErr) {
              console.error('[PayMongo] Fallback allocation failed for', invName, allocErr && allocErr.message);
            }
          }

          try {
            const pullCondsFallback = (order.orderItems || []).map(it => {
              if (!it || !it.product) return null;
              return it.size ? { product: it.product, size: it.size } : { product: it.product, size: null };
            }).filter(Boolean);
            if (pullCondsFallback.length) {
              await Cart.updateOne({ user: order.user }, { $pull: { items: { $or: pullCondsFallback } } });
            } else {
              await Cart.findOneAndUpdate({ user: order.user }, { $set: { items: [] } }, { new: true });
            }
          } catch (pullFallbackErr) {
            console.warn('[PayMongo] Failed to selectively remove cart items (fallback), clearing entire cart:', pullFallbackErr && pullFallbackErr.message);
            await Cart.findOneAndUpdate({ user: order.user }, { $set: { items: [] } }, { new: true });
          }

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

        // Decide payment type deterministically by amount first, then by status
        const epsilon = 0.01; // floating safety
        const halfAmount = totalAmount * 0.5;
        const fullTolerance = Math.max(totalAmount * 0.05, epsilon);
        const halfTolerance = Math.max(totalAmount * 0.1, epsilon);

        // 1. Full payment (100%) - identify by amount first
        if (paidAmount && Math.abs(paidAmount - totalAmount) <= fullTolerance) {
          console.log('[PayMongo] Detected 100% full payment - marking for final verification');
          order.paymentAmount = paidAmount;
          order.paymentType = 'full';
          order.downPaymentPaid = true;
          order.balancePaid = true;
          // Set to pending final verification so admin explicitly verifies
          order.status = 'Pending Final Verification';
          // Attempt idempotent allocation now (webhook) so inventory reflects payment immediately.
          // This is safe because `allocateInventoryBySizes` has an idempotency guard.
          if (!order.inventoryAllocated) {
            try {
              const allocSession = await mongoose.startSession();
              await allocSession.withTransaction(async () => {
                const extractSizesMap = (ord) => {
                  const map = {};
                  if (Array.isArray(ord.teamMembers) && ord.teamMembers.length) {
                    for (const m of ord.teamMembers) {
                      const s = (m.size || m.sizeLabel || '').toString();
                      if (!s) continue;
                      map[s] = (map[s] || 0) + 1;
                    }
                  } else if (ord.quotePayload && Array.isArray(ord.quotePayload.teamEntries) && ord.quotePayload.teamEntries.length) {
                    for (const e of ord.quotePayload.teamEntries) {
                      const s = (e.size || e.sizeLabel || '').toString();
                      const qty = Number(e.qty || e.quantity || 1) || 1;
                      if (!s) continue;
                      map[s] = (map[s] || 0) + qty;
                    }
                  } else if (ord.garmentSize || ord.size) {
                    const s = (ord.garmentSize || ord.size || '').toString();
                    if (s) {
                      const qty = Number(ord.quantity || 1) || 1;
                      map[s] = (map[s] || 0) + qty;
                    }
                  }
                  Object.keys(map).forEach(k => { if (!(map[k] > 0)) delete map[k]; });
                  return Object.keys(map).length ? map : null;
                };

                const sizesMap = extractSizesMap(order);
                if (sizesMap) {
                  const invName = order.inventoryName || order.productName || order.garmentType || order.fabricType || null;
                  if (!invName) throw new Error('Cannot determine inventory name for per-size allocation (webhook)');
                  const invDoc = await findInventoryByName(invName, allocSession);
                  const inventoryId = invDoc ? invDoc._id : null;
                  const allocRes = await allocateInventoryBySizes({ name: invName, inventoryId, sizesMap, orderId: order._id, session: allocSession, note: 'Allocated by sizes on webhook full payment' });
                  // sync linked Product.countInStock if inventory references product
                  try {
                    let invAfter = allocRes;
                    if (!invAfter) invAfter = invDoc ? await Inventory.findById(invDoc._id).session(allocSession) : await findInventoryByName(invName, allocSession);
                    if (invAfter && invAfter.productId) {
                      const prod = await Product.findById(invAfter.productId).session(allocSession);
                      if (prod) { prod.countInStock = Number(invAfter.quantity || 0); await prod.save({ session: allocSession }); }
                    }
                  } catch (syncErr) { console.warn('[PayMongo] Failed to sync product after webhook sizes allocation:', syncErr && syncErr.message); }
                  order.inventoryAllocated = true;
                  order.allocatedItems = [{ inventoryId: invDoc ? invDoc._id : null, name: invName, qty: Object.values(sizesMap).reduce((a,b)=>a+b,0) }];
                } else if (order.serviceType === 'printing-only' && (order.inventoryName || order.fabricType)) {
                  const allocName = order.inventoryName || order.fabricType;
                  const invDoc = await allocateInventory({ name: allocName, qty: Number(order.quantity || 1), orderId: order._id, session: allocSession, note: 'Allocated by webhook full payment' });
                  order.inventoryAllocated = true;
                  order.allocatedItems = [{ inventoryId: invDoc._id, name: invDoc.name, qty: Number(order.quantity || 1) }];
                  try {
                    if (invDoc.productId) {
                      const prod = await Product.findById(invDoc.productId).session(allocSession);
                      if (prod) { prod.countInStock = Number(invDoc.quantity || 0); await prod.save({ session: allocSession }); }
                    }
                  } catch (syncErr) { console.warn('[PayMongo] Failed to sync product after webhook allocation:', syncErr && syncErr.message); }
                }

                // Persist order allocation flags inside the transaction
                await order.save({ session: allocSession });
              });
              allocSession.endSession();
            } catch (allocErr) {
              console.warn('[PayMongo] Webhook allocation attempt failed (non-fatal):', allocErr && allocErr.message);
            }
          }
        }
        // 2. Remaining balance (final 50%) - if order expects balance
        else if (order.status === 'Pending Balance' && order.downPaymentPaid && !order.balancePaid) {
          console.log('[PayMongo] Detected remaining balance payment - awaiting admin verification');
          order.paymentAmount = paidAmount;
          order.paymentType = 'remaining';
          order.balancePaid = true;
          order.status = 'Pending Final Verification';
        }
        // 3. Downpayment by amount (50%) when there is no previous downpayment
        else if (!order.downPaymentPaid && paidAmount && Math.abs(paidAmount - halfAmount) <= halfTolerance) {
          console.log('[PayMongo] Detected 50% downpayment by amount - awaiting admin verification');
          order.paymentAmount = paidAmount;
          order.paymentType = 'downpayment';
          order.downPaymentPaid = true;
          // keep order.status as-is (usually 'Pending Downpayment') so admin can verify
        }
        // 4. Status-driven case: if status indicates Pending Downpayment and none recorded yet
        else if (order.status === 'Pending Downpayment' && !order.downPaymentPaid) {
          console.log('[PayMongo] Status indicates Pending Downpayment - marking downPaymentPaid');
          order.paymentAmount = paidAmount || order.paymentAmount;
          order.paymentType = 'downpayment';
          order.downPaymentPaid = true;
        }
        else {
          // Fallback: record payment amount and keep existing flags/status
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

    // Create a receipt record with auto-generated TIN
    try {
      function generateTIN() { return 'TIN-' + Math.random().toString(36).substr(2, 8).toUpperCase(); }

      const receiptItems = [];
      let subtotal = 0;
      if (isProductOrder) {
        for (const it of (order.orderItems || [])) {
          const q = Number(it.quantity || 0);
          const p = Number(it.price || 0);
          receiptItems.push({ name: it.name || 'Item', quantity: q, price: p, size: it.size || '' });
          subtotal += p * q;
        }
      } else {
        // For service/custom orders, try to extract items from quotePayload or team entries
        if (order.quotePayload && Array.isArray(order.quotePayload.teamEntries) && order.quotePayload.teamEntries.length) {
          for (const e of order.quotePayload.teamEntries) {
            const q = Number(e.qty || e.quantity || 1) || 1;
            const p = Number(e.price || 0);
            receiptItems.push({ name: e.name || order.productName || 'Service Item', quantity: q, price: p, size: e.size || '' });
            subtotal += p * q;
          }
        } else if (order.quantity) {
          const p = Number(order.totalPrice || 0);
          const q = Number(order.quantity || 1);
          const unit = q ? Math.round((p / q + Number.EPSILON) * 100) / 100 : p;
          receiptItems.push({ name: order.productName || 'Service', quantity: q, price: unit, size: order.garmentSize || '' });
          subtotal += unit * q;
        } else {
          // Fallback: single line with totalPrice
          const p = Number(order.totalPrice || 0);
          receiptItems.push({ name: order.productName || order.serviceType || 'Service', quantity: 1, price: p, size: '' });
          subtotal += p;
        }
      }

      const vat = Number(order.vat || order.vatAmount || 0) || 0;
      const delivery = Number(order.deliveryFee || 0) || 0;
      const total = Number(order.totalPrice || order.paymentAmount || subtotal + vat + delivery) || 0;

      const newReceipt = new Receipt({
        user: order.user,
        orderId: order._id,
        orderType: isProductOrder ? 'product' : 'service',
        tin: generateTIN(),
        items: receiptItems,
        subtotal,
        vat,
        deliveryFee: delivery,
        total,
        logoUrl: process.env.BUSINESS_LOGO_URL || '/images/logo.png',
        meta: { paymentIntentId: order.paymentIntentId }
      });

      await newReceipt.save();
      // Attach receipt reference to order for convenience
      try { order.receiptId = newReceipt._id; await order.save(); } catch (e) { /* non-fatal */ }
      console.log('[Receipt] Created receipt', newReceipt._id.toString(), 'for order', order._id.toString());
    } catch (receiptErr) {
      console.warn('[Receipt] Failed to create receipt:', receiptErr && receiptErr.message);
    }

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
