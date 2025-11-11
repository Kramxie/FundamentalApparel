const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const passport = require('passport'); // <-- NEW
const jwt = require('jsonwebtoken'); // <-- NEW

const {
    registerUser,
    loginUser,
    verifyUser,
    resendVerificationCode,
    getMe,
    getAdminUser,
    updateUserDetails,
    updateAvatar,
    addShippingAddress,
    deleteShippingAddress,
    setDefaultAddress,
    forgotPassword,
    resetPassword
} = require('../controllers/authController');

const { protect } = require('../middleware/authMiddleware');

// ... (Multer config ay walang bago) ...
const avatarsDir = path.join(__dirname, '..', 'uploads', 'avatars');
fs.mkdirSync(avatarsDir, { recursive: true });
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, avatarsDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `avatar-${req.user.id}${ext}`);
    }
});
const fileFilter = (req, file, cb) => {
    const allowed = /jpeg|jpg|png/;
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.test(ext)){ cb(null, true); } 
    else { cb(new Error('Only JPG or PNG images are allowed'), false); }
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 1 * 1024 * 1024 } });


// --- Standard Registration & Login ---
router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/verify', verifyUser);
router.post('/resendverification', resendVerificationCode);
router.post('/forgotpassword', forgotPassword);
router.put('/resetpassword', resetPassword);

// --- NEW: Google OAuth Routes ---
router.get('/google', 
    passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

router.get('/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login.html', session: false }),
    (req, res) => {
        // Successful authentication, i-generate ang ating sariling JWT
        const token = jwt.sign({ id: req.user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
        // I-redirect pabalik sa frontend na may kasamang token
        res.redirect(`${process.env.CLIENT_URL}/auth-success.html?token=${token}`);
    }
);

// --- NEW: Facebook OAuth Routes ---
router.get('/facebook',
    passport.authenticate('facebook', { scope: ['email', 'public_profile'], session: false })
);

router.get('/facebook/callback',
    passport.authenticate('facebook', { failureRedirect: '/login.html', session: false }),
    (req, res) => {
        // Successful authentication, i-generate ang JWT
        const token = jwt.sign({ id: req.user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });
        // I-redirect pabalik sa frontend
        res.redirect(`${process.env.CLIENT_URL}/auth-success.html?token=${token}`);
    }
);


// --- Protected User Profile Routes ---
router.get('/me', protect, getMe);
router.get('/admin-user', getAdminUser); // Public endpoint to get admin user ID
router.put('/updatedetails', protect, updateUserDetails);
router.put('/updateavatar', protect, upload.single('avatar'), updateAvatar);
router.post('/address', protect, addShippingAddress);
router.delete('/address/:addressId', protect, deleteShippingAddress);
router.put('/address/:addressId/setdefault', protect, setDefaultAddress);

module.exports = router;