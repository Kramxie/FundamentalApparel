const Category = require('../models/Category');
const Product = require('../models/Product');

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
    // optional flags
    const requiresSizes = req.body.requiresSizes === 'true' || req.body.requiresSizes === true;
    const requiresColors = req.body.requiresColors === 'true' || req.body.requiresColors === true;
    const requiresMaterials = req.body.requiresMaterials === 'true' || req.body.requiresMaterials === true;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, msg: 'Category name is required' });
    }

    const slug = name.trim().toLowerCase().replace(/\s+/g, '-');
    const exists = await Category.findOne({ slug });
    if (exists) {
      return res.status(400).json({ success: false, msg: 'Category already exists' });
    }

    const category = await Category.create({ name: name.trim(), slug, requiresSizes, requiresColors, requiresMaterials });
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    res.status(500).json({ success: false, msg: 'Server Error' });
  }
};

// @desc    Update (rename) category and reassign products
// @route   PUT /api/categories/:id
// @access  Private/Admin
exports.updateCategory = async (req, res) => {
  const { id } = req.params;
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, msg: 'Category name is required' });
    }

    const newName = name.trim();
    const newSlug = newName.toLowerCase().replace(/\s+/g, '-');

    // Start a session/transaction if possible
    let updatedCategory = null;
    let updatedProductsCount = 0;

    // Try transaction first
    const session = await Category.startSession();
    try {
      await session.withTransaction(async () => {
        const category = await Category.findById(id).session(session);
        if (!category) {
          throw { status: 404, message: 'Category not found' };
        }

        const oldName = category.name;

        const exists = await Category.findOne({ slug: newSlug }).session(session);
        if (exists && exists._id.toString() !== id) {
          throw { status: 400, message: 'Category name already exists' };
        }

        updatedCategory = await Category.findByIdAndUpdate(id, { name: newName, slug: newSlug }, { new: true, session });

        const resUpdate = await Product.updateMany({ category: oldName }, { $set: { category: newName } }).session(session);
        updatedProductsCount = resUpdate.modifiedCount || resUpdate.nModified || 0;
      });

      session.endSession();
      return res.status(200).json({ success: true, data: { category: updatedCategory, updatedProducts: updatedProductsCount } });
    } catch (txErr) {
      session.endSession();
      // If transactions not supported or other error, fall back to non-transactional flow
      if (txErr && txErr.status) {
        return res.status(txErr.status).json({ success: false, msg: txErr.message });
      }
      // continue to fallback below
    }

    // Fallback: non-transactional update
    const category = await Category.findById(id);
    if (!category) return res.status(404).json({ success: false, msg: 'Category not found' });
    const oldName = category.name;
    const exists2 = await Category.findOne({ slug: newSlug });
    if (exists2 && exists2._id.toString() !== id) return res.status(400).json({ success: false, msg: 'Category name already exists' });

    updatedCategory = await Category.findByIdAndUpdate(id, { name: newName, slug: newSlug }, { new: true });
    const resUpdate2 = await Product.updateMany({ category: oldName }, { $set: { category: newName } });
    updatedProductsCount = resUpdate2.modifiedCount || resUpdate2.nModified || 0;

    return res.status(200).json({ success: true, data: { category: updatedCategory, updatedProducts: updatedProductsCount } });
  } catch (error) {
    console.error('Category update error', error);
    return res.status(500).json({ success: false, msg: 'Server Error' });
  }
};
