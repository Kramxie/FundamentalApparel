const Product = require("../models/Product");
const Category = require("../models/Category");
const mongoose = require('mongoose');
const path = require("path");
// @desc    Add a new product
// @route   POST /api/products/add
// @access  Private/Admin
const BASE_URL = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 5000}`;
exports.addProduct = async (req, res, next) => {
  try {
    const {
      name,
      description,
      price,
      category,
      countInStock,
      imageUrl,
      sizes,
      colors,
      material,
      gallery,
      productDetails,
      faqs,power
    } = req.body;

    let resolvedCategory = category;
    if (category && mongoose.isValidObjectId(category)) {
      try {
        const catDoc = await Category.findById(category).lean();
        if (catDoc && catDoc.name) resolvedCategory = catDoc.name;
      } catch (e){
        
      }
    }  

    const payload = {
      name,
      description,
      price: Number(price) || 0,
      category,
      countInStock: Number(countInStock) || 0,
      sizes: sizes
        ? Array.isArray(sizes)
          ? sizes
          : sizes.split(",").map((s) => s.trim())
        : [],
      colors: colors
        ? Array.isArray(colors)
          ? colors
          : colors.split(",").map((c) => c.trim())
        : [],
      material: material || "",
      productDetails: productDetails || "",
      faqs: faqs || "",
    };


    if (req.files) {
      if (req.files.image && req.files.image[0]) {
        payload.imageUrl =
          `${BASE_URL}/uploads/products/${path.basename(req.files.image[0].path)}`;
      }
      if (req.files.gallery && req.files.gallery.length > 0) {
        payload.gallery = req.files.gallery.map(
          (f) => `${BASE_URL}/uploads/products/${path.basename(f.path)}`
        );
      }
    }

    if (!payload.imageUrl && req.body.imageUrl) {
      payload.imageUrl = req.body.imageUrl;
    }
    const product = await Product.create(payload);
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    console.error('Add product error:', error);
    res.status(500).json({ success: false, msg: 'Server Error' });
  }
};

    

// @desc    Get all products
// @route   GET /api/products
// @access  Public
exports.getProducts = async (req, res, next) => {
  try {
    let query = {};
    if (req.query.category) {
      if (req.query.exclude) {
        query._id = { $ne: req.query.exclude };
      }
      query.category = req.query.category;
    }
    if (req.query.minPrice || req.query.maxPrice) {
      query.price = {};
      if (req.query.minPrice) query.price.$gte = Number(req.query.minPrice);
      if (req.query.maxPrice) query.price.$lte = Number(req.query.maxPrice);
    }
    let sort = {};
    if (req.query.sort) {
      if (req.query.sort === "price-asc") sort.price = 1;
      else if (req.query.sort === "price-desc") sort.price = -1;
      else sort.createdAt = -1;
    } else {
      sort.createdAt = -1;
    }
    let queryPromise = Product.find(query).sort(sort);
    if (req.query.limit) {
      queryPromise = queryPromise.limit(Number(req.query.limit));
    }
    const products = await queryPromise;
    res
      .status(200)
      .json({ success: true, count: products.length, data: products });
  } catch (error) {
    console.error("[Get Products Controller] Error:", error);
    res.status(500).json({ success: false, msg: "Server Error" });
  }
};

// @desc    Get single product by ID
// @route   GET /api/products/:id
// @access  Public
exports.getProductById = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, msg: "Product not found" });
    }
    res.status(200).json({ success: true, data: product });
  } catch (error) {
    console.error("[Get Product By ID Controller] Error:", error);
    if (error.name === "CastError") {
      return res.status(404).json({ success: false, msg: "Product not found" });
    }
    res.status(500).json({ success: false, msg: "Server Error" });
  }
};

// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Private/Admin
exports.updateProduct = async (req, res, next) => {
  try {
    let product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, msg: "Product not found" });
    }

    const updatedData = { ...req.body };

    // Handle main image upload
    if (req.files && req.files.mainImage && req.files.mainImage[0]) {
      updatedData.imageUrl = `${BASE_URL}/uploads/products/${path.basename(req.files.mainImage[0].path)}`;
    } else if (req.body.existingMainImage) {
      updatedData.imageUrl = req.body.existingMainImage;
    }

    // Handle gallery images
    let galleryUrls = [];
    
    // Keep existing images (not marked for deletion)
    if (req.body.existingGallery) {
      try {
        const existing = JSON.parse(req.body.existingGallery);
        if (Array.isArray(existing)) {
          galleryUrls = [...existing];
        }
      } catch (e) {
        console.error('Error parsing existingGallery:', e);
      }
    }
    
    // Add new uploaded images
    if (req.files && req.files.galleryImages && req.files.galleryImages.length > 0) {
      const newGalleryUrls = req.files.galleryImages.map(
        (f) => `${BASE_URL}/uploads/products/${path.basename(f.path)}`
      );
      galleryUrls = [...galleryUrls, ...newGalleryUrls];
    }
    
    updatedData.gallery = galleryUrls;

    // Convert comma-separated strings to arrays for sizes/colors
    if (updatedData.sizes && typeof updatedData.sizes === 'string') {
      updatedData.sizes = updatedData.sizes.split(",").map((s) => s.trim()).filter(s => s);
    }
    if (updatedData.colors && typeof updatedData.colors === 'string') {
      updatedData.colors = updatedData.colors.split(",").map((c) => c.trim()).filter(c => c);
    }

    // Remove upload metadata fields
    delete updatedData.existingMainImage;
    delete updatedData.existingGallery;
    delete updatedData.deletedGallery;

    product = await Product.findByIdAndUpdate(req.params.id, updatedData, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({ success: true, data: product });
  } catch (error) {
    console.error("[Update Product Controller] Error:", error);
    res.status(500).json({ success: false, msg: "Server Error" });
  }
};

// @desc    Delete a product
// @route   DELETE /api/products/:id
// @access  Private/Admin
exports.deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, msg: "Product not found" });
    }

    await product.deleteOne(); // Use deleteOne method on the document

    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    console.error("[Delete Product Controller] Error:", error);
    res.status(500).json({ success: false, msg: "Server Error" });
  }
};


