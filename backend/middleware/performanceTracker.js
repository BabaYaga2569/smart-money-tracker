/**
 * Performance Tracking Middleware
 * Tracks response times for all API requests
 */

import healthMonitor from '../utils/healthMonitor.js';

const performanceTracker = (req, res, next) => {
  const startTime = Date.now();

  // Override res.json to capture when response is sent
  const originalJson = res.json.bind(res);
  
  res.json = (body) => {
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
    
    return originalJson(body);
  };

  next();
};

export default performanceTracker;
