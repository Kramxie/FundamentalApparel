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

// Admin customer stats (completed orders / completed quotes)
router.get('/customer-stats', protect, isAdmin, adminController.getCustomerStats);

// Employee management routes (admin only)
router.post('/create-employee', protect, isAdmin, (req, res, next) => {
  console.log('[Route] /create-employee hit! Body:', req.body);
  next();
}, adminController.createEmployee);
router.post('/reset-employee-password', protect, isAdmin, adminController.resetEmployeePassword);
const settingsController = require('../controllers/settingsController');

// User management (admin)
router.get('/users/:id', protect, isAdmin, adminController.getUser);
router.patch('/users/:id', protect, isAdmin, adminController.updateUser);
router.patch('/users/:id/active', protect, isAdmin, adminController.toggleUserActive);
router.delete('/users/:id', protect, isAdmin, adminController.deleteUser);

// Settings routes - use Cloudinary for uploads
const { productUpload } = require('../config/cloudinary');
const upload = productUpload; // Reuse product upload config for settings images

router.get('/settings', protect, isAdmin, settingsController.getSettings);
router.put('/settings/store', protect, isAdmin, upload.fields([{ name: 'logo' }, { name: 'banner' }]), settingsController.updateStoreInfo);
router.put('/settings/content', protect, isAdmin, upload.fields([{ name: 'homepageBanners' }]), settingsController.updateWebsiteContent);
router.get('/settings/staff', protect, isAdmin, settingsController.getStaffAndRoles);
router.post('/settings/staff', protect, isAdmin, settingsController.addOrUpdateStaff);
router.delete('/settings/staff/:id', protect, isAdmin, settingsController.deleteStaff);
// Roles management
router.get('/settings/roles', protect, isAdmin, settingsController.getRoles);
router.post('/settings/roles', protect, isAdmin, settingsController.addRole);
router.patch('/settings/roles/:name', protect, isAdmin, settingsController.updateRole);
router.delete('/settings/roles/:name', protect, isAdmin, settingsController.deleteRole);

module.exports = router;
