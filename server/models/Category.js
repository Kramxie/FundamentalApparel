const mongoose = require("mongoose");

const CategorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  // flags indicating admin expectations for products in this category
  requiresSizes: { type: Boolean, default: false },
  requiresColors: { type: Boolean, default: false },
  requiresMaterials: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Category", CategorySchema);
