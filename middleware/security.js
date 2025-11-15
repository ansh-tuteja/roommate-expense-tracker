// Security middleware
const addSecurityHeaders = (req, res, next) => {
  // Prevent XSS attacks
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "img-src 'self' data: https:; " +
    "connect-src 'self'"
  );
  
  // Remove server header
  res.removeHeader('X-Powered-By');
  
  next();
};

// Rate limiting for authentication endpoints
const authRateLimit = new Map();

const createAuthRateLimiter = (maxAttempts = 5, windowMs = 15 * 60 * 1000) => {
  return (req, res, next) => {
    const key = req.ip + ':' + req.path;
    const now = Date.now();
    
    if (!authRateLimit.has(key)) {
      authRateLimit.set(key, { attempts: 1, resetTime: now + windowMs });
      return next();
    }
    
    const record = authRateLimit.get(key);
    
    if (now > record.resetTime) {
      record.attempts = 1;
      record.resetTime = now + windowMs;
      return next();
    }
    
    if (record.attempts >= maxAttempts) {
      return res.status(429).json({
        error: 'Too many authentication attempts. Please try again later.'
      });
    }
    
    record.attempts++;
    next();
  };
};

// Session validation middleware
const validateSession = (req, res, next) => {
  if (req.session && req.session.user) {
    // Check for session hijacking by validating user agent
    if (req.session.userAgent && req.session.userAgent !== req.get('User-Agent')) {
      req.session.destroy((err) => {
        if (err) console.error('Session destruction error:', err);
      });
      return res.status(401).json({ error: 'Session security violation' });
    }
    
    // Store user agent on first request
    if (!req.session.userAgent) {
      req.session.userAgent = req.get('User-Agent');
    }
  }
  
  next();
};

module.exports = {
  addSecurityHeaders,
  createAuthRateLimiter,
  validateSession
};