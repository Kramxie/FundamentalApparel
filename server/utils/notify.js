let io = null;
const Notification = require('../models/Notification');

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
    return n;
  } catch (e) {
    console.warn('[Notify] Failed to create notification', e && e.message);
    return null;
  }
}

module.exports = { init, createNotification };
