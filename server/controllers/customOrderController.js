const CustomOrder = require("../models/CustomOrder");
const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");
const path = require("path");
const mongoose = require("mongoose"); // <-- Siguraduhin na na-import ito
const { allocateInventory, releaseInventory, findInventoryByName } = require('../utils/inventory');
const { allocateInventoryBySizes } = require('../utils/inventory');
const Inventory = require('../models/Inventory');

// Siguraduhin na ang SERVER_URL mo sa .env ay ang public URL mo (e.g., ngrok)
const BASE_URL =
  process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5000}`;

// @desc    Submit a new custom order
// @route   POST /api/custom-orders
// @access  Private
exports.submitCustomOrder = async (req, res) => {
  try {
    // Extract all fields from request body
    const { 
      serviceType,
      customType, 
      productName, 
      designDetails, 
      quantity, 
      notes,
      // Customize Jersey fields
      itemType,
      printingType,
      teamName,
      includeTeamMembers,
      teamMembers,
      includeShorts,
      shortsSameDesign,
      shortsDesignDetails,
      designStyle,
      primaryColor,
      secondaryColor,
      accentColor,
      textFont,
      textSize,
      textPlacement,
      customText,
      logoType,
      logoPlacement,
      // Layout Creation fields
      memberName,
      jerseyNumber,
      colorPalette,
      // Printing Only fields
      printingMethod,
      garmentSize
    } = req.body;
    
    const userId = req.user._id;

    // Guard: Maximum 3 active quotes per account (active = not Completed/Cancelled)
    try {
      const ACTIVE_LIMIT = 3;
      const activeCount = await CustomOrder.countDocuments({
        user: userId,
        status: { $nin: ['Completed', 'Cancelled'] }
      });
      if (activeCount >= ACTIVE_LIMIT) {
        return res.status(403).json({
          success: false,
          msg: 'You have reached the maximum of 3 active quotes. Please complete at least one existing order (status: Completed) or cancel a pending quote before submitting a new one.',
          activeCount,
          limit: ACTIVE_LIMIT
        });
      }
    } catch (e) {
      console.warn('[submitCustomOrder] Active-quote limit check failed:', e.message);
    }

    // Basic validation
    if (!quantity) {
      return res.status(400).json({
        success: false,
        msg: "Missing required field: quantity.",
      });
    }
    if (Number(quantity) <= 0) {
      return res
        .status(400)
        .json({ success: false, msg: "Quantity must be at least 1." });
    }

    // Initialize order data with common fields
    const orderData = {
      user: userId,
      serviceType: serviceType || 'customize-jersey',
      productName: productName || "Custom Jersey",
      customType: customType || 'Template',
      quantity: Number(quantity),
      notes: notes || "",
    };

    // Handle multiple file uploads
    if (req.files) {
      if (req.files.designFile && req.files.designFile[0]) {
        orderData.designFileUrl = `${BASE_URL}/uploads/custom-designs/${req.files.designFile[0].filename}`;
      }
      if (req.files.logoFile && req.files.logoFile[0]) {
        orderData.logoUrl = `${BASE_URL}/uploads/custom-designs/${req.files.logoFile[0].filename}`;
      }
      if (req.files.shortsDesignFile && req.files.shortsDesignFile[0]) {
        orderData.shortsDesignFileUrl = `${BASE_URL}/uploads/custom-designs/${req.files.shortsDesignFile[0].filename}`;
      }
      if (req.files.teamNamesFile && req.files.teamNamesFile[0]) {
        orderData.teamNamesFileUrl = `${BASE_URL}/uploads/custom-designs/${req.files.teamNamesFile[0].filename}`;
      }
    } else if (req.file) {
      // Backward compatibility for single file upload
      orderData.designFileUrl = `${BASE_URL}/uploads/custom-designs/${req.file.filename}`;
    }

    // Route based on serviceType
    switch(serviceType) {
      case 'customize-jersey':
        // Add item and printing type
        if (itemType) orderData.itemType = itemType;
        if (printingType) orderData.printingType = printingType;

        // Handle template customization fields
        if (customType === 'Template') {
          orderData.designDetails = designDetails || "Template customization";
          if (designStyle) orderData.designStyle = designStyle;
          if (primaryColor) orderData.primaryColor = primaryColor;
          if (secondaryColor) orderData.secondaryColor = secondaryColor;
          if (accentColor) orderData.accentColor = accentColor;
          if (textFont) orderData.textFont = textFont;
          if (textSize) orderData.textSize = textSize;
          if (textPlacement) orderData.textPlacement = textPlacement;
          if (customText) orderData.customText = customText;
          if (logoType) orderData.logoType = logoType;
          if (logoPlacement) orderData.logoPlacement = logoPlacement;
        } else if (customType === 'FileUpload') {
          // Validate design file for upload mode
          if (!orderData.designFileUrl) {
            return res.status(400).json({
              success: false,
              msg: "A design file is required for File Upload mode.",
            });
          }
          orderData.designDetails = designDetails || "Customer uploaded design";
        }

        // Handle team details
        if (teamName) orderData.teamName = teamName;
        if (includeTeamMembers === 'true' || includeTeamMembers === true) {
          orderData.includeTeamMembers = true;
          if (teamMembers) {
            try {
              orderData.teamMembers = typeof teamMembers === 'string' 
                ? JSON.parse(teamMembers) 
                : teamMembers;
            } catch (e) {
              console.error('Error parsing team members:', e);
            }
          }
        }

        // Handle shorts options
        if (includeShorts === 'true' || includeShorts === true) {
          orderData.includeShorts = true;
          orderData.shortsSameDesign = shortsSameDesign === 'true' || shortsSameDesign === true;
          if (shortsDesignDetails) orderData.shortsDesignDetails = shortsDesignDetails;
        }
        break;

      case 'layout-creation':
        // Require inspiration image for layout creation
        if (!orderData.designFileUrl) {
          return res.status(400).json({
            success: false,
            msg: "An inspiration image is required for Layout Creation service.",
          });
        }
        orderData.inspirationImageUrl = orderData.designFileUrl;
        orderData.designDetails = "Layout Creation Service";
        
        // Add layout-specific fields
        if (teamName) orderData.teamName = teamName;
        if (memberName) orderData.memberName = memberName;
        if (jerseyNumber) orderData.jerseyNumber = jerseyNumber;
        
        // Parse color palette
        if (colorPalette) {
          try {
            orderData.colorPalette = typeof colorPalette === 'string' 
              ? JSON.parse(colorPalette) 
              : colorPalette;
          } catch (e) {
            console.error('Error parsing color palette:', e);
          }
        }
        break;

      case 'printing-only':
        // Add printing method and garment size
        if (printingMethod) orderData.printingMethod = printingMethod;
        if (garmentSize) orderData.garmentSize = garmentSize;
        // Optional shared fields
        if (req.body.fabricType) orderData.fabricType = req.body.fabricType;
        if (req.body.garmentType) orderData.garmentType = req.body.garmentType;
        // Accept team members info for jersey printing
        if (req.body.includeTeamMembers === 'true' || req.body.includeTeamMembers === true) {
          orderData.includeTeamMembers = true;
          if (req.body.teamMembers) {
            try {
              orderData.teamMembers = typeof req.body.teamMembers === 'string' 
                ? JSON.parse(req.body.teamMembers) 
                : req.body.teamMembers;
            } catch (e) {
              console.error('Printing-only team members parse error:', e);
            }
          }
        }
        orderData.designDetails = `Printing Only - ${printingMethod || 'Method not specified'}`;
        
        // Validate file if upload-design method
        if (printingMethod === 'upload-design' && !orderData.designFileUrl) {
          return res.status(400).json({
            success: false,
            msg: "A design file is required for upload-design printing method.",
          });
        }
        break;

      default:
        // Default to customize-jersey behavior for backward compatibility
        if (customType === 'Template') {
          orderData.designDetails = designDetails || "No details provided.";
        } else if (customType === 'FileUpload' && !orderData.designFileUrl) {
          return res.status(400).json({
            success: false,
            msg: "A design file is required for File Upload mode.",
          });
        }
    }

    // Create the custom order
    const customOrder = await CustomOrder.create(orderData);

    res.status(201).json({
      success: true,
      data: customOrder,
      msg: "Your custom order request has been submitted! We will contact you with a quote.",
    });
  } catch (error) {
    console.error("Custom Order Submit Error:", error);
    console.error("Error details:", error.message);
    console.error("Order data:", orderData);
    
    // Send more detailed error for debugging
    res.status(500).json({ 
      success: false, 
      msg: "Server Error", 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// @desc    Get all custom orders (for Admin)
// @route   GET /api/custom-orders/admin
// @access  Private/Admin
exports.getAdminCustomOrders = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) {
      filter.status = status;
    }

    const orders = await CustomOrder.find(filter)
      .populate("user", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: orders });
  } catch (error) {
    console.error("Get Admin Custom Orders Error:", error);
    res.status(500).json({ success: false, msg: "Server Error" });
  }
};

// --- FIX PARA SA updateCustomOrderQuote ---
// @desc    Admin updates a custom order quote (price/status)
// @route   PUT /api/custom-orders/:id/quote
// @access  Private/Admin
exports.updateCustomOrderQuote = async (req, res) => {
  try {
    const { price, notes } = req.body;

    if (!price || Number(price) <= 0) {
      return res.status(400).json({
        // <-- Inayos ang syntax error
        success: false,
        msg: "A valid price is required.", // <-- Inayos ang error message
      });
    }

    // --- Idinagdag ang nawawalang 'order' ---
    const order = await CustomOrder.findById(req.params.id);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, msg: "Custom order not found." });
    }
    // --- End ng fix ---

    order.price = Number(price);
    if (typeof notes === 'string') {
      order.adminNotes = notes;
    }
    order.status = "Quote Sent";

    const updatedOrder = await order.save(); // <-- Inayos ang variable name

    // Notify customer: Quote ready with price
    try {
      const populated = await updatedOrder.populate('user', 'name email');
      const profileUrl = `${BASE_URL}/client/my-quotes.html`;
      const code = populated._id.toString().slice(-8).toUpperCase();
      await sendEmail({
        email: populated.user?.email,
        subject: `Your Quote Is Ready – Ref ${code}`,
        message: `
          <div style=\"font-family:Inter,Segoe UI,Arial,sans-serif;font-size:14px;color:#111\">
            <p>Hi ${populated.user?.name || 'there'},</p>
            <p>Your quote <strong>${code}</strong> is now ready.</p>
            <p>Please review the details and proceed with your payment to continue.</p>
            <p><a href=\"${profileUrl}\" style=\"color:#4f46e5\">Review and Pay</a></p>
            <p style=\"color:#6b7280\">Fundamental Apparel</p>
          </div>
        `
      });
    } catch (e) {
      console.error('Email (Quote Ready) failed:', e.message);
    }

    res.status(200).json({ success: true, data: updatedOrder });
  } catch (error) {
    console.error("Update Quote Error:", error);
    res.status(500).json({ success: false, msg: "Server Error" });
  }
};
// --- END NG FIX ---

// @desc    Get logged in user's custom orders
// @route   GET /api/custom-orders/my-custom-orders
// @access  Private
exports.getMyCustomOrders = async (req, res) => {
  try {
    const orders = await CustomOrder.find({ user: req.user._id }).sort({
      createdAt: -1,
    });
    res.status(200).json({ success: true, data: orders });
  } catch (error) {
    console.error("Get My Custom Orders Error:", error);
    res.status(500).json({ success: false, msg: "Server Error" });
  }
};

// @desc    Get single custom order by ID
// @route   GET /api/custom-orders/:id
// @access  Private
exports.getSingleCustomOrder = async (req, res) => {
  try {
    const order = await CustomOrder.findById(req.params.id);
    
    if (!order) {
      return res.status(404).json({ success: false, msg: 'Order not found' });
    }
    
    // Check if user owns this order or is admin
    if (order.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, msg: 'Not authorized to view this order' });
    }
    
    res.status(200).json({ success: true, data: order });
  } catch (error) {
    console.error("Get Single Order Error:", error);
    res.status(500).json({ success: false, msg: "Server Error" });
  }
};

// @desc    Customer accepts the quote to proceed
// @route   PUT /api/custom-orders/:id/accept
// @access  Private
exports.acceptCustomOrderQuote = async (req, res) => {
  try {
    const order = await CustomOrder.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, msg: 'Custom order not found.' });
    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, msg: 'Not authorized for this order.' });
    }
    if (order.status !== 'Quote Sent') {
      return res.status(400).json({ success: false, msg: 'Quote is not awaiting acceptance.' });
    }
    order.status = 'Pending Downpayment';
    await order.save();

    // Notify customer (optional) that acceptance is recorded
    try {
      const populated = await order.populate('user', 'name email');
      const code = populated._id.toString().slice(-8).toUpperCase();
      await sendEmail({
        email: populated.user?.email,
        subject: `Quote Accepted – Ref ${code}`,
        message: `
          <div style=\"font-family:Inter,Segoe UI,Arial,sans-serif;font-size:14px;color:#111\">
            <p>Thanks! You accepted the quote <strong>${code}</strong>.</p>
            <p>You can now submit your 50% downpayment or pay in full from your account page.</p>
            <p style=\"color:#6b7280\">Fundamental Apparel</p>
          </div>
        `
      });
    } catch(e){
      console.error('Email (Quote Accepted) failed:', e.message);
    }

    res.json({ success: true, data: order, msg: 'Quote accepted. You may proceed to payment.' });
  } catch (error) {
    console.error('Accept Quote Error:', error);
    res.status(500).json({ success: false, msg: 'Server Error' });
  }
};

// --- FIX PARA SA submitDownPayment ---
// Pinalitan ang pangalan ng function para tumugma sa Phase 3
exports.submitDownPayment = async (req, res) => {
  try {
    const orderId = req.params.id;

    if (!req.file) {
      return res
        .status(400)
        .json({
          success: false,
          msg: "Down payment receipt image is required.",
        });
    }
    const order = await CustomOrder.findById(orderId);

    if (!order) {
      return res.status(404).json({ success: false, msg: "Order not found." });
    }
    // Inayos ang 'Not authorized' message
    if (order.user.toString() !== req.user._id.toString()) {
      return res
        .status(403)
        .json({ success: false, msg: "Not authorized for this order." });
    }

    // Inayos ang logic at error message
    if (order.status !== "Quote Sent" && order.status !== "Pending Downpayment") {
      return res
        .status(400)
        .json({
          success: false,
          msg: "This order is not awaiting down payment.",
        });
    }

    // Store receipt URL and payment details
    const receiptUrl = `${BASE_URL}/uploads/custom-designs/${req.file.filename}`;
    order.downPaymentReceiptUrl = receiptUrl; // Keep for backward compatibility
    order.receiptUrl = receiptUrl; // New unified field
    order.paymentAmount = (order.price || order.totalPrice || 0) * 0.5; // 50% downpayment
    order.paymentType = 'downpayment';
    order.paymentMethod = 'manual'; // Manual receipt upload
    order.status = "Pending Downpayment"; // Admin must now verify
    await order.save();
    
    // Notify customer: Downpayment receipt uploaded
    try {
      const populated = await order.populate('user', 'name email');
      const code = populated._id.toString().slice(-8).toUpperCase();
      await sendEmail({
        email: populated.user?.email,
        subject: `Downpayment Submitted – Ref ${code}`,
        message: `
          <div style=\"font-family:Inter,Segoe UI,Arial,sans-serif;font-size:14px;color:#111\">
            <p>Thanks! We received your 50% downpayment receipt for <strong>${code}</strong>.</p>
            <p>We’ll verify it shortly and start production. You’ll be notified once verified.</p>
            <p style=\"color:#6b7280\">Fundamental Apparel</p>
          </div>
        `
      });
    } catch (e) {
      console.error('Email (Downpayment Submitted) failed:', e.message);
    }
    res
      .status(200)
      .json({
        success: true,
        data: order,
        msg: "Down payment receipt submitted! Please wait for admin verification.",
      });
  } catch (error) {
    console.error("Submit Down Payment Error:", error);
    res.status(500).json({ success: false, msg: "Server Error" });
  }
};
// --- END NG FIX ---

// @desc    Admin verifies down payment and starts production
// @route   PUT /api/custom-orders/:id/verify-downpayment
// @access  Private/Admin
exports.verifyDownPayment = async (req, res) => {
  try {
    const order = await CustomOrder.findById(req.params.id);

    if (!order) {
      return res
        .status(404)
        .json({ success: false, msg: "Custom order not found." });
    } // Check kung 'Pending Downpayment' nga ang status

    if (order.status !== "Pending Downpayment") {
      return res
        .status(400)
        .json({
          success: false,
          msg: "This order is not awaiting down payment verification.",
        });
    }
    
    // Check if this was a 100% full payment (both downpayment and balance paid)
    const isFullPayment = order.balancePaid === true || order.paymentType === 'full';
    
    if (isFullPayment) {
      // 100% payment - go directly to Ready for Pickup/Delivery
      // allocate inventory for printing-only orders or by sizes for Pre-Design style orders
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        // attempt per-size allocation first if applicable
        const extractSizesMap = (ord) => {
          const map = {};
          if (Array.isArray(ord.teamMembers) && ord.teamMembers.length) {
            for (const m of ord.teamMembers) {
              const s = (m.size || m.sizeLabel || '').toString();
              if (!s) continue;
              map[s] = (map[s] || 0) + 1;
            }
          } else if (ord.quotePayload && Array.isArray(ord.quotePayload.teamEntries) && ord.quotePayload.teamEntries.length) {
            for (const e of ord.quotePayload.teamEntries) {
              const s = (e.size || e.sizeLabel || '').toString();
              const qty = Number(e.qty || e.quantity || 1) || 1;
              if (!s) continue;
              map[s] = (map[s] || 0) + qty;
            }
          }
          Object.keys(map).forEach(k => { if (!(map[k] > 0)) delete map[k]; });
          return Object.keys(map).length ? map : null;
        };

        const sizesMap = extractSizesMap(order);
        if (sizesMap) {
          const invName = order.productName || order.garmentType || order.fabricType || null;
          if (!invName) throw new Error('Cannot determine inventory name for per-size allocation');
          // Try to resolve Inventory doc first so we can pass inventoryId (more robust than name-only)
          const invDoc = await findInventoryByName(invName, session);
          const inventoryId = invDoc ? invDoc._id : null;
          await allocateInventoryBySizes({ name: invName, inventoryId, sizesMap, orderId: order._id, adminId: req.user._id, session, note: 'Allocate by sizes for pre-design full payment' });
          // Sync linked product
          try {
            const invAfter = invDoc ? await Inventory.findById(invDoc._id).session(session) : await findInventoryByName(invName, session);
            if (invAfter && invAfter.productId) {
              const Product = require('../models/Product');
              const prod = await Product.findById(invAfter.productId).session(session);
              if (prod) { prod.countInStock = Number(invAfter.quantity || 0); await prod.save({ session }); }
            }
          } catch (syncErr) { console.warn('Failed to sync product after sizes allocation:', syncErr && syncErr.message); }
          order.inventoryAllocated = true;
          order.allocatedItems = [{ inventoryId: null, name: invName, qty: Object.values(sizesMap).reduce((a,b)=>a+b,0) }];
        } else {
          if (order.serviceType === 'printing-only' && order.fabricType && !order.inventoryAllocated) {
            const invDoc = await allocateInventory({ name: order.fabricType, qty: order.quantity, orderId: order._id, adminId: req.user._id, session });
            order.inventoryAllocated = true;
            order.allocatedItems = [{ inventoryId: invDoc._id, name: invDoc.name, qty: order.quantity }];
            try {
              if (invDoc.productId) {
                const Product = require('../models/Product');
                const prod = await Product.findById(invDoc.productId).session(session);
                if (prod) { prod.countInStock = Number(invDoc.quantity || 0); await prod.save({ session }); }
              }
            } catch (syncErr) { console.warn('Sync product after allocation failed:', syncErr && syncErr.message); }
          }
        }
      
      // Auto-set fulfillment method based on checkout selection
      if (order.shippingMethod === 'Pick-Up') {
        order.fulfillmentMethod = 'pickup';
      } else if (order.shippingAddress || order.deliveryAddress) {
        order.fulfillmentMethod = 'delivery';
        // Use shippingAddress from checkout if available, otherwise use deliveryAddress
        if (order.shippingAddress && !order.deliveryAddress) {
          const addr = order.shippingAddress;
          order.deliveryAddress = `${addr.street || ''}${addr.building ? ', ' + addr.building : ''}, ${addr.city || ''}, ${addr.province || ''} ${addr.zip || ''}`;
        }
      } else {
        // Fallback: default to delivery if no method specified
        order.fulfillmentMethod = 'delivery';
      }
      
        const updatedOrder = await order.save({ session });
        await session.commitTransaction();
        session.endSession();
      
      // Notify customer: Full payment verified, ready for fulfillment
      try {
        const populated = await updatedOrder.populate('user', 'name email');
        const code = populated._id.toString().slice(-8).toUpperCase();
        const profileUrl = `${BASE_URL}/client/my-quotes.html`;
        
        let fulfillmentMsg = '';
        if (order.fulfillmentMethod === 'pickup') {
          fulfillmentMsg = '<p>Your order is ready for <strong>pickup</strong> at our store.</p>';
        } else {
          fulfillmentMsg = '<p>Your order is being prepared for <strong>delivery</strong> to your address.</p>';
        }
        
        await sendEmail({
          email: populated.user?.email,
          subject: `Payment Verified \u2013 Order Ready (Ref ${code})`,
          message: `
            <div style=\"font-family:Inter,Segoe UI,Arial,sans-serif;font-size:14px;color:#111\">
              <p>Excellent! Your full payment for order <strong>${code}</strong> is verified.</p>
              ${fulfillmentMsg}
              <p>Track your order: <a href=\"${profileUrl}\" style=\"color:#4f46e5\">View Order</a></p>
              <p style=\"color:#6b7280\">Fundamental Apparel</p>
            </div>
          `
        });
      } catch (e) {
        console.error('Email (Full Payment Verified) failed:', e.message);
      }
      return res.status(200).json({ success: true, data: updatedOrder, msg: 'Full payment verified. Order ready for fulfillment!' });
      } catch (allocErr) {
        await session.abortTransaction();
        session.endSession();
        console.error('Inventory allocation failed during full payment verify:', allocErr.message);
        return res.status(400).json({ success: false, msg: 'Inventory allocation failed: ' + allocErr.message });
      }
    }
    
    // Regular 50% downpayment flow
    // allocate inventory for printing-only orders on downpayment verification
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      // If this custom order contains per-size quantities (teamMembers or quotePayload.teamEntries),
      // attempt to allocate by sizes atomically to prevent oversell.
      const extractSizesMap = (ord) => {
        const map = {};
        if (Array.isArray(ord.teamMembers) && ord.teamMembers.length) {
          for (const m of ord.teamMembers) {
            const s = (m.size || m.sizeLabel || '').toString();
            if (!s) continue;
            map[s] = (map[s] || 0) + 1;
          }
        } else if (ord.quotePayload && Array.isArray(ord.quotePayload.teamEntries) && ord.quotePayload.teamEntries.length) {
          for (const e of ord.quotePayload.teamEntries) {
            const s = (e.size || e.sizeLabel || '').toString();
            const qty = Number(e.qty || e.quantity || 1) || 1;
            if (!s) continue;
            map[s] = (map[s] || 0) + qty;
          }
        }
        // filter zeros
        Object.keys(map).forEach(k => { if (!(map[k] > 0)) delete map[k]; });
        return Object.keys(map).length ? map : null;
      };

      const sizesMap = extractSizesMap(order);
      if (sizesMap) {
        // Prefer mapping inventory by product name; fall back to garmentType or fabricType
        const invName = order.productName || order.garmentType || order.fabricType || null;
        if (!invName) throw new Error('Cannot determine inventory name for per-size allocation');
        const invDoc = await findInventoryByName(invName, session);
        const inventoryId = invDoc ? invDoc._id : null;
        await allocateInventoryBySizes({ name: invName, inventoryId, sizesMap, orderId: order._id, adminId: req.user._id, session, note: 'Allocate for pre-design custom order on downpayment verification' });

        // Sync linked Product.countInStock when Inventory references a productId
        try {
          const invAfter = invDoc ? await Inventory.findById(invDoc._id).session(session) : await findInventoryByName(invName, session);
          if (invAfter && invAfter.productId) {
            const Product = require('../models/Product');
            const prod = await Product.findById(invAfter.productId).session(session);
            if (prod) {
              prod.countInStock = Number(invAfter.quantity || 0);
              await prod.save({ session });
            }
          }
        } catch (syncErr) {
          console.warn('Failed to sync product countInStock after sizes allocation:', syncErr && syncErr.message);
        }
        // mark inventory allocated for this order
        order.inventoryAllocated = true;
        order.allocatedItems = [{ inventoryId: null, name: invName, qty: Object.values(sizesMap).reduce((a,b)=>a+b,0) }];
      } else {
        if (order.serviceType === 'printing-only' && order.fabricType && !order.inventoryAllocated) {
          const invDoc = await allocateInventory({ name: order.fabricType, qty: order.quantity, orderId: order._id, adminId: req.user._id, session });
          order.inventoryAllocated = true;
          order.allocatedItems = [{ inventoryId: invDoc._id, name: invDoc.name, qty: order.quantity }];
          // sync product count
          try {
            if (invDoc.productId) {
              const Product = require('../models/Product');
              const prod = await Product.findById(invDoc.productId).session(session);
              if (prod) { prod.countInStock = Number(invDoc.quantity || 0); await prod.save({ session }); }
            }
          } catch (syncErr) { console.warn('Sync product after allocation failed:', syncErr && syncErr.message); }
        }
      }

      // Update the order
      order.status = "In Production";
      order.downPaymentPaid = true;
      const updatedOrder = await order.save({ session });
      await session.commitTransaction();
      session.endSession();

      // Notify customer: Downpayment verified, now In Production
    try {
      const populated = await updatedOrder.populate('user', 'name email');
      const code = populated._id.toString().slice(-8).toUpperCase();
      await sendEmail({
        email: populated.user?.email,
        subject: `Downpayment Verified – Ref ${code}`,
        message: `
          <div style=\"font-family:Inter,Segoe UI,Arial,sans-serif;font-size:14px;color:#111\">
            <p>Great news! Your downpayment for <strong>${code}</strong> is verified.</p>
            <p>Your order is now <strong>In Production</strong>. We’ll notify you when the final balance is due.</p>
            <p style=\"color:#6b7280\">Fundamental Apparel</p>
          </div>
        `
      });
    } catch (e) {
        console.error('Email (Downpayment Verified) failed:', e.message);
      }

      return res.status(200).json({ success: true, data: updatedOrder });

    } catch (transactionError) {
      
      await session.abortTransaction();
      session.endSession();
      console.error("Verify Downpayment Transaction Error:", transactionError);
      return res.status(400).json({ success: false, msg: "Failed to verify downpayment: " + transactionError.message });
    }
  
    
  } catch (error) {
    console.error("Verify Down Payment Error:", error);
    res.status(500).json({ success: false, msg: "Server Error" });
  }
};

// @desc    Admin marks order as finished, requests final balance
// @route   PUT /api/custom-orders/:id/request-final-payment
// @access  Private/Admin

exports.requestFinalPayment = async (req, res) => {
  try {
    const order = await CustomOrder.findById(req.params.id);

    if (!order) {
      return res
        .status(404)
        .json({ success: false, msg: "Custom order not found." });
    } // Tiyakin na "In Production" ang status bago mag-request

    if (order.status !== "In Production") {
      return res
        .status(400)
        .json({
          success: false,
          msg: "This order is not currently in production.",
        });
    } // Update the order
    order.status = "Pending Balance";
    const updatedOrder = await order.save();

    // Notify customer: Final payment requested
    try {
      const populated = await updatedOrder.populate('user', 'name email');
      const profileUrl = `${BASE_URL}/client/my-quotes.html`;
      const code = populated._id.toString().slice(-8).toUpperCase();
      await sendEmail({
        email: populated.user?.email,
        subject: `Final Payment Requested – Ref ${code}`,
        message: `
          <div style=\"font-family:Inter,Segoe UI,Arial,sans-serif;font-size:14px;color:#111\">
            <p>Your order <strong>${code}</strong> is finished. Please pay your remaining balance to proceed.</p>
            <p><a href=\"${profileUrl}\" style=\"color:#4f46e5\">Pay Final Payment</a></p>
            <p style=\"color:#6b7280\">Fundamental Apparel</p>
          </div>
        `
      });
    } catch (e) {
      console.error('Email (Request Final Payment) failed:', e.message);
    }
    res.status(200).json({ success: true, data: updatedOrder });
  } catch (error) {
    console.error("Request Final Payment Error:", error);
    res.status(500).json({ success: false, msg: "Server Error" });
  }
};

exports.submitFinalPayment = async (req, res) => {
  try {
        const orderId = req.params.id;

        if (!req.file) {
            return res.status(400).json({ success: false, msg: 'Final payment receipt image is required.' });
        }

        const order = await CustomOrder.findById(orderId);

        if (!order) {
            return res.status(404).json({ success: false, msg: 'Order not found.' });
        }
        
        // Check ownership
        if (order.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, msg: 'Not authorized for this order.' });
        }
        
        // Check status: allow full payment right after quote or when final balance is requested
        if (order.status !== 'Pending Balance' && order.status !== 'Quote Sent') {
          return res.status(400).json({ success: false, msg: 'This order is not ready for final payment.' });
        }

        // Store receipt URL and payment details
        const receiptUrl = `${BASE_URL}/uploads/custom-designs/${req.file.filename}`;
        order.finalPaymentReceiptUrl = receiptUrl; // Keep for backward compatibility
        order.receiptUrl = receiptUrl; // New unified field (overwrites downpayment receipt if this is final payment)
        
        // Calculate payment amount based on whether downpayment was already made
        if (order.downPaymentPaid) {
          // This is the remaining 50%
          order.paymentAmount = (order.price || order.totalPrice || 0) * 0.5;
          order.paymentType = 'remaining';
        } else {
          // This is full 100% payment
          order.paymentAmount = order.price || order.totalPrice || 0;
          order.paymentType = 'full';
        }
        
        order.paymentMethod = 'manual'; // Manual receipt upload
        order.status = 'Pending Final Verification'; // Admin must now verify
        
        await order.save();

        // Notify customer: Final payment submitted
        try {
          const populated = await order.populate('user', 'name email');
          const profileUrl = `${BASE_URL}/client/my-quotes.html`;
          const code = populated._id.toString().slice(-8).toUpperCase();
          await sendEmail({
            email: populated.user?.email,
            subject: `Final Payment Submitted – Ref ${code}`,
            message: `
              <div style=\"font-family:Inter,Segoe UI,Arial,sans-serif;font-size:14px;color:#111\"> 
                <p>We received your final payment receipt for order <strong>${code}</strong>. Our team will verify it shortly.</p>
                <p>You can check the latest status here: <a href=\"${profileUrl}\" style=\"color:#4f46e5\">View My Quotes/Orders</a></p>
                <p style=\"color:#6b7280\">Fundamental Apparel</p>
              </div>
            `
          });
        } catch (e) {
          console.error('Email (Final Payment Submitted) failed:', e.message);
        }

        res.status(200).json({ success: true, data: order, msg: 'Final payment receipt submitted! Please wait for admin verification.' });

    } catch (error) {
        console.error('Submit Final Payment Error:', error);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

// @desc    Admin verifies final payment and completes order
// @route   PUT /api/custom-orders/:id/verify-final-payment
// @access  Private/Admin
exports.verifyFinalPayment = async (req, res) => {
    try {
        const order = await CustomOrder.findById(req.params.id);

        if (!order) {
            return res.status(404).json({ success: false, msg: 'Custom order not found.' });
        }

        // Tiyakin na "Pending Final Verification" ang status
        if (order.status !== 'Pending Final Verification') {
            return res.status(400).json({ success: false, msg: 'This order is not awaiting final payment verification.' });
        }
        
        // allocate inventory for printing-only orders if not already allocated
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
          if (order.serviceType === 'printing-only' && order.fabricType && !order.inventoryAllocated) {
            const invDoc = await allocateInventory({ name: order.fabricType, qty: order.quantity, orderId: order._id, adminId: req.user._id, session });
            order.inventoryAllocated = true;
            order.allocatedItems = [{ inventoryId: invDoc._id, name: invDoc.name, qty: order.quantity }];
          }

          // Update the order - go directly to Ready for Pickup/Delivery
          order.status = 'Ready for Pickup/Delivery';
          order.balancePaid = true;
          
          // Auto-set fulfillment method based on checkout selection
          if (order.shippingMethod === 'Pick-Up') {
            order.fulfillmentMethod = 'pickup';
          } else if (order.shippingAddress || order.deliveryAddress) {
            order.fulfillmentMethod = 'delivery';
          // Use shippingAddress from checkout if available, otherwise use deliveryAddress
          if (order.shippingAddress && !order.deliveryAddress) {
            const addr = order.shippingAddress;
            // Format complete address with all fields
            const parts = [];
            if (addr.block) parts.push(`Block ${addr.block}`);
            if (addr.lot) parts.push(`Lot ${addr.lot}`);
            if (addr.street) parts.push(addr.street);
            if (addr.building) parts.push(addr.building);
            if (addr.city) parts.push(addr.city);
            if (addr.province) parts.push(addr.province);
            if (addr.zip) parts.push(addr.zip);
            if (addr.phone) parts.push(`Tel: ${addr.phone}`);
            order.deliveryAddress = parts.join(', ');
          }
        } else {
          // Fallback: default to delivery if no method specified
          order.fulfillmentMethod = 'delivery';
        }
        
          const updatedOrder = await order.save({ session });
          await session.commitTransaction();
          session.endSession();

        // Notify customer: Final payment verified and ready for fulfillment
        try {
          const populated = await updatedOrder.populate('user', 'name email');
          const profileUrl = `${BASE_URL}/client/my-quotes.html`;
          const code = populated._id.toString().slice(-8).toUpperCase();
          
          let fulfillmentMsg = '';
          if (order.fulfillmentMethod === 'pickup') {
            fulfillmentMsg = '<p>Your order is ready for <strong>pickup</strong> at our store.</p>';
          } else {
            fulfillmentMsg = '<p>Your order is being prepared for <strong>delivery</strong> to your address.</p>';
          }
          
          await sendEmail({
            email: populated.user?.email,
            subject: `Payment Verified – Order Ready (Ref ${code})`,
            message: `
              <div style=\"font-family:Inter,Segoe UI,Arial,sans-serif;font-size:14px;color:#111\">
                <p>Your final payment for order <strong>${code}</strong> is verified!</p>
                ${fulfillmentMsg}
                <p>Track your order status: <a href=\"${profileUrl}\" style=\"color:#4f46e5\">View Order</a></p>
                <p style=\"color:#6b7280\">Fundamental Apparel</p>
              </div>
            `
          });
        } catch (e) {
          console.error('Email (Final Payment Verified) failed:', e.message);
        }

        res.status(200).json({ success: true, data: updatedOrder });

        } catch (allocErr) {
          await session.abortTransaction();
          session.endSession();
          console.error('Inventory allocation failed during final payment verify:', allocErr.message);
          return res.status(400).json({ success: false, msg: 'Inventory allocation failed: ' + allocErr.message });
        }

    } catch (error) {
        console.error('Verify Final Payment Error:', error);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};

// @desc    Customer chooses fulfillment method (pickup or delivery)
// @route   PUT /api/custom-orders/:id/fulfillment
// @access  Private
exports.setFulfillmentMethod = async (req, res) => {
  try {
    const { fulfillmentMethod, deliveryAddress } = req.body;
    const order = await CustomOrder.findById(req.params.id);

    if (!order) {
      return res
        .status(404)
        .json({ success: false, msg: "Custom order not found" });
    }

    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, msg: "Not authorized" });
    }

    if (order.status !== "Completed") {
      return res
        .status(400)
        .json({ success: false, msg: "Order must be completed first" });
    }

    if (
      !fulfillmentMethod ||
      !["pickup", "delivery"].includes(fulfillmentMethod)
    ) {
      return res
        .status(400)
        .json({ success: false, msg: "Invalid fulfillment method" });
    }

    if (fulfillmentMethod === "delivery" && !deliveryAddress) {
      return res
        .status(400)
        .json({ success: false, msg: "Delivery address is required" });
    }

    order.fulfillmentMethod = fulfillmentMethod;
    if (fulfillmentMethod === "delivery") {
      order.deliveryAddress = deliveryAddress;
    }
    order.status = "Ready for Pickup/Delivery";
    await order.save();

    // Notify customer: Fulfillment method set
    try {
      const populated = await order.populate('user', 'name email');
      const code = populated._id.toString().slice(-8).toUpperCase();
      const friendly = fulfillmentMethod === 'delivery' ? 'Delivery' : 'Pickup';
      await sendEmail({
        email: populated.user?.email,
        subject: `Fulfillment Selected – ${friendly} (Ref ${code})`,
        message: `
          <div style=\"font-family:Inter,Segoe UI,Arial,sans-serif;font-size:14px;color:#111\">
            <p>You selected <strong>${friendly}</strong> for order <strong>${code}</strong>. We will send the details shortly.</p>
            <p style=\"color:#6b7280\">Fundamental Apparel</p>
          </div>
        `
      });
    } catch (e) {
      console.error('Email (Fulfillment Set) failed:', e.message);
    }

    res.json({
      success: true,
      msg: `Fulfillment method set to ${fulfillmentMethod}`,
      data: order,
    });
  } catch (err) {
    console.error("setFulfillmentMethod error:", err);
    res.status(500).json({ success: false, msg: "Server error" });
  }
};

// @desc    Customer confirms receipt of order (marks as completed)
// @route   PUT /api/custom-orders/:id/confirm-receipt
// @access  Private (Customer only)
exports.confirmReceipt = async (req, res) => {
  try {
    const order = await CustomOrder.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, msg: 'Custom order not found' });
    }

    // Check if user owns this order
    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, msg: 'Not authorized' });
    }

    // Check if order is ready for receipt confirmation
    if (order.status !== 'Ready for Pickup/Delivery' && order.status !== 'Out for Delivery') {
      return res.status(400).json({ 
        success: false, 
        msg: 'Order must be ready for pickup/delivery or out for delivery to confirm receipt' 
      });
    }

    // Mark as completed
    order.status = 'Completed';
    order.completedAt = new Date();
    await order.save();

    // Optional: Notify admin that customer confirmed receipt
    try {
      const populated = await order.populate('user', 'name email');
      const code = populated._id.toString().slice(-8).toUpperCase();
      // You can add admin email notification here if needed
      console.log(`[Order ${code}] Customer confirmed receipt - marked as Completed`);
    } catch (e) {
      console.error('Logging failed:', e.message);
    }

    res.json({
      success: true,
      msg: 'Order marked as completed. Thank you!',
      data: order
    });
  } catch (err) {
    console.error('confirmReceipt error:', err);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
};

// @desc    Customer cancels a quote
// @route   PUT /api/custom-orders/:id/cancel
// @access  Private/Customer
exports.cancelQuote = async (req, res) => {
  try {
    const order = await CustomOrder.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, msg: 'Custom order not found' });
    }

    // Check if user owns this order
    if (order.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, msg: 'Not authorized' });
    }

    // Only allow cancellation for Quote Sent and Pending Downpayment (before payment)
    if (order.status !== 'Quote Sent' && !(order.status === 'Pending Downpayment' && !order.downPaymentPaid)) {
      return res.status(400).json({ 
        success: false, 
        msg: 'Cannot cancel order at this stage' 
      });
    }

    order.status = 'Cancelled';
    order.cancelledAt = new Date();
    order.cancelledBy = 'customer';
    await order.save();

    res.json({
      success: true,
      msg: 'Quote cancelled successfully',
      data: order
    });
  } catch (err) {
    console.error('cancelQuote error:', err);
    res.status(500).json({ success: false, msg: 'Server error' });
  }
};

// @desc    Admin adds fulfillment details (tracking number or pickup date)
// @route   PUT /api/custom-orders/:id/fulfillment-details
// @access  Private/Admin
exports.updateFulfillmentDetails = async (req, res) => {
  try {
    const { trackingNumber, estimatedDeliveryDate, pickupDate, pickupLocation, courier } =
      req.body;
    const order = await CustomOrder.findById(req.params.id);

    if (!order) {
      return res
        .status(404)
        .json({ success: false, msg: "Custom order not found" });
    }

    if (order.status !== "Ready for Pickup/Delivery") {
      return res
        .status(400)
        .json({ success: false, msg: "Order is not ready for fulfillment" });
    }

    if (order.fulfillmentMethod === "delivery") {
      if (trackingNumber) order.trackingNumber = trackingNumber;
      if (courier) order.courier = courier;
      if (estimatedDeliveryDate)
        order.estimatedDeliveryDate = estimatedDeliveryDate;
      // Change status to "Out for Delivery" when admin submits tracking details
      order.status = "Out for Delivery";
    } else if (order.fulfillmentMethod === "pickup") {
      if (pickupDate) order.pickupDate = pickupDate;
      if (pickupLocation) order.pickupLocation = pickupLocation;
      // For pickup, keep status as "Ready for Pickup/Delivery"
    }

    await order.save();

    // Notify customer: Fulfillment details provided
    try {
      const populated = await order.populate('user', 'name email');
      const code = populated._id.toString().slice(-8).toUpperCase();
      let body = '';
      if (order.fulfillmentMethod === 'delivery') {
        body = `
          <p>Your order <strong>${code}</strong> is on its way.</p>
          ${order.trackingNumber ? `<p><strong>Tracking #:</strong> ${order.trackingNumber}</p>` : ''}
          ${order.estimatedDeliveryDate ? `<p><strong>ETA:</strong> ${order.estimatedDeliveryDate}</p>` : ''}
        `;
      } else {
        body = `
          <p>Your order <strong>${code}</strong> is ready for pickup.</p>
          ${order.pickupDate ? `<p><strong>Pickup Date:</strong> ${order.pickupDate}</p>` : ''}
          ${order.pickupLocation ? `<p><strong>Location:</strong> ${order.pickupLocation}</p>` : ''}
        `;
      }
      await sendEmail({
        email: populated.user?.email,
        subject: `Fulfillment Details – Ref ${code}`,
        message: `
          <div style=\"font-family:Inter,Segoe UI,Arial,sans-serif;font-size:14px;color:#111\">
            ${body}
            <p style=\"color:#6b7280\">Fundamental Apparel</p>
          </div>
        `
      });
    } catch (e) {
      console.error('Email (Fulfillment Details) failed:', e.message);
    }

    res.json({
      success: true,
      msg: "Fulfillment details updated",
      data: order,
    });
  } catch (err) {
    console.error("updateFulfillmentDetails error:", err);
    const customOrder = await CustomOrder.create(orderData);
  }
};

  // @desc    Admin: consume reserved inventory for an order (allocate inventory manually)
  // @route   PUT /api/custom-orders/:id/admin-consume
  // @access  Private/Admin
  exports.adminConsumeReserved = async (req, res) => {
    try {
      const order = await CustomOrder.findById(req.params.id);
      if (!order) return res.status(404).json({ success: false, msg: 'Custom order not found.' });

      if (order.inventoryAllocated) {
        return res.status(400).json({ success: false, msg: 'Inventory already allocated for this order.' });
      }

      if (!order.fabricType) {
        return res.status(400).json({ success: false, msg: 'No fabric type associated with this order to allocate.' });
      }

      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        const invDoc = await allocateInventory({ name: order.fabricType, qty: order.quantity, orderId: order._id, adminId: req.user._id, session });
        order.inventoryAllocated = true;
        order.allocatedItems = [{ inventoryId: invDoc._id, name: invDoc.name, qty: order.quantity }];
        const updated = await order.save({ session });
        await session.commitTransaction();
        session.endSession();
        return res.status(200).json({ success: true, data: updated, msg: 'Inventory allocated successfully.' });
      } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error('adminConsumeReserved transaction error:', err.message);
        return res.status(500).json({ success: false, msg: 'Failed to allocate inventory: ' + err.message });
      }
    } catch (error) {
      console.error('adminConsumeReserved error:', error);
      return res.status(500).json({ success: false, msg: 'Server error' });
    }
  };

// @desc    Submit customization quote from professional customizer (3-panel layout)
// @route   POST /api/custom-orders/quote
// @access  Private
exports.submitQuote = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Extract form fields
    const {
      garmentType,
      garmentColor,
      customColor,
      fabricType,
      garmentLabel,
      neckStyle,
      selectedLocation,
      garmentColorName,
      garmentColorHex,
      primaryColor,
      secondaryColor,
      accentColor,
      designText,
      designTextWithPlacements,
      quantity,
      totalPrice,
      unitPrice,
      printingType,
      teamMode,
      teamEntries,
      designElements,
      pricingBreakdown,
      requestType
    } = req.body;
    
    // --- Debug: Log raw incoming keys (helps diagnose 500s) ---
    try {
      const bodyKeys = Object.keys(req.body || {});
      const fileFields = Array.isArray(req.files) ? req.files.map(f=>f.fieldname) : (req.file ? [req.file.fieldname] : []);
      console.log('[submitQuote] Body keys:', bodyKeys.join(', '));
      console.log('[submitQuote] File fields:', fileFields.join(', ') || 'none');
    } catch(e){ console.warn('[submitQuote] Logging incoming data failed:', e.message); }

    // Normalize garmentType (UI may send 'tshirt')
    let normalizedGarmentType = garmentType;
    if (garmentType === 'tshirt') normalizedGarmentType = 't-shirt';
    
    console.log('[submitQuote] Raw garmentType:', garmentType);
    console.log('[submitQuote] Normalized garmentType:', normalizedGarmentType);

    // Basic field presence validation
    if (!normalizedGarmentType || !selectedLocation || typeof quantity === 'undefined') {
      return res.status(400).json({
        success: false,
        msg: 'Missing required fields: garmentType, selectedLocation, quantity'
      });
    }

    // Quantity numeric validation
    const qtyNum = Number(quantity);
    if (Number.isNaN(qtyNum) || qtyNum <= 0) {
      return res.status(400).json({ success: false, msg: 'Quantity must be a positive number' });
    }

    // Garment type enum validation (match model and product catalog)
    const allowedGarments = [
      't-shirt', 'jersey', 'hoodie',
      'vneck-tshirt', 'round-tshirt', 'raglan',
      'classic-polo', 'drifit-polo', '2tone-polo', '2tone-polo-ladies',
      'drifit-vneck',
      'pullup-jacket', 'hoodie-jacket',
      'drifit-short', 'jogging-pants'
    ];
    if (!allowedGarments.includes(normalizedGarmentType)) {
      return res.status(400).json({ success: false, msg: `Invalid garmentType '${normalizedGarmentType}'. Allowed: ${allowedGarments.join(', ')}` });
    }
    
    // Guard: Maximum 3 active quotes per account (active = not Completed/Cancelled)
    try {
      const ACTIVE_LIMIT = 3;
      const activeCount = await CustomOrder.countDocuments({
        user: userId,
        status: { $nin: ['Completed', 'Cancelled'] }
      });
      if (activeCount >= ACTIVE_LIMIT) {
        return res.status(403).json({
          success: false,
          msg: 'You have reached the maximum of 3 active quotes. Please complete at least one existing order (status: Completed) or cancel a pending quote before submitting a new one.',
          activeCount,
          limit: ACTIVE_LIMIT
        });
      }
    } catch (e) {
      console.warn('[submitQuote] Active-quote limit check failed:', e.message);
    }
    
    // Validation
    // (Legacy validation block replaced by normalized checks above)
    
    // Handle image uploads (single legacy + multi-location previews)
    let designImageUrl = null;
    let designImageOriginalName = null;
    let designImagesMap = {};
    if (Array.isArray(req.files) && req.files.length) {
      req.files.forEach(f => {
        if (f.fieldname === 'designImage') {
          designImageUrl = `${BASE_URL}/uploads/custom-designs/${f.filename}`;
          // Capture original filename for admin display
          if (f.originalname) {
            designImageOriginalName = f.originalname;
          }
        } else if (f.fieldname.startsWith('designImage_')) {
          // fieldname: designImage_front, designImage_back, designImage_left-sleeve
          const key = f.fieldname.replace('designImage_', '');
          designImagesMap[key] = `${BASE_URL}/uploads/custom-designs/${f.filename}`;
        }
      });
    } else if (req.file) {
      designImageUrl = `${BASE_URL}/uploads/custom-designs/${req.file.filename}`;
      if (req.file.originalname) {
        designImageOriginalName = req.file.originalname;
      }
    }
    
    // Parse JSON-like fields if provided as strings
    let parsedTeamEntries = [];
    let parsedDesignElements = [];
    let parsedPricingBreakdown = null;
    let parsedDesignElementsMap = undefined;
    let parsedTextWithPlacements = [];
    // Safe parse helpers returning explicit 400 errors when malformed
    const safeParse = (label, value, fallback, isRequired=false) => {
      if (value === undefined || value === null || value === '') return fallback;
      if (typeof value === 'string') {
        try { return JSON.parse(value); }
        catch(e){
          if (isRequired) {
            throw { type: 'parse', field: label, message: `Invalid JSON in ${label}: ${e.message}` };
          }
          console.warn(`[submitQuote] Failed parsing ${label}:`, e.message);
          return fallback;
        }
      }
      return value;
    };
    try {
      parsedTeamEntries = safeParse('teamEntries', teamEntries, []);
      parsedDesignElements = safeParse('designElements', designElements, []);
      parsedPricingBreakdown = safeParse('pricingBreakdown', pricingBreakdown, null);
      parsedDesignElementsMap = safeParse('designElementsMap', req.body.designElementsMap, undefined);
      parsedTextWithPlacements = safeParse('designTextWithPlacements', designTextWithPlacements, []);
    } catch(parseErr) {
      if (parseErr.type === 'parse') {
        return res.status(400).json({ success:false, msg: parseErr.message });
      }
    }

    console.log('[submitQuote] Parsed counts:', {
      teamEntries: parsedTeamEntries.length,
      designElements: parsedDesignElements.length,
      designElementsMapKeys: parsedDesignElementsMap ? Object.keys(parsedDesignElementsMap).length : 0
    });

    // Create new custom order
    const customOrder = new CustomOrder({
      user: userId,
      serviceType: 'customize-jersey',
      customType: 'Template',
      productName: `Custom ${normalizedGarmentType.charAt(0).toUpperCase() + normalizedGarmentType.slice(1)}`,
      itemType: normalizedGarmentType,
      
      // Professional customizer fields
      garmentType: normalizedGarmentType,
      garmentColor: garmentColor || undefined,
      customColor: customColor || undefined,
      fabricType: fabricType || undefined,
      selectedLocation: selectedLocation,
      colors: {
        primary: primaryColor || '#000000',
        secondary: secondaryColor || '#FFFFFF',
        accent: accentColor || '#FF0000'
      },
      designText: designText || '',
      designImage: designImageUrl || null,
      designImagesMap: Object.keys(designImagesMap).length ? designImagesMap : null,
      
      // Order details
      quantity: qtyNum,
      totalPrice: totalPrice ? Number(totalPrice) : undefined,
      status: 'Pending Quote',
      // Persist the full quote payload for admin review
      quotePayload: {
        requestType: requestType || 'quote',
        unitPrice: unitPrice ? Number(unitPrice) : undefined,
        printingType: printingType || undefined,
        teamMode: teamMode === 'true' || teamMode === true || false,
        teamEntries: parsedTeamEntries,
        designElements: parsedDesignElements,
        // Persist per-location design elements map if provided (already parsed)
        designElementsMap: parsedDesignElementsMap,
        pricingBreakdown: parsedPricingBreakdown,
        // Additional display metadata from client
        garmentLabel: garmentLabel || undefined,
        neckStyle: neckStyle || undefined,
        // Selected garment color (single swatch for admin display)
        garmentColorName: garmentColorName || undefined,
        garmentColorHex: garmentColorHex || garmentColorName || undefined,
        // Original uploaded design filename (if provided)
        uploadedDesignFilename: designImageOriginalName || undefined,
        // Design text elements with their actual placements
        designTextWithPlacements: parsedTextWithPlacements.length > 0 ? parsedTextWithPlacements : undefined
      }
    });
    
    // Save to database with validation error handling
    try {
      await customOrder.save();
    } catch(saveErr) {
      if (saveErr.name === 'ValidationError') {
        const details = Object.values(saveErr.errors).map(e=>e.message).join('; ');
        console.error('[submitQuote] ValidationError:', details);
        return res.status(400).json({ success:false, msg: 'Validation failed', details });
      }
      console.error('[submitQuote] Save error:', saveErr);
      return res.status(500).json({ success:false, msg:'Failed saving quote', error: saveErr.message });
    }
    
    // Notify customer: Quote received
    try {
      const profileUrl = `${BASE_URL}/client/my-quotes.html`;
      const code = customOrder._id.toString().slice(-8).toUpperCase();
      await sendEmail({
        email: req.user.email,
        subject: `Quote Received – Ref ${code}`,
        message: `
          <div style=\"font-family:Inter,Segoe UI,Arial,sans-serif;font-size:14px;color:#111\">
            <p>Hi ${req.user.name || 'there'},</p>
            <p>We received your customization quote request. Your reference is <strong>${code}</strong>.</p>
            <p>We’ll review your details and send pricing shortly. You can track the status here:</p>
            <p><a href=\"${profileUrl}\" style=\"color:#4f46e5\">View My Quotes</a></p>
            <p style=\"color:#6b7280\">Fundamental Apparel</p>
          </div>
        `
      });
    } catch (e) {
      console.error('Email (Quote Received) failed:', e.message);
    }
    
    res.status(201).json({
      success: true,
      msg: "Customization quote submitted successfully",
      data: {
        orderId: customOrder._id,
        orderNumber: customOrder._id.toString().slice(-8).toUpperCase(),
        quoteNumber: customOrder._id.toString().slice(-8).toUpperCase(),
        totalPrice: customOrder.totalPrice,
        status: customOrder.status
      }
    });
    
  } catch (error) {
    console.error("submitQuote error:", error);
    // Distinguish parse / early validation errors already handled above
    if (error && error.type === 'parse') {
      return res.status(400).json({ success:false, msg: error.message });
    }
    res.status(500).json({ success: false, msg: 'Failed to submit customization quote', error: error.message });
  }
};

// @desc    Admin rejects a custom order quote
// @route   PUT /api/custom-orders/:id/reject
// @access  Private/Admin
exports.rejectCustomOrderQuote = async (req, res) => {
  try {
    const { notes } = req.body || {};
    const order = await CustomOrder.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ success: false, msg: 'Custom order not found.' });
    }
    // If inventory was allocated for this order, release it
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      if (order.inventoryAllocated && Array.isArray(order.allocatedItems) && order.allocatedItems.length) {
        for (const it of order.allocatedItems) {
          try {
            await releaseInventory({ name: it.name, qty: it.qty, orderId: order._id, adminId: req.user?._id, session });
          } catch (e) {
            console.error('Failed to release inventory for reject:', e.message);
          }
        }
        order.inventoryAllocated = false;
        order.allocatedItems = [];
      }

      order.status = 'Cancelled';
      if (typeof notes === 'string') {
        order.adminNotes = notes;
      }
      const updated = await order.save({ session });
      await session.commitTransaction();
      session.endSession();
      res.status(200).json({ success: true, data: updated });
    } catch (txErr) {
      await session.abortTransaction();
      session.endSession();
      console.error('rejectCustomOrderQuote transaction error:', txErr.message);
      return res.status(500).json({ success: false, msg: 'Failed to cancel order and restore inventory' });
    }
  } catch (error) {
    console.error('Reject Quote Error:', error);
    res.status(500).json({ success: false, msg: 'Server Error' });
  }
};
