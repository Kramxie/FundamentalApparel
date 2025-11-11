const Message = require('../models/Message');
const User = require('../models/User');

// @desc    Get chat history between user and admin
// @route   GET /api/messages
// @access  Private
exports.getMessages = async (req, res) => {
    try {
        const userId = req.user._id;
        const isAdmin = req.user.role === 'admin';

        let query;
        if (isAdmin) {
            // If admin, get all messages (can filter by customer later in frontend)
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

// @desc    Get all conversations for admin
// @route   GET /api/messages/conversations
// @access  Private/Admin
exports.getConversations = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
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
        const { recipientId, message } = req.body;
        const senderId = req.user._id;

        if (!recipientId || !message) {
            return res.status(400).json({
                success: false,
                message: 'Recipient and message are required'
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

        const isAdminMessage = req.user.role === 'admin';

        const newMessage = await Message.create({
            sender: senderId,
            recipient: recipientId,
            message,
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
