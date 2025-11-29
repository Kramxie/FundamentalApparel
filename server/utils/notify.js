let io = null;
const Notification = require('../models/Notification');
const User = require('../models/User');
const sendEmail = require('./sendEmail');

function init(srvIo) {
  io = srvIo;
}

async function createNotification(payload) {
  // payload: { type, title, body, targetRole, targetUser, meta }
  try {
    const n = await Notification.create(payload);
    // Emit to admins room if targetRole === 'admin'
    if (io && payload.targetRole === 'admin') {
      io.to('admins').emit('notification', n);
    }
    // Emit to a specific user if targetUser set
    if (io && payload.targetUser) {
      io.to(String(payload.targetUser)).emit('notification', n);
    }

    // For admin-targeted notifications, also send an email to admin/employee users for important types
    try {
      if (payload.targetRole === 'admin') {
        // Decide which types should be emailed
        const emailTypes = new Set(['low_stock', 'refund_request', 'quote_request']);
        if (emailTypes.has((payload.type||'').toString())) {
          // Fetch admin/employees with email
          const users = await User.find({ role: { $in: ['admin','employee'] }, email: { $exists: true, $ne: '' } }).select('email name');
          const emails = users.map(u => u.email).filter(Boolean);
          if (emails.length) {
            // Compose message: use payload.body (assumed HTML) if provided
            const message = payload.body || `<p>${payload.title}</p>`;
            await sendEmail({ email: emails.join(','), subject: `[Fundamental] ${payload.title}`, message });
          }
        }
      }
    } catch (e) {
      console.warn('[Notify] failed to send notification email', e && e.message);
    }

    return n;
  } catch (e) {
    console.warn('[Notify] Failed to create notification', e && e.message);
    return null;
  }
}

module.exports = { init, createNotification };
