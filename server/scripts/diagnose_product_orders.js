const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const argv = require('minimist')(process.argv.slice(2));
const name = argv.name || argv.product || argv.inventory || 'Fundamental Socks';
const limit = Number(argv.limit || 50);

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set'); process.exit(2);
  }
  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const db = mongoose.connection.db;
  const products = db.collection('products');
  const inventories = db.collection('inventories');
  const orders = db.collection('orders');

  console.log('[diagnoseProduct] looking up product/inventory for:', name);
  const prod = await products.findOne({ name: new RegExp('^' + name + '$','i') });
  const inv = await inventories.findOne({ name: new RegExp('^' + name + '$','i') });

  console.log('Product:', prod ? { _id: prod._id.toString(), name: prod.name } : null);
  console.log('Inventory:', inv ? { _id: inv._id.toString(), name: inv.name, quantity: inv.quantity, sizesInventory: inv.sizesInventory, sizesPrice: inv.sizesPrice } : null);

  // find recent orders that reference the product or name
  const q = { $or: [ { 'orderItems.product': prod? prod._id : null }, { 'orderItems.name': new RegExp(name,'i') }, { 'orderItems.inventoryName': new RegExp(name,'i') } ] };
  // cleanup q to not include null
  if (!prod) delete q.$or[0];

  const cursor = orders.find(q).sort({ createdAt: -1 }).limit(limit);
  const results = [];
  while (await cursor.hasNext()) {
    const o = await cursor.next();
    const items = (o.orderItems || []).filter(it => {
      if (prod && it.product && String(it.product) === String(prod._id)) return true;
      if (it.name && new RegExp(name,'i').test(it.name)) return true;
      if (it.inventoryName && new RegExp(name,'i').test(it.inventoryName)) return true;
      return false;
    });
    if (items.length === 0) continue;
    // find inventory transactions for this order
    const collNames = (await db.listCollections().toArray()).map(c => c.name.toLowerCase());
    let txColName = collNames.find(n => n.includes('inventory') && n.includes('trans')) || collNames.find(n => n === 'inventorytransactions') || null;
    const txs = txColName ? await db.collection(txColName).find({ orderId: o._id }).toArray() : [];
    results.push({ orderId: o._id.toString(), status: o.status, paymentStatus: o.paymentStatus, createdAt: o.createdAt, items: items.map(it=>({ name: it.name, product: it.product, size: it.size || null, quantity: it.quantity, price: it.price, inventoryName: it.inventoryName || null })), inventoryTransactions: txs.map(t => ({ _id: t._id, sizesMap: t.sizesMap, qty: t.qty, type: t.type })) });
  }

  console.log(JSON.stringify({ product: prod? prod._id : null, inventory: inv? inv._id : null, orders: results }, null, 2));
  await mongoose.disconnect();
}

main().catch(err=>{ console.error(err && err.stack? err.stack: err); process.exit(99); });
