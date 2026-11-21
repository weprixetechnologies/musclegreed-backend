const express = require('express');
const router = express.Router();
const { checkPhone, login, getMe, getMyMemberships } = require('../controllers/memberController');
const { memberAuth } = require('../middleware/memberAuth');

// Public routes for members
router.post('/member/check-phone', checkPhone);
router.post('/member/login', login);

// Authenticated member routes
router.get('/member/me', memberAuth, getMe);
router.get('/member/memberships', memberAuth, getMyMemberships);

module.exports = router;
