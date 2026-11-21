const express = require('express');
const router = express.Router();
const {
  getSubscriptions,
  updateSubscriptions,
  resetSubscriptions,
} = require('../controllers/subscriptionsController');
const adminAuth = require('../middleware/adminAuth');

// Public route for ISR / frontend
router.get('/subscriptions', getSubscriptions);

// Admin routes
router.put('/admin/subscriptions', adminAuth, updateSubscriptions);
router.post('/admin/subscriptions/reset', adminAuth, resetSubscriptions);

module.exports = router;
