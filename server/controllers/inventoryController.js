const Inventory = require('../models/Inventory');
const Product = require('../models/Product');

// Helper function to sync inventory to product
async function syncToProduct(inventoryItem) {
    try {
        if (!inventoryItem.isProduct) {
            return null; // Don't sync if it's not marked as a product
        }

        const productData = {
            name: inventoryItem.name,
            description: inventoryItem.description || '',
            price: inventoryItem.price,
            category: inventoryItem.category || 'Uncategorized',
            imageUrl: inventoryItem.imageUrl || '',
            gallery: inventoryItem.gallery || [],
            countInStock: inventoryItem.quantity,
            sizes: inventoryItem.sizes || [],
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

// @desc    Create new inventory item
// @desc    Create new inventory item
// @route   POST /api/admin/inventory
// @access  Private/Admin
exports.createInventoryItem = async (req, res) => {
    try {
        const { 
            name, type, quantity, unit, price, lowStockThreshold, supplier, description, sku,
            // Product fields
            isProduct, category, sizes, colors, material, productDetails, faqs
        } = req.body;

        // Validation
        if (!name || !type || quantity === undefined || !unit || price === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Please provide all required fields: name, type, quantity, unit, price'
            });
        }

        // Check if SKU already exists (if provided)
        if (sku) {
            const existingSKU = await Inventory.findOne({ sku });
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

        // Parse arrays from form data
        const parsedSizes = sizes ? (Array.isArray(sizes) ? sizes : JSON.parse(sizes)) : [];
        const parsedColors = colors ? (Array.isArray(colors) ? colors : JSON.parse(colors)) : [];

        const itemData = {
            name,
            type,
            quantity,
            unit,
            price,
            lowStockThreshold: lowStockThreshold || 10,
            supplier: supplier || '',
            description: description || '',
            sku: sku || undefined,
            // Product fields
            isProduct: isProduct === 'true' || isProduct === true,
            category: category || '',
            imageUrl,
            gallery,
            sizes: parsedSizes,
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
            isProduct, category, sizes, colors, material, productDetails, faqs
        } = req.body;

        let item = await Inventory.findById(req.params.id);

        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Inventory item not found'
            });
        }

        // Check if SKU is being changed and if it already exists
        if (sku && sku !== item.sku) {
            const existingSKU = await Inventory.findOne({ sku, _id: { $ne: req.params.id } });
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

        // Parse arrays from form data if they exist
        const parsedSizes = sizes ? (Array.isArray(sizes) ? sizes : JSON.parse(sizes)) : undefined;
        const parsedColors = colors ? (Array.isArray(colors) ? colors : JSON.parse(colors)) : undefined;

        // Update basic fields
        if (name !== undefined) item.name = name;
        if (type !== undefined) item.type = type;
        if (quantity !== undefined) item.quantity = quantity;
        if (unit !== undefined) item.unit = unit;
        if (price !== undefined) item.price = price;
        if (lowStockThreshold !== undefined) item.lowStockThreshold = lowStockThreshold;
        if (supplier !== undefined) item.supplier = supplier;
        if (description !== undefined) item.description = description;
        if (sku !== undefined) item.sku = sku;

        // Update product fields
        if (isProduct !== undefined) item.isProduct = isProduct === 'true' || isProduct === true;
        if (category !== undefined) item.category = category;
        if (parsedSizes !== undefined) item.sizes = parsedSizes;
        if (parsedColors !== undefined) item.colors = parsedColors;
        if (material !== undefined) item.material = material;
        if (productDetails !== undefined) item.productDetails = productDetails;
        if (faqs !== undefined) item.faqs = faqs;

        // Update lastRestocked if quantity increased
        if (quantity !== undefined && quantity > item.quantity) {
            item.lastRestocked = Date.now();
        }

        await item.save();

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
