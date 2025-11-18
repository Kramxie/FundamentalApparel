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
    gallery: {
        type: [String],
        default: []
    },
    countInStock: {
        type: Number,
        required: [true, 'Please add stock quantity'],
        default: 0
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
            createdAt: { type: Date, default: Date.now }
        }
    ],
    averageRating: { type: Number, default: 0 },
    numReviews: { type: Number, default: 0 }

});

module.exports = mongoose.model('Product', ProductSchema);
