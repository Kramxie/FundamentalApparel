const Notification = require('../models/Notification');

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
