const User = require('../models/User');
const jwt = require('jsonwebtoken');
const sendEmail = require('../utils/sendEmail');
const path = require('path');

const sendTokenResponse = (user, statusCode, res) => {
    if (!process.env.JWT_SECRET) {
        return res.status(500).json({ success: false, msg: 'Server configuration error' });
    }
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
    
    // Tiyakin na ang lahat ng user info ay kasama sa response
    const userObject = user.toObject ? user.toObject() : user;
    delete userObject.password; // Alisin ang password bago ipadala

    res.status(statusCode).json({
        success: true,
        token,
        user: userObject // Ipadala ang buong user object
    });
};

exports.registerUser = async (req, res) => {
    try {
        const { name, email, password } = req.body;
        let user = await User.findOne({ email });
        if (user) {
            if (!user.isVerified) {
                const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
                user.verificationCode = verificationCode;
                user.verificationCodeExpire = Date.now() + 15 * 60 * 1000;
                await user.save();
                const message = `<h1>Welcome Back!</h1><p>Please use this new code to verify your email: <strong>${verificationCode}</strong></p>`;
                await sendEmail({ email: user.email, subject: 'New Verification Code', message });
                return res.status(200).json({ success: true, msg: 'Account already exists. A new verification code has been sent to your email.' });
            }
            return res.status(400).json({ success: false, msg: 'User with that email already exists and is verified.' });
        }
        
        // --- NEW: Mag-generate ng default username galing sa email ---
        const username = email.split('@')[0] + Math.floor(100 + Math.random() * 900);

        user = new User({ 
            name, 
            email, 
            password,
            username: username // Mag-assign ng default username
        });

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        user.verificationCode = verificationCode;
        user.verificationCodeExpire = Date.now() + 15 * 60 * 1000; 

        await user.save();

        const message = `<h1>Email Verification</h1><p>Your verification code is: <strong>${verificationCode}</strong>. It will expire in 15 minutes.</p>`;
        await sendEmail({ email: user.email, subject: 'Verify Your Email for Fundamental Apparel', message});

        res.status(201).json({
            success: true,
            msg: 'Registration successful! Please check your email for a verification code, then proceed to login.' 
        });
    } catch (error) {
        console.error("Register User Error: ", error);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

exports.loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        const emailLC = String(email || '').trim().toLowerCase();

        // Allow attempts with empty password to trigger "set-password" flow
        // Use case-insensitive email lookup to avoid issues with stored email casing
        const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const emailQuery = { email: { $regex: '^' + escapeRegex(String(email || '').trim() ) + '$', $options: 'i' } };
        const user = await User.findOne(emailQuery).select('+password');
        if (!user) return res.status(401).json({ success: false, msg: 'Invalid credentials' });

        // If user exists but has no password set, and the client submitted an empty password,
        // generate a short-lived set-password token and return it so client can redirect.
        if ((!user.password || user.password === '') && (!password || String(password).trim() === '')) {
            const crypto = require('crypto');
            const token = crypto.randomBytes(24).toString('hex');
            user.resetPasswordToken = token;
            user.resetPasswordExpire = Date.now() + 60 * 60 * 1000; // 1 hour
            await user.save({ validateBeforeSave: false });
            return res.status(200).json({ success: true, needsSetPassword: true, token, email: user.email, msg: 'Please set your password' });
        }

        // Otherwise, require a password and validate as normal
        if (!password) return res.status(400).json({ success: false, msg: 'Please provide an email and password' });

        const isMatch = await user.matchPassword(password);
        if (!isMatch) return res.status(401).json({ success: false, msg: 'Invalid credentials' });

        if (!user.isVerified && user.role !== 'admin') {
            return res.status(401).json({ success: false, verificationRequired: true, email: user.email, msg: 'Account not verified. Please check your email.' });
        }

        sendTokenResponse(user, 200, res);
    } catch (error) {
        console.error('loginUser error', error);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

exports.verifyUser = async (req, res) => {
    try {
        const { email, code } = req.body;
        // --- MODIFIED: Kunin ang buong user info ---
        const user = await User.findOne({
            email,
            verificationCode: code,
            verificationCodeExpire: { $gt: Date.now()}
        });
        if (!user) {
            return res.status(400).json({ success: false, msg: 'Invalid or expired verification code'});
        }

        user.isVerified = true;
        user.verificationCode = undefined,
        user.VerificationCodeExpire = undefined,
        await user.save();

        sendTokenResponse(user, 200, res);
    } catch (error) {
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

exports.resendVerificationCode = async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });
        if (!user) return res.status(404).json({ success: false, msg: 'No user found with that email' });
        if (user.isVerified) return res.status(400).json({ success: false, msg: 'Account is already verified' });

        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        user.verificationCode = verificationCode;
        user.verificationCodeExpire = Date.now() + 15 * 60 * 1000;
        await user.save();

        const message = `<h1>New Verification Code</h1><p>Your new verification code is: <strong>${verificationCode}</strong>. It will expire in 15 minutes.</p>`;
        await sendEmail({ email: user.email, subject: 'Resend Verification Code', message });
        res.status(200).json({ success: true, msg: 'A new verification code has been sent to your email.' });
    } catch (error) {
        res.status(500).json({ success: false, msg: 'Error sending new code' });
    }
};

