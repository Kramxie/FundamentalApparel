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

// List images stored under /images/<key> (e.g., images/aboutus)
router.get('/:key/images', async (req, res) => {
  try {
    const { key } = req.params;
    const imagesDir = path.join(__dirname, '..', '..', 'images', key);
    fs.mkdirSync(imagesDir, { recursive: true });
    const files = fs.readdirSync(imagesDir).filter(f => f && f[0] !== '.');
    const items = files.map(f => ({ filename: f, url: `/images/${key}/${f}` }));
    return res.json({ success: true, data: items });
  } catch (err) {
    console.error('list images error', err);
    return res.status(500).json({ success: false, msg: 'Failed to list images' });
  }
});

// Upload/replace image for /images/<key>
router.post('/:key/images', (req, res) => {
  const { key } = req.params;
  const imagesDir = path.join(__dirname, '..', '..', 'images', key);
  fs.mkdirSync(imagesDir, { recursive: true });
  const storageLocal = multer.diskStorage({
    destination: (req2, file, cb) => cb(null, imagesDir),
    filename: (req2, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const safe = `${Date.now()}-${Math.round(Math.random()*1e9)}${ext}`;
      cb(null, safe);
    }
  });
  const uploadLocal = multer({ storage: storageLocal, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } }).single('image');
  uploadLocal(req, res, function(err){
    if (err) return res.status(400).json({ success: false, msg: err.message });
    if (!req.file) return res.status(400).json({ success: false, msg: 'No file uploaded' });
    return res.json({ success: true, data: { filename: req.file.filename, url: `/images/${key}/${req.file.filename}` } });
  });
});

// Delete an image from /images/<key>
router.delete('/:key/images', (req, res) => {
  try {
    const { key } = req.params;
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ success: false, msg: 'filename required' });
    const p = path.join(__dirname, '..', '..', 'images', key, filename);
    if (fs.existsSync(p)) { fs.unlinkSync(p); }
    return res.json({ success: true });
  } catch (err) {
    console.error('delete image error', err);
    return res.status(500).json({ success: false, msg: 'Failed to delete image' });
  }
});

module.exports = router;
