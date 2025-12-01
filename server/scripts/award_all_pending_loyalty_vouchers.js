/**
 * Script to award ALL pending loyalty vouchers (for any month).
 * 
 * This script checks ALL users who have 10+ completed orders in ANY month
 * but haven't received their loyalty voucher for that month, and awards it to them.
 * 
 * Run with: node server/scripts/award_all_pending_loyalty_vouchers.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Order = require('../models/Order');
const User = require('../models/User');

const MONGO_URI = process.env.MONGO_URI;
const THRESHOLD = 10;
const VOUCHER_VALUE = 20;

async function main() {
    console.log('='.repeat(60));
    console.log('AWARD ALL PENDING LOYALTY VOUCHERS');
    console.log('='.repeat(60));
    
    if (!MONGO_URI) {
        console.error('ERROR: MONGO_URI not set in environment');
        process.exit(1);
    }

    try {
        await mongoose.connect(MONGO_URI);
        console.log('✓ Connected to MongoDB\n');

        // Get all completed orders grouped by user and month
        const ordersByUserAndMonth = await Order.aggregate([
            {
                $match: {
                    status: { $in: ['Delivered', 'Completed'] }
                }
            },
            {
                $addFields: {
                    completedDate: { $ifNull: ['$deliveredAt', '$updatedAt'] }
                }
            },
            {
                $group: {
                    _id: {
                        user: '$user',
                        year: { $year: '$completedDate' },
                        month: { $month: '$completedDate' }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $match: {
                    count: { $gte: THRESHOLD }
                }
            }
        ]);

        console.log(`Found ${ordersByUserAndMonth.length} user-month combinations with ${THRESHOLD}+ orders\n`);
        console.log('-'.repeat(60));

        let awardedCount = 0;
        let alreadyHadCount = 0;
        let errorCount = 0;

        for (const record of ordersByUserAndMonth) {
            const userId = record._id.user;
            const year = record._id.year;
            const month = record._id.month;
            const count = record.count;
            const mm = String(month).padStart(2, '0');
            const voucherCode = `LOYALTY-${year}${mm}`;

            try {
                const user = await User.findById(userId).select('name email vouchers');
                if (!user) {
                    console.log(`⚠ User ${userId} not found (deleted?)`);
                    continue;
                }

                // Check if user already has this month's voucher
                const alreadyHas = (user.vouchers || []).some(v => v.code === voucherCode);

                if (alreadyHas) {
                    console.log(`✓ ${user.email} - ${mm}/${year} (${count} orders) - Already has voucher`);
                    alreadyHadCount++;
                } else {
                    // Award the voucher
                    const voucher = {
                        code: voucherCode,
                        description: `Loyalty reward: ₱${VOUCHER_VALUE} off for ${THRESHOLD} purchases in ${mm}/${year}`,
                        type: 'fixed',
                        value: VOUCHER_VALUE,
                        used: false,
                        createdAt: new Date()
                    };

                    user.vouchers = user.vouchers || [];
                    user.vouchers.push(voucher);
                    await user.save();

                    console.log(`🎁 ${user.email} - ${mm}/${year} (${count} orders) - VOUCHER AWARDED! (${voucherCode})`);
                    awardedCount++;
                }
            } catch (err) {
                console.error(`✗ Error processing user ${userId}:`, err.message);
                errorCount++;
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('SUMMARY');
        console.log('='.repeat(60));
        console.log(`User-months with ${THRESHOLD}+ orders: ${ordersByUserAndMonth.length}`);
        console.log(`Vouchers awarded now: ${awardedCount}`);
        console.log(`Already had voucher: ${alreadyHadCount}`);
        console.log(`Errors: ${errorCount}`);
        console.log('='.repeat(60));

        if (awardedCount > 0) {
            console.log(`\n🎉 Successfully awarded ${awardedCount} loyalty voucher(s)!`);
        } else if (ordersByUserAndMonth.length === 0) {
            console.log('\nNo users with 10+ completed orders in any month.');
        } else {
            console.log('\nAll eligible users already have their vouchers.');
        }

    } catch (err) {
        console.error('Script error:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\n✓ Disconnected from MongoDB');
    }
}

main();
