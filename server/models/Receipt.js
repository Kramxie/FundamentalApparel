const mongoose = require('mongoose');

const receiptSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.ObjectId, ref: 'User', required: true },
  orderId: { type: mongoose.Schema.ObjectId, required: true },
  orderType: { type: String, enum: ['product','service'], required: true },
  tin: { type: String, required: true, index: true },
  items: [
    {
      name: String,
      quantity: Number,
      price: Number,
      size: String
    }
  ],
  subtotal: { type: Number, default: 0 },
  vat: { type: Number, default: 0 },
  deliveryFee: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  logoUrl: { type: String },
  meta: { type: mongoose.Schema.Types.Mixed },
  preparedBy: { type: mongoose.Schema.ObjectId, ref: 'User' },
  preparedByName: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Receipt', receiptSchema);
