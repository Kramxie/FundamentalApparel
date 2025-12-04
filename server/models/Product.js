const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please add a product name'],
        trim: true
    },
    description: {
        type: String,
        required: [true, 'Please add a product description']
    },
    price: {
        type: Number,
        required: [true, 'Please add a price']
    },
    category: {
        type: String,
        required: [true, 'Please add a category']
        
    },
    imageUrl: {
        type: String,
        required: [true, 'Please add an image URL']
    },
    // For Pre-Design products we store explicit front/back images
    images: {
        front: { type: String, default: '' },
        back: { type: String, default: '' }
    },
    // product type: regular | predesign
    type: {
        type: String,
        enum: ['regular', 'predesign'],
        default: 'regular'
    },
    gallery: {
        type: [String],
        default: []
    },
    countInStock: {
        type: Number,
        required: [true, 'Please add stock quantity'],
        default: 0
    },
    // per-size inventory map: { "S": 10, "M": 5 }
    sizesInventory: {
        type: Object,
        default: {}
    },
    // per-size prices: { "S": 399.00, "M": 429.00 }
    sizesPrice: {
        type: Object,
        default: {}
    },
    sizes: {
        type: [String],
        default: []
    },
    colors: {
        type: [String],
        default: []
    },
    material: {
        type: String,
        default: ''
    },
    productDetails: {
        type: String,
        default: ''
    },
    faqs: {
        type: String,
        default: ''
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    reviews: [
        {
            user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            userName: { type: String },
            rating: { type: Number, required: true, min: 1, max: 5 },
            comment: { type: String },
            images: { type: [String], default: [] },
            moderationStatus: { type: String, enum: ['pending','approved','rejected'], default: 'approved' },
            createdAt: { type: Date, default: Date.now }
        }
    ],
    averageRating: { type: Number, default: 0 },
    numReviews: { type: Number, default: 0 }

    ,
    // placements: control marketing placements like featured, new arrivals with expiry, and services
    placements: {
        featured: { type: Boolean, default: false },
        // expiry datetime for 'new arrivals' placement (nullable)
        newArrivalExpiresAt: { type: Date, default: null },
        // services keys the product belongs to, e.g. ['customizeApparel','printing']
        services: { type: [String], default: [] }
    },
    // Soft delete / Archive fields
    isArchived: {
        type: Boolean,
        default: false
    },
    archivedAt: {
        type: Date,
        default: null
    }

});

module.exports = mongoose.model('Product', ProductSchema);
