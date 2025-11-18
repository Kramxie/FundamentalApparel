// @desc    Validate a voucher code for the logged-in user
// @route   GET /api/vouchers/validate?code=...
// @access  Private
exports.validateVoucher = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ success: false, msg: 'User not found.' });
        const code = (req.query.code || '').trim();
        if (!code) return res.status(400).json({ success: false, msg: 'Voucher code is required.' });
        const voucher = user.vouchers.find(v => v.code.toLowerCase() === code.toLowerCase());
        if (!voucher) return res.status(404).json({ success: false, msg: 'Voucher not found or not assigned to you.' });
        // Check usage
        if (voucher.used) return res.status(400).json({ success: false, msg: 'Voucher has already been used.' });
        // Optionally: check for expiry, other conditions
        return res.status(200).json({ success: true, data: voucher });
    } catch (err) {
        console.error('[Validate Voucher] Error:', err);
        return res.status(500).json({ success: false, msg: 'Server Error' });
    }
};
const User = require('../models/User');

// @desc    Get voucher usage history (admin)
// @route   GET /api/vouchers/history
// @access  Private/Admin
exports.getVoucherUsageHistory = async (req, res) => {
    try {
        // Optional filters
        const { start, end, code } = req.query;
        let startDate = null;
        let endDate = null;
        if (start) {
            const sd = new Date(start);
            if (!isNaN(sd)) startDate = sd;
        }
        if (end) {
            const ed = new Date(end);
            if (!isNaN(ed)) {
                // set end to end of day if time isn't provided
                endDate = ed;
            }
        }

        // Find users that may have used vouchers
        const users = await User.find({ 'vouchers.used': true }, { name: 1, email: 1, vouchers: 1 });
        const history = [];
        users.forEach(u => {
            (u.vouchers || []).forEach(v => {
                if (!v.used) return;

                // Filter by code if provided (case-insensitive exact or contains)
                if (code && typeof code === 'string') {
                    const filter = code.trim().toLowerCase();
                    if (!v.code || v.code.toLowerCase().indexOf(filter) === -1) return;
                }

                // Filter by date range if provided
                if (startDate || endDate) {
                    const usedAt = v.usedAt ? new Date(v.usedAt) : null;
                    if (!usedAt) return; // no usedAt cannot match date filter
                    if (startDate && usedAt < startDate) return;
                    if (endDate && usedAt > endDate) return;
                }

                history.push({
                    code: v.code,
                    description: v.description,
                    type: v.type,
                    value: v.value,
                    usedAt: v.usedAt,
                    usedByOrder: v.usedByOrder,
                    userId: u._id,
                    userName: u.name,
                    userEmail: u.email
                });
            });
        });

        // Sort by usedAt desc
        history.sort((a, b) => (b.usedAt ? new Date(b.usedAt) : 0) - (a.usedAt ? new Date(a.usedAt) : 0));
        return res.status(200).json({ success: true, data: history });
    } catch (err) {
        console.error('[Voucher History] Error:', err);
        return res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

// @desc    Assign a voucher to a user
// @route   POST /api/vouchers/assign
// @access  Private/Admin
exports.assignVoucher = async (req, res) => {
    try {
        const { userEmail, code, description, type, value } = req.body;

        if (!userEmail || !code || !description || !type) {
            return res.status(400).json({ success: false, msg: 'Please provide all required voucher details.' });
        }

        const user = await User.findOne({ email: userEmail });

        if (!user) {
            return res.status(404).json({ success: false, msg: `User with email ${userEmail} not found.` });
        }
        
        const voucherExists = user.vouchers.some(voucher => voucher.code === code);
        if (voucherExists) {
            return res.status(400).json({ success: false, msg: `User already has a voucher with the code "${code}".` });
        }
        
        let voucherValue = 0;

        if (type === 'percentage' || type === 'fixed') {
            if (value === undefined || value === '' || isNaN(parseFloat(value))) {
                return res.status(400).json({ success: false, msg: 'A valid discount value is required for this voucher type.' });
            }
            voucherValue = parseFloat(value);
        }

        const newVoucher = {
            code,
            description,
            type,
            value: voucherValue
        };

        user.vouchers.push(newVoucher);
        await user.save();

        return res.status(200).json({
            success: true,
            msg: `Voucher "${code}" successfully assigned to ${user.name}.`,
            data: user.vouchers
        });

    } catch (error) {
        console.error('--- VOUCHER ASSIGNMENT CRASH ---');
        console.error('Error Message:', error.message);
        console.error('Stack Trace:', error.stack);
        console.error('--- END OF CRASH REPORT ---');
        return res.status(500).json({ success: false, msg: 'Server Error. Check terminal for details.' });
    }
};

