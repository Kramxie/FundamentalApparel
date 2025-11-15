const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect } = require('../middleware/authMiddleware');

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
  console.log('[isAdmin Middleware] Checking admin role for user:', req.user ? req.user.email : 'NO USER');
  console.log('[isAdmin Middleware] User role:', req.user ? req.user.role : 'NO ROLE');
  
  if (!req.user || req.user.role !== 'admin') {
    console.log('[isAdmin Middleware] BLOCKED - Not admin');
    return res.status(403).json({ success: false, msg: 'Access denied. Admin privileges required.' });
  }
  
  console.log('[isAdmin Middleware] PASSED - User is admin');
  next();
};

// Password change routes (admin and employee)
router.post('/send-verification-code', protect, adminController.sendVerificationCode);
router.post('/verify-code', protect, adminController.verifyCode);
router.post('/resend-verification-code', protect, adminController.resendVerificationCode);
router.patch('/update-password', protect, adminController.updatePassword);

// Employee management routes (admin only)
router.post('/create-employee', protect, isAdmin, (req, res, next) => {
  console.log('[Route] /create-employee hit! Body:', req.body);
  next();
}, adminController.createEmployee);
router.post('/reset-employee-password', protect, isAdmin, adminController.resetEmployeePassword);

module.exports = router;
