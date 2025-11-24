const Product = require("../models/Product");
const Inventory = require("../models/Inventory");
const Category = require("../models/Category");
const mongoose = require('mongoose');
const path = require("path");
const Order = require('../models/Order');
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
    // Optional new fields: sizesInventory (JSON/object), sizesPrice (JSON/object), placements
    let sizesInventory = req.body.sizesInventory;
    let sizesPrice = req.body.sizesPrice;
    let placements = req.body.placements;

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
      type: req.body.type || 'regular'
    };

    // Parse optional per-size structures (accept JSON strings or objects)
    try {
      if (sizesInventory) {
        if (typeof sizesInventory === 'string') sizesInventory = JSON.parse(sizesInventory);
        payload.sizesInventory = sizesInventory || {};
      }
    } catch (e) {
      payload.sizesInventory = {};
    }
    try {
      if (sizesPrice) {
        if (typeof sizesPrice === 'string') sizesPrice = JSON.parse(sizesPrice);
        payload.sizesPrice = sizesPrice || {};
      }
    } catch (e) {
      payload.sizesPrice = {};
    }
    // If no explicit base price provided, derive a sensible base price
    // from per-size prices (use the minimum per-size price).
    try {
      const sp = payload.sizesPrice || {};
      const vals = Object.keys(sp || {}).map(k => Number(sp[k])).filter(v => !isNaN(v));
      if ((!payload.price || Number(payload.price) === 0) && vals.length > 0) {
        payload.price = Math.min(...vals);
      }
    } catch (e) {
      // ignore
    }
    try {
      if (placements) {
        if (typeof placements === 'string') placements = JSON.parse(placements);
        payload.placements = placements || {};
      }
    } catch (e) {
      payload.placements = {};
    }


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
      // Handle predesign front/back uploads
      if (req.files.front && req.files.front[0]) {
        const frontUrl = `${BASE_URL}/uploads/products/${path.basename(req.files.front[0].path)}`;
        payload.images = payload.images || {};
        payload.images.front = frontUrl;
        // Default main image to front if not set
        if (!payload.imageUrl) payload.imageUrl = frontUrl;
      }
      if (req.files.back && req.files.back[0]) {
        const backUrl = `${BASE_URL}/uploads/products/${path.basename(req.files.back[0].path)}`;
        payload.images = payload.images || {};
        payload.images.back = backUrl;
      }
    }

    if (!payload.imageUrl && req.body.imageUrl) {
      payload.imageUrl = req.body.imageUrl;
    }
    const product = await Product.create(payload);
    
    // Auto-sync to Inventory: create inventory entry for this product
    try {
      const inventoryData = {
        name: product.name,
        // set inventory type based on product.type so Pre-Design products are distinguishable
        type: (product.type === 'predesign' ? 'pre-design-apparel' : 'product'),
        quantity: product.countInStock,
        unit: 'pieces',
        price: product.price,
        lowStockThreshold: 10,
        supplier: '',
        description: product.description || '',
        isProduct: true,
        isPreDesign: (product.type === 'predesign'),
        productId: product._id,
        category: product.category || '',
        imageUrl: product.imageUrl || '',
        gallery: product.gallery || [],
        sizes: product.sizes || [],
        sizesInventory: product.sizesInventory || {},
        // include per-size prices so inventory view can show the same per-size pricing
        sizesPrice: product.sizesPrice || {},
        colors: product.colors || [],
        material: product.material || '',
        productDetails: product.productDetails || '',
        faqs: product.faqs || ''
      };
      await Inventory.create(inventoryData);
    } catch (invError) {
      console.error('Failed to create inventory entry:', invError);
      // Don't fail the product creation, just log the error
    }
    
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
    // Support placement filters
    if (req.query.placement) {
      const placement = req.query.placement;
      if (placement === 'newArrivals') {
        // only show products with a future newArrivalExpiresAt
        query['placements.newArrivalExpiresAt'] = { $gt: new Date() };
      } else if (placement === 'featured') {
        query['placements.featured'] = true;
      } else if (placement === 'service' && req.query.serviceKey) {
        query['placements.services'] = req.query.serviceKey;
      }
    }
    if (req.query.category) {
      if (req.query.exclude) {
        query._id = { $ne: req.query.exclude };
      }
      query.category = req.query.category;
    }
    // Filter by product type (e.g., predesign)
    if (req.query.type) {
      query.type = req.query.type;
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

    // Parse optional JSON fields for per-size data and placements
    if (updatedData.sizesInventory && typeof updatedData.sizesInventory === 'string') {
      try { updatedData.sizesInventory = JSON.parse(updatedData.sizesInventory); } catch (e) { updatedData.sizesInventory = {}; }
    }
    if (updatedData.sizesPrice && typeof updatedData.sizesPrice === 'string') {
      try { updatedData.sizesPrice = JSON.parse(updatedData.sizesPrice); } catch (e) { updatedData.sizesPrice = {}; }
    }
    if (updatedData.placements && typeof updatedData.placements === 'string') {
      try { updatedData.placements = JSON.parse(updatedData.placements); } catch (e) { updatedData.placements = {}; }
    }

    // Remove upload metadata fields
    delete updatedData.existingMainImage;
    delete updatedData.existingGallery;
    delete updatedData.deletedGallery;

    product = await Product.findByIdAndUpdate(req.params.id, updatedData, {
      new: true,
      runValidators: true,
    });

    // Sync to Inventory if linked
    try {
      const inventoryItem = await Inventory.findOne({ productId: product._id });
      if (inventoryItem) {
        inventoryItem.name = product.name;
        inventoryItem.quantity = product.countInStock;
        // Ensure inventory price follows product.price; if product.price is 0
        // but per-size prices exist, derive a base price from sizesPrice.
        let invPrice = Number(product.price) || 0;
        try {
          const sp = product.sizesPrice || {};
          const vals = Object.keys(sp || {}).map(k => Number(sp[k])).filter(v => !isNaN(v));
          if ((!invPrice || invPrice === 0) && vals.length > 0) invPrice = Math.min(...vals);
        } catch (e) {}
        inventoryItem.price = invPrice;
        // Sync per-size prices as well
        inventoryItem.sizesPrice = product.sizesPrice || {};
        inventoryItem.description = product.description || '';
        inventoryItem.category = product.category || '';
        inventoryItem.imageUrl = product.imageUrl || '';
        inventoryItem.gallery = product.gallery || [];
        inventoryItem.sizes = product.sizes || [];
        inventoryItem.sizesInventory = product.sizesInventory || {};
        inventoryItem.colors = product.colors || [];
        inventoryItem.material = product.material || '';
        inventoryItem.productDetails = product.productDetails || '';
        inventoryItem.faqs = product.faqs || '';
        await inventoryItem.save();
      }
    } catch (invError) {
      console.error('Failed to sync inventory:', invError);
    }

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

    // Delete linked inventory entry
    try {
      await Inventory.findOneAndDelete({ productId: product._id });
    } catch (invError) {
      console.error('Failed to delete inventory entry:', invError);
    }

    await product.deleteOne(); // Use deleteOne method on the document

    res.status(200).json({ success: true, data: {} });
  } catch (error) {
    console.error("[Delete Product Controller] Error:", error);
    res.status(500).json({ success: false, msg: "Server Error" });
  }
};

