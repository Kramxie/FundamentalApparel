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
        enum: ['fabric', 'product', 'pre-design-apparel', 'material'],
        lowercase: true
    },
    // Material sub-type for raw materials (ink, thread, vinyl, etc.)
    materialType: {
        type: String,
        enum: ['ink', 'thread', 'vinyl', 'transfer-paper', 'sublimation-paper', 'heat-press-tape', 'adhesive', 'other'],
        default: null
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
    // Cost price (what you pay supplier) - for profit tracking
    costPrice: {
        type: Number,
        default: 0,
        min: [0, 'Cost price cannot be negative']
    },
    // Color/variant for materials (e.g., ink color, thread color)
    color: {
        type: String,
        trim: true,
        default: ''
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
    // Map of size -> status for per-size inventory (e.g. { "S": "in_stock", "M": "low_stock" })
    sizesStatus: {
        type: Map,
        of: String,
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
    try {
        const sizesInv = this.sizesInventory || {};
        let derivedTotal = 0;
        let hasSizesInventory = false;
        
        // Clear previous size statuses
        this.sizesStatus = new Map();

        if (sizesInv && typeof sizesInv === 'object' && Object.keys(sizesInv).length > 0) {
            hasSizesInventory = true;
            const processSize = (qty, size) => {
                derivedTotal += Number(qty || 0);
                let sizeStatus = 'in_stock';
                if (qty === 0) {
                    sizeStatus = 'out_of_stock';
                } else if (qty <= this.lowStockThreshold) {
                    sizeStatus = 'low_stock';
                }
                this.sizesStatus.set(size, sizeStatus);
            };

            if (sizesInv instanceof Map) {
                sizesInv.forEach(processSize);
            } else {
                for (const size in sizesInv) {
                    processSize(sizesInv[size], size);
                }
            }
            // Only override quantity from sizesInventory if sizes exist
            this.quantity = derivedTotal;
        }
        // If no sizesInventory, keep the original quantity value (for materials, etc.)

        // Set overall status based on size statuses
        const sizeStatuses = Array.from(this.sizesStatus.values());

        if (this.quantity === 0) {
            this.status = 'out_of_stock';
        } else if (sizeStatuses.length > 0 && sizeStatuses.every(s => s === 'out_of_stock')) {
            this.status = 'out_of_stock';
        } else if (sizeStatuses.length > 0 && sizeStatuses.some(s => s === 'low_stock')) {
            this.status = 'low_stock';
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

// Helper to get sizes that are low or out of stock
inventorySchema.methods.getLowStockSizes = function() {
    const lowStockSizes = [];
    if (this.sizesStatus && this.sizesStatus.size > 0) {
        this.sizesStatus.forEach((status, size) => {
            if (status === 'low_stock' || status === 'out_of_stock') {
                lowStockSizes.push({
                    size,
                    status,
                    quantity: this.sizesInventory.get(size) || 0
                });
            }
        });
    }
    return lowStockSizes;
};

module.exports = mongoose.model('Inventory', inventorySchema);
