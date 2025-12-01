const path = require('path');
const fs = require('fs');
const RefundRequest = require('../models/RefundRequest');
const Order = require('../models/Order');
const CustomOrder = require('../models/CustomOrder');
const User = require('../models/User');
const notify = require('../utils/notify');
const sendEmail = require('../utils/sendEmail');

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const PAYMONGO_API_URL = 'https://api.paymongo.com/v1';

// Helper: Send refund status email to customer
async function sendRefundStatusEmail(user, refundRequest, statusMessage) {
  if (!user || !user.email) return;
  try {
    const subject = `Refund Request Update - ${refundRequest.status}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4F46E5;">Fundamental Apparel</h2>
        <h3>Refund Request Update</h3>
        <p>Hi ${user.name || 'Valued Customer'},</p>
        <p>${statusMessage}</p>
        <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Request ID:</strong> ${refundRequest._id}</p>
          <p><strong>Status:</strong> ${refundRequest.status}</p>
          <p><strong>Reason:</strong> ${refundRequest.reason}</p>
          ${refundRequest.adminNotes ? `<p><strong>Admin Notes:</strong> ${refundRequest.adminNotes}</p>` : ''}
          ${refundRequest.returnShippingAddress ? `<p><strong>Return Address:</strong> ${refundRequest.returnShippingAddress}</p>` : ''}
          ${refundRequest.approvedAmount ? `<p><strong>Approved Refund Amount:</strong> ₱${refundRequest.approvedAmount.toLocaleString()}</p>` : ''}
        </div>
        <p>If you have questions, please contact our support team.</p>
        <p>Thank you,<br>Fundamental Apparel Team</p>
      </div>
    `;
    await sendEmail({ email: user.email, subject, html });
  } catch (e) {
    console.warn('[Returns] Failed to send status email:', e.message);
  }
}

// Create a return/refund request (user)
exports.createReturnRequest = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id: orderId } = req.params;
    const { reason, details, amount, refundPaymentMethod, gcashNumber, bankName, bankAccountName, bankAccountNumber } = req.body;

    if (!reason) return res.status(400).json({ success: false, msg: 'Reason is required' });

    // Support both regular Orders and CustomOrders
    let order = await Order.findById(orderId);
    let isCustom = false;
    if (!order) {
      order = await CustomOrder.findById(orderId);
      if (order) isCustom = true;
    }
    if (!order) return res.status(404).json({ success: false, msg: 'Order not found' });
    if (order.user.toString() !== userId.toString()) return res.status(403).json({ success: false, msg: 'Not authorized to request return for this order' });

    // Collect uploaded files (videos/images)
    const videos = [];
    const images = [];
    if (req.files) {
      if (req.files.videos) req.files.videos.forEach(f => videos.push(`/uploads/returns/${f.filename}`));
      if (req.files.images) req.files.images.forEach(f => images.push(`/uploads/returns/${f.filename}`));
    }

    const refund = new RefundRequest({
      order: order._id,
      user: userId,
      reason,
      details: details || '',
      videos,
      images,
      amount: amount ? Number(amount) : (order.totalPrice || order.price || 0),
      // New payment method fields
      refundPaymentMethod: refundPaymentMethod || '',
      gcashNumber: gcashNumber || '',
      bankName: bankName || '',
      bankAccountName: bankAccountName || '',
      bankAccountNumber: bankAccountNumber || ''
    });

    await refund.save();

    // Create an admin notification so admins see the new refund request
    try {
      await notify.createNotification({
        type: 'refund_request',
        title: `Refund requested for Order ${order._id}`,
        body: `${req.user.name || req.user.email || 'A user'} requested a refund for order ${order._id}`,
        targetRole: 'admin',
        meta: { orderId: order._id, refundId: refund._id }
      });
    } catch (e) {
      console.warn('[Returns] Failed to create notification for refund', e && e.message);
    }

    // Annotate order with lightweight refund pointers for admin UI
    try {
      if (order) {
        order.hasRefundRequest = true;
        order.latestRefundId = refund._id;
        order.latestRefundStatus = refund.status || 'Pending';
        await order.save();
      }
    } catch (e) {
      console.warn('[Returns] Failed to annotate order with refund pointers:', e.message);
    }

    return res.status(201).json({ success: true, data: refund });
  } catch (error) {
    console.error('[Returns] createReturnRequest error:', error);
    return res.status(500).json({ success: false, msg: 'Failed to create return request', error: error.message });
  }
};

// Admin: list all return requests
exports.listReturns = async (req, res) => {
  try {
    const items = await RefundRequest.find().populate('order').populate('user', 'name email').sort({ createdAt: -1 });
    return res.json({ success: true, data: items });
  } catch (error) {
    console.error('[Returns] listReturns error:', error);
    return res.status(500).json({ success: false, msg: 'Failed to list return requests' });
  }
};

