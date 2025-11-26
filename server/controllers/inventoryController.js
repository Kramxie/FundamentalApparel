const Inventory = require('../models/Inventory');
const Product = require('../models/Product');
const { notifyLowStock } = require('./notificationController');

// Helper function to sync inventory to product
async function syncToProduct(inventoryItem) {
    try {
        if (!inventoryItem.isProduct) {
            return null; // Don't sync if it's not marked as a product
        }
        // If sizesInventory exists, compute total from per-size buckets
        let computedCountInStock = Number(inventoryItem.quantity || 0);
        try {
            const si = inventoryItem.sizesInventory || {};
            if (si && ((si instanceof Map && si.size > 0) || (typeof si === 'object' && Object.keys(si || {}).length > 0))) {
                let t = 0;
                if (si instanceof Map) {
                    for (const v of si.values()) t += Number(v || 0);
                } else {
                    for (const k of Object.keys(si)) t += Number(si[k] || 0);
                }
                computedCountInStock = t;
            }
        } catch (e) { /* ignore */ }

        const productData = {
            name: inventoryItem.name,
            description: inventoryItem.description || '',
            price: inventoryItem.price,
            category: inventoryItem.category || 'Uncategorized',
            imageUrl: inventoryItem.imageUrl || '',
            gallery: inventoryItem.gallery || [],
            countInStock: computedCountInStock,
            sizes: inventoryItem.sizes || [],
            // include per-size inventory and prices
            sizesInventory: inventoryItem.sizesInventory || {},
            sizesPrice: inventoryItem.sizesPrice || {},
            colors: inventoryItem.colors || [],
            material: inventoryItem.material || '',
            productDetails: inventoryItem.productDetails || '',
            faqs: inventoryItem.faqs || ''
        };

        if (inventoryItem.productId) {
            // Update existing product
            const product = await Product.findByIdAndUpdate(
                inventoryItem.productId,
                productData,
                { new: true, runValidators: true }
            );
            return product;
        } else {
            // Create new product
            const product = await Product.create(productData);
            // Update inventory with productId reference
            inventoryItem.productId = product._id;
            await inventoryItem.save();
            return product;
        }
    } catch (error) {
        console.error('Sync to Product Error:', error);
        throw error;
    }
}

// Helper function to delete product when inventory is deleted
async function deleteProductIfLinked(inventoryItem) {
    try {
        if (inventoryItem.productId) {
            await Product.findByIdAndDelete(inventoryItem.productId);
        }
    } catch (error) {
        console.error('Delete Product Error:', error);
        // Continue even if product deletion fails
    }
}

// @desc    Get all inventory items
// @route   GET /api/admin/inventory
// @access  Private/Admin
exports.getAllInventory = async (req, res) => {
    try {
        const { type, status, search, page = 1, limit = 10, sortBy = 'name', sortOrder = 'asc' } = req.query;

        // Build query
        let query = {};

        if (type && type !== 'all') {
            query.type = type.toLowerCase();
        }

        if (status && status !== 'all') {
            query.status = status.toLowerCase();
        }

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { supplier: { $regex: search, $options: 'i' } },
                { sku: { $regex: search, $options: 'i' } }
            ];
        }

        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sortDirection = sortOrder === 'desc' ? -1 : 1;
        const sort = { [sortBy]: sortDirection };

        // Execute query
        const items = await Inventory.find(query)
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Inventory.countDocuments(query);
        const totalPages = Math.ceil(total / parseInt(limit));

        // Get low stock count
        const lowStockCount = await Inventory.countDocuments({ status: 'low_stock' });
        const outOfStockCount = await Inventory.countDocuments({ status: 'out_of_stock' });

        res.status(200).json({
            success: true,
            data: items,
            pagination: {
                currentPage: parseInt(page),
                totalPages,
                totalItems: total,
                itemsPerPage: parseInt(limit)
            },
            alerts: {
                lowStockCount,
                outOfStockCount
            }
        });
    } catch (error) {
        console.error('Get Inventory Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch inventory items'
        });
    }
};

