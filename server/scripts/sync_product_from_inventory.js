const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const argv = require('minimist')(process.argv.slice(2));
const name = argv.name || argv.inventory || argv.product;

if (!name) {
  console.error('Usage: node sync_product_from_inventory.js --name "Inventory Name"');
  process.exit(2);
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set in server/.env'); process.exit(3);
  }
  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const Inventory = require('../models/Inventory');
  const Product = require('../models/Product');

  const inv = await Inventory.findOne({ name: new RegExp('^' + name + '$', 'i') }).lean();
  if (!inv) {
    console.error('Inventory not found for name:', name);
    await mongoose.disconnect(); process.exit(4);
  }

  console.log('Inventory (before):', { _id: inv._id.toString(), name: inv.name, quantity: inv.quantity, sizesInventory: inv.sizesInventory, reserved: inv.reserved, reservedSizes: inv.reservedSizes, productId: inv.productId });

  if (!inv.productId) {
    console.warn('No linked productId on inventory. Nothing to sync to Product model.');
    await mongoose.disconnect(); process.exit(0);
  }

  const prod = await Product.findById(inv.productId).lean();
  if (!prod) {
    console.error('Linked product not found:', inv.productId);
    await mongoose.disconnect(); process.exit(5);
  }

  console.log('Product (before):', { _id: prod._id.toString(), name: prod.name, countInStock: prod.countInStock, sizesInventory: prod.sizesInventory });

  // Build update object: set countInStock and sizesInventory to match inventory
  const sizesObj = (inv.sizesInventory && typeof inv.sizesInventory === 'object') ?
    (inv.sizesInventory instanceof Map ? Object.fromEntries(inv.sizesInventory) : inv.sizesInventory)
    : {};

  const update = { countInStock: Number(inv.quantity || 0), sizesInventory: sizesObj };

  const updated = await Product.findByIdAndUpdate(inv.productId, { $set: update }, { new: true }).lean();

  console.log('Product (after):', { _id: updated._id.toString(), name: updated.name, countInStock: updated.countInStock, sizesInventory: updated.sizesInventory });

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => { console.error(err && err.stack ? err.stack : err); process.exit(99); });
