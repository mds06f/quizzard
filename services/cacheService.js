const Redis = require('ioredis');

let redisClient = null;
let isRedisConnected = false;

// Simple in-memory fallback store: Map of key -> { value, expiresAt }
const inMemoryCache = new Map();

try {
  // Use REDIS_URL from environment variables if defined, otherwise default to local Redis
  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  
  redisClient = new Redis(redisUrl, {
    maxRetriesPerRequest: 1, // Fail fast to fall back quickly if connection is blocked/refused
    connectTimeout: 2000,
    retryStrategy(times) {
      if (times > 3) {
        // Stop retrying and fallback
        return null;
      }
      return Math.min(times * 100, 1000);
    }
  });

  redisClient.on('connect', () => {
    console.log('Redis client attempting connection...');
  });

  redisClient.on('ready', () => {
    console.log('Redis client successfully connected and ready.');
    isRedisConnected = true;
  });

  redisClient.on('error', (err) => {
    console.warn('Redis client error, falling back to in-memory cache:', err.message);
    isRedisConnected = false;
  });

  redisClient.on('close', () => {
    console.warn('Redis client connection closed, falling back to in-memory cache.');
    isRedisConnected = false;
  });
} catch (err) {
  console.warn('Failed to initialize Redis client, falling back to in-memory cache:', err.message);
  isRedisConnected = false;
}

// Memory Cache Helpers
function setMemoryCache(key, value, ttlSeconds) {
  const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
  inMemoryCache.set(key, { value, expiresAt });
}

function getMemoryCache(key) {
  const item = inMemoryCache.get(key);
  if (!item) return null;
  if (item.expiresAt && Date.now() > item.expiresAt) {
    inMemoryCache.delete(key);
    return null;
  }
  return item.value;
}

/**
 * Gets a cached item by key.
 * @param {string} key
 * @returns {Promise<any>} The parsed cached item, or null if not found/expired.
 */
async function get(key) {
  if (isRedisConnected && redisClient) {
    try {
      const val = await redisClient.get(key);
      return val ? JSON.parse(val) : null;
    } catch (err) {
      console.warn(`Redis get error for key "${key}":`, err.message);
    }
  }
  return getMemoryCache(key);
}

/**
 * Sets a cached item with a key, value, and optional TTL.
 * @param {string} key
 * @param {any} value
 * @param {number} [ttlSeconds]
 */
async function set(key, value, ttlSeconds) {
  if (isRedisConnected && redisClient) {
    try {
      if (ttlSeconds) {
        await redisClient.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      } else {
        await redisClient.set(key, JSON.stringify(value));
      }
      return;
    } catch (err) {
      console.warn(`Redis set error for key "${key}":`, err.message);
    }
  }
  setMemoryCache(key, value, ttlSeconds);
}

/**
 * Deletes a cached item by key.
 * @param {string} key
 */
async function del(key) {
  if (isRedisConnected && redisClient) {
    try {
      await redisClient.del(key);
      return;
    } catch (err) {
      console.warn(`Redis del error for key "${key}":`, err.message);
    }
  }
  inMemoryCache.delete(key);
}

/**
 * Invalidates quiz cache entries.
 * Deletes 'quiz:sections' and optionally all questions matching sectionId.
 * @param {string|number} [sectionId]
 */
async function invalidateQuizCaches(sectionId = null) {
  // Always delete sections list cache
  await del('quiz:sections');

  if (sectionId) {
    if (isRedisConnected && redisClient) {
      try {
        const keys = await redisClient.keys(`quiz:questions:${sectionId}:*`);
        if (keys && keys.length > 0) {
          await redisClient.del(keys);
        }
      } catch (err) {
        console.warn('Redis key scan/delete error:', err.message);
      }
    }
    // Handle memory cache deletion
    for (const key of inMemoryCache.keys()) {
      if (key.startsWith(`quiz:questions:${sectionId}:`)) {
        inMemoryCache.delete(key);
      }
    }
  } else {
    // Delete all quiz:questions:*
    if (isRedisConnected && redisClient) {
      try {
        const keys = await redisClient.keys('quiz:questions:*');
        if (keys && keys.length > 0) {
          await redisClient.del(keys);
        }
      } catch (err) {
        console.warn('Redis key scan/delete error:', err.message);
      }
    }
    for (const key of inMemoryCache.keys()) {
      if (key.startsWith('quiz:questions:')) {
        inMemoryCache.delete(key);
      }
    }
  }
}

module.exports = {
  get,
  set,
  del,
  invalidateQuizCaches,
  getRedisClient: () => redisClient,
  isRedisConnected: () => isRedisConnected
};