// @desc    Get single inventory item
// @route   GET /api/admin/inventory/:id
// @access  Private/Admin
exports.getInventoryItem = async (req, res) => {
    try {
        const item = await Inventory.findById(req.params.id);

        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Inventory item not found'
            });
        }

        res.status(200).json({
            success: true,
            data: item
        });
    } catch (error) {
        console.error('Get Inventory Item Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch inventory item'
        });
    }
};

// @desc    Get availability (per-size) for an inventory item by name or id
// @route   GET /api/admin/inventory/availability
// @access  Private (authenticated users)
exports.getInventoryAvailability = async (req, res) => {
    try {
        const { name, id } = req.query;
        let item = null;
        if (id) {
            item = await Inventory.findById(id);
        } else if (name) {
            item = await Inventory.findOne({ name: new RegExp('^' + name + '$', 'i') });
        } else {
            return res.status(400).json({ success: false, message: 'Provide inventory name or id' });
        }

        if (!item) return res.status(404).json({ success: false, message: 'Inventory item not found' });

        // Convert Map fields to plain objects
        const sizesInventory = item.sizesInventory ? Object.fromEntries(item.sizesInventory) : {};
        const sizesPrice = item.sizesPrice ? Object.fromEntries(item.sizesPrice) : {};
        const reservedSizes = item.reservedSizes ? Object.fromEntries(item.reservedSizes) : {};

        res.status(200).json({
            success: true,
            data: {
                id: item._id,
                name: item.name,
                quantity: item.quantity,
                reserved: item.reserved,
                price: Number(item.price || 0),
                sizesInventory,
                sizesPrice,
                reservedSizes
            }
        });
    } catch (error) {
        console.error('Get Inventory Availability Error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch availability' });
    }
};

// @desc    Public: Get visible inventory variants for customers (fabric/combined variants)
// @route   GET /api/admin/inventory/public/variants
// @access  Public
exports.getPublicVariants = async (req, res) => {
    try {
        // Return fabric-type inventory variants that have positive available quantity
        const items = await Inventory.find({ type: 'fabric' }).select('name quantity reserved sizesInventory reservedSizes').sort({ name: 1 });

        const data = items.map(it => {
            const sizesInventory = it.sizesInventory ? Object.fromEntries(it.sizesInventory) : {};
            const reservedSizes = it.reservedSizes ? Object.fromEntries(it.reservedSizes) : {};
            const sizesPrice = it.sizesPrice ? Object.fromEntries(it.sizesPrice) : {};
            const available = Number(it.quantity || 0);
            return {
                id: it._id,
                name: it.name,
                quantity: it.quantity,
                reserved: it.reserved,
                available,
                price: Number(it.price || 0),
                sizesInventory,
                sizesPrice,
                reservedSizes
            };
        });

        // Filter out fully depleted variants (available <= 0)
        const visible = data.filter(d => Number(d.available) > 0);

        return res.status(200).json({ success: true, data: visible });
    } catch (error) {
        console.error('Get Public Variants Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch variants' });
    }
};

