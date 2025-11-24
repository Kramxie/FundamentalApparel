const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  if (!process.env.MONGO_URI) { console.error('MONGO_URI not set'); process.exit(2); }
  await mongoose.connect(process.env.MONGO_URI);
  const InventoryTransaction = require('../models/InventoryTransaction');
  const txs = await InventoryTransaction.find({}).sort({ createdAt: -1 }).limit(20).lean();
  console.log('Found', txs.length, 'recent transactions');
  txs.forEach(t => console.log(JSON.stringify({ _id: t._id, type: t.type, qty: t.qty, inventory: t.inventory, inventoryName: t.inventoryName, orderId: t.orderId, createdAt: t.createdAt }, null, 2)));
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(e=>{ console.error(e && e.stack); process.exit(99); });
