const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    message: {
        type: String,
        required: true,
        trim: true
    },
    imageUrl: {
        type: String,
        default: null
    },
    isRead: {
        type: Boolean,
        default: false
    },
    isAdminMessage: {
        type: Boolean,
        default: false
    },
    // Archive system - conversation-level archiving
    isArchivedByAdmin: {
        type: Boolean,
        default: false
    },
    archivedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Index for faster queries
messageSchema.index({ sender: 1, recipient: 1, createdAt: -1 });
messageSchema.index({ recipient: 1, isRead: 1 });

module.exports = mongoose.model('Message', messageSchema);
