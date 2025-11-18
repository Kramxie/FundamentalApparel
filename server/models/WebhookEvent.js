const mongoose = require('mongoose');

const WebhookEventSchema = new mongoose.Schema({
  provider: { type: String, default: 'paymongo' },
  externalId: { type: String, index: true },
  eventType: { type: String },
  raw: { type: mongoose.Schema.Types.Mixed },
  verified: { type: Boolean, default: false },
  processed: { type: Boolean, default: false },
  processedAt: { type: Date },
  result: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('WebhookEvent', WebhookEventSchema);
