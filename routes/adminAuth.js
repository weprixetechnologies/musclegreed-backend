const express = require('express');
const router = express.Router();
const { login, refreshToken, logout, getMe } = require('../controllers/adminAuthController');
const adminAuth = require('../middleware/adminAuth');

router.post('/login', login);
router.post('/refresh-token', refreshToken);
router.post('/logout', logout);
router.get('/me', adminAuth, getMe);

module.exports = router;
