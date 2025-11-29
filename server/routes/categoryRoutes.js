const express = require("express");
const router = express.Router();
const {
  getCategories,
  addCategory,
} = require("../controllers/categoryController");
const { updateCategory } = require("../controllers/categoryController");
const { protect, authorize } = require("../middleware/authMiddleware");

router
  .route("/")
  .get(getCategories)
  .post(protect, authorize("admin"), addCategory);

// Check pending orders for a category
router.get('/:id/pending', protect, authorize('admin'), require('../controllers/categoryController').checkPending);

// Delete category (with validation)
router.delete('/:id', protect, authorize('admin'), require('../controllers/categoryController').deleteCategory);

router
  .route('/:id')
  .put(protect, authorize('admin'), updateCategory);

module.exports = router;
