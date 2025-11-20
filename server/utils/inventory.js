const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');
const InventoryTransaction = require('../models/InventoryTransaction');

async function findInventoryByName(name, session = null) {
  if (!name) return null;
  // Case-insensitive match
  return await Inventory.findOne({ name: new RegExp('^' + name + '$', 'i'), type: 'fabric' }).session(session);
}

async function allocateInventory({ name, qty, orderId = null, adminId = null, session = null, note = '' }) {
  if (!name) throw new Error('Inventory name is required');
  if (!qty || qty <= 0) throw new Error('Quantity must be > 0');

  const inv = await findInventoryByName(name, session);
  if (!inv) throw new Error('Inventory item not found: ' + name);

  const available = (inv.quantity || 0);
  if (available < qty) {
    throw new Error(`Insufficient stock for ${name}. Available: ${available}, required: ${qty}`);
  }

  // Perform atomic update: decrement quantity and increment reserved
  const res = await Inventory.updateOne({ _id: inv._id, quantity: { $gte: qty } }, { $inc: { quantity: -qty, reserved: qty } }).session(session);
  if (res.nModified === 0) {
    throw new Error('Failed to allocate inventory due to concurrent update.');
  }

  await InventoryTransaction.create([{
    inventory: inv._id,
    inventoryName: inv.name,
    orderId,
    adminId,
    qty: qty,
    type: 'allocate',
    note
  }], { session });

  return inv; // return inventory document for caller use
}

async function releaseInventory({ name, qty, orderId = null, adminId = null, session = null, note = '' }) {
  if (!name) throw new Error('Inventory name is required');
  if (!qty || qty <= 0) throw new Error('Quantity must be > 0');

  const inv = await findInventoryByName(name, session);
  if (!inv) throw new Error('Inventory item not found: ' + name);

  // Decrement reserved and increment quantity
  const res = await Inventory.updateOne({ _id: inv._id, reserved: { $gte: qty } }, { $inc: { quantity: qty, reserved: -qty } }).session(session);
  if (res.nModified === 0) {
    // Fallback: try a safer update without reserved check (but still log)
    await Inventory.updateOne({ _id: inv._id }, { $inc: { quantity: qty } }).session(session);
  }

  await InventoryTransaction.create([{
    inventory: inv._id,
    inventoryName: inv.name,
    orderId,
    adminId,
    qty: -qty,
    type: 'release',
    note
  }], { session });

  return inv;
}

module.exports = {
  allocateInventory,
  releaseInventory,
  findInventoryByName
};
