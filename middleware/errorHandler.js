// Simple logger fallback if winston logger is not available
const logger = {
  error: (message, meta) => {
    console.error('[ERROR]', message, meta ? JSON.stringify(meta, null, 2) : '');
  },
  info: (message, meta) => {
    console.log('[INFO]', message, meta ? JSON.stringify(meta, null, 2) : '');
  },
  warn: (message, meta) => {
    console.warn('[WARN]', message, meta ? JSON.stringify(meta, null, 2) : '');
  }
};

// Standard error response format
const createErrorResponse = (message, code = 'GENERIC_ERROR', statusCode = 500) => {
  return {
    error: {
      message,
      code,
      statusCode,
      timestamp: new Date().toISOString()
    }
  };
};

// Centralized error handler middleware
const errorHandler = (err, req, res, next) => {
  // Log the error
  logger.error('Application Error:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query,
    user: req.session?.user?.id || 'anonymous',
    timestamp: new Date().toISOString()
  });

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json(createErrorResponse(
      'Validation failed: ' + Object.values(err.errors).map(e => e.message).join(', '),
      'VALIDATION_ERROR',
      400
    ));
  }

  if (err.name === 'CastError') {
    return res.status(400).json(createErrorResponse(
      'Invalid ID format',
      'INVALID_ID',
      400
    ));
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return res.status(409).json(createErrorResponse(
      `${field} already exists`,
      'DUPLICATE_ENTRY',
      409
    ));
  }

  if (err.name === 'MongoNetworkError' || err.name === 'MongoTimeoutError') {
    return res.status(503).json(createErrorResponse(
      'Database connection error. Please try again later.',
      'DATABASE_ERROR',
      503
    ));
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json(createErrorResponse(
      'Authentication required',
      'UNAUTHORIZED',
      401
    ));
  }

  // Default error response
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production' 
    ? 'An internal server error occurred' 
    : err.message;

  res.status(statusCode).json(createErrorResponse(message, 'INTERNAL_ERROR', statusCode));
};

// Async error handler wrapper
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 404 handler
const notFoundHandler = (req, res) => {
  res.status(404).json(createErrorResponse(
    `Route ${req.originalUrl} not found`,
    'NOT_FOUND',
    404
  ));
};

// Request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed:', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      user: req.session?.user?.id || 'anonymous'
    });
  });

  next();
};

module.exports = {
  errorHandler,
  asyncHandler,
  notFoundHandler,
  requestLogger,
  createErrorResponse
};