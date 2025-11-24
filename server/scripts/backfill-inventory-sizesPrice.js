// Backfill script: copy sizesPrice from Product -> Inventory for linked items
// Usage: from server root run: node server/scripts/backfill-inventory-sizesPrice.js

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const Product = require('../models/Product');
const Inventory = require('../models/Inventory');

async function main(){
  const MONGO = process.env.MONGO_URI || process.env.DATABASE_URL || 'mongodb://localhost:27017/fundamental_apparel';
  console.log('Connecting to', MONGO);
  await mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected');
  try {
    const products = await Product.find({}).lean();
    let updated = 0;
    for(const p of products){
      if(!p._id) continue;
      const inv = await Inventory.findOne({ productId: p._id });
      if(!inv) continue;
      const sizesPrice = p.sizesPrice || {};
      // If inventory already has sizesPrice and non-empty, skip
      const has = inv.sizesPrice && Object.keys(Object.fromEntries(inv.sizesPrice || []) || {}).length > 0;
      if(has) continue;
      inv.sizesPrice = sizesPrice;
      await inv.save();
      updated++;
      console.log('Updated inventory', inv._id.toString(), 'with sizesPrice from product', p._id.toString());
    }
    console.log('Done. Updated', updated, 'inventory items.');
  } catch (e){
    console.error('Error', e);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main();
