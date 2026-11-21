const express = require('express');
const router = express.Router();
const multer = require('multer');
const adminAuth = require('../middleware/adminAuth');
const {
  getHomepage,
  updateHomepage,
  uploadMedia,
  resetHomepage,
} = require('../controllers/homepageController');

// Configure multer with memory storage (for direct stream to Bunny/file)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB (supports images & video loops)
  },
});

// Public endpoint for ISR homepage generation
router.get('/homepage', getHomepage);

// Admin-only endpoints
router.put('/admin/homepage', adminAuth, updateHomepage);
router.post('/admin/homepage/reset', adminAuth, resetHomepage);
router.post('/admin/upload', adminAuth, upload.single('file'), uploadMedia);
router.post('/admin/upload-multiple', adminAuth, upload.array('files', 10), uploadMedia);

module.exports = router;
