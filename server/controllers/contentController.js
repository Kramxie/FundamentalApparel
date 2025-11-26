const path = require('path');
const fs = require('fs');
const Content = require('../models/Content');

// Get content by key (e.g., 'about-us' or 'contact')
exports.getContent = async (req, res) => {
  try {
    const { key } = req.params;
    const item = await Content.findOne({ key });
    if (!item) return res.json({ success: true, data: { key, title: '', body: '', images: [] } });
    return res.json({ success: true, data: item });
  } catch (error) {
    console.error('[Content] getContent error:', error);
    return res.status(500).json({ success: false, msg: 'Failed to load content' });
  }
};

// Update content by key. Accepts multipart/form-data for images.
exports.updateContent = async (req, res) => {
  try {
    const { key } = req.params;
    const { title, body } = req.body;

    // Build images array: keep existing images unless replaced; append new uploads
    const existing = await Content.findOne({ key });
    let images = existing && existing.images ? existing.images.slice() : [];

    // If client sends `replaceImages` = 'true', we clear existing images before adding uploaded
    if (req.body.replaceImages === 'true') images = [];

    if (req.files && Array.isArray(req.files)) {
      for (const f of req.files) {
        images.push({ url: `/uploads/content/${f.filename}`, filename: f.filename });
      }
    }

    const update = { title: title || (existing && existing.title) || '', body: body || (existing && existing.body) || '', images };

    const opts = { upsert: true, new: true, setDefaultsOnInsert: true };
    const saved = await Content.findOneAndUpdate({ key }, update, opts);
    return res.json({ success: true, data: saved });
  } catch (error) {
    console.error('[Content] updateContent error:', error);
    return res.status(500).json({ success: false, msg: 'Failed to save content' });
  }
};

// Optional: delete a specific image from content
exports.deleteImage = async (req, res) => {
  try {
    const { key } = req.params;
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ success: false, msg: 'filename is required' });
    const item = await Content.findOne({ key });
    if (!item) return res.status(404).json({ success: false, msg: 'Content not found' });
    const remaining = (item.images || []).filter(i => i.filename !== filename);
    item.images = remaining;
    await item.save();
    // remove file from disk (best-effort)
    try { fs.unlinkSync(path.join(__dirname, '..', 'uploads', 'content', filename)); } catch (e) { /* ignore */ }
    return res.json({ success: true, data: item });
  } catch (error) {
    console.error('[Content] deleteImage error:', error);
    return res.status(500).json({ success: false, msg: 'Failed to delete image' });
  }
};
