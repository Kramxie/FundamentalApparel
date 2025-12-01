const User = require('../models/User');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');

// Store verification codes temporarily (in production, use Redis or similar)
const verificationCodes = new Map();

// Send verification code for password change
exports.sendVerificationCode = async (req, res) => {
  try {
    const { currentPassword } = req.body;
    const userId = req.user.id;

    // Find user
    const user = await User.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, msg: 'User not found' });
    }

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, msg: 'Current password is incorrect' });
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store code with expiration (10 minutes)
    verificationCodes.set(userId.toString(), {
      code,
      expiresAt: Date.now() + 10 * 60 * 1000
    });

    // Send email
    const emailText = `Your verification code for password change is: <strong>${code}</strong><br><br>This code will expire in 10 minutes.<br><br>If you did not request this, please ignore this email.`;
    
    try {
      await sendEmail({
        email: user.email,
        subject: 'Password Change Verification Code',
        message: emailText
      });
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      return res.status(500).json({ success: false, msg: 'Failed to send verification email. Please try again.' });
    }

    res.json({ 
      success: true, 
      msg: 'Verification code sent to your email',
      email: user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3') // Mask email
    });
  } catch (error) {
    console.error('Send verification code error:', error);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
};

// Verify the code
exports.verifyCode = async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.user.id;

    const stored = verificationCodes.get(userId.toString());
    if (!stored) {
      return res.status(400).json({ success: false, msg: 'No verification code found. Please request a new one.' });
    }

    if (Date.now() > stored.expiresAt) {
      verificationCodes.delete(userId.toString());
      return res.status(400).json({ success: false, msg: 'Verification code expired. Please request a new one.' });
    }

    if (stored.code !== code) {
      return res.status(400).json({ success: false, msg: 'Invalid verification code' });
    }

    // Generate verification token (valid for 5 minutes)
    const verificationToken = crypto.randomBytes(32).toString('hex');
    verificationCodes.set(userId.toString(), {
      ...stored,
      verified: true,
      verificationToken,
      tokenExpiresAt: Date.now() + 5 * 60 * 1000
    });

    res.json({ 
      success: true, 
      msg: 'Code verified successfully',
      verificationToken
    });
  } catch (error) {
    console.error('Verify code error:', error);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
};

// Resend verification code (only if a session exists)
exports.resendVerificationCode = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, msg: 'User not found' });
    }

    const existing = verificationCodes.get(userId.toString());
    if (!existing) {
      return res.status(400).json({ success: false, msg: 'No active verification. Please enter your current password to request a new code.' });
    }

    // Generate new 6-digit code and reset expiry
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    verificationCodes.set(userId.toString(), {
      code,
      expiresAt: Date.now() + 10 * 60 * 1000
    });

    const emailText = `Your new verification code is: <strong>${code}</strong><br><br>This code will expire in 10 minutes.`;

    try {
      await sendEmail({
        email: user.email,
        subject: 'New Password Change Verification Code',
        message: emailText
      });
    } catch (emailError) {
      console.error('Resend email failed:', emailError);
      return res.status(500).json({ success: false, msg: 'Failed to send verification email. Please try again.' });
    }

    res.json({ success: true, msg: 'A new verification code was sent to your email.' });
  } catch (error) {
    console.error('Resend verification code error:', error);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
};

// Update password after verification
exports.updatePassword = async (req, res) => {
  try {
    const { newPassword, verificationToken } = req.body;
    const userId = req.user.id;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ success: false, msg: 'Password must be at least 8 characters long' });
    }

    const stored = verificationCodes.get(userId.toString());
    if (!stored || !stored.verified) {
      return res.status(400).json({ success: false, msg: 'Verification required. Please verify your code first.' });
    }

    if (stored.verificationToken !== verificationToken) {
      return res.status(400).json({ success: false, msg: 'Invalid verification token' });
    }

    if (Date.now() > stored.tokenExpiresAt) {
      verificationCodes.delete(userId.toString());
      return res.status(400).json({ success: false, msg: 'Verification expired. Please start over.' });
    }

    // Update password
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, msg: 'User not found' });
    }

    user.password = newPassword;
    await user.save();

    // Clear verification data
    verificationCodes.delete(userId.toString());

    res.json({ 
      success: true, 
      msg: 'Password updated successfully'
    });
  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
};

