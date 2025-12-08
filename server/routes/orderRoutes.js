const express = require('express');
const router = express.Router();

const {
    getMyOrders,
    createOrder,
    createOrderWithReceipt,
    getAllOrders,
    updateOrderStatus,
    getOrderById,
    cancelOrder,
    completeOrder,
    getLoyaltyProgress,
    // Archive system
    archiveOrder,
    restoreOrder,
    deleteOrderPermanently,
    getArchivedOrders
} = require('../controllers/orderController');
const { createReturnRequest } = require('../controllers/returnController');

const { protect, authorize } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/permissionMiddleware');
const { receiptUpload, returnUpload } = require('../config/cloudinary');

// Use Cloudinary uploads
const upload = receiptUpload;
const returnsUpload = returnUpload;

// All routes here are protected
router.use(protect);

// IMPORTANT: declare specific literal routes BEFORE parameter routes to avoid collisions
// Create order (checkout without receipt)
router.route('/')
    .post(createOrder);

// Create order with uploaded receipt (must come BEFORE /:id)
router.post('/upload-receipt', upload.single('receipt'), createOrderWithReceipt);

// Create a return/refund request for an order (user) - supports video/images
router.post('/:id/returns', returnsUpload.fields([{ name: 'videos' }, { name: 'images' }]), createReturnRequest);

// User orders
router.get('/myorders', getMyOrders);

// Loyalty progress for the logged-in user
router.get('/loyalty-progress', getLoyaltyProgress);

// Admin routes (literal)
// Orders listing and status management require permissions
router.get('/admin', requirePermission('manage_orders'), getAllOrders);
router.get('/admin/archived', requirePermission('manage_orders'), getArchivedOrders);

// --- Archive system routes ---
router.put('/:id/archive', requirePermission('manage_orders'), archiveOrder);
router.put('/:id/restore', requirePermission('manage_orders'), restoreOrder);
router.delete('/:id/permanent', requirePermission('manage_orders'), deleteOrderPermanently);

// --- NEW ROUTE for user to cancel ---
router.put('/:id/cancel', cancelOrder);
// --- NEW ROUTE for user to mark as complete ---
router.put('/:id/complete', completeOrder);

// Admin status update
router.put('/:id/status', requirePermission('manage_orders'), updateOrderStatus);

// Get single order (owner or admin) - param route placed last
router.get('/:id', getOrderById);

module.exports = router;