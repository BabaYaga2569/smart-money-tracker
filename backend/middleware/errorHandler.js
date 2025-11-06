/**
 * Centralized Error Handling Middleware
 * Catches all errors and returns structured responses
 */

class AppError extends Error {
  constructor(message, statusCode, code = 'UNKNOWN_ERROR', retryable = false) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.retryable = retryable;
    this.timestamp = Date.now();
    Error.captureStackTrace(this, this.constructor);
  }
}

const errorHandler = (err, req, res, next) => {
  // Log the error
  console.error('[ERROR_HANDLER]', {
    message: err.message,
    code: err.code || 'UNKNOWN_ERROR',
    statusCode: err.statusCode || 500,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString(),
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

  // Structured error response
  const errorResponse = {
    error: true,
    code: err.code || 'INTERNAL_ERROR',
    message: err.message || 'An unexpected error occurred',
    timestamp: Date.now(),
    retryable: err.retryable || false
  };

  // Include validation errors if present
  if (err.errors) {
    errorResponse.errors = err.errors;
  }

  // Only include stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
    errorResponse.path = req.path;
  }

  // Send response
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json(errorResponse);
};

// Common error creators
const createError = {
  badRequest: (message, code = 'BAD_REQUEST') => 
    new AppError(message, 400, code, false),
  
  unauthorized: (message = 'Unauthorized') => 
    new AppError(message, 401, 'UNAUTHORIZED', false),
  
  notFound: (message = 'Resource not found') => 
    new AppError(message, 404, 'NOT_FOUND', false),
  
  plaidError: (message, retryable = true) => 
    new AppError(message, 502, 'PLAID_ERROR', retryable),
  
  firebaseError: (message) => 
    new AppError(message, 500, 'FIREBASE_ERROR', true),
  
  validationError: (message, errors = []) => {
    const err = new AppError(message, 400, 'VALIDATION_ERROR', false);
    err.errors = errors;
    return err;
  },
  
  timeout: (message = 'Request timeout') => 
    new AppError(message, 504, 'TIMEOUT', true)
};

export { errorHandler, AppError, createError };
