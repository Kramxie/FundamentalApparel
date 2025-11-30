const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const User = require('../models/User');
const mongoose = require('mongoose');
const notify = require('../utils/notify');
const { allocateInventoryBySizes, findInventoryByName } = require('../utils/inventory');

function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- MODIFIED FUNCTION ---
// @desc    Get logged in user orders
// @route   GET /api/orders/myorders
// @access  Private
exports.getMyOrders = async (req, res) => {
    try {
        const query = { user: req.user._id };

        // NEW: Handle complex tab filters
        const tab = req.query.tab;
        if (tab === 'To Pay') {
            query.paymentStatus = 'Pending';
            query.status = { $ne: 'Cancelled' };
        } else if (tab === 'To Ship') {
            query.paymentStatus = 'Received';
            query.status = 'Accepted';
        } else if (tab === 'To Receive') {
            query.paymentStatus = 'Received';
            query.status = 'Shipped';
        } else if (tab === 'Completed') {
            query.status = { $in: ['Delivered', 'Completed'] };
        } else if (tab === 'Cancelled') {
            query.status = 'Cancelled';
        }
        // 'All' tab ay walang extra filter

        const orders = await Order.find(query).sort({ createdAt: -1 });
        // Work with plain JS objects so we can freely attach annotation fields
        const plainOrders = orders.map(o => (typeof o.toObject === 'function' ? o.toObject() : o));

        // Annotate orders with whether the current user has left a review
        try {
            // Collect unique product ids from the orders
            const productIds = new Set();
            orders.forEach(o => (o.orderItems || []).forEach(it => { if (it.product) productIds.add(it.product.toString()); }));
            const pidArray = Array.from(productIds);
            if (pidArray.length > 0) {
                // Find products among these that contain a review by this user
                const productsWithMyReview = await Product.find({ _id: { $in: pidArray }, 'reviews.user': req.user._id }, { 'reviews.$': 1 }).lean();
                // Build map productId -> review
                const reviewMap = {};
                for (const p of productsWithMyReview) {
                    if (p.reviews && p.reviews.length > 0) {
                        const r = p.reviews[0];
                        reviewMap[p._id.toString()] = { rating: r.rating, comment: r.comment || '', userName: r.userName || '', reviewedAt: r.createdAt || null };
                    }
                }
                // Attach flags to orders
                plainOrders.forEach(o => {
                    o.userHasReview = false;
                    o.userReview = null;
                    for (const it of (o.orderItems || [])) {
                        const pid = it.product ? it.product.toString() : null;
                        if (pid && reviewMap[pid]) {
                            o.userHasReview = true;
                            o.userReview = Object.assign({ productId: pid }, reviewMap[pid]);
                            break;
                        }
                    }
                });
            } else {
                // No products -> ensure fields present
                plainOrders.forEach(o => { o.userHasReview = false; o.userReview = null; });
            }
        } catch (annotErr) {
            console.warn('[getMyOrders] Failed to annotate reviews:', annotErr.message || annotErr);
            plainOrders.forEach(o => { o.userHasReview = false; o.userReview = null; });
        }

        res.status(200).json({ success: true, count: plainOrders.length, data: plainOrders });
    } catch (error) {
        console.error('[Get My Orders Controller] Error:', error);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};
// --- END MODIFIED FUNCTION ---

// @desc    Create new order with uploaded receipt (GCash/Bank)
// @route   POST /api/orders/upload-receipt
// @access  Private
exports.createOrderWithReceipt = async (req, res) => {
    try {
        const userId = req.user._id;

        if (!req.file) {
            return res.status(400).json({ success: false, msg: 'Receipt image is required.' });
        }

        const cart = await Cart.findOne({ user: userId }).populate('items.product');
        if (!cart || !cart.items || cart.items.length === 0) {
            return res.status(400).json({ success: false, msg: 'Your cart is empty.' });
        }
        
        let shippingAddress = {};
        try {
            const raw = req.body.shippingAddress;
            shippingAddress = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
        } catch (e) {
            return res.status(400).json({ success: false, msg: 'Invalid shippingAddress format.' });
        }

        const requiredFields = ['street', 'province', 'city', 'zip', 'phone'];
        for (const f of requiredFields) {
            if (!shippingAddress[f]) {
                return res.status(400).json({ success: false, msg: `Missing required address field: ${f}` });
            }
        }

        const shippingMethod = req.body.shippingMethod === 'Pick-Up' ? 'Pick-Up' : 'Standard';
        const paymentMethod = req.body.paymentMethod === 'BankTransfer' ? 'BankTransfer' : 'GCash';
        const deliveryFee = Number(req.body.deliveryFee || 0);
        const comment = req.body.comment || '';

        let itemIds = null;
        if (req.body.itemIds) {
            try {
                itemIds = JSON.parse(req.body.itemIds);
            } catch (e) {
                console.warn('Could not parse itemIds from FormData, proceeding with full cart.');
            }
        }

        let itemsToProcess;
        if (itemIds && Array.isArray(itemIds) && itemIds.length > 0) {
            itemsToProcess = cart.items.filter(item => itemIds.includes(item._id.toString()));
        } else {
            itemsToProcess = cart.items;
        }

        if (itemsToProcess.length === 0) {
            return res.status(400).json({ success: false, msg: 'No valid items selected for checkout.' });
        }

        const orderItems = itemsToProcess.map((it) => ({
            name: (it.product && it.product.name) ? it.product.name : 'Item',
            quantity: it.quantity || 0,
            imageUrl: (it.product && it.product.imageUrl) ? it.product.imageUrl : '',
            price: (it.product && typeof it.product.price === 'number') ? it.product.price : 0,
            product: it.product ? it.product._id : null,
            size: it.size || null,
            color: it.color || null
        })).filter(i => i.product);

        // Server-side validation: if a product has per-size inventory, ensure a size was selected.
        for (const it of itemsToProcess) {
            if (!it.product) continue;
            try {
                const prod = it.product; // populated product
                const sizesInv = prod.sizesInventory || prod.sizesInventoryMap || prod.sizes || {};
                const hasPerSize = (sizesInv && typeof sizesInv === 'object' && Object.keys(sizesInv || {}).length > 0);
                if (hasPerSize && !it.size) {
                    return res.status(400).json({ success: false, msg: `Size selection required for product ${prod.name}` });
                }
            } catch (e) { /* ignore validation errors but continue */ }
        }

        if (orderItems.length === 0) {
            return res.status(400).json({ success: false, msg: 'No valid items in cart.' });
        }

        const subtotal = orderItems.reduce((sum, it) => sum + (it.price * it.quantity), 0);
        const totalPrice = subtotal + deliveryFee;

        const receiptUrl = `/uploads/receipts/${req.file.filename}`;

        const order = await Order.create({
            user: userId,
            orderItems, 
            shippingAddress,
            shippingMethod,
            deliveryFee,
            comment,
            paymentMethod,
            paymentStatus: 'Pending',
            receiptUrl,
            status: 'Processing',
            totalPrice,
            isPaid: false
        });

        if (itemIds && Array.isArray(itemIds) && itemIds.length > 0) {
            cart.items = cart.items.filter(item => !itemIds.includes(item._id.toString()));
        } else {
            cart.items = [];
        }
        await cart.save();

        res.status(201).json({ success: true, data: order });
    } catch (error) {
        console.error('[Create Order With Receipt] Error:', error);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

// @desc    Admin - Get all orders
// @route   GET /api/orders/admin
// @access  Private/Admin
exports.getAllOrders = async (req, res) => {
    try {
        const { status, paymentStatus, search, dateFrom, dateTo, shippingMethod } = req.query;
        const query = {};

        // map friendly status filters from admin UI
        if (status) {
            if (status === 'to-pay') {
                query.status = 'Processing';
                query.paymentStatus = { $in: [null, 'Pending'] };
            } else if (status === 'to-ship') {
                query.status = 'Accepted';
            } else if (status === 'to-receive') {
                query.status = 'Shipped';
            } else if (status === 'completed') {
                query.status = { $in: ['Delivered', 'Completed'] };
            } else if (status === 'cancelled') {
                query.status = 'Cancelled';
            } else {
                // allow direct DB status names
                query.status = status;
            }
        }

        if (paymentStatus) {
            query.paymentStatus = paymentStatus;
        }

        if (shippingMethod) {
            // Normalize common values
            const sm = String(shippingMethod).toLowerCase();
            if (sm === 'pick-up' || sm === 'pickup' || sm === 'pick_up') query.shippingMethod = 'Pick-Up';
            else if (sm === 'standard' || sm === 'delivery' || sm === 'standard/delivery') query.shippingMethod = 'Standard';
            else query.shippingMethod = shippingMethod;
        }

        if (dateFrom || dateTo) {
            query.createdAt = {};
            if (dateFrom) {
                const d = new Date(dateFrom);
                if (!isNaN(d)) query.createdAt.$gte = d;
            }
            if (dateTo) {
                const d = new Date(dateTo);
                if (!isNaN(d)) {
                    d.setHours(23,59,59,999);
                    query.createdAt.$lte = d;
                }
            }
            if (Object.keys(query.createdAt).length === 0) delete query.createdAt;
        }

        // handle search: try to match user by name/email, or tracking code, or exact order id
        if (search && String(search).trim()) {
            const s = String(search).trim();
            const regex = new RegExp(escapeRegex(s), 'i');
            const or = [];
            // match tracking code
            or.push({ trackingCode: regex });
            // match user name or email
            try {
                const users = await User.find({ $or: [{ name: regex }, { email: regex }] }, '_id');
                const uids = users.map(u => u._id);
                if (uids.length) or.push({ user: { $in: uids } });
            } catch (e) {
                console.warn('User search failed', e.message || e);
            }
            // exact id match
            if (mongoose.Types.ObjectId.isValid(s)) {
                try { or.push({ _id: mongoose.Types.ObjectId(s) }); } catch (e) {}
            }
            if (or.length) query.$or = or;
        }

        const orders = await Order.find(query).populate('user', 'name email').sort({ createdAt: -1 });
        res.status(200).json({ success: true, count: orders.length, data: orders });
    } catch (error) {
        console.error('[Admin Get All Orders] Error:', error);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

// --- MODIFIED FUNCTION ---
// @desc    Admin - Update order/payment status and logistics fields
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
exports.updateOrderStatus = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Load the order first
        const order = await Order.findById(id);
        if (!order) {
            return res.status(404).json({ success: false, msg: 'Order not found' });
        }
        
        const updates = {};

        if (typeof req.body.paymentStatus === 'string') {
            const allowedPS = ['Pending', 'Received', 'Rejected'];
            if (!allowedPS.includes(req.body.paymentStatus)) {
                return res.status(400).json({ success: false, msg: 'Invalid paymentStatus' });
            }
            
            const previousPaymentStatus = order.paymentStatus;
            updates.paymentStatus = req.body.paymentStatus;
            
            if (req.body.paymentStatus === 'Received') {
                updates.isPaid = true;
                updates.paidAt = new Date();

                // Deduct stock for the whole order. Prefer atomic per-size allocations when sizes are present.
                const items = order.orderItems || [];
                // Group items per inventory/product name when sizes present
                const perInventorySizes = {};
                for (const it of items) {
                    const qty = Number(it.quantity || 0) || 0;
                    const size = it.size || null;
                    if (!it.product) continue;
                    try {
                        const prod = await Product.findById(it.product);
                        if (!prod) continue;
                                // Prefer linked Inventory document (by productId) to determine the inventory name
                                let invName;
                                try {
                                    const linkedInv = await Inventory.findOne({ productId: prod._id });
                                    invName = linkedInv ? linkedInv.name : (prod.name || prod._id.toString());
                                } catch (e) {
                                    invName = prod.name || prod._id.toString();
                                }
                                if (size) {
                                    perInventorySizes[invName] = perInventorySizes[invName] || {};
                                    perInventorySizes[invName][size] = (perInventorySizes[invName][size] || 0) + qty;
                                } else {
                            // fallback: decrement product.countInStock directly
                            const previousStock = Number(prod.countInStock || 0);
                            const newStock = Math.max(0, previousStock - qty);
                            prod.countInStock = newStock;
                            await prod.save();
                            console.log(`[Stock] Admin approved - Deducted ${qty} from Product ${prod.name}. New stock: ${newStock}`);
                            // adjust inventory doc if exists
                            try {
                                const inv = await Inventory.findOne({ productId: prod._id });
                                if (inv) {
                                    inv.quantity = newStock;
                                    await inv.save();
                                }
                            } catch (e) { console.warn('Failed to sync inventory fallback:', e && e.message); }
                        }
                    } catch (e) { console.warn('Skipping item during stock deduction grouping:', e && e.message); }
                }

                // Now perform atomic per-size allocations for each inventory group
                for (const [invName, sizesMap] of Object.entries(perInventorySizes)) {
                    try {
                        // Safety: avoid double-allocation. If there is already an allocation
                        // InventoryTransaction for this order, skip (idempotency guard).
                        const InventoryTransaction = require('../models/InventoryTransaction');
                        const existingAlloc = await InventoryTransaction.findOne({ orderId: order._id, type: 'allocate' });
                        if (existingAlloc) {
                            console.log(`[Stock] Allocation already recorded for order ${order._id}, skipping per-size allocation for ${invName}`);
                            continue;
                        }
                        // Attempt allocation by sizes using utils which performs atomic update checks
                                                // Resolve inventory document by name so we can pass inventoryId (more robust)
                                                let invDoc = null;
                                                try { invDoc = await findInventoryByName(invName); } catch (e) { invDoc = null; }
                                                const inventoryId = invDoc ? invDoc._id : null;
                                                // Better idempotency: check allocation specifically for this inventory if we have its id
                                                if (inventoryId) {
                                                    const InventoryTransaction = require('../models/InventoryTransaction');
                                                    const existingAllocForInv = await InventoryTransaction.findOne({ orderId: order._id, inventory: inventoryId, type: 'allocate' });
                                                    if (existingAllocForInv) {
                                                        console.log(`[Stock] Allocation already recorded for order ${order._id} and inventory ${inventoryId}, skipping`);
                                                        continue;
                                                    }
                                                }
                                                await allocateInventoryBySizes({ name: invName, inventoryId, sizesMap, orderId: order._id, adminId: req.user._id });
                                                // After allocation, sync linked Product.countInStock if inventory references a product
                                                try {
                                                        const invAfter = inventoryId ? await Inventory.findById(inventoryId) : await findInventoryByName(invName);
                                                        if (invAfter && invAfter.productId) {
                                                                const prod = await Product.findById(invAfter.productId);
                                                                if (prod) { prod.countInStock = Number(invAfter.quantity || 0); await prod.save(); }
                                                        }
                                                } catch (syncErr) { console.warn('Failed to sync product after sizes allocation:', syncErr && syncErr.message); }
                    } catch (allocErr) {
                        console.error('[Stock] Failed to allocate inventory by sizes for', invName, allocErr && allocErr.message);
                    }
                }
            } else {
                updates.isPaid = false;
                updates.paidAt = undefined;
            }
        }

        if (typeof req.body.status === 'string') {
            const allowedS = ['Processing', 'Accepted', 'Shipped', 'Delivered', 'Completed', 'Cancelled'];
            if (!allowedS.includes(req.body.status)) {
                return res.status(400).json({ success: false, msg: 'Invalid order status' });
            }
            updates.status = req.body.status;

            // If admin marks order as Accepted, record who accepted it (preparedBy)
            if (req.body.status === 'Accepted') {
                updates.acceptedBy = req.user._id;
                updates.acceptedByName = req.user.name || '';
            }
            
            // NEW: If admin cancels, log reason
            if (req.body.status === 'Cancelled') {
                updates.cancelledBy = 'admin';
                if(req.body.cancellationReason) {
                    updates.cancellationReason = req.body.cancellationReason;
                }
            }
        }

        if (typeof req.body.shippingService !== 'undefined') {
            updates.shippingService = req.body.shippingService;
        }
        if (typeof req.body.trackingCode !== 'undefined') {
            updates.trackingCode = req.body.trackingCode;
        }

        const updatedOrder = await Order.findByIdAndUpdate(id, updates, { new: true });
        if (!updatedOrder) {
            return res.status(404).json({ success: false, msg: 'Order not found' });
        }
        // If we recorded an acceptedBy and the order already has a stored receipt, update receipt's preparedBy info
        try {
            if (updates.acceptedBy && updatedOrder.receiptId) {
                const Receipt = require('../models/Receipt');
                await Receipt.findByIdAndUpdate(updatedOrder.receiptId, { preparedBy: updates.acceptedBy, preparedByName: req.user.name || '' }).exec();
            }
        } catch (e) {
            console.warn('[OrderStatus] Failed to update receipt preparedBy:', e && e.message);
        }
        res.status(200).json({ success: true, data: updatedOrder });
    } catch (error) {
        console.error('[Admin Update Order Status] Error:', error);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};
// --- END MODIFIED FUNCTION ---


// @desc    Create new order (no receipt) - checkout flow
// @route   POST /api/orders
// @access  Private
exports.createOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { itemIds, shippingAddress: rawShippingAddress, shippingMethod, paymentMethod, deliveryFee, comment } = req.body;

    const cart = await Cart.findOne({ user: userId }).populate('items.product');
    if (!cart || !cart.items || cart.items.length === 0) {
      return res.status(400).json({ success: false, msg: 'Your cart is empty.' });
    }

    let shippingAddress = {};
    try {
      shippingAddress = typeof rawShippingAddress === 'string' ? JSON.parse(rawShippingAddress) : (rawShippingAddress || {});
    } catch (e) {
      return res.status(400).json({ success: false, msg: 'Invalid shippingAddress format.' });
    }

    const requiredFields = ['street', 'province', 'city', 'zip', 'phone'];
    for (const f of requiredFields) {
      if (!shippingAddress[f]) {
        return res.status(400).json({ success: false, msg: `Missing required address field: ${f}` });
      }
    }
    
    let itemsToProcess;
    if (itemIds && Array.isArray(itemIds) && itemIds.length > 0) {
        itemsToProcess = cart.items.filter(item => itemIds.includes(item._id.toString()));
    } else {
        itemsToProcess = cart.items;
    }

    if (itemsToProcess.length === 0) {
      return res.status(400).json({ success: false, msg: 'No items selected for checkout.' });
    }

        // Server-side validation: if a product has per-size inventory, ensure a size was selected.
        for (const it of itemsToProcess) {
            if (!it.product) continue;
            try {
                const prod = it.product; // populated product
                const sizesInv = prod.sizesInventory || prod.sizesInventoryMap || prod.sizes || {};
                const hasPerSize = (sizesInv && typeof sizesInv === 'object' && Object.keys(sizesInv || {}).length > 0);
                if (hasPerSize && !it.size) {
                    return res.status(400).json({ success: false, msg: `Size selection required for product ${prod.name}` });
                }
            } catch (e) { /* ignore validation errors but continue */ }
        }

        const orderItems = itemsToProcess.map((it) => ({
            name: (it.product && it.product.name) ? it.product.name : 'Item',
            quantity: it.quantity || 0,
            imageUrl: (it.product && it.product.imageUrl) ? it.product.imageUrl : '',
            // Prefer the cart item's stored price (may be per-size); fallback to product base price
            price: (it.price != null && !isNaN(Number(it.price))) ? Number(it.price) : ((it.product && typeof it.product.price === 'number') ? it.product.price : 0),
            product: it.product ? it.product._id : null,
            size: it.size || null,
            color: it.color || null
        })).filter(i => i.product);

    if (orderItems.length === 0) {
      return res.status(400).json({ success: false, msg: 'No valid items to order.' });
    }

    const subtotal = orderItems.reduce((sum, it) => sum + (it.price * it.quantity), 0);
    const totalPrice = subtotal + (Number(deliveryFee) || 0);

    const order = await Order.create({
      user: userId,
      orderItems,
      shippingAddress,
      shippingMethod: shippingMethod === 'Pick-Up' ? 'Pick-Up' : 'Standard',
      deliveryFee: Number(deliveryFee) || 0,
      comment: comment || '',
      paymentMethod: paymentMethod === 'BankTransfer' ? 'BankTransfer' : 'GCash',
      paymentStatus: 'Pending',
      receiptUrl: undefined,
      status: 'Processing',
      totalPrice,
      isPaid: false
    });

    if (itemIds && Array.isArray(itemIds) && itemIds.length > 0) {
        cart.items = cart.items.filter(item => !itemIds.includes(item._id.toString()));
    } else {
        cart.items = [];
    }
    await cart.save();

    res.status(201).json({ success: true, data: order });
  } catch (error) {
    console.error('[Create Order] Error:', error);
    res.status(500).json({ success: false, msg: 'Server Error' });
  }
};

// @desc    Get order by id (owner or admin)
// @route   GET /api/orders/:id
// @access  Private
exports.getOrderById = async (req, res) => {
  try {
    const id = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, msg: 'Invalid order id' });
    }

    const order = await Order.findById(id).populate('user', 'name email');
    if (!order) return res.status(404).json({ success: false, msg: 'Order not found' });

    if (req.user.role !== 'admin' && order.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, msg: 'Not authorized to view this order' });
    }

    res.status(200).json({ success: true, data: order });
  } catch (error) {
    console.error('[Get Order By ID] Error:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({ success: false, msg: 'Order not found' });
    }
    res.status(500).json({ success: false, msg: 'Server Error' });
  }
};

