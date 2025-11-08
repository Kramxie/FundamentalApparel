const User = require('../models/User');

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

