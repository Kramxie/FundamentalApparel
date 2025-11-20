/**
 * Migration helper: convert Inventory documents that have a `sizes` array
 * into a `sizesInventory` map. This script performs a dry-run by default
 * and will show the suggested mappings (distributing quantity evenly).
 *
 * Usage:
 *   node migrate-sizes-to-sizesInventory.js        # dry-run, prints suggestions
 *   node migrate-sizes-to-sizesInventory.js --apply  # apply changes
 */

const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');
require('dotenv').config();

const MONGO = process.env.MONGO_URI;
if (!MONGO) {
  console.error('MONGO_URI not set in environment. Aborting.');
  process.exit(1);
}

async function run(apply) {
  await mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true });
  const items = await Inventory.find({ sizes: { $exists: true, $ne: [] } });
  console.log(`Found ${items.length} inventory items with sizes array.`);

  for (const it of items) {
    const sizes = it.sizes || [];
    const totalQty = Number(it.quantity || 0);
    const perSize = {};
    if (sizes.length === 0) continue;

    // Distribute quantity evenly across sizes (integer division), leave remainder in first size
    const base = Math.floor(totalQty / sizes.length);
    let remainder = totalQty - base * sizes.length;
    for (const s of sizes) {
      perSize[s] = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder--;
    }

    console.log(`Item: ${it._id} - ${it.name}`);
    console.log('  sizes:', sizes);
    console.log('  current quantity:', totalQty);
    console.log('  suggested sizesInventory:', perSize);

    if (apply) {
      it.sizesInventory = perSize;
      // Optionally keep sizes array as-is for backward compatibility
      await it.save();
      console.log('  Applied sizesInventory to document.');
    }
  }

  await mongoose.disconnect();
}

(async () => {
  const apply = process.argv.includes('--apply');
  console.log(apply ? 'Running migration with --apply (will modify DB).' : 'Dry-run mode (no changes). Use --apply to apply updates.');
  try {
    await run(apply);
    console.log('Done.');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
})();
