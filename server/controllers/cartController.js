const Cart = require('../models/Cart');
const Product = require('../models/Product');

// @desc    Get user's cart
// @route   GET /api/cart
// @access  Private
exports.getCart = async (req, res) => {
    try {
        const cart = await Cart.findOne({ user: req.user._id }).populate('items.product');
        if (!cart) {
            const newCart = await Cart.create({ user: req.user._id, items: [] });
            return res.status(200).json({ success: true, data: newCart });
        }
        res.status(200).json({ success: true, data: cart });
    } catch (error) {
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

// @desc    Add item to cart
// @route   POST /api/cart
// @access  Private
exports.addToCart = async (req, res) => {
    const { productId, quantity, size } = req.body;
    const userId = req.user._id;
    try {
        let cart = await Cart.findOne({ user: userId });
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, msg: 'Product not found' });
        }
        // Determine price to use for this cart item. Prefer per-size price from Inventory when size provided.
        let priceToUse = Number(product.price) || 0;
        try {
            const InventoryModel = require('../models/Inventory');
            const inventoryItem = await InventoryModel.findOne({ productId: productId });
            if (inventoryItem) {
                // If a size is specified and a per-size price exists, use it
                if (size) {
                    const sp = inventoryItem.sizesPrice || {};
                    const perSizeVal = sp && (sp.get ? sp.get(size) : sp[size]);
                    if (perSizeVal != null && !isNaN(Number(perSizeVal))) {
                        priceToUse = Number(perSizeVal);
                    }
                }
                // If we still don't have a base price, derive from min per-size price if available
                if ((!priceToUse || priceToUse === 0) && inventoryItem.sizesPrice) {
                    try {
                        const spObj = inventoryItem.sizesPrice.get ? Object.fromEntries(inventoryItem.sizesPrice) : (inventoryItem.sizesPrice || {});
                        const vals = Object.keys(spObj).map(k => Number(spObj[k])).filter(v => !isNaN(v));
                        if (vals.length > 0) priceToUse = Math.min(...vals);
                    } catch (e) { /* ignore */ }
                }
            }
        } catch (e) {
            // ignore inventory lookup errors
        }
        // If product is backed by Inventory with sizesInventory, validate requested size availability
        try {
            const inventoryItem = await require('../models/Inventory').findOne({ productId: productId });
            if (inventoryItem && inventoryItem.sizesInventory) {
                // If inventory has per-size buckets, require a size selection
                const sizesObj = inventoryItem.sizesInventory.get ? Object.fromEntries(inventoryItem.sizesInventory) : (inventoryItem.sizesInventory || {});
                const hasPerSize = Object.keys(sizesObj || {}).length > 0;
                if (hasPerSize && !size) {
                    return res.status(400).json({ success: false, msg: 'Please select a size for this product before adding to cart.' });
                }
                if (hasPerSize && size) {
                    const available = Number(sizesObj[size] || 0);
                    if (available < Number(quantity)) {
                        return res.status(400).json({ success: false, msg: `Requested quantity (${quantity}) for size '${size}' exceeds available stock (${available}).` });
                    }
                }
            }
        } catch (err) {
            // ignore inventory lookup errors (don't block cart add)
            console.warn('[Cart] Inventory lookup failed', err && err.message);
        }
        if (cart) {
            // Try to find an existing cart item with same product and same size (both null/undefined sizes match)
            const itemIndex = cart.items.findIndex(p => p.product.toString() === productId && ((p.size || '') === (size || '')));
            if (itemIndex > -1) {
                cart.items[itemIndex].quantity += Number(quantity);
            } else {
                cart.items.push({ product: productId, quantity: Number(quantity), price: priceToUse, size: size || null });
            }
            await cart.save();
            const updatedCart = await Cart.findById(cart._id).populate('items.product');
            return res.status(200).json({ success: true, data: updatedCart });
        } else {
            const newCart = await Cart.create({
                user: userId,
                items: [{ product: productId, quantity: Number(quantity), price: priceToUse, size: size || null }]
            });
            const populatedCart = await Cart.findById(newCart._id).populate('items.product');
            return res.status(201).json({ success: true, data: populatedCart });
        }
    } catch (error) {
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};


// @desc    Remove item from cart
// @route   DELETE /api/cart/:itemId
// @access  Private
exports.removeFromCart = async (req, res) => {
    const { itemId } = req.params;
    const userId = req.user._id;

    try {
        // Ang $pull ay isang special MongoDB operator para tanggalin ang item sa isang array
        // na tumutugma sa condition.
        const updatedCart = await Cart.findOneAndUpdate(
            { user: userId },
            { $pull: { items: { _id: itemId } } },
            { new: true } // Ito ay nagsasabi sa Mongoose na ibalik ang updated na cart
        ).populate('items.product');

        if (!updatedCart) {
            return res.status(404).json({ success: false, msg: 'Cart not found' });
        }

        res.status(200).json({ success: true, data: updatedCart });

    } catch (error) {
        console.error('[Remove Controller] CRASHED:', error);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

exports.updateItemQuantity = async (req, res) => {
    const { itemId } = req.params;
    const { newQuantity } = req.body;
    const userId = req.user._id;

    try {
        const cart = await Cart.findOne({ user: userId });
        if (!cart) {
            return res.status(404).json({ success: false, msg: 'Cart not found' });
        }

    
        const item = cart.items.id(itemId);
        
        if (!item) {
            return res.status(404).json({ success: false, msg: 'Item not found in cart' });
        }

    
        const quantityToSet = Number(newQuantity);
        if (isNaN(quantityToSet) || quantityToSet <= 0) {
             console.error('Validation FAILED: Quantity is NaN or zero.');
             return res.status(400).json({ success: false, msg: 'Invalid quantity provided.' });
        }
        // --- END NG VALIDATION FIX ---

        item.quantity = quantityToSet; // Gamitin ang na-validate na quantity
        await cart.save();
        
        const populatedCart = await Cart.findById(cart._id).populate('items.product');
        res.status(200).json({ success: true, data: populatedCart });

    } catch (error) {
        console.error('[Update Quantity Controller] CRASHED:', error);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

exports.getCartPreview = async (req, res) => {
    const { itemIds } = req.body;
    const userId = req.user._id;

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ success: false, msg: 'No items selected for preview' });
    }

    try {
        const cart = await Cart.findOne({ user: userId }).populate('items.product');
        if (!cart) {
            return res.status(404).json({ success: false, msg: 'Cart not found' });
        }

        const selectedItems = cart.items.filter(item => itemIds.includes(item._id.toString()));

        const previewCart = {
            ...cart.toObject(),
            items: selectedItems
        };
        
        res.status(200).json({ success: true, data: previewCart });
    } catch (error) {
        console.error('[Get Preview Controller] CRASHED:', error);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};



