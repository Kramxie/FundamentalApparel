const mongoose = require('mongoose');

const ImageSchema = new mongoose.Schema({
  url: { type: String, required: true },
  filename: { type: String }
}, { _id: false });

const ContentSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  title: { type: String, default: '' },
  body: { type: String, default: '' },
  story: { type: String, default: '' },
  images: { type: [ImageSchema], default: [] }
}, { timestamps: true });

module.exports = mongoose.model('Content', ContentSchema);
