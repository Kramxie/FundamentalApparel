const Category = require('../models/Category');

exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.status(200).json({ success: true, data: categories });
  } catch (error) {
    res.status(500).json({ success: false, msg: 'Server Error' });
  }
};

// @desc    Add new category
// @route   POST /api/categories
// @access  Private/Admin
exports.addCategory = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, msg: 'Category name is required' });
    }

    const slug = name.trim().toLowerCase().replace(/\s+/g, '-');
    const exists = await Category.findOne({ slug });
    if (exists) {
      return res.status(400).json({ success: false, msg: 'Category already exists' });
    }

    const category = await Category.create({ name: name.trim(), slug });
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, msg: 'Server Error' });
  }
};
