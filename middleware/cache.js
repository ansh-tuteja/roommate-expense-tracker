// Redis caching middleware for ExpenseHub
const Redis = require('ioredis');

// Initialize Redis connection (fallback if main server Redis fails)
let redis = null;
try {
  redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    retryDelayOnFailover: 100,
    enableReadyCheck: false,
    maxRetriesPerRequest: null
  });
} catch (error) {
  console.log('Cache middleware: Redis connection failed, caching disabled');
}

// Cache key generators
const generateCacheKey = (prefix, userId, params = {}) => {
  const paramStr = Object.keys(params).length ? `:${JSON.stringify(params)}` : '';
  return `expensehub:${prefix}:${userId}${paramStr}`;
};

// Generic cache middleware
const cacheMiddleware = (prefix, ttl = 300) => {
  return async (req, res, next) => {
    if (!redis) return next();
    
    try {
      const userId = req.session?.user?.id;
      if (!userId) return next();
      
      const cacheKey = generateCacheKey(prefix, userId, req.query);
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        const data = JSON.parse(cached);
        // Add cache headers for browser caching
        res.set({
          'Cache-Control': 'private, max-age=60',
          'ETag': `"${Buffer.from(cached).toString('base64').slice(0, 16)}"`
        });
        return res.json(data);
      }
      
      // Store original json method
      const originalJson = res.json;
      res.json = function(data) {
        // Cache the response
        redis.setex(cacheKey, ttl, JSON.stringify(data)).catch(err => {
          console.log('Cache set error:', err);
        });
        
        // Add cache headers
        res.set({
          'Cache-Control': 'private, max-age=60',
          'ETag': `"${Buffer.from(JSON.stringify(data)).toString('base64').slice(0, 16)}"`
        });
        
        // Call original json method
        return originalJson.call(this, data);
      };
      
      next();
    } catch (error) {
      console.log('Cache middleware error:', error);
      next();
    }
  };
};

// Dashboard data caching
const dashboardCache = cacheMiddleware('dashboard', 300); // 5 minutes

// Expense list caching
const expenseListCache = cacheMiddleware('expenses', 180); // 3 minutes

// Group data caching
const groupDataCache = cacheMiddleware('groups', 600); // 10 minutes

// Cache invalidation helpers
const invalidateUserCache = async (userId) => {
  if (!redis) return;
  
  try {
    const patterns = [
      `expensehub:dashboard:${userId}*`,
      `expensehub:expenses:${userId}*`,
      `expensehub:groups:${userId}*`
    ];
    
    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }
  } catch (error) {
    console.log('Cache invalidation error:', error);
  }
};

// Cache invalidation for group updates
const invalidateGroupCache = async (groupId) => {
  if (!redis) return;
  
  try {
    const keys = await redis.keys(`expensehub:*:*:*${groupId}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    console.log('Group cache invalidation error:', error);
  }
};

module.exports = {
  cacheMiddleware,
  dashboardCache,
  expenseListCache,
  groupDataCache,
  invalidateUserCache,
  invalidateGroupCache,
  generateCacheKey
};