const express = require('express');
const router = express.Router();
const { listAdminNotifications, markRead, markAllRead } = require('../controllers/notificationController');
const { protect, authorize } = require('../middleware/authMiddleware');

router.use(protect);
router.get('/', authorize('admin','employee'), listAdminNotifications);
router.put('/:id/read', authorize('admin','employee'), markRead);
router.post('/mark-all-read', authorize('admin','employee'), markAllRead);

module.exports = router;
