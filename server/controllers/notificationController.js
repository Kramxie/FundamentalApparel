const Notification = require('../models/Notification');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');

// Helper: Get admin/employee emails for notifications
async function getAdminEmails() {
  const users = await User.find({ role: { $in: ['admin','employee'] }, email: { $exists: true, $ne: '' } }).select('email name');
  return users.map(u => u.email).filter(Boolean);
}

// Helper: send low-stock notifications to admin/employee users and create Notification records
async function notifyLowStock(items) {
  if(!Array.isArray(items) || items.length === 0) return;
  try{
    const title = 'Low stock alert';
    const bodyLines = items.map(it => {
      // it: { id, name, size, available }
      if(it.size) return `${it.name} — size ${it.size}: ${it.available} available`;
      return `${it.name}: ${it.available} available`;
    });
    const body = `<p>The following inventory items are low or out of stock:</p><ul>${bodyLines.map(l=>`<li>${l}</li>`).join('')}</ul>`;

    // Create a single notification record targeted to admins (UI will display)
    await Notification.create({ type: 'low_stock', title, body, targetRole: 'admin', meta: { items } });

    // Find admin and employee users with emails
    const emails = await getAdminEmails();
    if(emails.length){
      try{
        await sendEmail({
          email: emails.join(','),
          subject: `[Fundamental] ${title}`,
          message: body
        });
      }catch(e){
        console.error('[Notifications] sendEmail error', e && e.message);
      }
    }
  }catch(e){
    console.error('[Notifications] notifyLowStock error', e && e.message);
  }
}

// Helper: Notify admin of new order
async function notifyNewOrder(order) {
  try {
    const title = 'New Order Received';
    const customerName = order.shippingAddress?.name || order.user?.name || 'Customer';
    const itemCount = order.orderItems?.length || 0;
    const total = order.totalPrice || 0;
    const orderId = order._id?.toString().slice(-8).toUpperCase() || 'N/A';
    
    const body = `
      <h2>New Order #${orderId}</h2>
      <p><strong>Customer:</strong> ${customerName}</p>
      <p><strong>Items:</strong> ${itemCount} item(s)</p>
      <p><strong>Total:</strong> ₱${total.toLocaleString()}</p>
      <p><strong>Payment Method:</strong> ${order.paymentMethod || 'N/A'}</p>
      <p><strong>Shipping:</strong> ${order.shippingMethod || 'Standard'}</p>
      <hr>
      <p><a href="${process.env.FRONTEND_URL || 'http://localhost'}/client/admin/orders.html">View in Admin Panel</a></p>
    `;

    await Notification.create({ type: 'new_order', title, body, targetRole: 'admin', meta: { orderId: order._id } });

    const emails = await getAdminEmails();
    if (emails.length) {
      try {
        await sendEmail({
          email: emails.join(','),
          subject: `[Fundamental] ${title} #${orderId}`,
          message: body
        });
      } catch (e) {
        console.error('[Notifications] notifyNewOrder email error', e && e.message);
      }
    }
  } catch (e) {
    console.error('[Notifications] notifyNewOrder error', e && e.message);
  }
}

// Helper: Notify admin of payment received/verified
async function notifyPaymentReceived(order, paymentDetails = {}) {
  try {
    const title = 'Payment Received';
    const orderId = order._id?.toString().slice(-8).toUpperCase() || 'N/A';
    const total = order.totalPrice || 0;
    const method = paymentDetails.method || order.paymentMethod || 'N/A';
    
    const body = `
      <h2>Payment Confirmed for Order #${orderId}</h2>
      <p><strong>Amount:</strong> ₱${total.toLocaleString()}</p>
      <p><strong>Payment Method:</strong> ${method}</p>
      <p><strong>Status:</strong> Verified</p>
      <hr>
      <p><a href="${process.env.FRONTEND_URL || 'http://localhost'}/client/admin/orders.html">View Order</a></p>
    `;

    await Notification.create({ type: 'payment_received', title, body, targetRole: 'admin', meta: { orderId: order._id, amount: total } });

    const emails = await getAdminEmails();
    if (emails.length) {
      try {
        await sendEmail({
          email: emails.join(','),
          subject: `[Fundamental] ${title} - Order #${orderId}`,
          message: body
        });
      } catch (e) {
        console.error('[Notifications] notifyPaymentReceived email error', e && e.message);
      }
    }
  } catch (e) {
    console.error('[Notifications] notifyPaymentReceived error', e && e.message);
  }
}

