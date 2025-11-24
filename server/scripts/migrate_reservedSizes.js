// Migration script: backfill reservedSizes map on Inventory from existing allocated CustomOrders
const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');
const CustomOrder = require('../models/CustomOrder');

const MONGO = process.env.MONGO_URI || process.env.MONGO || 'mongodb://localhost:27017/fundamental';

async function connect() {
  await mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true });
}

async function run() {
  console.log('Connecting to', MONGO);
  await connect();

  // Initialize counts: map inventoryId -> { size -> count, _unassigned: n }
  const counts = new Map();

  const orders = await CustomOrder.find({ inventoryAllocated: true, allocatedItems: { $exists: true, $ne: [] } }).lean();
  console.log('Found', orders.length, 'allocated orders to process');

  for (const order of orders) {
    const items = order.allocatedItems || [];
    for (const it of items) {
      let invId = it.inventoryId || null;
      if (!invId && it.name) {
        const inv = await Inventory.findOne({ name: new RegExp('^' + it.name + '$', 'i') }).lean();
        invId = inv ? inv._id.toString() : null;
      }
      if (!invId) continue;
      const key = invId.toString();
      if (!counts.has(key)) counts.set(key, {});
      const map = counts.get(key);

      if (it.sizesMap && typeof it.sizesMap === 'object') {
        for (const [s, v] of Object.entries(it.sizesMap)) {
          const need = Number(v || 0);
          if (!need || need <= 0) continue;
          map[s] = (map[s] || 0) + need;
        }
      } else if (it.qty) {
        // cannot distribute to sizes; mark as unassigned
        map['_unassigned'] = (map['_unassigned'] || 0) + Number(it.qty || 0);
      }
    }
  }

  console.log('Computed reserved counts for', counts.size, 'inventory items');

  // Apply counts
  for (const [invId, map] of counts.entries()) {
    const inv = await Inventory.findById(invId);
    if (!inv) continue;
    // prepare update object
    const setObj = {};
    let total = 0;
    for (const [k, v] of Object.entries(map)) {
      if (k === '_unassigned') continue;
      setObj[`reservedSizes.${k}`] = v;
      total += v;
    }
    // include unassigned into aggregate reserved as well
    const unassigned = map['_unassigned'] || 0;
    total += unassigned;

    // Set reservedSizes entries (overwrite) and set reserved to total
    const update = { $set: {}, $inc: {} };
    for (const [path, val] of Object.entries(setObj)) {
      update.$set[path] = val;
    }
    update.$set['reserved'] = total;

    // Execute update
    await Inventory.updateOne({ _id: invId }, update);
    console.log(`Updated inventory ${inv.name} (${invId}): reserved=${total}`);
  }

  console.log('Migration complete. Verify data then remove script.');
  process.exit(0);
}

run().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
