const mongoose = require('mongoose');

const refundRequestSchema = new mongoose.Schema({
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, required: true },
    details: { type: String },
    videos: { type: [String], default: [] },
    images: { type: [String], default: [] },
    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Rejected', 'Refunded', 'Cancelled'],
        default: 'Pending'
    },
    adminNotes: { type: String },
    refundMethod: { type: String, enum: ['paymongo', 'manual', 'none'], default: 'none' },
    refundTxId: { type: String },
    amount: { type: Number },
    processedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('RefundRequest', refundRequestSchema);
