const mongoose = require('mongoose');

const cartSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    items: [
        {
            product: {
                type: mongoose.Schema.ObjectId,
                ref: 'Product',
                required: true
            },
            quantity: {
                type: Number,
                required: true,
                min: 1,
                default: 1
            },
            // Optional selected size for items with per-size inventory
            size: {
                type: String,
                default: null,
                trim: true
            },
            // Store the price at the time the item was added to cart so the UI
            // and checkout calculations remain stable even if product prices change.
            price: { type: Number, required: false, default: 0 }
        }
    ]
}, { 
    timestamps: true,
    // toJSON: { virtuals: true },
    // toObject: { virtuals: true }
});

// cartSchema.virtual('totalPrice').get(function() {
//     return this.items.reduce((total, item) => total + (item.quantity * item.price), 0);
// });

module.exports = mongoose.model('Cart', cartSchema);
