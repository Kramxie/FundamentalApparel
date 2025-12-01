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
    ,completeOrder,
    getLoyaltyProgress
} = require('../controllers/orderController');
const { createReturnRequest } = require('../controllers/returnController');

const { protect, authorize } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/permissionMiddleware');

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
// Dedicated uploader for return requests (videos/images)
const returnsDir = path.join(__dirname, '..', 'uploads', 'returns');
fs.mkdirSync(returnsDir, { recursive: true });
const returnsStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, returnsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const safe = `${Date.now()}-${Math.round(Math.random()*1e9)}${ext}`;
        cb(null, safe);
    }
});
const returnsFileFilter = (req, file, cb) => {
    const allowedVideo = ['.mp4', '.mov', '.webm', '.mkv'];
    const allowedImage = ['.png', '.jpg', '.jpeg', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedVideo.includes(ext) || allowedImage.includes(ext)) return cb(null, true);
    return cb(new Error('Only video/image files allowed for returns'));
};
const returnsUpload = multer({ storage: returnsStorage, fileFilter: returnsFileFilter, limits: { fileSize: 50 * 1024 * 1024 } });

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

// --- NEW ROUTE for user to cancel ---
router.put('/:id/cancel', cancelOrder);
// --- NEW ROUTE for user to mark as complete ---
router.put('/:id/complete', completeOrder);

// Admin status update
router.put('/:id/status', requirePermission('manage_orders'), updateOrderStatus);

// Get single order (owner or admin) - param route placed last
router.get('/:id', getOrderById);

module.exports = router;