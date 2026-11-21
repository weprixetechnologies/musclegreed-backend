const pool = require('../config/db');
const { getCache, setCache, delCache } = require('../config/redis');
const { defaultServicesData } = require('../models/defaultServices');

const REDIS_SERVICES_KEY = 'services:list';

// Ensure table exists and has initial data
async function ensureServicesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS services_config (
      id INT PRIMARY KEY,
      data JSON NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  const [rows] = await pool.query('SELECT data FROM services_config WHERE id = 1');
  if (rows.length === 0) {
    await pool.query(
      'INSERT INTO services_config (id, data) VALUES (1, ?)',
      [JSON.stringify(defaultServicesData)]
    );
    return defaultServicesData;
  }
  return typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
}

// 1. GET Services (Public for ISR)
async function getServices(req, res) {
  try {
    const cached = await getCache(REDIS_SERVICES_KEY);
    if (cached) {
      return res.status(200).json({
        success: true,
        source: 'redis',
        data: cached,
      });
    }

    const data = await ensureServicesTable();
    await setCache(REDIS_SERVICES_KEY, data, 86400);

    return res.status(200).json({
      success: true,
      source: 'database',
      data,
    });
  } catch (error) {
    console.error('Error fetching services:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch services.',
      fallback: defaultServicesData,
    });
  }
}

// 2. PUT Update Services (Admin only)
async function updateServices(req, res) {
  try {
    const services = req.body;
    if (!Array.isArray(services)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payload: services must be an array.',
      });
    }

    await ensureServicesTable();

    await pool.query(
      'UPDATE services_config SET data = ? WHERE id = 1',
      [JSON.stringify(services)]
    );

    await setCache(REDIS_SERVICES_KEY, services, 86400);

    return res.status(200).json({
      success: true,
      message: 'Services updated successfully and cached in Redis.',
      data: services,
    });
  } catch (error) {
    console.error('Error updating services:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update services.',
    });
  }
}

// 3. POST Reset Services to Defaults (Admin only)
async function resetServices(req, res) {
  try {
    await ensureServicesTable();

    await pool.query(
      'UPDATE services_config SET data = ? WHERE id = 1',
      [JSON.stringify(defaultServicesData)]
    );

    await setCache(REDIS_SERVICES_KEY, defaultServicesData, 86400);

    return res.status(200).json({
      success: true,
      message: 'Services reset to default configuration.',
      data: defaultServicesData,
    });
  } catch (error) {
    console.error('Error resetting services:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reset services.',
    });
  }
}

module.exports = {
  getServices,
  updateServices,
  resetServices,
};
