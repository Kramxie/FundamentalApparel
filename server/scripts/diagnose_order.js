const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

// Load server .env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const argv = require('minimist')(process.argv.slice(2));
const providedId = argv.orderId || argv.id || argv._id || null;

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set in server/.env');
    process.exit(2);
  }

  console.log('[diagnose] connecting to', process.env.MONGO_URI.replace(/:[^:@]+@/, ':***@'));

  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });

  const db = mongoose.connection.db;

  const ordersCol = db.collection('orders');
  const inventoriesCol = db.collection('inventories');

  // list collections to guess inventoryTransactions name
  const collNames = (await db.listCollections().toArray()).map(c => c.name.toLowerCase());
  const txCandidateNames = ['inventorytransactions','inventorytransactions','inventory_transactions','inventory_transaction','inventorytransaction','inventorytransactionlogs','inventorylogs','inventory_transactions'];
  let txColName = null;
  for (const n of txCandidateNames) {
    if (collNames.includes(n)) { txColName = n; break; }
  }
  // fallback: try plural or camel
  if (!txColName) {
    for (const c of collNames) {
      if (c.includes('inventory') && c.includes('trans')) { txColName = c; break; }
    }
  }

  const txCol = txColName ? db.collection(txColName) : null;

  console.log('[diagnose] using inventoryTransactions collection:', txColName || '(not found)');

  let order = null;

  function oidFrom(s) {
    try { return new mongoose.Types.ObjectId(s); } catch (e) { return null; }
  }

  if (providedId && providedId.length === 24) {
    const oid = oidFrom(providedId);
    order = await ordersCol.findOne({ _id: oid });
    if (!order) console.warn('[diagnose] no order found for _id', providedId);
  }

  if (!order) {
    // find recent paid/received/accepted orders
    const paidStatuses = ['Paid','paid','PAID','Received','received','RECEIVED','Completed','completed','COMPLETED','confirmed','Confirmed','accepted','Accepted'];
    const recent = await ordersCol.find({ paymentStatus: { $in: paidStatuses } }).sort({ createdAt: -1 }).limit(50).toArray();

    if (providedId) {
      // try to match substring of ObjectId
      const match = recent.find(o => o._id.toString().includes(providedId));
      if (match) {
        order = match;
        console.log('[diagnose] matched provided id to recent order _id=', order._id.toString());
      }
    }

    if (!order) {
      if (recent.length === 0) {
        console.error('[diagnose] no recent paid orders found');
        await mongoose.disconnect();
        process.exit(3);
      }
      order = recent[0];
      console.log('[diagnose] no exact id match; using most recent paid order _id=', order._id.toString());
    }
  }

  // Compose report
  const report = {
    orderId: order._id.toString(),
    orderStatus: order.status || order.paymentStatus || null,
    createdAt: order.createdAt,
    items: []
  };

  // Normalize orderItems field name
  const items = order.orderItems || order.items || [];

  for (const it of items) {
    const itemReport = {
      name: it.name || it.productName || null,
      productId: it.productId ? it.productId.toString() : (it.product ? it.product.toString() : null),
      inventoryName: it.inventoryName || it.name || null,
      size: it.size || null,
      quantity: it.quantity || it.qty || 1,
      price: it.price || null,
      inventory: null,
      inventoryTransactions: []
    };

    // find inventory by productId first
    let inv = null;
    if (itemReport.productId) {
      try {
        inv = await inventoriesCol.findOne({ productId: oidFrom(itemReport.productId) });
      } catch (e) { /* ignore */ }
    }

    if (!inv) {
      // try by inventoryName or item name
      const nameToTry = itemReport.inventoryName || itemReport.name;
      if (nameToTry) inv = await inventoriesCol.findOne({ name: nameToTry });
    }

    if (!inv) {
      // try by productId as string (in case saved as string)
      if (itemReport.productId) inv = await inventoriesCol.findOne({ productId: itemReport.productId });
    }

    if (inv) {
      // convert Maps (if stored as BSON) to plain objects for printing
      const sizesInventory = inv.sizesInventory || inv.sizesInventoryMap || null;
      const sizesPrice = inv.sizesPrice || null;
      const reservedSizes = inv.reservedSizes || null;

      itemReport.inventory = {
        _id: inv._id.toString(),
        name: inv.name,
        quantity: inv.quantity,
        sizesInventory: sizesInventory,
        sizesPrice: sizesPrice,
        reservedSizes: reservedSizes
      };
    }

    if (txCol) {
      // find transactions for this order and this item (try productId or inventoryId or name)
      const txQuery = { orderId: order._id };
      // include item productId if present
      if (itemReport.productId) {
        try { txQuery.productId = oidFrom(itemReport.productId); } catch(e) {}
      }
      // also try matching by size field inside tx (if tx schema includes size)
      try {
        const txs = await txCol.find({ orderId: order._id }).sort({ createdAt: 1 }).toArray();
        // filter txs locally for ones that mention this item's productId or size or inventory
        itemReport.inventoryTransactions = txs.filter(t => {
          try {
            if (t.productId && itemReport.productId && t.productId.toString() === itemReport.productId) return true;
            if (t.inventoryId && itemReport.inventory && t.inventoryId.toString() === itemReport.inventory._id) return true;
            if (t.size && itemReport.size && t.size === itemReport.size) return true;
            if (t.meta && t.meta.orderItemId && String(t.meta.orderItemId) === String(it._id || '')) return true;
            // fallback: if tx name matches
            if (t.name && itemReport.name && t.name === itemReport.name) return true;
          } catch (e) { /* ignore */ }
          return false;
        });
      } catch (e) {
        // couldn't query txs
      }
    }

    report.items.push(itemReport);
  }

  console.log(JSON.stringify(report, null, 2));

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal', err && err.stack ? err.stack : err);
  process.exit(99);
});
