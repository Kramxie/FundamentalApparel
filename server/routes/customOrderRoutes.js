const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();

const { 
    submitCustomOrder,
    getAdminCustomOrders,
    updateCustomOrderQuote,
    getMyCustomOrders,    // <-- IDAGDAG ITO
    submitDownPayment,
    verifyDownPayment,
    requestFinalPayment,
    submitFinalPayment,
    verifyFinalPayment
} = require('../controllers/customOrderController');

const { protect, authorize } = require('../middleware/authMiddleware');

// --- Multer config for Custom Designs ---
const designsDir = path.join(__dirname, '..', 'uploads', 'custom-designs');
fs.mkdirSync(designsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, designsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        // Gumamit ng user ID at date para unique ang filename
        const safeName = `${req.user._id}-${Date.now()}${ext}`;
        cb(null, safeName);
    }
});

const fileFilter = (req, file, cb) => {
    // Pwede kang magdagdag ng .ai, .psd, .pdf kung kailangan
    const allowedMime = /jpeg|jpg|png|webp|zip|vnd.adobe.photoshop|postscript|pdf/;
    const allowedExt = /jpeg|jpg|png|webp|zip|rar|psd|ai|pdf/; 
    
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');

    if (allowedMime.test(file.mimetype) || allowedExt.test(ext)){
        cb(null, true);
    } else {
        cb(new Error('File type not allowed (Allowed: jpg, png, zip, psd, ai, pdf)'), false);
    }
};

const upload = multer({ 
    storage, 
    fileFilter, 
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});
// --- End Multer Config ---


// User route: Submit a new custom order
router.route('/my-custom-orders')
    .get(protect, getMyCustomOrders);

router.route('/')
    .post(protect, upload.single('designFile'), submitCustomOrder);

router.route('/:id/downpayment')
    .put(protect, upload.single('designFile'), submitDownPayment); 

router.route('/:id/final-payment')
    .put(protect, upload.single('designFile'), submitFinalPayment);    

// Admin route: Get all custom orders
router.route('/admin')
    .get(protect, authorize('admin'), getAdminCustomOrders);

router.route('/:id/quote')
    .put(protect, authorize('admin'), updateCustomOrderQuote);

router.route('/:id/verify-downpayment')
    .put(protect, authorize('admin'), verifyDownPayment);    

router.route('/:id/request-final-payment')
    .put(protect, authorize('admin'), requestFinalPayment);

router.route('/:id/verify-final-payment')
    .put(protect, authorize('admin'), verifyFinalPayment);

module.exports = router;