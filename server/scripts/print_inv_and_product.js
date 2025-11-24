const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const argv = require('minimist')(process.argv.slice(2));
const invName = argv.name || argv.inventory || argv.id;

if (!invName) { console.error('Usage: node print_inv_and_product.js --name "Inventory Name"'); process.exit(2); }

async function main() {
  if (!process.env.MONGO_URI) { console.error('MONGO_URI not set'); process.exit(3); }
  await mongoose.connect(process.env.MONGO_URI);
  const Inventory = require('../models/Inventory');
  const Product = require('../models/Product');

  const inv = await Inventory.findOne({ name: new RegExp('^' + invName + '$', 'i') }).lean();
  if (!inv) { console.error('Inventory not found'); await mongoose.disconnect(); process.exit(4); }
  console.log('Inventory:', { _id: inv._id.toString(), name: inv.name, quantity: inv.quantity, sizesInventory: inv.sizesInventory, reserved: inv.reserved, reservedSizes: inv.reservedSizes });
  if (inv.productId) {
    const prod = await Product.findById(inv.productId).lean();
    console.log('Product:', { _id: prod._id.toString(), name: prod.name, countInStock: prod.countInStock, sizesInventory: prod.sizesInventory });
  }
  await mongoose.disconnect(); process.exit(0);
}

main().catch(e=>{ console.error(e && e.stack); process.exit(99); });
