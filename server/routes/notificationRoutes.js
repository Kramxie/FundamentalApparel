const express = require('express');
const router = express.Router();
const { listAdminNotifications, markRead, markAllRead, checkAndNotifyLowStock } = require('../controllers/notificationController');
const { createLowStockNotification } = require('../controllers/notificationController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);
router.get('/', authorize('admin','employee'), listAdminNotifications);
router.put('/:id/read', authorize('admin','employee'), markRead);
router.post('/mark-all-read', authorize('admin','employee'), markAllRead);
router.post('/low-stock', authorize('admin','employee'), createLowStockNotification);

// Check inventory and create/update low stock notification if needed
router.post('/check-low-stock', authorize('admin','employee'), async (req, res) => {
  try {
    const result = await checkAndNotifyLowStock();
    return res.json({ success: true, ...result });
  } catch (e) {
    console.error('[Notifications] check-low-stock route error', e);
    return res.status(500).json({ success: false, msg: 'Failed to check low stock' });
  }
});

module.exports = router;