exports.getMe = async (req, res) => {
    try {
        // Ang req.user ay galing na sa 'protect' middleware
        // at dapat ay buo na ang info nito
        const user = await User.findById(req.user.id).select('-password');
        if (!user) {
             return res.status(404).json({ success: false, msg: 'User not found' });
        }
        res.status(200).json({ success: true, data: user });
    } catch (error) {
        console.error('getMe error:', error);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

// --- NEW FUNCTION: Get Admin User ---
exports.getAdminUser = async (req, res) => {
    try {
        const adminUser = await User.findOne({ role: 'admin' }).select('_id name email avatar role');
        if (!adminUser) {
            return res.status(404).json({ success: false, message: 'Admin user not found' });
        }
        res.status(200).json({
            success: true,
            data: adminUser
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
};

exports.updateUserDetails = async (req, res) => {
    try {
        const { name, contactNumber, username, gender, dob } = req.body;
        
        const fieldsToUpdate = { 
            name, 
            contactNumber,
            username,
            gender
        };
        
        if (dob) {
            fieldsToUpdate.dob = new Date(dob);
        } else {
            fieldsToUpdate.dob = undefined;
        }

        const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
            new: true,
            runValidators: true
        });
        
        if (!user) {
            return res.status(404).json({ success: false, msg: 'User not found' });
        }
        
        res.status(200).json({ success: true, data: user });
    } catch (error) {
        if (error.code === 11000) { 
            return res.status(400).json({ success: false, msg: 'Username is already taken.' });
        }
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

// --- NEW FUNCTION ---
exports.updateAvatar = async (req, res) => {
    const BASE_URL = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5000}`;
    
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, msg: 'Please upload an image file (jpg/png).' });
        }

        const avatarUrl = `${BASE_URL}/uploads/avatars/${req.file.filename}`;

        const user = await User.findByIdAndUpdate(req.user.id, { avatarUrl }, {
            new: true
        });
        
        if (!user) {
            return res.status(404).json({ success: false, msg: 'User not found' });
        }

        res.status(200).json({ success: true, data: user });

    } catch (error) {
        console.error("Update Avatar Error: ", error);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

// --- (Walang bago sa address functions, forgot/reset password) ---

exports.addShippingAddress = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (user.shippingAddresses.length >= 3) {
            return res.status(400).json({ success: false, msg: 'You can only save up to 3 addresses.' });
        }
        user.shippingAddresses.push(req.body);
        await user.save();
        res.status(201).json({ success: true, data: user.shippingAddresses });
    } catch (error) {
        res.status(500).json({ success: false, msg: 'Server Error while adding address' });
    }
};

exports.deleteShippingAddress = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        const address = user.shippingAddresses.id(req.params.addressId);
        if (!address) {
            return res.status(404).json({ success: false, msg: 'Address not found' });
        }
        user.shippingAddresses.pull(req.params.addressId);
        await user.save();
        res.status(200).json({ success: true, data: user.shippingAddresses });
    } catch (error) {
        console.error('Delete address error:', error); // Add logging for debugging
        res.status(500).json({ success: false, msg: 'Server Error while deleting address' });
    }
};

exports.setDefaultAddress = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        user.shippingAddresses.forEach(addr => addr.isDefault = false);
        const address = user.shippingAddresses.id(req.params.addressId);
        if (address) {
            address.isDefault = true;
        }
        await user.save();
        res.status(200).json({ success: true, data: user.shippingAddresses });
    } catch (error) {
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

exports.forgotPassword = async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });
        if (!user) {
            return res.status(404).json({ success: false, msg: 'There is no user with that email' });
        }
        const resetToken = Math.floor(100000 + Math.random() * 900000).toString();
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
        await user.save({ validateBeforeSave: false });
        const message = `<h1>Password Reset Request</h1><p>Your password reset code is: <strong>${resetToken}</strong>. It will expire in 10 minutes.</p>`;
        await sendEmail({ email: user.email, subject: 'Fundamental E-Commerce - Password Reset Code', message });
        res.status(200).json({ success: true, data: 'Email sent' });
    } catch (err) {
        const user = await User.findOne({ email: req.body.email });
        if (user) {
            user.resetPasswordToken = undefined;
            user.resetPasswordExpire = undefined;
            await user.save({ validateBeforeSave: false });
        }
        res.status(500).json({ success: false, msg: 'Email could not be sent' });
    }
};

exports.resetPassword = async (req, res) => {
    try {
        const { resetToken, newPassword } = req.body;
        const user = await User.findOne({
            resetPasswordToken: resetToken,
            resetPasswordExpire: { $gt: Date.now() }
        });
        if (!user) return res.status(400).json({ success: false, msg: 'Invalid or expired code' });
        
        user.password = newPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;
        await user.save();
        sendTokenResponse(user, 200, res); // Ipadala ang buong user info
    } catch (error) {
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

// Delete user account and associated data
exports.deleteAccount = async (req, res) => {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ success: false, msg: 'Not authorized' });

    const mongoose = require('mongoose');
    const Order = require('../models/Order');
    const Message = require('../models/Message');
    const Notification = require('../models/Notification');
    const Cart = require('../models/Cart');
    const CustomOrder = require('../models/CustomOrder');
    const RefundRequest = require('../models/RefundRequest');

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        // Prevent deletion if user has active orders
        const activeOrders = await Order.countDocuments({ user: userId, status: { $nin: ['Completed', 'Cancelled'] } }).session(session);
        const activeCustom = await CustomOrder.countDocuments({ user: userId, status: { $nin: ['Completed', 'Cancelled'] } }).session(session);
        if (activeOrders > 0 || activeCustom > 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ success: false, msg: 'You have active orders or custom orders. Please complete or cancel them before deleting your account.' });
        }

        // Delete Orders, Custom Orders, Refund Requests, Messages, Notifications, Cart
        await Order.deleteMany({ user: userId }).session(session);
        await CustomOrder.deleteMany({ user: userId }).session(session);
        await RefundRequest.deleteMany({ user: userId }).session(session);
        await Message.deleteMany({ $or: [{ sender: userId }, { recipient: userId }] }).session(session);
        await Notification.deleteMany({ targetUser: userId }).session(session);
        await Cart.deleteOne({ user: userId }).session(session);

        // Finally delete the user record
        const User = require('../models/User');
        await User.findByIdAndDelete(userId).session(session);

        await session.commitTransaction();
        session.endSession();

        console.log('[Account Deletion] User deleted:', userId);
        // Optionally: clear server-side sessions, revoke tokens, notify admins

        return res.json({ success: true, msg: 'Your account and associated data have been permanently deleted.' });
    } catch (e) {
        console.error('[Account Deletion] Error:', e && e.message);
        try { await session.abortTransaction(); } catch(_){}
        session.endSession();
        return res.status(500).json({ success: false, msg: 'Failed to delete account' });
    }
};