// --- NEW FUNCTION ---
// @desc    User cancels an order
// @route   PUT /api/orders/:id/cancel
// @access  Private
exports.cancelOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        if (!reason) {
            return res.status(400).json({ success: false, msg: 'Cancellation reason is required.' });
        }

        const order = await Order.findById(id);

        if (!order) {
            return res.status(404).json({ success: false, msg: 'Order not found.' });
        }

        // Siguraduhin na ang user ang may-ari ng order
        if (order.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, msg: 'Not authorized to cancel this order.' });
        }

        // Logic kung kailan lang pwedeng i-cancel (e.g., 'To Pay' or 'To Ship' pa lang)
        if (order.status !== 'Processing' && order.paymentStatus !== 'Pending') {
             return res.status(400).json({ success: false, msg: 'Order cannot be cancelled at its current stage.' });
        }

        order.status = 'Cancelled';
        order.cancellationReason = reason;
        order.cancelledBy = 'user';
        
        await order.save();

        res.status(200).json({ success: true, data: order });

    } catch (error) {
        console.error('[Cancel Order] Error:', error);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

// --- NEW FUNCTION ---
// @desc    User marks order as received/completed
// @route   PUT /api/orders/:id/complete
// @access  Private
exports.completeOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const order = await Order.findById(id);
        if (!order) {
            return res.status(404).json({ success: false, msg: 'Order not found.' });
        }
        // ownership check (unless admin triggers later extension)
        if (req.user.role !== 'admin' && order.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, msg: 'Not authorized to complete this order.' });
        }
        // Only allow completion if shipped and payment received (delivered transition)
        if (order.status !== 'Shipped') {
            return res.status(400).json({ success: false, msg: 'Order cannot be marked as received yet.' });
        }
        if (order.paymentStatus !== 'Received') {
            return res.status(400).json({ success: false, msg: 'Payment must be confirmed before completing order.' });
        }
        // Mark as Completed to distinguish final customer-confirmed completion
        order.status = 'Completed';
        order.deliveredAt = new Date();
        await order.save();

        // Check and award loyalty voucher after order completion
        try {
            await checkAndAwardLoyaltyVoucher(order.user);
        } catch (loyaltyErr) {
            console.warn('[Complete Order] Loyalty check failed:', loyaltyErr.message || loyaltyErr);
    } catch (error) {
        console.error('[Complete Order] Error:', error);
        return res.status(500).json({ success: false, msg: 'Server Error' });
    }
};
