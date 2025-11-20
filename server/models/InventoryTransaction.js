const mongoose = require('mongoose');

const InventoryTransactionSchema = new mongoose.Schema({
  inventory: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true },
  inventoryName: { type: String, required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomOrder', required: false },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  qty: { type: Number, required: true }, // positive = allocate (deduct), negative = release (add)
  type: { type: String, enum: ['allocate', 'release', 'restore', 'adjust'], required: true },
  note: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('InventoryTransaction', InventoryTransactionSchema);
