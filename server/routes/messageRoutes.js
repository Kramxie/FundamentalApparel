const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');

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

// Configure multer for message images
const messageImagesDir = path.join(__dirname, '..', 'uploads', 'message-images');
fs.mkdirSync(messageImagesDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, messageImagesDir),
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, req.user.id + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});

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
