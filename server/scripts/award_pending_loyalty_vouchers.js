/**
 * Script to award pending loyalty vouchers to all eligible users.
 * 
 * This script checks ALL users who have 10+ completed orders this month
 * but haven't received their loyalty voucher yet, and awards it to them.
 * 
 * Run with: node server/scripts/award_pending_loyalty_vouchers.js
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
    console.log('LOYALTY VOUCHER AWARD SCRIPT');
    console.log('='.repeat(60));
    
    if (!MONGO_URI) {
        console.error('ERROR: MONGO_URI not set in environment');
        process.exit(1);
    }

    try {
        await mongoose.connect(MONGO_URI);
        console.log('✓ Connected to MongoDB\n');

        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth(); // 0-based
        const mm = String(month + 1).padStart(2, '0');
        const monthStart = new Date(year, month, 1, 0, 0, 0, 0);
        const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
        const loyaltyCode = `LOYALTY-${year}${mm}`;

        console.log(`Current Month: ${mm}/${year}`);
        console.log(`Voucher Code: ${loyaltyCode}`);
        console.log(`Threshold: ${THRESHOLD} completed orders`);
        console.log(`Voucher Value: ₱${VOUCHER_VALUE} OFF`);
        console.log('-'.repeat(60));

        // Find all users with completed orders this month
        const usersWithCompletedOrders = await Order.aggregate([
            {
                $match: {
                    status: { $in: ['Delivered', 'Completed'] },
                    $or: [
                        { deliveredAt: { $gte: monthStart, $lte: monthEnd } },
                        { updatedAt: { $gte: monthStart, $lte: monthEnd } }
                    ]
                }
            },
            {
                $group: {
                    _id: '$user',
                    completedCount: { $sum: 1 }
                }
            },
            {
                $match: {
                    completedCount: { $gte: THRESHOLD }
                }
            }
        ]);

        console.log(`Found ${usersWithCompletedOrders.length} user(s) with ${THRESHOLD}+ completed orders this month\n`);

        let awardedCount = 0;
        let alreadyHadCount = 0;
        let errorCount = 0;

        for (const record of usersWithCompletedOrders) {
            const userId = record._id;
            const orderCount = record.completedCount;

            try {
                const user = await User.findById(userId).select('name email vouchers');
                if (!user) {
                    console.log(`  ⚠ User ${userId} not found (deleted?)`);
                    continue;
                }

                // Check if user already has this month's voucher
                const alreadyHas = (user.vouchers || []).some(v => v.code === loyaltyCode);

                if (alreadyHas) {
                    console.log(`  ✓ ${user.email} (${orderCount} orders) - Already has voucher`);
                    alreadyHadCount++;
                } else {
                    // Award the voucher
                    const voucher = {
                        code: loyaltyCode,
                        description: `Loyalty reward: ₱${VOUCHER_VALUE} off for ${THRESHOLD} purchases in ${mm}/${year}`,
                        type: 'fixed',
                        value: VOUCHER_VALUE,
                        used: false,
                        createdAt: new Date()
                    };

                    user.vouchers = user.vouchers || [];
                    user.vouchers.push(voucher);
                    await user.save();

                    console.log(`  🎁 ${user.email} (${orderCount} orders) - VOUCHER AWARDED!`);
                    awardedCount++;
                }
            } catch (err) {
                console.error(`  ✗ Error processing user ${userId}:`, err.message);
                errorCount++;
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total eligible users: ${usersWithCompletedOrders.length}`);
        console.log(`Vouchers awarded now: ${awardedCount}`);
        console.log(`Already had voucher: ${alreadyHadCount}`);
        console.log(`Errors: ${errorCount}`);
        console.log('='.repeat(60));

        if (awardedCount > 0) {
            console.log(`\n🎉 Successfully awarded ${awardedCount} loyalty voucher(s)!`);
        } else if (usersWithCompletedOrders.length === 0) {
            console.log('\nNo users with 10+ completed orders this month yet.');
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
