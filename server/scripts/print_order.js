const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const argv = require('minimist')(process.argv.slice(2));
const orderId = argv.orderId || argv._id || argv.id;

if (!orderId) { console.error('Usage: node print_order.js --orderId <orderId>'); process.exit(2); }

async function main() {
  if (!process.env.MONGO_URI) { console.error('MONGO_URI not set'); process.exit(3); }
  await mongoose.connect(process.env.MONGO_URI);
  const Order = require('../models/Order');
  const OrderModel = Order;
  const prodOrder = await OrderModel.findById(orderId).lean();
  if (!prodOrder) {
    console.error('Order not found by id:', orderId);
    await mongoose.disconnect(); process.exit(4);
  }
  console.log(JSON.stringify(prodOrder, null, 2));
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(e => { console.error(e && e.stack); process.exit(99); });
