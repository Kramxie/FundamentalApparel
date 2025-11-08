const express = require("express");
const router = express.Router();
const {
  getCategories,
  addCategory,
} = require("../controllers/categoryController");
const { protect, authorize } = require("../middleware/authMiddleware");

router
  .route("/")
  .get(getCategories)
  .post(protect, authorize("admin"), addCategory);

module.exports = router;
