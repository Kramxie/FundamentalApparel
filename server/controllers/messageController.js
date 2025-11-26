const Message = require('../models/Message');
const User = require('../models/User');

// @desc    Get chat history (staff sees all)
// @route   GET /api/messages
// @access  Private
exports.getMessages = async (req, res) => {
    try {
        const userId = req.user._id;
        const isStaff = req.user.role === 'admin' || req.user.role === 'employee';

        let query;
        if (isStaff) {
            // If staff (admin or employee), get all messages (frontend filters per conversation)
            query = {};
        } else {
            // If customer, get only messages between them and admin
            // Find the admin user first
            const adminUser = await User.findOne({ role: 'admin' });
            if (!adminUser) {
                return res.status(404).json({ success: false, message: 'Admin not found' });
            }

            query = {
                $or: [
                    { sender: userId, recipient: adminUser._id },
                    { sender: adminUser._id, recipient: userId }
                ]
            };
        }

        const messages = await Message.find(query)
            .populate('sender', 'name email avatar role')
            .populate('recipient', 'name email avatar role')
            .sort({ createdAt: 1 });

        res.status(200).json({
            success: true,
            data: messages
        });
    } catch (error) {
        console.error('Get Messages Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch messages'
        });
    }
};

// @desc    Get all conversations for staff (admin and employee)
// @route   GET /api/messages/conversations
// @access  Private/Admin,Employee
exports.getConversations = async (req, res) => {
    try {
        const isStaff = req.user.role === 'admin' || req.user.role === 'employee';
        if (!isStaff) {
            return res.status(403).json({ success: false, message: 'Not authorized' });
        }

        // Get unique users who have messaged admin
        const messages = await Message.aggregate([
            {
                $match: {
                    $or: [
                        { isAdminMessage: false },
                        { isAdminMessage: true }
                    ]
                }
            },
            {
                $sort: { createdAt: -1 }
            },
            {
                $group: {
                    _id: {
                        $cond: [
                            { $eq: ['$isAdminMessage', true] },
                            '$recipient',
                            '$sender'
                        ]
                    },
                    lastMessage: { $first: '$message' },
                    lastMessageDate: { $first: '$createdAt' },
                    unreadCount: {
                        $sum: {
                            $cond: [
                                { $and: [{ $eq: ['$isRead', false] }, { $eq: ['$isAdminMessage', false] }] },
                                1,
                                0
                            ]
                        }
                    }
                }
            },
            {
                $sort: { lastMessageDate: -1 }
            }
        ]);

        // Populate user details
        const conversations = await User.populate(messages, {
            path: '_id',
            select: 'name email avatar'
        });

        res.status(200).json({
            success: true,
            data: conversations
        });
    } catch (error) {
        console.error('Get Conversations Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch conversations'
        });
    }
};

// @desc    Send a new message
// @route   POST /api/messages
// @access  Private
exports.sendMessage = async (req, res) => {
    try {
        const { recipientId, message, imageUrl } = req.body;
        const senderId = req.user._id;

        if (!recipientId || (!message && !imageUrl)) {
            return res.status(400).json({
                success: false,
                message: 'Recipient and message or image are required'
            });
        }

        // Check if recipient exists
        const recipient = await User.findById(recipientId);
        if (!recipient) {
            return res.status(404).json({
                success: false,
                message: 'Recipient not found'
            });
        }

        const isAdminMessage = req.user.role === 'admin' || req.user.role === 'employee';

        // Server-side sanitize: mask offensive words and reject if only masked
        function serverSanitize(input) {
            if (!input) return { blocked: false, message: input };
            const badWords = ['fuck','shit','bitch','asshole','motherfucker'];
            let msg = String(input);
            for (const w of badWords) {
                const re = new RegExp('\\b' + w.replace(/[.*+?^${}()|[\\]\\]/g,'\\\\$&') + '\\b', 'ig');
                msg = msg.replace(re, (m) => {
                    if (m.length <= 2) return '*'.repeat(m.length);
                    return m[0] + '*'.repeat(Math.max(1, m.length - 2)) + m[m.length-1];
                });
            }
            const maskCount = (msg.match(/\*/g) || []).length;
            const blocked = maskCount > 0 && msg.replace(/\*/g,'').trim().length === 0;
            return { blocked, message: msg };
        }

        const sanitized = serverSanitize(message);
        if (sanitized.blocked) {
            return res.status(400).json({ success: false, message: 'Message content not allowed' });
        }

        const newMessage = await Message.create({
            sender: senderId,
            recipient: recipientId,
            message: sanitized.message || '📷 Image',
            imageUrl: imageUrl || null,
            isAdminMessage
        });

        // Populate sender and recipient details
        await newMessage.populate('sender', 'name email avatar role');
        await newMessage.populate('recipient', 'name email avatar role');

        res.status(201).json({
            success: true,
            data: newMessage
        });
    } catch (error) {
        console.error('Send Message Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send message'
        });
    }
};

// @desc    Mark messages as read
// @route   PUT /api/messages/read
// @access  Private
exports.markAsRead = async (req, res) => {
    try {
        const { messageIds } = req.body;
        const userId = req.user._id;

        if (!messageIds || !Array.isArray(messageIds)) {
            return res.status(400).json({
                success: false,
                message: 'Message IDs array is required'
            });
        }

        // Only mark messages where the user is the recipient
        await Message.updateMany(
            {
                _id: { $in: messageIds },
                recipient: userId,
                isRead: false
            },
            {
                isRead: true
            }
        );

        res.status(200).json({
            success: true,
            message: 'Messages marked as read'
        });
    } catch (error) {
        console.error('Mark As Read Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark messages as read'
        });
    }
};

// @desc    Get unread message count
// @route   GET /api/messages/unread-count
// @access  Private
exports.getUnreadCount = async (req, res) => {
    try {
        const userId = req.user._id;

        const count = await Message.countDocuments({
            recipient: userId,
            isRead: false
        });

        res.status(200).json({
            success: true,
            count
        });
    } catch (error) {
        console.error('Get Unread Count Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get unread count'
        });
    }
};

// @desc    Upload image for message
// @route   POST /api/messages/upload
// @access  Private
exports.uploadImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No image file uploaded'
            });
        }

        // Get the base URL from environment or construct it
        const baseUrl = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5000}`;
        
        // Construct the image URL
        const imageUrl = `${baseUrl}/uploads/message-images/${req.file.filename}`;

        res.status(200).json({
            success: true,
            imageUrl,
            filename: req.file.filename
        });
    } catch (error) {
        console.error('Upload Image Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload image'
        });
    }
};