// User: list current user's return requests
exports.listMyReturns = async (req, res) => {
  try {
    const userId = req.user && req.user._id;
    if (!userId) return res.status(401).json({ success: false, msg: 'Unauthorized' });
    const items = await RefundRequest.find({ user: userId }).populate('order').sort({ createdAt: -1 });
    return res.json({ success: true, data: items });
  } catch (error) {
    console.error('[Returns] listMyReturns error:', error);
    return res.status(500).json({ success: false, msg: 'Failed to list your return requests' });
  }
};

// Get single return request
exports.getReturn = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await RefundRequest.findById(id).populate('order').populate('user', 'name email');
    if (!item) return res.status(404).json({ success: false, msg: 'Return request not found' });
    return res.json({ success: true, data: item });
  } catch (error) {
    console.error('[Returns] getReturn error:', error);
    return res.status(500).json({ success: false, msg: 'Failed to get return request' });
  }
};

// Admin: approve return
exports.approveReturn = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNotes, refundMethod, approvedAmount, returnShippingAddress } = req.body;
    const item = await RefundRequest.findById(id).populate('order').populate('user', 'name email');
    if (!item) return res.status(404).json({ success: false, msg: 'Return request not found' });

    item.status = 'Approved';
    item.adminNotes = adminNotes || '';
    item.refundMethod = refundMethod || 'manual';
    item.approvedAt = new Date();
    // Allow partial refund - admin can set a different amount
    if (approvedAmount !== undefined && approvedAmount !== null) {
      item.approvedAmount = Number(approvedAmount);
    } else {
      item.approvedAmount = item.amount; // Default to full amount
    }
    // Return shipping address for customer to send item back
    if (returnShippingAddress) {
      item.returnShippingAddress = returnShippingAddress;
      item.status = 'Awaiting Return'; // If address provided, expect item to be shipped back
    }
    await item.save();

    // Update order-level refund summary (but don't cancel yet - wait for item return)
    if (item.order) {
      try {
        item.order.hasRefundRequest = true;
        item.order.latestRefundId = item._id;
        item.order.latestRefundStatus = item.status;
        await item.order.save();
      } catch (e) {
        console.warn('[Returns] Failed to update order on approve:', e.message);
      }
    }

    // Send email notification to customer
    const statusMsg = returnShippingAddress 
      ? `Your return request has been approved! Please ship the item to the address provided below. Once we receive and inspect it, we will process your refund.`
      : `Your return request has been approved! We will process your refund shortly.`;
    await sendRefundStatusEmail(item.user, item, statusMsg);

    return res.json({ success: true, data: item });
  } catch (error) {
    console.error('[Returns] approveReturn error:', error);
    return res.status(500).json({ success: false, msg: 'Failed to approve return' });
  }
};

// Admin: mark return as received (item shipped back by customer)
exports.markReceived = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body;
    const item = await RefundRequest.findById(id).populate('user', 'name email');
    if (!item) return res.status(404).json({ success: false, msg: 'Return request not found' });

    item.status = 'Received';
    item.receivedAt = new Date();
    if (adminNotes) item.adminNotes = adminNotes;
    await item.save();

    // Update order-level refund summary
    try {
      const ord = await Order.findById(item.order) || await CustomOrder.findById(item.order);
      if (ord) {
        ord.latestRefundStatus = 'Received';
        await ord.save();
      }
    } catch (e) {
      console.warn('[Returns] Failed to update order on received:', e.message);
    }

    // Send email notification
    await sendRefundStatusEmail(item.user, item, 'We have received your returned item. We will inspect it and process your refund soon.');

    return res.json({ success: true, data: item });
  } catch (error) {
    console.error('[Returns] markReceived error:', error);
    return res.status(500).json({ success: false, msg: 'Failed to mark as received' });
  }
};

// Admin: reject return
exports.rejectReturn = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body;
    const item = await RefundRequest.findById(id).populate('user', 'name email');
    if (!item) return res.status(404).json({ success: false, msg: 'Return request not found' });

    item.status = 'Rejected';
    item.adminNotes = adminNotes || '';
    item.rejectedAt = new Date();
    await item.save();

    // Update order-level refund summary if linked
    try {
      const ord = await Order.findById(item.order) || await CustomOrder.findById(item.order);
      if (ord) {
        ord.hasRefundRequest = true;
        ord.latestRefundId = item._id;
        ord.latestRefundStatus = 'Rejected';
        await ord.save();
      }
    } catch (e) {
      console.warn('[Returns] Failed to update order on reject:', e.message);
    }

    // Send email notification
    await sendRefundStatusEmail(item.user, item, `Your return request has been rejected. ${adminNotes ? 'Reason: ' + adminNotes : 'Please contact support if you have questions.'}`);

    return res.json({ success: true, data: item });
  } catch (error) {
    console.error('[Returns] rejectReturn error:', error);
    return res.status(500).json({ success: false, msg: 'Failed to reject return' });
  }
};

