const express = require('express');
const router = express.Router();
const multer = require('multer');
const adminAuth = require('../middleware/adminAuth');
const {
  getPaymentSettings,
  updatePaymentSettings,
  uploadPaymentProof,
  lookupMembership,
  enrollSubscription,
  renewMembership,
  getAdminSubscriptionOrders,
  reviewSubscriptionOrder,
  getAdminMembers,
  updateMemberStatus,
  updateMembershipStatus,
} = require('../controllers/membershipController');

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB limit for payment screenshots
  },
});

// ================= PUBLIC ENDPOINTS =================
// 1. Payment QR / UPI info
router.get('/payment-settings', getPaymentSettings);

// 2. Upload screenshot proof (Public for subscribers)
router.post('/upload-proof', upload.single('file'), uploadPaymentProof);

// 3. Lookup membership by ID (for non-login renewal)
router.get('/memberships/lookup/:membershipId', lookupMembership);

// 4. Enroll new subscription
router.post('/subscriptions/enroll', enrollSubscription);

// 5. Renew or extend membership
router.post('/memberships/renew', renewMembership);

// ================= ADMIN ENDPOINTS =================
// Payment settings
router.put('/admin/payment-settings', adminAuth, updatePaymentSettings);

// Orders / Approvals
router.get('/admin/subscription-orders', adminAuth, getAdminSubscriptionOrders);
router.put('/admin/subscription-orders/:orderId/review', adminAuth, reviewSubscriptionOrder);

// Members directory
router.get('/admin/members', adminAuth, getAdminMembers);
router.put('/admin/members/:id/status', adminAuth, updateMemberStatus);
router.put('/admin/memberships/:membershipId/status', adminAuth, updateMembershipStatus);

module.exports = router;