// @desc    Create new inventory item
// @desc    Create new inventory item
// @route   POST /api/admin/inventory
// @access  Private/Admin
exports.createInventoryItem = async (req, res) => {
    try {
        const { 
            name, type, quantity, unit, price, lowStockThreshold, supplier, description, sku,
            // Product fields
            isProduct, category, sizes, colors, material, productDetails, faqs, sizesInventory
        } = req.body;

        // Validation
        if (!name || !type || quantity === undefined || !unit || price === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields: name, type, quantity, unit, price'
            });
        }

        // Normalize SKU: treat empty string as not-provided (sparse unique index must not store empty strings)
        const cleanedSku = (typeof sku === 'string') ? (sku.trim() === '' ? undefined : sku.trim()) : sku;

        // Check if SKU already exists (if provided and non-empty)
        if (cleanedSku) {
            const existingSKU = await Inventory.findOne({ sku: cleanedSku });
            if (existingSKU) {
                return res.status(400).json({
                    success: false,
                    message: 'SKU already exists'
                });
            }
        }

        // Handle uploaded images
        const BASE_URL = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5000}`;
        let imageUrl = '';
        let gallery = [];

        if (req.files) {
            // Main image
            if (req.files.mainImage && req.files.mainImage[0]) {
                imageUrl = `${BASE_URL}/uploads/products/${req.files.mainImage[0].filename}`;
            }
            
            // Gallery images
            if (req.files.galleryImages && req.files.galleryImages.length > 0) {
                gallery = req.files.galleryImages.map(file => 
                    `${BASE_URL}/uploads/products/${file.filename}`
                );
            }
        }

        // Parse arrays / maps from form data
        const parsedSizes = sizes ? (Array.isArray(sizes) ? sizes : JSON.parse(sizes)) : [];
        const parsedColors = colors ? (Array.isArray(colors) ? colors : JSON.parse(colors)) : [];
        let parsedSizesInventory = {};
        if (sizesInventory) {
            try {
                parsedSizesInventory = (typeof sizesInventory === 'string') ? JSON.parse(sizesInventory) : sizesInventory;
            } catch (e) {
                parsedSizesInventory = {};
            }
        }
        // parse sizesPrice if provided
        let parsedSizesPrice = {};
        if (req.body.sizesPrice) {
            try {
                parsedSizesPrice = (typeof req.body.sizesPrice === 'string') ? JSON.parse(req.body.sizesPrice) : req.body.sizesPrice;
            } catch (e) {
                parsedSizesPrice = {};
            }
        }
        // parse placements if provided
        let parsedPlacements = {};
        if (req.body.placements) {
            try {
                parsedPlacements = (typeof req.body.placements === 'string') ? JSON.parse(req.body.placements) : req.body.placements;
            } catch (e) {
                parsedPlacements = {};
            }
        }

        const itemData = {
            name,
            type,
            quantity,
            unit,
            price,
            lowStockThreshold: lowStockThreshold || 10,
            supplier: supplier || '',
            description: description || '',
            sku: cleanedSku || undefined,
            // Product fields
            isProduct: isProduct === 'true' || isProduct === true,
            category: category || '',
            imageUrl,
            gallery,
            sizes: parsedSizes,
            sizesInventory: parsedSizesInventory,
            sizesPrice: parsedSizesPrice,
            placements: parsedPlacements,
            colors: parsedColors,
            material: material || '',
            productDetails: productDetails || '',
            faqs: faqs || ''
        };

        const item = await Inventory.create(itemData);

        // Sync to Product collection if this is a product
        let syncedProduct = null;
        if (item.isProduct) {
            syncedProduct = await syncToProduct(item);
        }

        res.status(201).json({
            success: true,
            data: item,
            product: syncedProduct,
            message: `Inventory item created successfully${item.isProduct ? ' and synced to products' : ''}`
        });
    } catch (error) {
        console.error('Create Inventory Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to create inventory item'
        });
    }
};

// @desc    Update inventory item
// @route   PATCH /api/admin/inventory/:id
// @access  Private/Admin
exports.updateInventoryItem = async (req, res) => {
    try {
        const { 
            name, type, quantity, unit, price, lowStockThreshold, supplier, description, sku,
            // Product fields
            isProduct, category, sizes, colors, material, productDetails, faqs, sizesInventory
        } = req.body;

        let item = await Inventory.findById(req.params.id);
        const prevStatus = item ? item.status : null;

        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Inventory item not found'
            });
        }

        // Normalize SKU from request: treat empty string as clearing the SKU
        const cleanedUpdateSku = (typeof sku === 'string') ? (sku.trim() === '' ? null : sku.trim()) : sku;

        // Check if SKU is being changed to a non-empty value and if it already exists
        if (cleanedUpdateSku && cleanedUpdateSku !== item.sku) {
            const existingSKU = await Inventory.findOne({ sku: cleanedUpdateSku, _id: { $ne: req.params.id } });
            if (existingSKU) {
                return res.status(400).json({
                    success: false,
                    message: 'SKU already exists'
                });
            }
        }

        // Handle uploaded images
        const BASE_URL = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5000}`;
        
        if (req.files) {
            // Main image - only update if new file uploaded
            if (req.files.mainImage && req.files.mainImage[0]) {
                item.imageUrl = `${BASE_URL}/uploads/products/${req.files.mainImage[0].filename}`;
            }
            
            // Gallery images - append new images to existing ones
            if (req.files.galleryImages && req.files.galleryImages.length > 0) {
                const newGalleryImages = req.files.galleryImages.map(file => 
                    `${BASE_URL}/uploads/products/${file.filename}`
                );
                item.gallery = [...(item.gallery || []), ...newGalleryImages];
            }
        }

        // Parse arrays / maps from form data if they exist
        const parsedSizes = sizes ? (Array.isArray(sizes) ? sizes : JSON.parse(sizes)) : undefined;
        const parsedColors = colors ? (Array.isArray(colors) ? colors : JSON.parse(colors)) : undefined;
        let parsedSizesInventory = undefined;
        if (sizesInventory !== undefined) {
            try {
                parsedSizesInventory = (typeof sizesInventory === 'string') ? JSON.parse(sizesInventory) : sizesInventory;
            } catch (e) {
                parsedSizesInventory = undefined;
            }
        }
        // parse sizesPrice and placements for updates if provided
        let parsedSizesPrice = undefined;
        if (req.body.sizesPrice !== undefined) {
            try {
                parsedSizesPrice = (typeof req.body.sizesPrice === 'string') ? JSON.parse(req.body.sizesPrice) : req.body.sizesPrice;
            } catch (e) {
                parsedSizesPrice = undefined;
            }
        }
        let parsedPlacements = undefined;
        if (req.body.placements !== undefined) {
            try {
                parsedPlacements = (typeof req.body.placements === 'string') ? JSON.parse(req.body.placements) : req.body.placements;
            } catch (e) {
                parsedPlacements = undefined;
            }
        }

        // Update basic fields
        if (name !== undefined) item.name = name;
        if (type !== undefined) item.type = type;
        if (quantity !== undefined) item.quantity = quantity;
        if (unit !== undefined) item.unit = unit;
        if (price !== undefined) item.price = price;
        if (lowStockThreshold !== undefined) item.lowStockThreshold = lowStockThreshold;
        if (supplier !== undefined) item.supplier = supplier;
        if (description !== undefined) item.description = description;
        if (sku !== undefined) {
            // If client sent an empty string, clear the SKU (set to undefined so sparse index ignores it)
            if (cleanedUpdateSku === null) {
                item.sku = undefined;
            } else {
                item.sku = cleanedUpdateSku;
            }
        }

        // Update product fields
        if (isProduct !== undefined) item.isProduct = isProduct === 'true' || isProduct === true;
        if (category !== undefined) item.category = category;
        if (parsedSizes !== undefined) item.sizes = parsedSizes;
        if (parsedColors !== undefined) item.colors = parsedColors;
        if (parsedSizesInventory !== undefined) item.sizesInventory = parsedSizesInventory;
        if (parsedSizesPrice !== undefined) item.sizesPrice = parsedSizesPrice;
        if (parsedPlacements !== undefined) item.placements = parsedPlacements;
        if (material !== undefined) item.material = material;
        if (productDetails !== undefined) item.productDetails = productDetails;
        if (faqs !== undefined) item.faqs = faqs;

        // Update lastRestocked if quantity increased
        if (quantity !== undefined && quantity > item.quantity) {
            item.lastRestocked = Date.now();
        }

                await item.save();

                // After save: if status transitioned to low_stock or out_of_stock, notify admins
                try{
                    if(prevStatus !== item.status && (item.status === 'low_stock' || item.status === 'out_of_stock')){
                        // build items payload: include per-size low ones if available
                        const itemsToNotify = [];
                        const sizes = item.sizesInventory ? Object.fromEntries(item.sizesInventory) : {};
                        const reserved = item.reservedSizes ? Object.fromEntries(item.reservedSizes) : {};
                        if(Object.keys(sizes).length){
                            Object.keys(sizes).forEach(sz => {
                                const total = Number(sizes[sz] || 0);
                                const resv = Number(reserved[sz] || 0);
                                const avail = Math.max(0, total - resv);
                                if(avail <= (item.lowStockThreshold || 5)){
                                    itemsToNotify.push({ id: item._id, name: item.name, size: sz, available: avail });
                                }
                            });
                        } else {
                            itemsToNotify.push({ id: item._id, name: item.name, available: Number(item.quantity || 0) });
                        }
                        if(itemsToNotify.length) await notifyLowStock(itemsToNotify);
                    }
                }catch(e){ console.error('Notify low stock (update) failed', e && e.message); }

        // Sync to Product collection if this is a product
        let syncedProduct = null;
        if (item.isProduct) {
            syncedProduct = await syncToProduct(item);
        } else if (item.productId) {
            // If isProduct was set to false, delete the linked product
            await deleteProductIfLinked(item);
            item.productId = null;
            await item.save();
        }

        res.status(200).json({
            success: true,
            data: item,
            product: syncedProduct,
            message: `Inventory item updated successfully${item.isProduct ? ' and synced to products' : ''}`
        });
    } catch (error) {
        console.error('Update Inventory Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to update inventory item'
        });
    }
};

