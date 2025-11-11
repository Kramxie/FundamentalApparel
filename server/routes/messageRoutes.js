const express = require('express');
const router = express.Router();

const {
    getMessages,
    getConversations,
    sendMessage,
    markAsRead,
    getUnreadCount
} = require('../controllers/messageController');

const { protect, authorize } = require('../middleware/authMiddleware');

// All routes require authentication
router.use(protect);

// Get chat history
router.get('/', getMessages);

// Get all conversations (admin only)
router.get('/conversations', authorize('admin'), getConversations);

// Send a message
router.post('/', sendMessage);

// Mark messages as read
router.put('/read', markAsRead);

// Get unread message count
router.get('/unread-count', getUnreadCount);

module.exports = router;
