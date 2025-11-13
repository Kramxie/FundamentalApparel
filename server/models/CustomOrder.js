const mongoose = require('mongoose');

const CustomOrderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    
    // Service Type
    serviceType: {
        type: String,
        enum: ['customize-jersey', 'layout-creation', 'printing-only'],
        required: true,
        default: 'customize-jersey'
    },
    
    productName: {
        type: String,
        required: true,
        default: 'Custom Jersey'
    },
    
    // Item Type (Jersey, Jacket, etc.)
    itemType: {
        type: String,
        enum: ['jersey', 'jacket', 'shorts', 'other'],
        default: 'jersey'
    },
    
    customType: {
        type: String,
        enum: ['Template', 'FileUpload', 'LayoutCreation', 'PrintingOnly'],
        required: true
    },
    
    // Printing Type
    printingType: {
        type: String,
        enum: ['dye-sublimation', 'heat-transfer', 'vinyl-print', 'direct-to-garment'],
        default: 'dye-sublimation'
    },
    
    // Design Details for Customize Jersey (Template)
    designStyle: String,
    primaryColor: String,
    secondaryColor: String,
    accentColor: String,
    
    // Text Details
    textFont: String,
    textSize: String,
    textPlacement: String,
    customText: String,
    
    // Logo Details
    logoType: {
        type: String,
        enum: ['upload', 'select', 'none'],
        default: 'none'
    },
    logoUrl: String,
    logoPlacement: String,
    
    // Team Details (for bulk orders)
    teamName: String,
    includeTeamMembers: {
        type: Boolean,
        default: false
    },
    teamMembers: [{
        name: String,
        jerseyNumber: String,
        size: String
    }],
    
    // Shorts Option
    includeShorts: {
        type: Boolean,
        default: false
    },
    shortsSameDesign: {
        type: Boolean,
        default: true
    },
    shortsDesignDetails: String,
    shortsDesignFileUrl: String,
    
    // Para sa template: "Design: Legend, Colors: ..., Text: ..."
    designDetails: {
        type: String
    },
    
    // Para sa file upload
    designFileUrl: {
        type: String
    },
    
    // Layout Creation specific fields
    inspirationImageUrl: String,
    memberName: String,
    jerseyNumber: String,
    colorPalette: [String],
    
    // Printing Only specific fields
    printingMethod: {
        type: String,
        enum: ['sublimation', 'upload-design', 'direct-to-garment'],
    },
    garmentSize: String,
    
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