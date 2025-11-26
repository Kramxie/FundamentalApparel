const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();

const { getContent, updateContent, deleteImage } = require('../controllers/contentController');
const { protect, authorize } = require('../middleware/authMiddleware');

// Ensure uploads/content exists
const contentDir = path.join(__dirname, '..', 'uploads', 'content');
fs.mkdirSync(contentDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, contentDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safe = `${Date.now()}-${Math.round(Math.random()*1e9)}${ext}`;
    cb(null, safe);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) return cb(null, true);
  return cb(new Error('Only image files allowed'));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

// All routes protected and restricted to admins
router.use(protect);
router.use(authorize('admin'));

router.get('/:key', getContent);
router.put('/:key', upload.array('images', 6), updateContent);
router.delete('/:key/image', deleteImage);

module.exports = router;
