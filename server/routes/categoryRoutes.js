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

router
  .route('/:id')
  .put(protect, authorize('admin'), updateCategory);

module.exports = router;