// Create employee account (admin only)
exports.createEmployee = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate inputs
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, msg: 'All fields are required' });
    }

    if (!password || password.trim().length < 8) {
      return res.status(400).json({ success: false, msg: 'Password must be at least 8 characters long' });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, msg: 'Email already registered' });
    }

    // Create employee
    const trimmedPwd = password.trim();
    console.log('\n=== CREATE EMPLOYEE DEBUG ===');
    console.log('Input: name=%s, email=%s, pwd_len=%d', name, email, password.length);
    console.log('After normalize: email=%s, pwd_len=%d', email.toLowerCase(), trimmedPwd.length);
    
    const employee = await User.create({
      name,
      email: email.toLowerCase(),
      password: trimmedPwd,
      role: 'employee',
      isVerified: true // Auto-verify employee accounts
    });
    
    console.log('Employee created: id=%s, email=%s, role=%s, isVerified=%s', employee._id, employee.email, employee.role, employee.isVerified);
    console.log('=== END CREATE EMPLOYEE DEBUG ===\n');

    // Send welcome email
    try {
      await sendEmail({
        email: employee.email,
        subject: 'Welcome to Fundamental Apparel Admin Panel',
        message: `<p>Hello <strong>${name}</strong>,</p><p>Your employee account has been created.</p><p><strong>Email:</strong> ${email}<br><strong>Password:</strong> (provided by admin)</p><p>Please change your password after your first login.</p><p><strong>Admin Panel:</strong> <a href="${process.env.FRONTEND_URL || 'http://localhost'}/client/admin/login.html">Login Here</a></p><p>Best regards,<br>Fundamental Apparel Team</p>`
      });
    } catch (emailError) {
      console.error('Welcome email failed:', emailError);
      // Don't fail the request if email fails
    }

    res.status(201).json({
      success: true,
      msg: 'Employee account created successfully',
      data: {
        id: employee._id,
        name: employee.name,
        email: employee.email,
        role: employee.role
      }
    });
  } catch (error) {
    console.error('Create employee error:', error);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
};

// Reset an employee's password (admin only)
exports.resetEmployeePassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) {
      return res.status(400).json({ success: false, msg: 'Email and new password are required' });
    }
    const trimmed = String(newPassword).trim();
    if (trimmed.length < 8) {
      return res.status(400).json({ success: false, msg: 'Password must be at least 8 characters long' });
    }

    const user = await User.findOne({ email: String(email).toLowerCase(), role: 'employee' }).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, msg: 'Employee not found' });
    }

    user.password = trimmed; // pre-save hook will hash
    await user.save();

    // Optional: notify employee
    try {
      await sendEmail({
        email: user.email,
        subject: 'Your Admin Panel Password Was Reset',
        message: `<p>Hello ${user.name || ''},</p><p>Your admin panel password has been reset by an administrator. If this wasn’t you, please contact support immediately.</p>`
      });
    } catch (e) {
      // Do not fail the operation if email sending fails
      console.error('Reset password notification email failed:', e);
    }

    res.json({ success: true, msg: 'Employee password updated successfully' });
  } catch (error) {
    console.error('Reset employee password error:', error);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
};

