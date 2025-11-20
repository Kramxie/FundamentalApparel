const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  type: { type: String, required: true },
  title: { type: String, required: true },
  body: { type: String },
  // targetRole e.g. 'admin' or specific userId
  targetRole: { type: String },
  targetUser: { type: mongoose.Schema.ObjectId, ref: 'User' },
  meta: { type: Object, default: {} },
  read: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Notification', NotificationSchema);
