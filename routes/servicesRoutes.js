const express = require('express');
const router = express.Router();
const { getServices, updateServices, resetServices } = require('../controllers/servicesController');
const adminAuth = require('../middleware/adminAuth');

// Public route for ISR / frontend
router.get('/services', getServices);

// Admin routes
router.put('/admin/services', adminAuth, updateServices);
router.post('/admin/services/reset', adminAuth, resetServices);

module.exports = router;
