/**
 * Script to check users with completed orders (all time) for analysis.
 * 
 * This script shows all users and their completed order counts to help
 * understand who might be eligible for loyalty rewards.
 * 
 * Run with: node server/scripts/check_completed_orders.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Order = require('../models/Order');
const User = require('../models/User');

const MONGO_URI = process.env.MONGO_URI;

async function main() {
    console.log('='.repeat(60));
    console.log('COMPLETED ORDERS ANALYSIS');
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
                $sort: { '_id.year': -1, '_id.month': -1, 'count': -1 }
            }
        ]);

        console.log('COMPLETED ORDERS BY USER AND MONTH:');
        console.log('-'.repeat(60));

        const userMonthMap = new Map();
        
        for (const record of ordersByUserAndMonth) {
            const userId = record._id.user;
            const year = record._id.year;
            const month = record._id.month;
            const count = record.count;
            const monthKey = `${year}-${String(month).padStart(2, '0')}`;
            
            if (!userMonthMap.has(userId?.toString())) {
                userMonthMap.set(userId?.toString(), []);
            }
            userMonthMap.get(userId?.toString()).push({ monthKey, count });
        }

        // Get user details
        const userIds = [...userMonthMap.keys()].filter(id => id && id !== 'null' && id !== 'undefined');
        const users = await User.find({ _id: { $in: userIds } }).select('name email vouchers');
        const userMap = new Map(users.map(u => [u._id.toString(), u]));

        let eligibleForRewards = [];

        for (const [userId, months] of userMonthMap.entries()) {
            const user = userMap.get(userId);
            if (!user) continue;
            
            console.log(`\n📧 ${user.email} (${user.name || 'No name'})`);
            console.log(`   Vouchers: ${(user.vouchers || []).length}`);
            
            for (const m of months) {
                const isEligible = m.count >= 10;
                const status = isEligible ? '✅ ELIGIBLE' : '';
                console.log(`   ${m.monthKey}: ${m.count} orders ${status}`);
                
                if (isEligible) {
                    // Check if they have voucher for that month
                    const [year, month] = m.monthKey.split('-');
                    const voucherCode = `LOYALTY-${year}${month}`;
                    const hasVoucher = (user.vouchers || []).some(v => v.code === voucherCode);
                    
                    if (!hasVoucher) {
                        eligibleForRewards.push({
                            userId,
                            email: user.email,
                            monthKey: m.monthKey,
                            count: m.count,
                            voucherCode
                        });
                        console.log(`      ⚠️ MISSING VOUCHER: ${voucherCode}`);
                    } else {
                        console.log(`      ✓ Has voucher: ${voucherCode}`);
                    }
                }
            }
        }

        // Also show overall stats
        const totalOrders = await Order.countDocuments({ status: { $in: ['Delivered', 'Completed'] } });
        const totalUsers = await User.countDocuments();

        console.log('\n' + '='.repeat(60));
        console.log('SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total completed orders: ${totalOrders}`);
        console.log(`Total users: ${totalUsers}`);
        console.log(`Users with completed orders: ${userMonthMap.size}`);
        console.log(`Missing loyalty vouchers: ${eligibleForRewards.length}`);
        
        if (eligibleForRewards.length > 0) {
            console.log('\n⚠️ USERS MISSING THEIR LOYALTY VOUCHERS:');
            for (const e of eligibleForRewards) {
                console.log(`   - ${e.email}: ${e.count} orders in ${e.monthKey} (needs ${e.voucherCode})`);
            }
        }

        console.log('='.repeat(60));

    } catch (err) {
        console.error('Script error:', err);
    } finally {
        await mongoose.disconnect();
        console.log('\n✓ Disconnected from MongoDB');
    }
}

main();
