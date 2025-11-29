const Category = require('../models/Category');
const Product = require('../models/Product');
const Order = require('../models/Order');

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

// @desc    Check if any product in the category has pending orders
// @route   GET /api/categories/:id/pending
// @access  Private/Admin
exports.checkPending = async (req, res) => {
  const { id } = req.params;
  try {
    const category = await Category.findById(id);
    if (!category) return res.status(404).json({ success: false, msg: 'Category not found' });
    // find products that belong to this category (category stored as name)
    const products = await Product.find({ category: category.name }, '_id').lean();
    if (!products || products.length === 0) return res.status(200).json({ success: true, hasPending: false, pendingCount: 0 });
    const pids = products.map(p => p._id);
    // Consider orders with statuses that indicate not yet delivered
    const pendingStatuses = ['Processing','Accepted','Shipped'];
    const pendingCount = await Order.countDocuments({ 'orderItems.product': { $in: pids }, status: { $in: pendingStatuses } });
    return res.status(200).json({ success: true, hasPending: pendingCount > 0, pendingCount });
  } catch (error) {
    console.error('[Category checkPending] Error', error);
    return res.status(500).json({ success: false, msg: 'Server Error' });
  }
};

// @desc    Delete category after validation
// @route   DELETE /api/categories/:id
// @access  Private/Admin
exports.deleteCategory = async (req, res) => {
  const { id } = req.params;
  try {
    const category = await Category.findById(id);
    if (!category) return res.status(404).json({ success: false, msg: 'Category not found' });
    const products = await Product.find({ category: category.name }, '_id').lean();
    const pids = products.map(p => p._id);
    const pendingStatuses = ['Processing','Accepted','Shipped'];
    if (pids.length > 0) {
      const pending = await Order.countDocuments({ 'orderItems.product': { $in: pids }, status: { $in: pendingStatuses } });
      if (pending > 0) {
        return res.status(400).json({ success: false, msg: 'Cannot delete category: one or more products have pending orders' });
      }
    }

    // No pending orders found: proceed to delete category and unassign products
    // Unassign products' category to avoid dangling references
    if (pids.length > 0) {
      await Product.updateMany({ _id: { $in: pids } }, { $set: { category: '' } });
    }
    await Category.findByIdAndDelete(id);
    return res.status(200).json({ success: true, msg: 'Category deleted' });
  } catch (error) {
    console.error('[Category delete] Error', error);
    return res.status(500).json({ success: false, msg: 'Server Error' });
  }
};
