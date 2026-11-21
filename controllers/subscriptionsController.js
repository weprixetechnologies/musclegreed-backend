const pool = require('../config/db');
const { getCache, setCache, delCache } = require('../config/redis');
const { defaultSubscriptionsData } = require('../models/defaultSubscriptions');

const REDIS_SUBSCRIPTIONS_KEY = 'subscriptions:list';

// Ensure table exists and has initial data
async function ensureSubscriptionsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions_config (
      id INT PRIMARY KEY,
      data JSON NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  const [rows] = await pool.query('SELECT data FROM subscriptions_config WHERE id = 1');
  if (rows.length === 0) {
    await pool.query(
      'INSERT INTO subscriptions_config (id, data) VALUES (1, ?)',
      [JSON.stringify(defaultSubscriptionsData)]
    );
    return defaultSubscriptionsData;
  }
  return typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
}

// 1. GET Subscriptions (Public for ISR)
async function getSubscriptions(req, res) {
  try {
    const cached = await getCache(REDIS_SUBSCRIPTIONS_KEY);
    if (cached) {
      return res.status(200).json({
        success: true,
        source: 'redis',
        data: cached,
      });
    }

    const data = await ensureSubscriptionsTable();
    await setCache(REDIS_SUBSCRIPTIONS_KEY, data, 86400);

    return res.status(200).json({
      success: true,
      source: 'database',
      data,
    });
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch subscriptions.',
      fallback: defaultSubscriptionsData,
    });
  }
}

// 2. PUT Update Subscriptions (Admin only)
async function updateSubscriptions(req, res) {
  try {
    const subscriptions = req.body;
    if (!subscriptions || typeof subscriptions !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Invalid payload: subscriptions must be an object keyed by serviceId.',
      });
    }

    await ensureSubscriptionsTable();

    await pool.query(
      'UPDATE subscriptions_config SET data = ? WHERE id = 1',
      [JSON.stringify(subscriptions)]
    );

    await setCache(REDIS_SUBSCRIPTIONS_KEY, subscriptions, 86400);

    return res.status(200).json({
      success: true,
      message: 'Subscriptions updated successfully and cached in Redis.',
      data: subscriptions,
    });
  } catch (error) {
    console.error('Error updating subscriptions:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update subscriptions.',
    });
  }
}

// 3. POST Reset Subscriptions to Defaults (Admin only)
async function resetSubscriptions(req, res) {
  try {
    await ensureSubscriptionsTable();

    await pool.query(
      'UPDATE subscriptions_config SET data = ? WHERE id = 1',
      [JSON.stringify(defaultSubscriptionsData)]
    );

    await setCache(REDIS_SUBSCRIPTIONS_KEY, defaultSubscriptionsData, 86400);

    return res.status(200).json({
      success: true,
      message: 'Subscriptions reset to default configuration.',
      data: defaultSubscriptionsData,
    });
  } catch (error) {
    console.error('Error resetting subscriptions:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reset subscriptions.',
    });
  }
}

module.exports = {
  getSubscriptions,
  updateSubscriptions,
  resetSubscriptions,
};
