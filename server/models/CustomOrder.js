const mongoose = require('mongoose');

const CustomOrderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    productName: {
        type: String,
        required: true,
        default: 'Custom Jersey'
    },
    customType: {
        type: String,
        enum: ['Template', 'FileUpload'],
        required: true
    },
    // Para sa template: "Design: Legend, Colors: ..., Text: ..."
    designDetails: {
        type: String
    },
    // Para sa file upload
    designFileUrl: {
        type: String
    },
    downPaymentReceiptUrl: {
        type: String
    },
    finalPaymentReceiptUrl: {
        type: String
    },
    quantity: {
        type: Number,
        required: [true, 'Please provide a quantity'],
        min: 1
    },
    notes: {
        type: String
    },
    status: {
        type: String,
        enum: ['Pending Quote', 'Quote Sent', 'Pending Downpayment', 'In Production', 'Pending Balance', 'Pending Final Verification', 'Completed', 'Ready for Pickup/Delivery', 'Cancelled'],
        default: 'Pending Quote'
    },
    // I-a-update ito ng admin sa Phase 2
    price: {
        type: Number,
        default: 0
    },
    // Payment option: customer can choose full payment or 50% downpayment
    paymentOption: {
        type: String,
        enum: ['full', 'downpayment'],
        default: 'downpayment'
    },
    downPaymentPaid: {
        type: Boolean,
        default: false
    },
    balancePaid: {
        type: Boolean,
        default: false
    },
    // Fulfillment details
    fulfillmentMethod: {
        type: String,
        enum: ['pickup', 'delivery', 'pending'],
        default: 'pending'
    },
    deliveryAddress: {
        type: String
    },
    trackingNumber: {
        type: String
    },
    estimatedDeliveryDate: {
        type: Date
    },
    pickupDate: {
        type: Date
    },
    pickupLocation: {
        type: String,
        default: 'Fundamental Store - 123 Main St, Manila'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('CustomOrder', CustomOrderSchema);