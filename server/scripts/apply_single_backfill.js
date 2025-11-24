const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const argv = require('minimist')(process.argv.slice(2));
const name = argv.name || argv.inventory || argv.product;
const orderId = argv.orderId || argv.order || null;
const size = argv.size || argv.s || null;
const qty = argv.qty ? Number(argv.qty) : (argv.quantity ? Number(argv.quantity) : 1);

if (!name || !orderId || !size) {
  console.error('Usage: node apply_single_backfill.js --name "Product Name" --orderId <orderId> --size S [--qty 1]');
  process.exit(2);
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set in server/.env'); process.exit(3);
  }
  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const Inventory = require('../models/Inventory');
  const InventoryTransaction = require('../models/InventoryTransaction');
  const inventoryUtil = require('../utils/inventory');

  // show before
  const inv = await Inventory.findOne({ name: new RegExp('^' + name + '$', 'i') }).lean();
  if (!inv) {
    console.error('Inventory not found for name:', name);
    await mongoose.disconnect(); process.exit(4);
  }

  console.log('BEFORE inventory:', { _id: inv._id.toString(), name: inv.name, quantity: inv.quantity, sizesInventory: inv.sizesInventory, reserved: inv.reserved, reservedSizes: inv.reservedSizes });

  try {
    await inventoryUtil.allocateInventoryBySizes({ name, sizesMap: { [size]: qty }, orderId, note: 'Backfill allocation (manual)' });
    console.log('[apply] allocateInventoryBySizes succeeded');
  } catch (err) {
    console.error('[apply] allocate failed:', err && err.message ? err.message : err);
    await mongoose.disconnect(); process.exit(5);
  }

  // re-fetch
  const invAfter = await Inventory.findOne({ _id: inv._id }).lean();
  console.log('AFTER inventory:', { _id: invAfter._id.toString(), name: invAfter.name, quantity: invAfter.quantity, sizesInventory: invAfter.sizesInventory, reserved: invAfter.reserved, reservedSizes: invAfter.reservedSizes });

  // fetch recent transactions for this order
  const txs = await InventoryTransaction.find({ orderId }).sort({ createdAt: -1 }).limit(10).lean();
  console.log('Recent transactions for order:', orderId, txs.map(t => ({ _id: t._id, type: t.type, qty: t.qty, sizesMap: t.sizesMap, note: t.note, createdAt: t.createdAt })));

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => { console.error(err && err.stack ? err.stack : err); process.exit(99); });
