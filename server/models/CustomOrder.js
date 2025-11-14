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
        enum: ['t-shirt', 'jersey', 'hoodie', 'jacket', 'shorts', 'other'],
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
    
    // New Professional Customizer Fields (3-Panel Layout)
    // garmentType: Type of garment being customized (t-shirt, jersey, hoodie)
    garmentType: {
        type: String,
        enum: ['t-shirt', 'jersey', 'hoodie']
    },
    // selectedLocation: Placement location (Front, Back, Sleeves, etc.)
    selectedLocation: String,
    // colors: Hex color values for garment customization
    colors: {
        primary: String,
        secondary: String,
        accent: String
    },
    // designText: Text added by user for the design
    designText: String,
    // designImage: File path to uploaded design image
    designImage: String,
    // Multi-location generated preview images (e.g., front, back, sleeves)
    designImagesMap: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    // totalPrice: Total price calculated based on customization
    totalPrice: Number,
    
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
    },
    // Raw payload from the quote-first customizer (for admin review)
    quotePayload: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    // Optional notes from admin (e.g., rejection reason or adjustments)
    adminNotes: {
        type: String,
        default: ''
    },
    // PayMongo payment integration fields
    paymentIntentId: {
        type: String,
        default: null
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'failed', 'refunded'],
        default: 'pending'
    },
    paymentMethod: {
        type: String,
        enum: ['card', 'gcash', 'grab_pay', 'paymaya', 'online_banking', 'manual'],
        default: null
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('CustomOrder', CustomOrderSchema);