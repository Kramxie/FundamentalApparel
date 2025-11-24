const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const argv = require('minimist')(process.argv.slice(2));
const invId = argv.inventoryId || argv.inv || argv.id;

if (!invId) { console.error('Usage: node list_inventory_txs_by_inventory.js --inventoryId <inventoryId>'); process.exit(2); }

async function main() {
  if (!process.env.MONGO_URI) { console.error('MONGO_URI not set'); process.exit(3); }
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;
  const collNames = (await db.listCollections().toArray()).map(c => c.name);
  const txName = collNames.find(n => n.toLowerCase().includes('inventory') && n.toLowerCase().includes('trans')) || 'inventorytransactions';
  const txCol = db.collection(txName);

  const ObjectId = mongoose.Types.ObjectId;
  let query = {};
  try { query = { inventory: ObjectId(invId) }; } catch (e) { query = { inventory: invId }; }

  const txs = await txCol.find(query).sort({ createdAt: 1 }).toArray();
  console.log('Using tx collection:', txName);
  console.log('Found', txs.length, 'transactions for inventory', invId);
  txs.forEach(t => console.log(JSON.stringify({ _id: t._id, type: t.type, qty: t.qty, sizesMap: t.sizesMap, inventory: t.inventory, inventoryName: t.inventoryName, orderId: t.orderId, createdAt: t.createdAt }, null, 2)));

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(e => { console.error(e && e.stack); process.exit(99); });
