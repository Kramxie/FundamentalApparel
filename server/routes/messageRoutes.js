const express = require('express');
const router = express.Router();

const {
    getMessages,
    getConversations,
    sendMessage,
    markAsRead,
    getUnreadCount,
    uploadImage,
    deleteMessage,
    deleteConversation,
    archiveConversation,
    restoreConversation,
    getArchivedConversations
} = require('../controllers/messageController');

const { protect, authorize } = require('../middleware/authMiddleware');
const { messageUpload } = require('../config/cloudinary');

// Use Cloudinary uploads for message images
const upload = messageUpload;

// All routes require authentication
router.use(protect);

// Get chat history
router.get('/', getMessages);

// Get all conversations (admin and employee)
router.get('/conversations', authorize('admin','employee'), getConversations);

// Get archived conversations (admin and employee)
router.get('/conversations/archived', authorize('admin','employee'), getArchivedConversations);

// Send a message
router.post('/', sendMessage);

// Mark messages as read
router.put('/read', markAsRead);

// Get unread message count
router.get('/unread-count', getUnreadCount);

// Upload image for message
router.post('/upload', upload.single('image'), uploadImage);

// Archive conversation with a customer (admin/employee only)
router.put('/conversation/:customerId/archive', authorize('admin', 'employee'), archiveConversation);

// Restore archived conversation (admin/employee only)
router.put('/conversation/:customerId/restore', authorize('admin', 'employee'), restoreConversation);

// Delete entire conversation with a customer (admin/employee only) - MUST be before /:id
router.delete('/conversation/:customerId', authorize('admin', 'employee'), deleteConversation);

// Delete a single message (admin/employee only)
router.delete('/:id', authorize('admin', 'employee'), deleteMessage);

module.exports = router;
