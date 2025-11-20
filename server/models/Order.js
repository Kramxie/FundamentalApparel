const mongoose = require('mongoose');

// Embedded sub-schema for a normalized shipping address used during checkout
const shippingAddressSchema = new mongoose.Schema({
    block: { type: String },
    lot: { type: String },
    street: { type: String, required: true },
    building: { type: String },
    province: { type: String, required: true },
    city: { type: String, required: true },
    zip: { type: String, required: true },
    phone: { type: String, required: true }
}, { _id: false });

const orderSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: true
    },
    orderItems: [
        {
            name: { type: String, required: true },
            quantity: { type: Number, required: true },
            imageUrl: { type: String, required: true },
            price: { type: Number, required: true },
            product: {
                type: mongoose.Schema.ObjectId,
                ref: 'Product',
                required: true
            }
            ,
            // Optional size and color selected by the buyer
            size: { type: String },
            color: { type: String }
        }
    ],
    // Checkout-specific fields
    shippingAddress: { type: shippingAddressSchema, required: true },
    shippingMethod: {
        type: String,
        enum: ['Standard', 'Pick-Up'],
        default: 'Standard',
        required: true
    },
    deliveryFee: { type: Number, default: 0 },
    comment: { type: String },

    // Payment (no gateway integration). A receipt image will be uploaded by the buyer
    paymentMethod: {
        type: String,
        enum: ['GCash', 'BankTransfer', 'card'],
        default: 'GCash',
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Received', 'Rejected'],
        default: 'Pending'
    },
    receiptUrl: { type: String }, // public URL to the uploaded receipt image (deprecated for PayMongo)
    paymentIntentId: { type: String }, // PayMongo checkout session ID

    // Order lifecycle status managed by admin
    status: {
        type: String,
        enum: ['Processing', 'Accepted', 'Shipped', 'Delivered', 'Completed', 'Cancelled'],
        default: 'Processing',
        required: true
    },
    deliveredAt: { type: Date },
    
    // --- NEW CANCELLATION FIELDS ---
    cancellationReason: {
        type: String 
    },
    cancelledBy: {
        type: String,
        enum: ['user', 'admin']
    },
    // --- END NEW FIELDS ---

    // Payment flags (kept for compatibility w/ dashboards)
    isPaid: { type: Boolean, required: true, default: false },
    paidAt: { type: Date },

    // Refund / Return summary flags (lightweight order-level pointers for admin UI)
    hasRefundRequest: { type: Boolean, default: false },
    latestRefundId: { type: mongoose.Schema.ObjectId, ref: 'RefundRequest' },
    latestRefundStatus: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Refunded'], default: undefined },

    // Optional logistics info
    shippingService: { type: String },
    trackingCode: { type: String },

    totalPrice: { type: Number, required: true, default: 0.0 },
}, {
    timestamps: true
});

module.exports = mongoose.model('Order', orderSchema);