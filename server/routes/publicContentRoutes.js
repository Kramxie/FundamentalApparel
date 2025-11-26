const express = require('express');
const router = express.Router();
const { getContent } = require('../controllers/contentController');

// Public read-only content endpoint
router.get('/:key', getContent);

module.exports = router;
