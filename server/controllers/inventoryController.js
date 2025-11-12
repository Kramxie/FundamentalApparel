const Inventory = require('../models/Inventory');

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
// @route   POST /api/admin/inventory
// @access  Private/Admin
exports.createInventoryItem = async (req, res) => {
    try {
        const { name, type, quantity, unit, price, lowStockThreshold, supplier, description, sku } = req.body;

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

        const item = await Inventory.create({
            name,
            type,
            quantity,
            unit,
            price,
            lowStockThreshold: lowStockThreshold || 10,
            supplier: supplier || '',
            description: description || '',
            sku: sku || undefined
        });

        res.status(201).json({
            success: true,
            data: item,
            message: 'Inventory item created successfully'
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
        const { name, type, quantity, unit, price, lowStockThreshold, supplier, description, sku } = req.body;

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

        // Update fields
        if (name !== undefined) item.name = name;
        if (type !== undefined) item.type = type;
        if (quantity !== undefined) item.quantity = quantity;
        if (unit !== undefined) item.unit = unit;
        if (price !== undefined) item.price = price;
        if (lowStockThreshold !== undefined) item.lowStockThreshold = lowStockThreshold;
        if (supplier !== undefined) item.supplier = supplier;
        if (description !== undefined) item.description = description;
        if (sku !== undefined) item.sku = sku;

        // Update lastRestocked if quantity increased
        if (quantity !== undefined && quantity > item.quantity) {
            item.lastRestocked = Date.now();
        }

        await item.save();

        res.status(200).json({
            success: true,
            data: item,
            message: 'Inventory item updated successfully'
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
