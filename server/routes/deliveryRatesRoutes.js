const express = require('express');
const router = express.Router();
const deliveryRatesController = require('../controllers/deliveryRatesController');
const { protect } = require('../middleware/authMiddleware');

// simple admin check
function isAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, msg: 'Admin access required' });
  }
  next();
}

router.get('/', protect, isAdmin, deliveryRatesController.getRates);
router.put('/', protect, isAdmin, deliveryRatesController.updateRates);

module.exports = router;
