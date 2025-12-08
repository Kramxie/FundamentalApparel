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

        // Check if requesting archived conversations
        const showArchived = req.query.archived === 'true';

        // Get unique users who have messaged admin (exclude archived by default)
        const messages = await Message.aggregate([
            {
                $match: {
                    $and: [
                        {
                            $or: [
                                { isAdminMessage: false },
                                { isAdminMessage: true }
                            ]
                        },
                        // Filter by archive status
                        showArchived 
                            ? { isArchivedByAdmin: true }
                            : { $or: [{ isArchivedByAdmin: false }, { isArchivedByAdmin: { $exists: false } }] }
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
                    },
                    isArchived: { $first: '$isArchivedByAdmin' },
                    archivedAt: { $first: '$archivedAt' }
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

        // Cloudinary stores URL in file.path
        const imageUrl = req.file.path;

        res.status(200).json({
            success: true,
            imageUrl,
            filename: req.file.filename || 'cloudinary-image'
        });
    } catch (error) {
        console.error('Upload Image Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload image'
        });
    }
};

// @desc    Delete a single message
// @route   DELETE /api/messages/:id
// @access  Private/Admin
exports.deleteMessage = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Only admin can delete messages
        if (req.user.role !== 'admin' && req.user.role !== 'employee') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete messages'
            });
        }

        const message = await Message.findById(id);
        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        await Message.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: 'Message deleted successfully'
        });
    } catch (error) {
        console.error('Delete Message Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete message'
        });
    }
};

// @desc    Delete entire conversation with a customer
// @route   DELETE /api/messages/conversation/:customerId
// @access  Private/Admin
exports.deleteConversation = async (req, res) => {
    try {
        const { customerId } = req.params;
        
        // Only admin can delete conversations
        if (req.user.role !== 'admin' && req.user.role !== 'employee') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete conversations'
            });
        }

        // Delete all messages where sender or recipient is the customer
        const result = await Message.deleteMany({
            $or: [
                { sender: customerId },
                { recipient: customerId }
            ]
        });

        res.status(200).json({
            success: true,
            message: `Deleted ${result.deletedCount} messages`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        console.error('Delete Conversation Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete conversation'
        });
    }
};

// @desc    Archive conversation with a customer
// @route   PUT /api/messages/conversation/:customerId/archive
// @access  Private/Admin
exports.archiveConversation = async (req, res) => {
    try {
        const { customerId } = req.params;
        
        // Only admin/employee can archive conversations
        if (req.user.role !== 'admin' && req.user.role !== 'employee') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to archive conversations'
            });
        }

        // Archive all messages where sender or recipient is the customer
        const result = await Message.updateMany(
            {
                $or: [
                    { sender: customerId },
                    { recipient: customerId }
                ]
            },
            {
                isArchivedByAdmin: true,
                archivedAt: new Date()
            }
        );

        res.status(200).json({
            success: true,
            message: `Archived ${result.modifiedCount} messages`,
            archivedCount: result.modifiedCount
        });
    } catch (error) {
        console.error('Archive Conversation Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to archive conversation'
        });
    }
};

// @desc    Restore archived conversation with a customer
// @route   PUT /api/messages/conversation/:customerId/restore
// @access  Private/Admin
exports.restoreConversation = async (req, res) => {
    try {
        const { customerId } = req.params;
        
        // Only admin/employee can restore conversations
        if (req.user.role !== 'admin' && req.user.role !== 'employee') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to restore conversations'
            });
        }

        // Restore all messages where sender or recipient is the customer
        const result = await Message.updateMany(
            {
                $or: [
                    { sender: customerId },
                    { recipient: customerId }
                ]
            },
            {
                isArchivedByAdmin: false,
                archivedAt: null
            }
        );

        res.status(200).json({
            success: true,
            message: `Restored ${result.modifiedCount} messages`,
            restoredCount: result.modifiedCount
        });
    } catch (error) {
        console.error('Restore Conversation Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to restore conversation'
        });
    }
};

// @desc    Get archived conversations (admin only)
// @route   GET /api/messages/conversations/archived
// @access  Private/Admin
exports.getArchivedConversations = async (req, res) => {
    try {
        // Only admin/employee can view archived conversations
        if (req.user.role !== 'admin' && req.user.role !== 'employee') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }

        // Get unique customers with archived conversations
        const archivedConversations = await Message.aggregate([
            {
                $match: {
                    isArchivedByAdmin: true
                }
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
                    lastMessage: { $last: '$message' },
                    lastMessageDate: { $max: '$createdAt' },
                    messageCount: { $sum: 1 },
                    archivedAt: { $max: '$archivedAt' }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'customer'
                }
            },
            {
                $unwind: '$customer'
            },
            {
                $match: {
                    'customer.role': 'customer'
                }
            },
            {
                $project: {
                    _id: {
                        _id: '$customer._id',
                        name: '$customer.name',
                        email: '$customer.email',
                        avatar: '$customer.profileImage'
                    },
                    lastMessage: 1,
                    lastMessageDate: 1,
                    messageCount: 1,
                    archivedAt: 1,
                    isArchived: { $literal: true }
                }
            },
            {
                $sort: { archivedAt: -1 }
            }
        ]);

        res.status(200).json({
            success: true,
            data: archivedConversations
        });
    } catch (error) {
        console.error('Get Archived Conversations Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get archived conversations'
        });
    }
};
