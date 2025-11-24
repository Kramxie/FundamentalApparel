const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');
const InventoryTransaction = require('../models/InventoryTransaction');

async function findInventoryByName(name, session = null) {
  if (!name) return null;
  // Case-insensitive match
  // Search by name across inventory types (product/fabric/pre-design)
  return await Inventory.findOne({ name: new RegExp('^' + name + '$', 'i') }).session(session);
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

// Consume reserved inventory (reduce reserved count when order is fulfilled)
async function consumeReserved({ name, qty, orderId = null, adminId = null, session = null, note = '' }) {
  if (!name) throw new Error('Inventory name is required');
  if (!qty || qty <= 0) throw new Error('Quantity must be > 0');

  const inv = await findInventoryByName(name, session);
  if (!inv) throw new Error('Inventory item not found: ' + name);

  // Decrease reserved by qty (consumed). Do not increase quantity.
  const res = await Inventory.updateOne({ _id: inv._id, reserved: { $gte: qty } }, { $inc: { reserved: -qty } }).session(session);
  if (res.nModified === 0) {
    throw new Error('Failed to consume reserved inventory: insufficient reserved quantity');
  }

  await InventoryTransaction.create([{
    inventory: inv._id,
    inventoryName: inv.name,
    orderId,
    adminId,
    qty: qty, // positive indicates consumption/deduction from stock perspective
    type: 'adjust',
    note: note || 'Consumed reserved inventory for order fulfillment'
  }], { session });

  return inv;
}

// Allocate inventory by sizes: sizesMap is { "S": 2, "M": 1 }
async function allocateInventoryBySizes({ name, sizesMap, orderId = null, adminId = null, session = null, note = '' }) {
  if (!name) throw new Error('Inventory name is required');
  if (!sizesMap || typeof sizesMap !== 'object') throw new Error('sizesMap is required');

  const inv = await findInventoryByName(name, session);
  if (!inv) throw new Error('Inventory item not found: ' + name);

  // Validate availability per size and compute total
  let total = 0;
  const filter = { _id: inv._id };
  for (const [size, v] of Object.entries(sizesMap)) {
    const need = Number(v || 0);
    if (!need || need <= 0) continue;
    const available = Number(inv.sizesInventory?.get(size) || 0);
    if (need > available) {
      throw new Error(`Insufficient stock for ${name} size ${size}. Available: ${available}, required: ${need}`);
    }
    total += need;
    // add check to filter to ensure atomic update will only succeed if each size has enough
    filter[`sizesInventory.${size}`] = { $gte: need };
  }

  if (total <= 0) throw new Error('Total allocation quantity must be > 0');

  // Build $inc object: decrement each size and decrement overall quantity, increment reserved
  const inc = { reserved: total, quantity: -total };
  for (const [size, v] of Object.entries(sizesMap)) {
    const need = Number(v || 0);
    if (!need || need <= 0) continue;
    inc[`sizesInventory.${size}`] = -need;
    // increment reservedSizes per-size
    inc[`reservedSizes.${size}`] = need;
  }

  const res = await Inventory.updateOne(filter, { $inc: inc }).session(session);
  if (res.nModified === 0) {
    throw new Error('Failed to allocate inventory by sizes due to concurrent update or insufficient stock');
  }

  await InventoryTransaction.create([{
    inventory: inv._id,
    inventoryName: inv.name,
    orderId,
    adminId,
    qty: total,
    type: 'allocate',
    note: note || `Allocated by sizes: ${JSON.stringify(sizesMap)}`,
    sizesMap
  }], { session });

  return inv;
}

// Consume reserved by sizes: reduces global reserved by total (per-size reserved tracking not stored yet)
async function consumeReservedBySizes({ name, sizesMap, orderId = null, adminId = null, session = null, note = '' }) {
  if (!name) throw new Error('Inventory name is required');
  if (!sizesMap || typeof sizesMap !== 'object') throw new Error('sizesMap is required');

  const inv = await findInventoryByName(name, session);
  if (!inv) throw new Error('Inventory item not found: ' + name);

  let total = 0;
  for (const [size, v] of Object.entries(sizesMap)) {
    const need = Number(v || 0);
    if (!need || need <= 0) continue;
    total += need;
  }

  if (total <= 0) throw new Error('Total consumption quantity must be > 0');

  // Decrease reserved by total
  // Build $inc for reserved and reservedSizes
  const incObj = { reserved: -total };
  for (const [size, v] of Object.entries(sizesMap)) {
    const need = Number(v || 0);
    if (!need || need <= 0) continue;
    incObj[`reservedSizes.${size}`] = -need;
  }

  const res = await Inventory.updateOne({ _id: inv._id, reserved: { $gte: total } }, { $inc: incObj }).session(session);
  if (res.nModified === 0) {
    throw new Error('Failed to consume reserved inventory: insufficient reserved quantity');
  }

  await InventoryTransaction.create([{
    inventory: inv._id,
    inventoryName: inv.name,
    orderId,
    adminId,
    qty: total,
    type: 'adjust',
    note: note || `Consumed reserved by sizes: ${JSON.stringify(sizesMap)}`,
    sizesMap
  }], { session });

  return inv;
}

module.exports = {
  allocateInventory,
  releaseInventory,
  findInventoryByName,
  consumeReserved,
  allocateInventoryBySizes,
  consumeReservedBySizes
};
