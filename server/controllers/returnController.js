const path = require('path');
const fs = require('fs');
const RefundRequest = require('../models/RefundRequest');
const Order = require('../models/Order');
const CustomOrder = require('../models/CustomOrder');
const User = require('../models/User');
const notify = require('../utils/notify');

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const PAYMONGO_API_URL = 'https://api.paymongo.com/v1';

// Create a return/refund request (user)
exports.createReturnRequest = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id: orderId } = req.params;
    const { reason, details, amount } = req.body;

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
      amount: amount ? Number(amount) : (order.totalPrice || order.price || 0)
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
    const { adminNotes, refundMethod } = req.body;
    const item = await RefundRequest.findById(id).populate('order');
    if (!item) return res.status(404).json({ success: false, msg: 'Return request not found' });

    item.status = 'Approved';
    item.adminNotes = adminNotes || '';
    item.refundMethod = refundMethod || 'manual';
    await item.save();

    // Optionally update order status

    if (item.order) {
      item.order.status = 'Cancelled';
      // Update order-level refund summary
      try {
        item.order.hasRefundRequest = true;
        item.order.latestRefundId = item._id;
        item.order.latestRefundStatus = 'Approved';
        await item.order.save();
      } catch (e) {
        console.warn('[Returns] Failed to update order on approve:', e.message);
      }
    }

    return res.json({ success: true, data: item });
  } catch (error) {
    console.error('[Returns] approveReturn error:', error);
    return res.status(500).json({ success: false, msg: 'Failed to approve return' });
  }
};

// Admin: reject return
exports.rejectReturn = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminNotes } = req.body;
    const item = await RefundRequest.findById(id);
    if (!item) return res.status(404).json({ success: false, msg: 'Return request not found' });

    item.status = 'Rejected';
    item.adminNotes = adminNotes || '';
    await item.save();

    // Update order-level refund summary if linked
    try {
      const ord = await Order.findById(item.order);
      if (ord) {
        ord.hasRefundRequest = true;
        ord.latestRefundId = item._id;
        ord.latestRefundStatus = 'Rejected';
        await ord.save();
      }
    } catch (e) {
      console.warn('[Returns] Failed to update order on reject:', e.message);
    }

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
    const item = await RefundRequest.findById(id).populate('order');
    if (!item) return res.status(404).json({ success: false, msg: 'Return request not found' });

    if (item.status !== 'Approved') return res.status(400).json({ success: false, msg: 'Return must be approved before refunding' });

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

      // Call PayMongo Refunds API (best-effort) - attempt to refund full amount or specified amount
      const refundAmount = item.amount ? Math.round(item.amount * 100) : Math.round((item.order.totalPrice || 0) * 100);
      const refundPayload = { data: { attributes: { amount: refundAmount, payment: paymentId } } };

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

    return res.json({ success: true, data: item });
  } catch (error) {
    console.error('[Returns] refundReturn error:', error);
    return res.status(500).json({ success: false, msg: 'Failed to refund return', error: error.message });
  }
};
