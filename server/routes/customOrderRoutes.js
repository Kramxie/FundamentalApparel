const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();

const { 
    submitCustomOrder,
    getAdminCustomOrders,
    updateCustomOrderQuote,
    acceptCustomOrderQuote,
    getMyCustomOrders,
    submitDownPayment,
    verifyDownPayment,
    requestFinalPayment,
    submitFinalPayment,
    verifyFinalPayment,
    setFulfillmentMethod,
    updateFulfillmentDetails,
    submitQuote,
    rejectCustomOrderQuote,
    getSingleCustomOrder,
    confirmReceipt,
    cancelQuote,
    // Archive system
    archiveCustomOrder,
    restoreCustomOrder,
    deleteCustomOrderPermanently,
    getArchivedCustomOrders
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
            // protect against missing req.user during upload (fallback to anon)
            const uid = (req.user && req.user._id) ? String(req.user._id) : `anon`;
            const safeName = `${uid}-${Date.now()}${ext}`;
            cb(null, safeName);
    }
});

const fileFilter = (req, file, cb) => {
    // Allow common images, vector/print files, archives and simple text lists
    const allowedMime = /jpeg|jpg|png|webp|zip|vnd.adobe.photoshop|postscript|pdf|plain|csv/;
    const allowedExt = /jpeg|jpg|png|webp|zip|rar|psd|ai|pdf|txt|csv/; 
    
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');

    if (allowedMime.test(file.mimetype) || allowedExt.test(ext)){
        cb(null, true);
    } else {
        cb(new Error('File type not allowed (Allowed: jpg, png, zip, psd, ai, pdf, txt, csv)'), false);
    }
};

const upload = multer({ 
    storage,
    fileFilter,
    limits: { fileSize: 20 * 1024 * 1024 } // 20MB limit
});
// --- End Multer Config ---

// Returns uploads (videos/images) - reused for custom order return requests
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


// User route: Submit a new custom order
router.route('/my-custom-orders')
    .get(protect, getMyCustomOrders);

// New route: Submit customization quote from professional customizer (3-panel layout)
// Accept multiple per-location preview images: designImage_front, designImage_back, etc.
router.route('/quote')
    .post(protect, upload.any(), submitQuote);

router.route('/')
    .post(protect, upload.fields([
        { name: 'designFile', maxCount: 1 },
        { name: 'logoFile', maxCount: 1 },
        { name: 'shortsDesignFile', maxCount: 1 },
        { name: 'teamNamesFile', maxCount: 1 }
    ]), submitCustomOrder);

router.route('/:id/downpayment')
    .put(protect, upload.single('designFile'), submitDownPayment); 

router.route('/:id/final-payment')
    .put(protect, upload.single('designFile'), submitFinalPayment);    

// Admin route: Get all custom orders
// Allow employees to view custom orders list; admin retains write actions
router.route('/admin')
    .get(protect, authorize('admin','employee'), getAdminCustomOrders);

// Admin route: Get archived custom orders
router.route('/admin/archived')
    .get(protect, authorize('admin','employee'), getArchivedCustomOrders);

router.route('/:id/quote')
    .put(protect, authorize('admin','employee'), updateCustomOrderQuote);

router.route('/:id/accept')
    .put(protect, acceptCustomOrderQuote);

router.route('/:id')
    .get(protect, getSingleCustomOrder);

router.route('/:id/reject')
    .put(protect, authorize('admin','employee'), rejectCustomOrderQuote);

router.route('/:id/verify-downpayment')
    .put(protect, authorize('admin','employee'), verifyDownPayment);    

router.route('/:id/request-final-payment')
    .put(protect, authorize('admin','employee'), requestFinalPayment);

router.route('/:id/verify-final-payment')
    .put(protect, authorize('admin','employee'), verifyFinalPayment);

// Admin helper: consume reserved inventory for an order (admin-only)
router.route('/:id/admin-consume')
    .put(protect, authorize('admin','employee'), require('../controllers/customOrderController').adminConsumeReserved);

// Customer chooses pickup or delivery
router.route('/:id/fulfillment')
    .put(protect, setFulfillmentMethod);

// Admin adds tracking or pickup details
router.route('/:id/fulfillment-details')
    .put(protect, authorize('admin','employee'), updateFulfillmentDetails);

// Customer confirms receipt (final completion)
router.route('/:id/confirm-receipt')
    .put(protect, confirmReceipt);

// Customer create return/refund request for a custom order (supports videos/images)
router.post('/:id/returns', returnsUpload.fields([{ name: 'videos' }, { name: 'images' }]), protect, require('../controllers/returnController').createReturnRequest);

// Customer cancels quote
router.route('/:id/cancel')
    .put(protect, cancelQuote);

// --- Archive system routes ---
router.route('/:id/archive')
    .put(protect, authorize('admin','employee'), archiveCustomOrder);

router.route('/:id/restore')
    .put(protect, authorize('admin','employee'), restoreCustomOrder);

router.route('/:id/permanent')
    .delete(protect, authorize('admin','employee'), deleteCustomOrderPermanently);

module.exports = router;