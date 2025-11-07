/**
 * Performance Tracking Middleware
 * Tracks response times for all API requests
 */

import healthMonitor from '../utils/healthMonitor.js';

const performanceTracker = (req, res, next) => {
  const startTime = Date.now();

  // Use 'finish' event to capture all responses regardless of content type
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    
    // Track the request
    healthMonitor.trackRequest(responseTime);
    
    // Log slow requests (>1000ms)
    if (responseTime > 1000) {
      console.warn('[PERFORMANCE] Slow request detected:', {
        method: req.method,
        path: req.path,
        duration: `${responseTime}ms`,
        timestamp: new Date().toISOString()
      });
    }
  });

  next();
};

export default performanceTracker;
