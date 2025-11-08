const CustomOrder = require("../models/CustomOrder");
const path = require("path");
const mongoose = require("mongoose"); // <-- Siguraduhin na na-import ito

// Siguraduhin na ang SERVER_URL mo sa .env ay ang public URL mo (e.g., ngrok)
const BASE_URL =
  process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5000}`;

// @desc    Submit a new custom order
// @route   POST /api/custom-orders
// @access  Private
exports.submitCustomOrder = async (req, res) => {
  try {
    const { customType, productName, designDetails, quantity, notes } =
      req.body;
    const userId = req.user._id; // Validation

    if (!customType || !quantity) {
      return res.status(400).json({
        success: false,
        msg: "Missing required fields: customType and quantity.",
      });
    }
    if (Number(quantity) <= 0) {
      return res
        .status(400)
        .json({ success: false, msg: "Quantity must be at least 1." });
    }

    const orderData = {
      user: userId,
      productName: productName || "Custom Jersey",
      customType,
      quantity: Number(quantity),
      notes: notes || "",
    };

    if (customType === "Template") {
      orderData.designDetails = designDetails || "No details provided.";
    } else if (customType === "FileUpload") {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          msg: "A design file is required for File Upload mode.",
        });
      }
      orderData.designFileUrl = `${BASE_URL}/uploads/custom-designs/${req.file.filename}`;
    }

    const customOrder = await CustomOrder.create(orderData);

    res.status(201).json({
      success: true,
      data: customOrder,
      msg: "Your custom order request has been submitted! We will contact you with a quote.",
    });
  } catch (error) {
    console.error("Custom Order Submit Error:", error);
    res.status(500).json({ success: false, msg: "Server Error" });
  }
};

// @desc    Get all custom orders (for Admin)
// @route   GET /api/custom-orders/admin
// @access  Private/Admin
exports.getAdminCustomOrders = async (req, res) => {
  try {
    const orders = await CustomOrder.find()
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
    const { price } = req.body;

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
    order.status = "Quote Sent";

    const updatedOrder = await order.save(); // <-- Inayos ang variable name

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
    if (order.status !== "Quote Sent") {
      return res
        .status(400)
        .json({
          success: false,
          msg: "This order is not awaiting down payment.",
        });
    }

    order.downPaymentReceiptUrl = `${BASE_URL}/uploads/custom-designs/${req.file.filename}`;
    order.status = "Pending Downpayment"; // Admin must now verify
    await order.save();
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
    } // Update the order
    order.status = "In Production";
    order.downPaymentPaid = true;
    const updatedOrder = await order.save(); // Dito ka ulit pwedeng mag-email sa user // e.g., sendEmail({ email: order.user.email, message: `Your down payment is verified! Your order is now In Production.` })
    res.status(200).json({ success: true, data: updatedOrder });
  } catch (error) {
    // <-- Inayos ang nawawalang '{'
    console.error("Verify Down Payment Error:", error);
    res.status(500).json({ success: false, msg: "Server Error" });
  }
};

// @desc    Admin marks order as finished, requests final balance
// @route   PUT /api/custom-orders/:id/request-final-payment
// @access  Private/Admin
// --- Inalis ang duplicate na comments ---
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
    const updatedOrder = await order.save(); // Dito ka ulit pwedeng mag-email sa user // e.g., sendEmail({ email: order.user.email, message: `Your custom order is complete! Please pay the remaining balance.` })
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
        
        // Check status
        if (order.status !== 'Pending Balance') {
            return res.status(400).json({ success: false, msg: 'This order is not awaiting final payment.' });
        }

        order.finalPaymentReceiptUrl = req.file.path; // I-save ang full path
        order.status = 'Pending Final Verification'; // Admin must now verify
        
        await order.save();
        
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
        
        // Update the order
        order.status = 'Completed';
        order.balancePaid = true;
        
        const updatedOrder = await order.save();
        
        // Dito ka ulit pwedeng mag-email sa user
        // e.g., sendEmail({ email: order.user.email, message: `Your final payment is verified! Your order is complete.` })

        res.status(200).json({ success: true, data: updatedOrder });

    } catch (error) {
        console.error('Verify Final Payment Error:', error);
        res.status(500).json({ success: false, msg: 'Server Error' });
    }
};
