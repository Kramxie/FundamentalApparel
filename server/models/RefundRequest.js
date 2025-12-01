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
        enum: ['Pending', 'Approved', 'Awaiting Return', 'Received', 'Rejected', 'Refunded', 'Cancelled'],
        default: 'Pending'
    },
    adminNotes: { type: String },
    // Admin can set a different approved amount (partial refund)
    approvedAmount: { type: Number },
    // Return shipping address provided by admin
    returnShippingAddress: { type: String },
    // Customer's preferred refund payment method
    refundPaymentMethod: { 
        type: String, 
        enum: ['gcash', 'bank', ''], 
        default: '' 
    },
    gcashNumber: { type: String },
    bankName: { type: String },
    bankAccountName: { type: String },
    bankAccountNumber: { type: String },
    // System refund method (paymongo auto or manual)
    refundMethod: { type: String, enum: ['paymongo', 'manual', 'none'], default: 'none' },
    refundTxId: { type: String },
    amount: { type: Number }, // Original requested amount
    processedAt: { type: Date },
    // Timestamps for each status change
    approvedAt: { type: Date },
    receivedAt: { type: Date },
    rejectedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('RefundRequest', refundRequestSchema);