// @desc    Delete inventory item
// @route   DELETE /api/admin/inventory/:id
// @access  Private/Admin
exports.deleteInventoryItem = async (req, res) => {
    try {
        const item = await Inventory.findById(req.params.id);

        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Inventory item not found'
            });
        }

        // Delete linked product if exists
        await deleteProductIfLinked(item);

        await item.deleteOne();

        res.status(200).json({
            success: true,
            message: 'Inventory item deleted successfully'
        });
    } catch (error) {
        console.error('Delete Inventory Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete inventory item'
        });
    }
};

// @desc    Bulk update inventory quantities
// @route   POST /api/admin/inventory/bulk-update
// @access  Private/Admin
exports.bulkUpdateQuantities = async (req, res) => {
    try {
        const { updates } = req.body; // Array of { id, quantity }

        if (!Array.isArray(updates) || updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide an array of updates'
            });
        }

        const results = [];

        for (const update of updates) {
            const { id, quantity } = update;
            const item = await Inventory.findById(id);

            if (item) {
                item.quantity = quantity;
                if (quantity > item.quantity) {
                    item.lastRestocked = Date.now();
                }
                await item.save();
                results.push({ id, success: true });
            } else {
                results.push({ id, success: false, message: 'Item not found' });
            }
        }

        res.status(200).json({
            success: true,
            data: results,
            message: 'Bulk update completed'
        });
    } catch (error) {
        console.error('Bulk Update Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to perform bulk update'
        });
    }
};

