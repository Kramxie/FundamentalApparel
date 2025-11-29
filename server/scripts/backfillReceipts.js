#!/usr/bin/env node
/**
 * One-time script to backfill `receiptId` on Order and CustomOrder
 * Finds Receipt documents and ensures the referenced Order/CustomOrder has receiptId set.
 * Usage (PowerShell):
 *   $env:MONGO_URI = 'your_mongo_uri'; node server/scripts/backfillReceipts.js
 */
const mongoose = require('mongoose');
require('dotenv').config();

const Receipt = require('../models/Receipt');
const Order = require('../models/Order');
const CustomOrder = require('../models/CustomOrder');

async function main(){
  const uri = process.env.MONGO_URI || process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/fundamental';
  console.log('Connecting to', uri);
  await mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected. Scanning receipts...');

  const receipts = await Receipt.find({}).lean();
  console.log('Found', receipts.length, 'receipts');

  let updated = 0;
  for (const r of receipts) {
    if (!r.orderId) continue;
    // Try regular Order first
    try {
      const ord = await Order.findById(r.orderId);
      if (ord) {
        if (!ord.receiptId || String(ord.receiptId) !== String(r._id)) {
          ord.receiptId = r._id;
          await ord.save();
          updated++;
          console.log('Updated Order', ord._id.toString(), '-> receiptId', r._id.toString());
        }
        continue;
      }
    } catch (e) { /* ignore */ }
    // Try custom order
    try {
      const cord = await CustomOrder.findById(r.orderId);
      if (cord) {
        if (!cord.receiptId || String(cord.receiptId) !== String(r._id)) {
          cord.receiptId = r._id;
          await cord.save();
          updated++;
          console.log('Updated CustomOrder', cord._id.toString(), '-> receiptId', r._id.toString());
        }
      }
    } catch (e) { /* ignore */ }
  }

  console.log('Done. Updated', updated, 'orders.');
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(2); });
