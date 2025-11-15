const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();

const {
    getMyOrders,
    createOrder,
    createOrderWithReceipt,
    getAllOrders,
    updateOrderStatus,
    getOrderById,
    cancelOrder // <-- NEW
} = require('../controllers/orderController');

const { protect, authorize } = require('../middleware/authMiddleware');

// Configure multer storage for receipts
const receiptsDir = path.join(__dirname, '..', 'uploads', 'receipts');
fs.mkdirSync(receiptsDir, { recursive: true });
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, receiptsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const safe = `${Date.now()}-${Math.round(Math.random()*1e9)}${ext}`;
        cb(null, safe);
    }
});
const fileFilter = (req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) return cb(new Error('Only image files (png,jpg,jpeg,webp) are allowed'));
    cb(null, true);
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// All routes here are protected
router.use(protect);

// IMPORTANT: declare specific literal routes BEFORE parameter routes to avoid collisions
// Create order (checkout without receipt)
router.route('/')
    .post(createOrder);

// Create order with uploaded receipt (must come BEFORE /:id)
router.post('/upload-receipt', upload.single('receipt'), createOrderWithReceipt);

// User orders
router.get('/myorders', getMyOrders);

// Admin routes (literal)
// Allow employees to view orders list; writes remain admin-only
router.get('/admin', authorize('admin','employee'), getAllOrders);

// --- NEW ROUTE for user to cancel ---
router.put('/:id/cancel', cancelOrder);

// Admin status update
router.put('/:id/status', authorize('admin','employee'), updateOrderStatus);

// Get single order (owner or admin) - param route placed last
router.get('/:id', getOrderById);

module.exports = router;