// @desc    Get inventory statistics
// @route   GET /api/admin/inventory/stats
// @access  Private/Admin
exports.getInventoryStats = async (req, res) => {
    try {
        const totalItems = await Inventory.countDocuments();
        const fabricCount = await Inventory.countDocuments({ type: 'fabric' });
        const productCount = await Inventory.countDocuments({ type: 'product' });
        const lowStockCount = await Inventory.countDocuments({ status: 'low_stock' });
        const outOfStockCount = await Inventory.countDocuments({ status: 'out_of_stock' });
        const inStockCount = await Inventory.countDocuments({ status: 'in_stock' });

        // Calculate total inventory value
        const items = await Inventory.find();
        const totalValue = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        res.status(200).json({
            success: true,
            data: {
                totalItems,
                fabricCount,
                productCount,
                lowStockCount,
                outOfStockCount,
                inStockCount,
                totalValue
            }
        });
    } catch (error) {
        console.error('Get Inventory Stats Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch inventory statistics'
        });
    }
};

// @desc    Decrement inventory stock (per-size or overall)
// @route   POST /api/admin/inventory/:id/decrement
// @access  Private/Admin|Employee
exports.decrementStock = async (req, res) => {
    try {
        const { sizesDecrement, quantity } = req.body;

        const item = await Inventory.findById(req.params.id);
        if (!item) return res.status(404).json({ success: false, message: 'Inventory item not found' });

        // Support two modes: per-size decrements (preferred) or overall quantity decrement
        let totalDecrement = 0;

        if (sizesDecrement && typeof sizesDecrement === 'object') {
            // Validate availability per size
            for (const [size, v] of Object.entries(sizesDecrement)) {
                const need = Number(v || 0);
                const available = Number(item.sizesInventory?.get(size) || 0);
                if (need > available) {
                    return res.status(400).json({ success: false, message: `Insufficient stock for size ${size}` });
                }
                totalDecrement += need;
            }
        } else if (quantity !== undefined) {
            totalDecrement = Number(quantity || 0);
            if (totalDecrement <= 0) return res.status(400).json({ success: false, message: 'Invalid quantity to decrement' });
            if (totalDecrement > item.quantity) return res.status(400).json({ success: false, message: 'Insufficient overall quantity' });
        } else {
            return res.status(400).json({ success: false, message: 'Provide sizesDecrement or quantity' });
        }

        // Perform atomic decrement
        const inc = { quantity: -totalDecrement };
        if (sizesDecrement && typeof sizesDecrement === 'object') {
            for (const [size, v] of Object.entries(sizesDecrement)) {
                const need = Number(v || 0);
                inc[`sizesInventory.${size}`] = -need;
            }
        }

        const updated = await Inventory.findByIdAndUpdate(req.params.id, { $inc: inc }, { new: true });

        // Re-evaluate status via save hook: ensure map values non-negative (we pre-validated)
                if (updated) {
                        // If now a product, sync to Product collection
                        if (updated.isProduct) {
                                try { await syncToProduct(updated); } catch (e) { console.error('Sync after decrement failed', e); }
                        }
                        // After decrement: check previous item.status -> updated.status and notify if transitioned
                        try{
                            const prev = item; // earlier fetched
                            if(prev && prev.status !== updated.status && (updated.status === 'low_stock' || updated.status === 'out_of_stock')){
                                const sizes = updated.sizesInventory ? Object.fromEntries(updated.sizesInventory) : {};
                                const reserved = updated.reservedSizes ? Object.fromEntries(updated.reservedSizes) : {};
                                const itemsToNotify = [];
                                if(Object.keys(sizes).length){
                                    Object.keys(sizes).forEach(sz => {
                                        const total = Number(sizes[sz] || 0);
                                        const resv = Number(reserved[sz] || 0);
                                        const avail = Math.max(0, total - resv);
                                        if(avail <= (updated.lowStockThreshold || 5)) itemsToNotify.push({ id: updated._id, name: updated.name, size: sz, available: avail });
                                    });
                                } else {
                                    itemsToNotify.push({ id: updated._id, name: updated.name, available: Number(updated.quantity || 0) });
                                }
                                if(itemsToNotify.length) await notifyLowStock(itemsToNotify);
                            }
                        }catch(e){ console.error('Notify low stock (decrement) failed', e && e.message); }

                        return res.status(200).json({ success: true, data: updated, message: 'Stock decremented' });
                }

        res.status(500).json({ success: false, message: 'Failed to decrement stock' });
    } catch (error) {
        console.error('Decrement Stock Error:', error);
        res.status(500).json({ success: false, message: 'Failed to decrement stock' });
    }
};