// Admin: attempt to refund via PayMongo (best-effort) or mark refunded manually
exports.refundReturn = async (req, res) => {
  try {
    const { id } = req.params;
    const item = await RefundRequest.findById(id).populate('order').populate('user', 'name email');
    if (!item) return res.status(404).json({ success: false, msg: 'Return request not found' });

    // Allow refund from Approved, Awaiting Return, or Received status
    if (!['Approved', 'Awaiting Return', 'Received'].includes(item.status)) {
      return res.status(400).json({ success: false, msg: 'Return must be approved/received before refunding' });
    }

    // Use approvedAmount if set, otherwise use original amount
    const finalRefundAmount = item.approvedAmount || item.amount || (item.order?.totalPrice || 0);

    // If the admin requested a PayMongo refund and we have keys, try to perform it
    if (process.env.PAYMONGO_SECRET_KEY && item.order && item.order.paymentIntentId) {
      const sessionId = item.order.paymentIntentId;
      // Try to fetch checkout session details to find payment id
      const sessionResp = await fetch(`${PAYMONGO_API_URL}/checkout_sessions/${sessionId}`, {
        method: 'GET',
        headers: { 'Authorization': `Basic ${Buffer.from(process.env.PAYMONGO_SECRET_KEY + ':').toString('base64')}` }
      });
      const sessionData = await sessionResp.json();

      // Attempt to find payment id in likely places
      let paymentId = null;
      try {
        paymentId = sessionData?.data?.relationships?.payments?.data?.[0]?.id || sessionData?.data?.attributes?.payment_id || sessionData?.data?.attributes?.payment_intent_id;
      } catch (e) {
        paymentId = null;
      }

      if (!paymentId) {
        // Try to inspect raw included data
        if (Array.isArray(sessionData?.included)) {
          const p = sessionData.included.find(i => i.type === 'payment' || i.type === 'payments');
          if (p && p.id) paymentId = p.id;
        }
      }

      if (!paymentId) {
        console.warn('[Returns] Could not extract payment id from checkout session; cannot call PayMongo refund automatically');
        // Mark as refunded-manual-needed
        item.refundMethod = 'manual';
        item.status = 'Approved';
        await item.save();
        return res.status(200).json({ success: false, msg: 'Could not determine PayMongo payment id. Marked for manual refund by admin.', data: item });
      }

      // Call PayMongo Refunds API (best-effort) - use approved amount for partial refunds
      const refundAmountCentavos = Math.round(finalRefundAmount * 100);
      const refundPayload = { data: { attributes: { amount: refundAmountCentavos, payment: paymentId } } };

      const refundResp = await fetch(`${PAYMONGO_API_URL}/refunds`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from(process.env.PAYMONGO_SECRET_KEY + ':').toString('base64')}`
        },
        body: JSON.stringify(refundPayload)
      });

      const refundData = await refundResp.json();
      if (!refundResp.ok) {
        console.error('[Returns] PayMongo refund API error:', refundData);
        return res.status(500).json({ success: false, msg: 'PayMongo refund failed', error: refundData });
      }

      item.refundMethod = 'paymongo';
      item.refundTxId = refundData?.data?.id || null;
      item.status = 'Refunded';
      item.processedAt = new Date();
      await item.save();

      // Update order and inventory (restock) as needed
      if (item.order) {
        try {
          item.order.status = 'Cancelled';
          item.order.isPaid = false;
          item.order.hasRefundRequest = true;
          item.order.latestRefundId = item._id;
          item.order.latestRefundStatus = 'Refunded';
          await item.order.save();
        } catch (e) {
          console.warn('[Returns] Failed to update order on refund (paymongo):', e.message);
        }
      }

      // Send email notification
      await sendRefundStatusEmail(item.user, item, `Your refund of ₱${finalRefundAmount.toLocaleString()} has been processed via PayMongo. The amount should appear in your account within 5-7 business days.`);

      return res.json({ success: true, data: { refund: refundData, request: item } });
    }

    // Otherwise, mark refund as manual and refunded by admin
    item.refundMethod = 'manual';
    item.status = 'Refunded';
    item.processedAt = new Date();
    await item.save();

    if (item.order) {
      try {
        item.order.status = 'Cancelled';
        item.order.isPaid = false;
        item.order.hasRefundRequest = true;
        item.order.latestRefundId = item._id;
        item.order.latestRefundStatus = 'Refunded';
        await item.order.save();
      } catch (e) {
        console.warn('[Returns] Failed to update order on refund (manual):', e.message);
      }
    }

    // Send email notification for manual refund
    let paymentInfo = '';
    if (item.refundPaymentMethod === 'gcash' && item.gcashNumber) {
      paymentInfo = `We will send your refund to GCash ${item.gcashNumber}.`;
    } else if (item.refundPaymentMethod === 'bank' && item.bankAccountNumber) {
      paymentInfo = `We will send your refund to ${item.bankName} account ${item.bankAccountNumber}.`;
    }
    await sendRefundStatusEmail(item.user, item, `Your refund of ₱${finalRefundAmount.toLocaleString()} has been processed. ${paymentInfo} Please allow 3-7 business days for the transfer to complete.`);

    return res.json({ success: true, data: item });
  } catch (error) {
    console.error('[Returns] refundReturn error:', error);
    return res.status(500).json({ success: false, msg: 'Failed to refund return', error: error.message });
  }
};
