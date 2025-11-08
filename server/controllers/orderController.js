const Order = require('../models/Order');
const Cart = require('../models/Cart');
const mongoose = require('mongoose');

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
            query.status = 'Delivered';
        } else if (tab === 'Cancelled') {
            query.status = 'Cancelled';
        }
        // 'All' tab ay walang extra filter

        const orders = await Order.find(query).sort({ createdAt: -1 });
        res.status(200).json({ success: true, count: orders.length, data: orders });
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
        })).filter(i => i.product);

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
        const orders = await Order.find().populate('user', 'name email').sort({ createdAt: -1 });
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
        const updates = {};

        if (typeof req.body.paymentStatus === 'string') {
            const allowedPS = ['Pending', 'Received', 'Rejected'];
            if (!allowedPS.includes(req.body.paymentStatus)) {
                return res.status(400).json({ success: false, msg: 'Invalid paymentStatus' });
            }
            updates.paymentStatus = req.body.paymentStatus;
            if (req.body.paymentStatus === 'Received') {
                updates.isPaid = true;
                updates.paidAt = new Date();
            } else {
                updates.isPaid = false;
                updates.paidAt = undefined;
            }
        }

        if (typeof req.body.status === 'string') {
            const allowedS = ['Processing', 'Accepted', 'Shipped', 'Delivered', 'Cancelled'];
            if (!allowedS.includes(req.body.status)) {
                return res.status(400).json({ success: false, msg: 'Invalid order status' });
            }
            updates.status = req.body.status;
            
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

        const order = await Order.findByIdAndUpdate(id, updates, { new: true });
        if (!order) {
            return res.status(404).json({ success: false, msg: 'Order not found' });
        }
        res.status(200).json({ success: true, data: order });
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

    const orderItems = itemsToProcess.map((it) => ({
      name: (it.product && it.product.name) ? it.product.name : 'Item',
      quantity: it.quantity || 0,
      imageUrl: (it.product && it.product.imageUrl) ? it.product.imageUrl : '',
      price: (it.product && typeof it.product.price === 'number') ? it.product.price : 0,
      product: it.product ? it.product._id : null,
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
