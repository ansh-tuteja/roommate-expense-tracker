// Redis caching middleware for ExpenseHub
const redis = require('../lib/redis');

const shouldBypassCache = (req = {}) => {
  const query = req.query || {};
  const forceParam = query.force || query.nocache || query.refresh;
  if (forceParam && ['1', 'true', true].includes(forceParam)) {
    return true;
  }
  const header = req.headers ? req.headers['x-bypass-cache'] : null;
  if (header && ['1', 'true'].includes(header)) {
    return true;
  }
  return false;
};

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
      
      const bypassCache = shouldBypassCache(req);
      const cacheKey = generateCacheKey(prefix, userId, req.query);
      
      if (!bypassCache) {
        const cached = await redis.get(cacheKey);
        
        if (cached) {
          const data = JSON.parse(cached);
          // Add cache headers for browser caching
          res.set({
            'Cache-Control': 'private, max-age=60',
            'ETag': `"${Buffer.from(cached).toString('base64').slice(0, 16)}"`,
            'X-Data-Cache': 'HIT'
          });
          return res.json(data);
        }
      } else {
        res.set('X-Data-Cache', 'BYPASS');
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
          'ETag': `"${Buffer.from(JSON.stringify(data)).toString('base64').slice(0, 16)}"`,
          'X-Data-Cache': bypassCache ? 'REFRESH' : 'MISS'
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