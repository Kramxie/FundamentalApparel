const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Item name is required'],
        trim: true
    },
    type: {
        type: String,
        required: [true, 'Item type is required'],
        enum: ['fabric', 'product', 'pre-design-apparel'],
        lowercase: true
    },
    quantity: {
        type: Number,
        required: [true, 'Quantity is required'],
        min: [0, 'Quantity cannot be negative'],
        default: 0
    },
    unit: {
        type: String,
        required: [true, 'Unit is required'],
        trim: true,
        default: 'pieces'
    },
    price: {
        type: Number,
        required: [true, 'Price is required'],
        min: [0, 'Price cannot be negative']
    },
    status: {
        type: String,
        enum: ['in_stock', 'low_stock', 'out_of_stock'],
        default: 'in_stock'
    },
    lowStockThreshold: {
        type: Number,
        default: 10,
        min: 0
    },
    supplier: {
        type: String,
        trim: true,
        default: ''
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },
    sku: {
        type: String,
        trim: true,
        unique: true,
        sparse: true
    },
    lastRestocked: {
        type: Date,
        default: Date.now
    },
    // Quantity that has been reserved/allocated for orders but not yet consumed
    reserved: {
        type: Number,
        default: 0,
        min: [0, 'Reserved cannot be negative']
    },
    
    // Product-specific fields (only used when type='product')
    isProduct: {
        type: Boolean,
        default: false
    },
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        default: null
    },
    category: {
        type: String,
        trim: true,
        default: ''
    },
    imageUrl: {
        type: String,
        default: ''
    },
    gallery: {
        type: [String],
        default: []
    },
    sizes: {
        type: [String],
        default: []
    },
    colors: {
        type: [String],
        default: []
    },
    // Map of size -> quantity for per-size inventory (e.g. { "S": 10, "M": 5 })
    sizesInventory: {
        type: Map,
        of: Number,
        default: {}
    },
    // Map of size -> reserved quantity for that size
    reservedSizes: {
        type: Map,
        of: Number,
        default: {}
    },
    // per-size prices map: { "S": 399.00 }
    sizesPrice: {
        type: Map,
        of: Number,
        default: {}
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
    }
    ,
    // placements: allow marking inventory items for marketing placements if synced as product
    placements: {
        featured: { type: Boolean, default: false },
        newArrivalExpiresAt: { type: Date, default: null },
        services: { type: [String], default: [] }
    }
}, {
    timestamps: true
});

// Index for faster queries
inventorySchema.index({ name: 1, type: 1 });
inventorySchema.index({ status: 1 });
inventorySchema.index({ type: 1, status: 1 });

// Auto-update status based on quantity
inventorySchema.pre('save', function(next) {
    // If per-size inventory exists, derive overall quantity from sum of sizes
    try {
        const sizesInv = this.sizesInventory || {};
        let derivedTotal = 0;
        if (sizesInv && typeof sizesInv === 'object' && Object.keys(sizesInv || {}).length > 0) {
            // sizesInventory may be a Map in mongoose; handle both
            if (sizesInv instanceof Map) {
                for (const v of sizesInv.values()) {
                    derivedTotal += Number(v || 0);
                }
            } else {
                for (const k of Object.keys(sizesInv)) {
                    derivedTotal += Number(sizesInv[k] || 0);
                }
            }
            this.quantity = derivedTotal;
        }

        if (this.quantity === 0) {
            this.status = 'out_of_stock';
        } else if (this.quantity <= this.lowStockThreshold) {
            this.status = 'low_stock';
        } else {
            this.status = 'in_stock';
        }
    } catch (e) {
        // Fallback to previous behavior on error
        if (this.quantity === 0) {
            this.status = 'out_of_stock';
        } else if (this.quantity <= this.lowStockThreshold) {
            this.status = 'low_stock';
        } else {
            this.status = 'in_stock';
        }
    }
    next();
});

module.exports = mongoose.model('Inventory', inventorySchema);