// --- NEW: Add / Update Product Review ---
// @desc    Add or update a product review by a user who completed (Delivered) an order containing the product
// @route   POST /api/products/:id/reviews
// @access  Private (any user who purchased & received the product)
exports.addReview = async (req, res) => {
  try {
    const productId = req.params.id;
    const { rating, comment } = req.body;
    if (!rating) {
      return res.status(400).json({ success: false, msg: 'Rating is required.' });
    }
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, msg: 'Product not found' });
    }
    // Ensure user purchased & order delivered
    const hasPurchased = await Order.findOne({ user: req.user._id, status: { $in: ['Delivered','Completed'] }, 'orderItems.product': productId });
    if (!hasPurchased) {
      return res.status(403).json({ success: false, msg: 'You can only review products you have received.' });
    }
    // Check existing review by same user
    const existing = product.reviews.find(r => r.user.toString() === req.user._id.toString());
    if (existing) {
      existing.rating = Number(rating);
      existing.comment = comment || existing.comment;
      existing.createdAt = new Date();
    } else {
      product.reviews.push({
        user: req.user._id,
        userName: req.user.name || req.user.username || 'User',
        rating: Number(rating),
        comment: comment || ''
      });
    }
    product.numReviews = product.reviews.length;
    product.averageRating = product.reviews.reduce((sum, r) => sum + r.rating, 0) / product.numReviews;
    await product.save();
    res.status(200).json({ success: true, data: { reviews: product.reviews, averageRating: product.averageRating, numReviews: product.numReviews } });
  } catch (error) {
    console.error('[Add Review] Error:', error);
    res.status(500).json({ success: false, msg: 'Server Error' });
  }
};


