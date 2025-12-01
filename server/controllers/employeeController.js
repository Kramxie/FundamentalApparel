const Employee = require('../models/Employee');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');
const crypto = require('crypto');

// @desc    Get all employees
// @route   GET /api/admin/employees
// @access  Private/Admin
exports.getAllEmployees = async (req, res) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { position: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status === 'active') query.isActive = true;
    if (status === 'inactive') query.isActive = false;
    if (status === 'with-account') query.hasAccount = true;
    if (status === 'no-account') query.hasAccount = false;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const employees = await Employee.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('user', 'name email role isVerified');
    
    const total = await Employee.countDocuments(query);
    
    res.json({
      success: true,
      data: employees,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalItems: total,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Get Employees Error:', error);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
};

// @desc    Get single employee
// @route   GET /api/admin/employees/:id
// @access  Private/Admin
exports.getEmployee = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id).populate('user', 'name email role isVerified');
    if (!employee) {
      return res.status(404).json({ success: false, msg: 'Employee not found' });
    }
    res.json({ success: true, data: employee });
  } catch (error) {
    console.error('Get Employee Error:', error);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
};

// @desc    Add new employee
// @route   POST /api/admin/employees
// @access  Private/Admin
exports.addEmployee = async (req, res) => {
  try {
    const { name, email, contactNumber, position, notes } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ success: false, msg: 'Name and email are required' });
    }
    
    // Check if employee with email exists
    const existingEmployee = await Employee.findOne({ email: email.toLowerCase() });
    if (existingEmployee) {
      return res.status(400).json({ success: false, msg: 'Employee with this email already exists' });
    }
    
    // Check if user account with this email exists
    const existingUser = await User.findOne({ email: email.toLowerCase(), role: { $in: ['admin', 'employee'] } });
    
    const employee = await Employee.create({
      name,
      email: email.toLowerCase(),
      contactNumber: contactNumber || '',
      position: position || 'Staff',
      notes: notes || '',
      hasAccount: !!existingUser,
      user: existingUser ? existingUser._id : null,
      accountCreatedAt: existingUser ? existingUser.createdAt : null
    });
    
    res.status(201).json({ success: true, data: employee, msg: 'Employee added successfully' });
  } catch (error) {
    console.error('Add Employee Error:', error);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
};

// @desc    Update employee
// @route   PUT /api/admin/employees/:id
// @access  Private/Admin
exports.updateEmployee = async (req, res) => {
  try {
    const { name, email, contactNumber, position, notes, isActive } = req.body;
    
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ success: false, msg: 'Employee not found' });
    }
    
    // Check for duplicate email if changing
    if (email && email.toLowerCase() !== employee.email) {
      const existingEmployee = await Employee.findOne({ email: email.toLowerCase(), _id: { $ne: employee._id } });
      if (existingEmployee) {
        return res.status(400).json({ success: false, msg: 'Another employee with this email already exists' });
      }
      employee.email = email.toLowerCase();
    }
    
    if (name) employee.name = name;
    if (contactNumber !== undefined) employee.contactNumber = contactNumber;
    if (position) employee.position = position;
    if (notes !== undefined) employee.notes = notes;
    if (typeof isActive === 'boolean') employee.isActive = isActive;
    
    await employee.save();
    
    res.json({ success: true, data: employee, msg: 'Employee updated successfully' });
  } catch (error) {
    console.error('Update Employee Error:', error);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
};

// @desc    Delete employee
// @route   DELETE /api/admin/employees/:id
// @access  Private/Admin
exports.deleteEmployee = async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ success: false, msg: 'Employee not found' });
    }
    
    await Employee.deleteOne({ _id: req.params.id });
    
    res.json({ success: true, msg: 'Employee deleted successfully' });
  } catch (error) {
    console.error('Delete Employee Error:', error);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
};

