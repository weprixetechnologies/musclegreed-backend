const { createClient } = require('redis');

let client = null;
let isConnected = false;

async function getRedisClient() {
  if (client && isConnected) {
    return client;
  }

  try {
    client = createClient({
      url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
    });

    client.on('error', (err) => {
      console.warn('Redis client error (falling back to direct DB):', err.message);
      isConnected = false;
    });

    client.on('connect', () => {
      isConnected = true;
      console.log('Connected to Redis successfully');
    });

    client.on('end', () => {
      isConnected = false;
    });

    await client.connect();
    isConnected = true;
    return client;
  } catch (err) {
    console.warn('Could not connect to Redis:', err.message);
    isConnected = false;
    return null;
  }
}

async function getCache(key) {
  try {
    const redis = await getRedisClient();
    if (!redis || !isConnected) return null;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.warn(`Redis getCache error for ${key}:`, err.message);
    return null;
  }
}

async function setCache(key, value, ttlSeconds = 3600) {
  try {
    const redis = await getRedisClient();
    if (!redis || !isConnected) return;
    const stringified = JSON.stringify(value);
    if (ttlSeconds) {
      await redis.set(key, stringified, { EX: ttlSeconds });
    } else {
      await redis.set(key, stringified);
    }
  } catch (err) {
    console.warn(`Redis setCache error for ${key}:`, err.message);
  }
}

async function delCache(key) {
  try {
    const redis = await getRedisClient();
    if (!redis || !isConnected) return;
    await redis.del(key);
  } catch (err) {
    console.warn(`Redis delCache error for ${key}:`, err.message);
  }
}

module.exports = {
  getRedisClient,
  getCache,
  setCache,
  delCache,
};
