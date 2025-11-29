const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const Receipt = require('../models/Receipt');

// Get receipts for logged-in user
router.get('/', protect, async (req, res) => {
  try {
    const receipts = await Receipt.find({ user: req.user._id }).sort({ createdAt: -1 }).lean();
    return res.status(200).json({ success: true, data: receipts });
  } catch (err) {
    console.error('[Receipts] Failed to fetch receipts:', err && err.message);
    return res.status(500).json({ success: false, msg: 'Failed to fetch receipts' });
  }
});

// Get single receipt by id (only owner or admin)
router.get('/:id', protect, async (req, res) => {
  try {
    const r = await Receipt.findById(req.params.id).lean();
    if (!r) return res.status(404).json({ success: false, msg: 'Receipt not found' });
    if (r.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, msg: 'Not authorized' });
    }
    return res.status(200).json({ success: true, data: r });
  } catch (err) {
    console.error('[Receipts] Failed to fetch receipt:', err && err.message);
    return res.status(500).json({ success: false, msg: 'Failed to fetch receipt' });
  }
});

module.exports = router;
