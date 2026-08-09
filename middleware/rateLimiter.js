const rateLimit = require('express-rate-limit');
const cacheService = require('../services/cacheService');

async function logRateLimitHit(ip) {
  if (cacheService.isRedisConnected()) {
    const redis = cacheService.getRedisClient();
    try {
      const today = new Date().toISOString().slice(0, 10);
      await redis.hincrby(`ratelimit:metrics:${today}`, 'hits', 1);
      await redis.hincrby(`ratelimit:ips:${today}`, ip, 1);
      await redis.expire(`ratelimit:metrics:${today}`, 7 * 24 * 60 * 60);
      await redis.expire(`ratelimit:ips:${today}`, 7 * 24 * 60 * 60);
    } catch (err) {
      console.warn('Failed to log rate limit hit to Redis:', err.message);
    }
  }
}

async function logRateLimitBlock(ip) {
  if (cacheService.isRedisConnected()) {
    const redis = cacheService.getRedisClient();
    try {
      const today = new Date().toISOString().slice(0, 10);
      await redis.hincrby(`ratelimit:metrics:${today}`, 'blocks', 1);
      await redis.expire(`ratelimit:metrics:${today}`, 7 * 24 * 60 * 60);
    } catch (err) {
      console.warn('Failed to log rate limit block to Redis:', err.message);
    }
  }
}

const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  handler: (req, res, next, options) => {
    logRateLimitBlock(req.ip);
    res.status(options.statusCode).json(options.message);
  },
  message: {
    error: 'Too many AI quiz generation requests from this IP. Please try again after a minute.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const aiRateLimiterWithLogging = (req, res, next) => {
  logRateLimitHit(req.ip);
  aiRateLimiter(req, res, next);
};

module.exports = {
  aiRateLimiter: aiRateLimiterWithLogging
};
