const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();

const {
  listReturns,
  getReturn,
  approveReturn,
  rejectReturn,
  refundReturn,
  markReceived
} = require('../controllers/returnController');
const { listMyReturns } = require('../controllers/returnController');

const { protect, authorize } = require('../middleware/authMiddleware');

// Ensure uploads/returns exists
const returnsDir = path.join(__dirname, '..', 'uploads', 'returns');
fs.mkdirSync(returnsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, returnsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safe = `${Date.now()}-${Math.round(Math.random()*1e9)}${ext}`;
    cb(null, safe);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedVideo = ['.mp4', '.mov', '.webm', '.mkv'];
  const allowedImage = ['.png', '.jpg', '.jpeg', '.webp'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedVideo.includes(ext) || allowedImage.includes(ext)) return cb(null, true);
  return cb(new Error('Only video/image files allowed (mp4,mov,webm,mkv,png,jpg,jpeg,webp)'));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 50 * 1024 * 1024 } });

// All return routes are protected
router.use(protect);

// User endpoint: list current user's returns
router.get('/my', listMyReturns);

// Admin endpoints
router.get('/', authorize('admin','employee'), listReturns);
router.get('/:id', authorize('admin','employee'), getReturn);
router.put('/:id/approve', authorize('admin','employee'), approveReturn);
router.put('/:id/reject', authorize('admin','employee'), rejectReturn);
router.put('/:id/received', authorize('admin','employee'), markReceived);
router.post('/:id/refund', authorize('admin','employee'), refundReturn);

module.exports = router;
