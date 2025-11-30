const Order = require('../models/Order');
const User = require('../models/User');

/**
 * Check and award loyalty voucher: when a user has >=10 completed purchases in the current month,
 * award a single fixed ₱20 voucher for that month if not already awarded.
 *
 * This function is idempotent and safe to call multiple times.
 *
 * @param {mongoose.Types.ObjectId|string} userId
 * @returns {Promise<boolean>} true if voucher awarded, false otherwise
 */
async function checkAndAwardLoyaltyVoucher(userId){
  if (!userId) return false;
  try{
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-based
    const monthStart = new Date(year, month, 1, 0, 0, 0, 0);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

    // Count orders that reached Delivered/Completed in this month for the user.
    // Use deliveredAt when available, otherwise updatedAt — this captures orders
    // that were completed/marked delivered during the current month.
    const count = await Order.countDocuments({
      user: userId,
      status: { $in: ['Delivered', 'Completed'] },
      $or: [
        { deliveredAt: { $gte: monthStart, $lte: monthEnd } },
        { updatedAt: { $gte: monthStart, $lte: monthEnd } }
      ]
    });

    // If less than threshold, nothing to do
    const THRESHOLD = 10;
    if (count < THRESHOLD) return false;

    // Build a month-specific loyalty code so we can easily detect existing award
    const mm = String(month + 1).padStart(2, '0');
    const code = `LOYALTY-${year}${mm}`; // e.g. LOYALTY-202511 for Nov 2025

    // Load user to check existing vouchers
    const user = await User.findById(userId).select('vouchers');
    if (!user) return false;

    const already = (user.vouchers || []).some(v => v.code === code);
    if (already) return false;

    // Add voucher to user's vouchers array
    const voucher = {
      code,
      description: `Loyalty reward: ₱20 off for ${THRESHOLD} purchases in ${mm}/${year}`,
      type: 'fixed',
      value: 20,
      used: false,
      createdAt: new Date()
    };

    user.vouchers = user.vouchers || [];
    user.vouchers.push(voucher);
    await user.save();

    console.log(`[Loyalty] Awarded voucher ${code} to user ${userId} after ${count} purchases`);
    return true;
  }catch(err){
    console.warn('[Loyalty] checkAndAwardLoyaltyVoucher error:', err && err.message);
    return false;
  }
}

module.exports = { checkAndAwardLoyaltyVoucher };
