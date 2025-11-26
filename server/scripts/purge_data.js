/* Safe purge script for Orders, CustomOrders, and Quotes

Usage (PowerShell):
  # Dry run - show counts
  node server/scripts/purge_data.js --what=all --dry-run

  # Backup only (no delete)
  node server/scripts/purge_data.js --what=all --backup

  # Backup and delete (requires explicit confirm phrase)
  node server/scripts/purge_data.js --what=all --backup --confirm=DELETE_ALL_TEST_DATA

  # Options for --what: orders, custom, quotes, all
  # --revert-inventory : attempt to revert inventory transactions for deleted orders (risky)

Note: This script REQUIRES a confirmation phrase for destructive action unless NODE_ENV !== 'production' is set
and you pass --confirm. Do NOT run this on production unless you have full backups.
*/

const mongoose = require('mongoose');
const argv = require('minimist')(process.argv.slice(2));
const Order = require('../models/Order');
const CustomOrder = require('../models/CustomOrder');
const InventoryTransaction = require('../models/InventoryTransaction');
const WebhookEvent = require('../models/WebhookEvent');
const Inventory = require('../models/Inventory');

const { releaseInventory, consumeReserved, allocateInventory, findInventoryByName } = require('../utils/inventory');

const MONGO_URI = process.env.MONGO_URI || process.env.DATABASE_URL || 'mongodb://localhost:27017/fundamental-apparel';

async function connect() {
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
}

function nowTag() {
  const d = new Date();
  return d.toISOString().replace(/[:.]/g, '-');
}

async function backupCollection(collName, docs) {
  if (!docs || !docs.length) return 0;
  const backupName = `${collName}_backup_${nowTag()}`;
  const db = mongoose.connection.db;
  await db.collection(backupName).insertMany(docs);
  console.log(`Backed up ${docs.length} documents to collection: ${backupName}`);
  return docs.length;
}

async function main() {
  const what = (argv.what || 'all').toString();
  const dryRun = !!argv.dryRun || !!argv['dry-run'];
  const doBackup = !!argv.backup;
  const confirm = argv.confirm || argv.c;
  const revertInventory = !!argv['revert-inventory'];

  console.log('Purge script starting. Connecting to DB...');
  await connect();
  console.log('Connected to DB:', MONGO_URI);

  // Safety check
  if (!dryRun && (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'prod')) {
    if (!confirm || confirm !== 'DELETE_ALL_TEST_DATA') {
      console.error('\nDestructive operation blocked. To proceed in production set --confirm=DELETE_ALL_TEST_DATA');
      process.exit(1);
    }
  } else if (!dryRun && !confirm) {
    console.warn('\nNon-production environment or safe mode: still require --confirm flag to proceed with deletions.');
    console.warn('Pass --confirm=DELETE_ALL_TEST_DATA to proceed.');
    process.exit(1);
  }

  const results = {};

  // Helper: find user quotes (custom orders in quote states)
  if (what === 'quotes' || what === 'all' || what === 'custom') {
    // Custom quotes are CustomOrder with statuses 'Pending Quote' or 'Quote Sent'
    const quoteFilter = { status: { $in: ['Pending Quote', 'Quote Sent'] } };
    const quotes = await CustomOrder.find(quoteFilter).lean();
    console.log(`Found ${quotes.length} user quote(s) matching ${JSON.stringify(quoteFilter)}`);
    results.quotesCount = quotes.length;
    if (doBackup && quotes.length) await backupCollection('customorders_quotes', quotes);
    if (!dryRun && confirm) {
      const delRes = await CustomOrder.deleteMany(quoteFilter);
      console.log(`Deleted ${delRes.deletedCount} custom order quote documents`);
      results.quotesDeleted = delRes.deletedCount;
    }
  }

  if (what === 'orders' || what === 'all') {
    const orders = await Order.find({}).lean();
    console.log(`Found ${orders.length} Order documents`);
    results.ordersCount = orders.length;
    if (doBackup && orders.length) await backupCollection('orders', orders);
    if (!dryRun && confirm) {
      const delRes = await Order.deleteMany({});
      console.log(`Deleted ${delRes.deletedCount} Order documents`);
      results.ordersDeleted = delRes.deletedCount;
    }
  }

  if (what === 'custom' || what === 'all') {
    const customs = await CustomOrder.find({}).lean();
    console.log(`Found ${customs.length} CustomOrder documents`);
    results.customCount = customs.length;
    if (doBackup && customs.length) await backupCollection('customorders', customs);
    if (!dryRun && confirm) {
      const delRes = await CustomOrder.deleteMany({});
      console.log(`Deleted ${delRes.deletedCount} CustomOrder documents`);
      results.customDeleted = delRes.deletedCount;
    }
  }

  // InventoryTransactions and webhook events are related; back them up as well if backup requested
  if (doBackup) {
    const txs = await InventoryTransaction.find({}).lean();
    console.log(`Found ${txs.length} InventoryTransaction documents`);
    if (txs.length) await backupCollection('inventorytransactions', txs);

    const webhooks = await WebhookEvent.find({}).lean();
    console.log(`Found ${webhooks.length} WebhookEvent documents`);
    if (webhooks.length) await backupCollection('webhookevents', webhooks);
  }

  // If requested, optionally revert inventory adjustments before removing InventoryTransaction entries
  if (revertInventory && !dryRun && confirm) {
    console.log('Attempting to revert inventory allocations based on InventoryTransaction records (CAUTION)');
    const txs = await InventoryTransaction.find({}).sort({ createdAt: 1 });
    for (const tx of txs) {
      try {
        if (tx.type === 'allocate') {
          // For per-size allocations the transaction may have sizesMap
          if (tx.sizesMap && Object.keys(tx.sizesMap || {}).length) {
            // Attempt to reverse: increment sizesInventory and decrement reserved/reservedSizes
            const inv = await Inventory.findById(tx.inventory);
            if (!inv) { console.warn('Inventory not found for tx:', tx._id); continue; }
            const inc = {};
            let total = 0;
            for (const [sz, q] of Object.entries(tx.sizesMap || {})) {
              const need = Number(q || 0);
              if (!need) continue;
              inc[`sizesInventory.${sz}`] = need;
              inc[`reservedSizes.${sz}`] = -need;
              total += need;
            }
            inc['quantity'] = total;
            inc['reserved'] = -total;
            await Inventory.updateOne({ _id: inv._id }, { $inc: inc });
            console.log('Reverted allocate tx:', tx._id.toString());
          } else if (tx.qty) {
            // Non-size allocate: increase quantity and decrease reserved
            await Inventory.updateOne({ _id: tx.inventory }, { $inc: { quantity: tx.qty, reserved: -tx.qty } });
            console.log('Reverted allocate tx (qty):', tx._id.toString());
          }
        }
        // Note: not reversing 'release' or 'adjust' types automatically here
      } catch (err) {
        console.warn('Failed to revert tx', tx._id, err && err.message);
      }
    }
  }

  // Optionally delete InventoryTransaction and WebhookEvent after backups
  if (!dryRun && confirm && argv['remove-transactions']) {
    const tdel = await InventoryTransaction.deleteMany({});
    console.log(`Deleted ${tdel.deletedCount} InventoryTransaction documents`);
    const wdel = await WebhookEvent.deleteMany({});
    console.log(`Deleted ${wdel.deletedCount} WebhookEvent documents`);
  }

  console.log('\nPurge script completed. Summary:', results);
  process.exit(0);
}

main().catch(err => {
  console.error('Purge script error:', err && err.message);
  process.exit(2);
});
