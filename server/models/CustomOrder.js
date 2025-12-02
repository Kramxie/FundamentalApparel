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
        enum: ['customize-jersey', 'layout-creation', 'printing-only', 'predesign-product'],
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
        enum: [
            't-shirt', 'jersey', 'hoodie', 'polo', 'drifit', 'longsleeve', 'raglan',
            'jacket', 'pullup-jacket', 'zipper-jacket', 'hoodie-jacket',
            'shorts', 'drifit-short', 'jogging-pants',
            'scrub-suit', 'fabric-banner',
            // New product types
            'vneck-tshirt', 'round-tshirt', 'classic-polo', 'drifit-polo', 
            '2tone-polo', '2tone-polo-ladies', 'drifit-vneck',
            'other'
        ],
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
    // Optional: uploaded team names list file (txt/csv)
    teamNamesFileUrl: String,
    
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
        enum: ['sublimation', 'dye-sublimation', 'heat-transfer', 'vinyl-print', 'upload-design', 'direct-to-garment'],
    },
    garmentSize: String,
    
    // New Professional Customizer Fields (3-Panel Layout)
    // garmentType: Type of garment being customized (t-shirt, jersey, hoodie)
    garmentType: {
        type: String,
        enum: [
            't-shirt', 'jersey', 'hoodie', 'polo', 'drifit', 'longsleeve', 'raglan',
            'pullup-jacket', 'zipper-jacket', 'drifit-short', 'jogging-pants',
            'scrub-suit', 'fabric-banner',
            // New actual product types
            'vneck-tshirt', 'round-tshirt', 'classic-polo', 'drifit-polo',
            '2tone-polo', '2tone-polo-ladies', 'drifit-vneck', 'hoodie-jacket'
        ]
    },
    // fabricType: Type of fabric for the garment (Cotton, Dry Fit, Polyester)
    fabricType: {
        type: String,
        enum: ['Cotton', 'Dry Fit', 'Polyester', 'Mixed', 'Polycotton'],
        default: 'Cotton'
    },
    // inventoryName: Combined fabric-garment name for inventory matching (e.g., "Dry-Fit - Jersey")
    inventoryName: {
        type: String
    },
    // selectedLocation: Placement location (Front, Back, Sleeves, etc.)
    selectedLocation: String,
    // Selected garment color from dropdown
    garmentColor: String,
    // Custom color requested by customer (optional)
    customColor: String,
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
        enum: ['Pending Quote', 'Quote Sent', 'Pending Downpayment', 'In Production', 'Pending Balance', 'Pending Final Verification', 'Completed', 'Ready for Pickup/Delivery', 'Out for Delivery', 'Cancelled'],
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
    // Shipping Address (detailed structure)
    shippingAddress: {
        block: { type: String },
        lot: { type: String },
        street: { type: String, required: false },
        building: { type: String },
        province: { type: String, required: false },
        city: { type: String, required: false },
        zip: { type: String, required: false },
        phone: { type: String, required: false }
    },
    // Shipping Method (Standard Delivery or Pick-Up)
    shippingMethod: {
        type: String,
        enum: ['Standard', 'Pick-Up'],
        default: 'Standard'
    },
    // Delivery Fee
    deliveryFee: {
        type: Number,
        default: 0
    },
    trackingNumber: {
        type: String
    },
    courier: {
        type: String,
        default: ''
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
    // Payment integration fields
    paymentIntentId: { 
        type: String 
    }, // PayMongo checkout session ID
    receiptUrl: { 
        type: String 
    }, // For manual payment receipts (GCash/Bank Transfer)
    paymentAmount: { 
        type: Number 
    }, // Actual amount paid (50% or 100%)
    paymentType: {
        type: String,
        enum: ['downpayment', 'full', 'remaining'],
        default: null
    }, // Track if this was down payment or full payment
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'failed', 'refunded'],
        default: 'pending'
    },
    paymentMethod: {
        type: String,
        enum: ['card', 'gcash', 'grab_pay', 'paymaya', 'online_banking', 'manual'],
        default: null
    },
    // Link to generated receipt (if any)
    receiptId: { type: mongoose.Schema.Types.ObjectId, ref: 'Receipt' },
    // Price breakdown for customer transparency
    priceBreakdown: {
        materials: [{
            name: String,
            qty: Number,
            unit: String,
            unitCost: Number,
            subtotal: Number
        }],
        labor: {
            printing: { type: Number, default: 0 },
            design: { type: Number, default: 0 },
            setup: { type: Number, default: 0 },
            other: { type: Number, default: 0 }
        },
        materialsTotal: { type: Number, default: 0 },
        laborTotal: { type: Number, default: 0 },
        grandTotal: { type: Number, default: 0 }
    },
    // Materials quoted (for allocation when payment is verified)
    quoteMaterials: [{
        inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' },
        name: String,
        qtyUsed: Number,
        unitCost: Number,
        unit: String
    }],
    // Inventory allocation tracking (for printing-only orders)
    inventoryAllocated: {
        type: Boolean,
        default: false
    },
    allocatedItems: [{
        inventoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory' },
        name: String,
        qty: Number
    }],
    
    // Archive system - hide completed orders from main view
    isArchived: { type: Boolean, default: false },
    archivedAt: { type: Date },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
    timestamps: true
});

module.exports = mongoose.model('CustomOrder', CustomOrderSchema);