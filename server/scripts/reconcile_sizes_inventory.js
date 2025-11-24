const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const argv = require('minimist')(process.argv.slice(2));
const limit = argv.limit ? Number(argv.limit) : null; // null = no limit (scan all)
const doApply = !!argv.apply; // --apply to perform allocations

// We'll call the inventory util when applying
const inventoryUtil = require('../utils/inventory');

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set in server/.env');
    process.exit(2);
  }
  console.log('[reconcile] connecting to', process.env.MONGO_URI.replace(/:[^:@]+@/, ':***@'));
  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const db = mongoose.connection.db;

  const ordersCol = db.collection('orders');
  const inventoriesCol = db.collection('inventories');

  // Find inventory transactions collection name
  const collNames = (await db.listCollections().toArray()).map(c => c.name.toLowerCase());
  let txColName = collNames.find(n => n.includes('inventory') && n.includes('trans')) || collNames.find(n => n === 'inventorytransactions') || null;
  const txCol = txColName ? db.collection(txColName) : null;
  if (!txCol) console.warn('[reconcile] inventory transactions collection not found; results will only show missing txs by absence check');
  console.log('[reconcile] using tx collection:', txColName || '(none)');

  // Query for paid/accepted orders
  const paidStatuses = ['Paid','paid','PAID','Received','received','RECEIVED','Accepted','accepted','ACCEPTED','Completed','completed','COMPLETED','confirmed','Confirmed','accepted','Accepted'];
  const query = { $or: [ { paymentStatus: { $in: paidStatuses } }, { status: { $in: paidStatuses } } ] };
  let cursor = ordersCol.find(query).sort({ createdAt: -1 });
  if (limit && Number.isFinite(limit)) cursor = cursor.limit(limit);

  const report = { totalOrdersChecked: 0, ordersWithSizeItems: 0, missingAllocations: 0, samples: [] };

  while (await cursor.hasNext()) {
    const order = await cursor.next();
    report.totalOrdersChecked++;
    const items = order.orderItems || order.items || [];

    // Build per-inventory sizes map for this order from its items that have size
    const perInventory = {}; // invName -> sizesMap
    for (const it of items) {
      if (!it.size) continue;
      // find inventory doc
      let inv = null;
      try {
        if (it.product) inv = await inventoriesCol.findOne({ productId: it.product });
      } catch (e) {}
      if (!inv && it.inventoryName) inv = await inventoriesCol.findOne({ name: it.inventoryName });

      const invName = inv ? inv.name : (it.inventoryName || it.name || (it.product ? String(it.product) : ''));
      if (!invName) continue;
      perInventory[invName] = perInventory[invName] || {};
      perInventory[invName][it.size] = (perInventory[invName][it.size] || 0) + (Number(it.quantity) || 1);
    }

    // For each inventory group, check whether transactions exist for this order
    for (const [invName, sizesMap] of Object.entries(perInventory)) {
      report.ordersWithSizeItems++;
      // Determine if a transaction already exists that records sizesMap for this order
      let hasTx = false;
      if (txCol) {
        try {
          // Find any txs for this order that include sizesMap in the document
          const txs = await txCol.find({ orderId: order._id }).limit(20).toArray();
          if (txs && txs.length > 0) {
            // simple heuristic: if any tx has sizesMap and overlaps on sizes, consider allocated
            for (const t of txs) {
              if (t.sizesMap) {
                for (const s of Object.keys(sizesMap)) {
                  if (t.sizesMap[s] && Number(t.sizesMap[s]) >= sizesMap[s]) {
                    hasTx = true; break;
                  }
                }
                if (hasTx) break;
              }
            }
          }
        } catch (e) { /* ignore */ }
      }

      if (!hasTx) {
        report.missingAllocations++;
        if (report.samples.length < 200) {
          report.samples.push({ orderId: order._id.toString(), inventory: invName, sizesMap });
        }

        // If apply mode, attempt to allocate using inventory util
        if (doApply) {
          try {
            await inventoryUtil.allocateInventoryBySizes({ name: invName, sizesMap, orderId: order._id, note: 'Backfill allocation (reconcile_sizes_inventory)' });
            report.applied = (report.applied || 0) + 1;
            console.log(`[apply] Allocated for order ${order._id} inventory ${invName} sizes ${JSON.stringify(sizesMap)}`);
          } catch (applyErr) {
            report.applyErrors = report.applyErrors || [];
            report.applyErrors.push({ orderId: order._id.toString(), inventory: invName, sizesMap, error: applyErr.message });
            console.warn(`[apply] Failed to allocate for order ${order._id} inventory ${invName}:`, applyErr.message);
          }
        }
      }
    }
  }

  console.log(JSON.stringify(report, null, 2));
  await mongoose.disconnect();
}

main().catch(err => { console.error('Fatal', err && err.stack ? err.stack : err); process.exit(99); });
