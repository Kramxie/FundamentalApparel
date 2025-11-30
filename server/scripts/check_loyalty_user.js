#!/usr/bin/env node
// Usage: node server/scripts/check_loyalty_user.js email@example.com

require('dotenv').config();
const connectDB = require('../config/db');
const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: node server/scripts/check_loyalty_user.js <email>');
    process.exit(1);
  }

  await connectDB();

  try {
    const user = await User.findOne({ email: email.toLowerCase() }).lean();
    if (!user) {
      console.error('User not found for email:', email);
      process.exit(2);
    }

    console.log('User:', user._id.toString(), user.name || '', user.email);

    // Show vouchers
    const vouchers = (user.vouchers || []).map(v => ({ code: v.code, value: v.value, used: !!v.used, createdAt: v.createdAt }));
    console.log('Vouchers (' + vouchers.length + '):');
    vouchers.forEach(v => console.log('  -', v.code, '|', v.value, 'PHP | used:', v.used, '| createdAt:', v.createdAt));

    // Count delivered/completed orders for current month
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthStart = new Date(year, month, 1, 0, 0, 0, 0);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

    const query = {
      user: mongoose.Types.ObjectId(user._id),
      status: { $in: ['Delivered', 'Completed'] },
      $or: [
        { deliveredAt: { $gte: monthStart, $lte: monthEnd } },
        { updatedAt: { $gte: monthStart, $lte: monthEnd } }
      ]
    };

    const count = await Order.countDocuments(query);
    console.log(`Completed/Delivered orders in ${String(month+1).padStart(2,'0')}/${year}:`, count);

    const orders = await Order.find(query).sort({ deliveredAt: -1 }).limit(50).lean();
    console.log('Recent matched orders (up to 50):');
    orders.forEach(o => console.log('  -', o._id.toString(), '| status:', o.status, '| deliveredAt:', o.deliveredAt, '| updatedAt:', o.updatedAt, '| total:', o.totalPrice));

    // Check monthly loyalty voucher code
    const mm = String(month + 1).padStart(2, '0');
    const code = `LOYALTY-${year}${mm}`;
    const hasLoyalty = (user.vouchers || []).some(v => v.code === code);
    console.log('Expected loyalty code for this month:', code, '-> present in user vouchers?', hasLoyalty);

    process.exit(0);
  } catch (err) {
    console.error('Error while checking user:', err && err.message);
    process.exit(3);
  }
}

main();