// @desc    Create account for employee
// @route   POST /api/admin/employees/:id/create-account
// @access  Private/Admin
exports.createEmployeeAccount = async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password || password.trim().length < 8) {
      return res.status(400).json({ success: false, msg: 'Password must be at least 8 characters' });
    }
    
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ success: false, msg: 'Employee not found' });
    }
    
    // Check if account already exists
    const existingUser = await User.findOne({ email: employee.email });
    if (existingUser) {
      // Link employee to existing account
      employee.user = existingUser._id;
      employee.hasAccount = true;
      employee.accountCreatedAt = existingUser.createdAt;
      await employee.save();
      return res.status(400).json({ success: false, msg: 'An account with this email already exists' });
    }
    
    // Create new user account (auto-verified for employees)
    const user = await User.create({
      name: employee.name,
      email: employee.email,
      password: password.trim(),
      role: 'employee',
      isVerified: true // Auto-verified for admin-created accounts
    });
    
    // Update employee record
    employee.user = user._id;
    employee.hasAccount = true;
    employee.accountCreatedAt = new Date();
    await employee.save();
    
    res.status(201).json({
      success: true,
      msg: 'Employee account created successfully',
      data: {
        employee,
        user: { id: user._id, email: user.email, role: user.role }
      }
    });
  } catch (error) {
    console.error('Create Employee Account Error:', error);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
};

// @desc    Send message/credentials to employee via email
// @route   POST /api/admin/employees/:id/send-message
// @access  Private/Admin
exports.sendEmployeeMessage = async (req, res) => {
  try {
    const { subject, message, includeCredentials, password } = req.body;
    
    if (!message) {
      return res.status(400).json({ success: false, msg: 'Message is required' });
    }
    
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ success: false, msg: 'Employee not found' });
    }
    
    let emailBody = `
      <div style="font-family: 'Inter', Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #4F46E5, #7C3AED); padding: 20px; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Fundamental Apparel</h1>
        </div>
        <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
          <h2 style="color: #111827; margin-top: 0;">Hello ${employee.name},</h2>
          <div style="color: #374151; line-height: 1.6;">
            ${message.replace(/\n/g, '<br>')}
          </div>
    `;
    
    if (includeCredentials && password) {
      emailBody += `
          <div style="margin-top: 20px; padding: 20px; background: #EEF2FF; border-radius: 8px; border-left: 4px solid #4F46E5;">
            <h3 style="color: #4F46E5; margin: 0 0 10px 0;">Your Login Credentials</h3>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${employee.email}</p>
            <p style="margin: 5px 0;"><strong>Password:</strong> ${password}</p>
            <p style="margin: 15px 0 0 0; font-size: 14px; color: #6B7280;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost'}/client/admin/login.html" style="color: #4F46E5; text-decoration: underline;">Login to Admin Panel</a>
            </p>
            <p style="margin: 10px 0 0 0; font-size: 12px; color: #9CA3AF;">Please change your password after your first login.</p>
          </div>
      `;
    }
    
    emailBody += `
          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <p style="color: #6B7280; font-size: 14px; margin: 0;">Best regards,<br>Fundamental Apparel Team</p>
          </div>
        </div>
      </div>
    `;
    
    try {
      await sendEmail({
        email: employee.email,
        subject: subject || 'Message from Fundamental Apparel',
        message: emailBody
      });
      
      res.json({ success: true, msg: 'Message sent successfully' });
    } catch (emailError) {
      console.error('Send Email Error:', emailError);
      res.status(500).json({ success: false, msg: 'Failed to send email. Please try again.' });
    }
  } catch (error) {
    console.error('Send Employee Message Error:', error);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
};

// @desc    Reset employee password
// @route   POST /api/admin/employees/:id/reset-password
// @access  Private/Admin
exports.resetEmployeePassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    
    if (!newPassword || newPassword.trim().length < 8) {
      return res.status(400).json({ success: false, msg: 'Password must be at least 8 characters' });
    }
    
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ success: false, msg: 'Employee not found' });
    }
    
    if (!employee.user) {
      return res.status(400).json({ success: false, msg: 'This employee does not have an account yet' });
    }
    
    const user = await User.findById(employee.user).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, msg: 'User account not found' });
    }
    
    user.password = newPassword.trim();
    await user.save();
    
    res.json({ success: true, msg: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset Employee Password Error:', error);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
};
