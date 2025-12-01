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

// Check inventory for low stock items and create notification if any found
// This can be called on dashboard load to ensure admins see current low stock status
async function checkAndNotifyLowStock() {
  try {
    const Inventory = require('../models/Inventory');
    
    // Find all items with low_stock or out_of_stock status
    const lowStockItems = await Inventory.find({ 
      status: { $in: ['low_stock', 'out_of_stock'] },
      type: 'product' // Only products, not fabric
    }).select('name quantity sizesInventory sizesStatus lowStockThreshold reservedSizes');
    
    if (lowStockItems.length === 0) return { created: false, count: 0 };
    
    // Build items array with per-size details
    const itemsToNotify = [];
    lowStockItems.forEach(item => {
      const sizesInv = item.sizesInventory instanceof Map 
        ? Object.fromEntries(item.sizesInventory) 
        : (item.sizesInventory || {});
      const reserved = item.reservedSizes instanceof Map
        ? Object.fromEntries(item.reservedSizes)
        : (item.reservedSizes || {});
      const sizesStatus = item.sizesStatus instanceof Map
        ? Object.fromEntries(item.sizesStatus)
        : (item.sizesStatus || {});
      
      const threshold = item.lowStockThreshold || 5;
      
      if (Object.keys(sizesInv).length > 0) {
        // Per-size inventory
        Object.keys(sizesInv).forEach(sz => {
          const total = Number(sizesInv[sz] || 0);
          const resv = Number(reserved[sz] || 0);
          const avail = Math.max(0, total - resv);
          const sizeStatus = sizesStatus[sz];
          // Only notify if status is explicitly low/out OR available is at or below threshold
          if (sizeStatus === 'low_stock' || sizeStatus === 'out_of_stock' || avail <= threshold) {
            itemsToNotify.push({ 
              id: item._id, 
              name: item.name, 
              size: sz, 
              available: total, // Show actual stock, not available after reserved
              reserved: resv,
              status: avail === 0 ? 'out_of_stock' : 'low_stock'
            });
          }
        });
      } else {
        // Total quantity only
        itemsToNotify.push({ 
          id: item._id, 
          name: item.name, 
          available: item.quantity || 0,
          status: item.status
        });
      }
    });
    
    if (itemsToNotify.length === 0) return { created: false, count: 0 };
    
    // Check if we already have a recent unread low_stock notification (within last hour)
    const recentNotif = await Notification.findOne({ 
      type: 'low_stock', 
      read: false,
      createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
    });
    
    if (recentNotif) {
      // Update existing notification with current data
      const title = 'Low stock alert';
      const bodyLines = itemsToNotify.map(it => {
        const statusLabel = it.status === 'out_of_stock' ? '⚠️ OUT OF STOCK' : '⚠️ Low';
        if(it.size) return `${it.name} — size ${it.size}: ${statusLabel} (${it.available} available)`;
        return `${it.name}: ${statusLabel} (${it.available} available)`;
      });
      const body = `<p>The following inventory items need attention:</p><ul>${bodyLines.map(l=>`<li>${l}</li>`).join('')}</ul>`;
      
      recentNotif.body = body;
      recentNotif.meta = { items: itemsToNotify };
      recentNotif.updatedAt = new Date();
      await recentNotif.save();
      
      return { created: false, updated: true, count: itemsToNotify.length };
    }
    
    // Create new notification
    await notifyLowStock(itemsToNotify);
    return { created: true, count: itemsToNotify.length };
    
  } catch (e) {
    console.error('[Notifications] checkAndNotifyLowStock error', e && e.message);
    return { error: e.message };
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
exports.checkAndNotifyLowStock = checkAndNotifyLowStock;


// Admin: list notifications (prioritize low_stock alerts, unread first, then by date)
exports.listAdminNotifications = async (req, res) => {
  try {
    const items = await Notification.find({ $or: [ { targetRole: 'admin' }, { targetUser: req.user._id } ] }).sort({ createdAt: -1 }).limit(200);
    
    // Sort: unread first, then low_stock type first, then by date descending
    items.sort((a, b) => {
      // Unread first
      if (a.read !== b.read) return a.read ? 1 : -1;
      // Low stock priority
      const aIsLowStock = a.type === 'low_stock' ? 1 : 0;
      const bIsLowStock = b.type === 'low_stock' ? 1 : 0;
      if (aIsLowStock !== bIsLowStock) return bIsLowStock - aIsLowStock;
      // Then by date
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
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
