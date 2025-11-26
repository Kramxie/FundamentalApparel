const Notification = require('../models/Notification');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');

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
    const users = await User.find({ role: { $in: ['admin','employee'] }, email: { $exists: true, $ne: '' } }).select('email name');
    const emails = users.map(u => u.email).filter(Boolean);
    if(emails.length){
      // send a single email to all recipients (comma separated)
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

exports.notifyLowStock = notifyLowStock;


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
