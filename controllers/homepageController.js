const pool = require('../config/db');
const { getCache, setCache, delCache } = require('../config/redis');
const { defaultHomepageData } = require('../models/defaultHomepage');
const { uploadImage, uploadMultipleImages } = require('../services/uploadService');

const REDIS_HOMEPAGE_KEY = 'homepage:config';

// Ensure table exists and has initial data
async function ensureTableAndData() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS homepage_config (
      id INT PRIMARY KEY,
      data JSON NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  const [rows] = await pool.query('SELECT data FROM homepage_config WHERE id = 1');
  if (rows.length === 0) {
    await pool.query(
      'INSERT INTO homepage_config (id, data) VALUES (1, ?)',
      [JSON.stringify(defaultHomepageData)]
    );
    return defaultHomepageData;
  }
  return typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
}

// 1. GET Homepage Data (Public for ISR)
async function getHomepage(req, res) {
  try {
    // Check Redis first for fastest response
    const cached = await getCache(REDIS_HOMEPAGE_KEY);
    if (cached) {
      return res.status(200).json({
        success: true,
        source: 'redis',
        data: cached,
      });
    }

    // Cache miss: query MySQL
    const data = await ensureTableAndData();

    // Cache in Redis for 1 day (or until modified)
    await setCache(REDIS_HOMEPAGE_KEY, data, 86400);

    return res.status(200).json({
      success: true,
      source: 'database',
      data,
    });
  } catch (error) {
    console.error('getHomepage error:', error);
    // Even if DB fails, return default data so frontend never breaks
    return res.status(200).json({
      success: true,
      source: 'fallback',
      data: defaultHomepageData,
    });
  }
}

// 2. PUT Homepage Data (Protected Admin Endpoint)
async function updateHomepage(req, res) {
  try {
    const updatedData = req.body;

    if (!updatedData || typeof updatedData !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Invalid homepage configuration payload',
      });
    }

    await ensureTableAndData();

    // Upsert into MySQL
    await pool.query(
      'INSERT INTO homepage_config (id, data) VALUES (1, ?) ON DUPLICATE KEY UPDATE data = VALUES(data)',
      [JSON.stringify(updatedData)]
    );

    // Update Redis cache immediately
    await setCache(REDIS_HOMEPAGE_KEY, updatedData, 86400);

    return res.status(200).json({
      success: true,
      message: 'Homepage configuration updated and cached in Redis successfully',
      data: updatedData,
    });
  } catch (error) {
    console.error('updateHomepage error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update homepage configuration',
      error: error.message,
    });
  }
}

// 3. POST Upload File (Protected Admin Endpoint)
async function uploadMedia(req, res) {
  try {
    if (!req.file && (!req.files || req.files.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
      });
    }

    if (req.file) {
      const result = await uploadImage(req.file, req.body.folder || 'gm');
      if (result.success) {
        return res.status(200).json(result);
      } else {
        return res.status(500).json(result);
      }
    }

    if (req.files) {
      const result = await uploadMultipleImages(req.files, req.body.folder || 'gm');
      return res.status(200).json(result);
    }
  } catch (error) {
    console.error('uploadMedia error:', error);
    return res.status(500).json({
      success: false,
      message: 'Upload failed',
      error: error.message,
    });
  }
}

// 4. POST Reset Homepage to Defaults
async function resetHomepage(req, res) {
  try {
    await ensureTableAndData();
    await pool.query(
      'UPDATE homepage_config SET data = ? WHERE id = 1',
      [JSON.stringify(defaultHomepageData)]
    );
    await setCache(REDIS_HOMEPAGE_KEY, defaultHomepageData, 86400);

    return res.status(200).json({
      success: true,
      message: 'Homepage configuration reset to defaults',
      data: defaultHomepageData,
    });
  } catch (error) {
    console.error('resetHomepage error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reset homepage configuration',
    });
  }
}

module.exports = {
  getHomepage,
  updateHomepage,
  uploadMedia,
  resetHomepage,
};