// Admin: get customer stats (completed orders, completed quotes)
exports.getCustomerStats = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    // pagination: support `page` or `skip` + `limit`. Default to 5 per page.
    let skip = parseInt(req.query.skip, 10) || 0;
    const page = parseInt(req.query.page, 10) || null;
    const limit = Math.min(parseInt(req.query.limit, 10) || 5, 200);
    if (page && page > 0) skip = (page - 1) * limit;

    const match = {};
    if (q) match.email = { $regex: q, $options: 'i' };

    // Aggregate users with lookups to orders and customorders
    const pipeline = [
      { $match: match },
      { $lookup: {
          from: 'orders',
          let: { uid: '$_id' },
          pipeline: [
            { $match: { $expr: { $and: [ { $eq: ['$user', '$$uid'] }, { $in: ['$status', ['Delivered','Completed']] } ] } } },
            { $count: 'count' }
          ],
          as: 'completedOrdersArr'
      }},
      { $lookup: {
          from: 'customorders',
          let: { uid: '$_id' },
          pipeline: [
            { $match: { $expr: { $and: [ { $eq: ['$user', '$$uid'] }, { $eq: ['$status', 'Completed'] } ] } } },
            { $count: 'count' }
          ],
          as: 'completedQuotesArr'
      }},
        { $project: {
          email: 1,
          name: 1,
          createdAt: 1,
          completedOrders: { $ifNull: [ { $arrayElemAt: ['$completedOrdersArr.count', 0] }, 0 ] },
          completedQuotes: { $ifNull: [ { $arrayElemAt: ['$completedQuotesArr.count', 0] }, 0 ] }
        }},
        // Sort by completed orders DESC, then by createdAt DESC (LIFO tie-breaker), then completedQuotes DESC
        { $sort: { completedOrders: -1, createdAt: -1, completedQuotes: -1 } },
      { $skip: skip },
        { $limit: limit }
    ];

    const User = require('../models/User');
    const rows = await User.aggregate(pipeline);

    // Also return total count for pagination (simple count of matched users)
    const total = await User.countDocuments(match);

    // Calculate current page
    const currentPage = page && page > 0 ? page : Math.floor(skip / limit) + 1;
    res.json({ success: true, data: rows, total, page: currentPage, perPage: limit });
  } catch (error) {
    console.error('getCustomerStats error:', error);
    res.status(500).json({ success: false, msg: 'Server error retrieving customer stats' });
  }
};

// Get a single user (admin)
exports.getUser = async (req, res) => {
  try {
    const id = req.params.id;
    const user = await User.findById(id).lean();
    if (!user) return res.status(404).json({ success: false, msg: 'User not found' });
    res.json({ success: true, data: user });
  } catch (err) {
    console.error('getUser error', err);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
};

// Update a user (admin)
exports.updateUser = async (req, res) => {
  try {
    const id = req.params.id;
    const { name, email, role } = req.body;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ success: false, msg: 'User not found' });

    if (email && email !== user.email) {
      const dup = await User.findOne({ email: String(email).toLowerCase(), _id: { $ne: id } });
      if (dup) return res.status(400).json({ success: false, msg: 'Email already in use' });
      user.email = String(email).toLowerCase();
    }
    if (name) user.name = name;
    if (role) user.role = role;
    await user.save();
    res.json({ success: true, data: { id: user._id, name: user.name, email: user.email, role: user.role, isActive: user.isActive } });
  } catch (err) {
    console.error('updateUser error', err);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
};

// Toggle active/disable a user (admin)
exports.toggleUserActive = async (req, res) => {
  try {
    const id = req.params.id;
    const { isActive } = req.body;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ success: false, msg: 'User not found' });
    user.isActive = typeof isActive === 'boolean' ? isActive : !user.isActive;
    await user.save();
    res.json({ success: true, data: { id: user._id, isActive: user.isActive } });
  } catch (err) {
    console.error('toggleUserActive error', err);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
};

// Delete a user (admin)
exports.deleteUser = async (req, res) => {
  try {
    const id = req.params.id;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ success: false, msg: 'User not found' });

    // Prevent deleting primary owner/admin accidentally? Allow admins to delete employees only by default
    if (user.role === 'admin') {
      return res.status(403).json({ success: false, msg: 'Cannot delete admin users via this endpoint' });
    }

    await User.deleteOne({ _id: id });
    res.json({ success: true, msg: 'User deleted' });
  } catch (err) {
    console.error('deleteUser error', err);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
};