// Helper: Notify admin of new custom order/quote request
async function notifyNewQuote(customOrder) {
  try {
    const title = 'New Quote Request';
    const customerEmail = customOrder.email || customOrder.user?.email || 'N/A';
    const projectName = customOrder.projectName || 'Custom Order';
    const quoteId = customOrder._id?.toString().slice(-8).toUpperCase() || 'N/A';
    
    const body = `
      <h2>New Quote Request #${quoteId}</h2>
      <p><strong>Project:</strong> ${projectName}</p>
      <p><strong>Customer Email:</strong> ${customerEmail}</p>
      <p><strong>Quantity:</strong> ${customOrder.quantity || 'N/A'}</p>
      <p><strong>Service Type:</strong> ${customOrder.serviceType || 'N/A'}</p>
      <hr>
      <p><a href="${process.env.FRONTEND_URL || 'http://localhost'}/client/admin/quotes.html">View in Admin Panel</a></p>
    `;

    await Notification.create({ type: 'new_quote', title, body, targetRole: 'admin', meta: { quoteId: customOrder._id } });

    const emails = await getAdminEmails();
    if (emails.length) {
      try {
        await sendEmail({
          email: emails.join(','),
          subject: `[Fundamental] ${title} - ${projectName}`,
          message: body
        });
      } catch (e) {
        console.error('[Notifications] notifyNewQuote email error', e && e.message);
      }
    }
  } catch (e) {
    console.error('[Notifications] notifyNewQuote error', e && e.message);
  }
}

// Helper: Daily summary email (can be called via cron or manually)
async function sendDailySummary(stats) {
  try {
    const title = 'Daily Summary Report';
    const date = new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    const body = `
      <h2>Daily Summary - ${date}</h2>
      <table style="border-collapse: collapse; width: 100%;">
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>New Orders</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${stats.newOrders || 0}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Total Sales</strong></td><td style="padding: 8px; border: 1px solid #ddd;">₱${(stats.totalSales || 0).toLocaleString()}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>New Quotes</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${stats.newQuotes || 0}</td></tr>
        <tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Low Stock Items</strong></td><td style="padding: 8px; border: 1px solid #ddd;">${stats.lowStockItems || 0}</td></tr>
      </table>
      <hr>
      <p><a href="${process.env.FRONTEND_URL || 'http://localhost'}/client/admin/index.html">View Dashboard</a></p>
    `;

    const emails = await getAdminEmails();
    if (emails.length) {
      try {
        await sendEmail({
          email: emails.join(','),
          subject: `[Fundamental] ${title} - ${date}`,
          message: body
        });
        console.log('[Notifications] Daily summary sent to:', emails.join(', '));
      } catch (e) {
        console.error('[Notifications] sendDailySummary email error', e && e.message);
      }
    }
  } catch (e) {
    console.error('[Notifications] sendDailySummary error', e && e.message);
  }
}

exports.notifyLowStock = notifyLowStock;
exports.notifyNewOrder = notifyNewOrder;
exports.notifyPaymentReceived = notifyPaymentReceived;
exports.notifyNewQuote = notifyNewQuote;
exports.sendDailySummary = sendDailySummary;


// Admin: list notifications (most recent first)
exports.listAdminNotifications = async (req, res) => {
  try {
    const items = await Notification.find({ $or: [ { targetRole: 'admin' }, { targetUser: req.user._id } ] }).sort({ createdAt: -1 }).limit(200);
    return res.json({ success: true, data: items });
  } catch (e) {
    console.error('[Notifications] listAdminNotifications', e);
    return res.status(500).json({ success: false, msg: 'Failed to load notifications' });
  }
};

exports.markRead = async (req, res) => {
  try {
    const { id } = req.params;
    const n = await Notification.findById(id);
    if (!n) return res.status(404).json({ success: false, msg: 'Notification not found' });
    n.read = true;
    await n.save();
    return res.json({ success: true, data: n });
  } catch (e) {
    console.error('[Notifications] markRead', e);
    return res.status(500).json({ success: false, msg: 'Failed to mark read' });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    await Notification.updateMany({ $or: [ { targetRole: 'admin' }, { targetUser: req.user._id } ], read: false }, { read: true });
    return res.json({ success: true });
  } catch (e) {
    console.error('[Notifications] markAllRead', e);
    return res.status(500).json({ success: false, msg: 'Failed to mark all read' });
  }
};

// POST /api/admin/notifications/low-stock
exports.createLowStockNotification = async (req, res) => {
  try{
    const items = req.body.items || [];
    await notifyLowStock(items);
    return res.json({ success: true });
  }catch(e){
    console.error('[Notifications] createLowStockNotification', e && e.message);
    return res.status(500).json({ success: false, msg: 'Failed to create low-stock notification' });
  }
};
