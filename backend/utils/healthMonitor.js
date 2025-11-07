/**
 * Health Monitoring Utility
 * Checks service status and tracks performance metrics
 */

import admin from 'firebase-admin';

class HealthMonitor {
  constructor() {
    this.startTime = Date.now();
    this.requestCount = 0;
    this.totalResponseTime = 0;
    this.requestsPerMinute = [];
  }

  /**
   * Get system uptime in seconds
   */
  getUptime() {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Track API request for performance metrics
   */
  trackRequest(responseTime) {
    this.requestCount++;
    this.totalResponseTime += responseTime;
    
    // Track requests per minute
    const now = Date.now();
    this.requestsPerMinute.push(now);
    
    // Clean old entries (older than 1 minute)
    this.requestsPerMinute = this.requestsPerMinute.filter(
      timestamp => now - timestamp < 60000
    );
  }

  /**
   * Get average response time
   */
  getAverageResponseTime() {
    if (this.requestCount === 0) return 0;
    return Math.round(this.totalResponseTime / this.requestCount);
  }

  /**
   * Get requests per minute
   */
  getRequestsPerMinute() {
    return this.requestsPerMinute.length;
  }

  /**
   * Check Firebase connection
   */
  async checkFirebase() {
    const startTime = Date.now();
    try {
      const db = admin.firestore();
      // Simple read to test connection
      await db.collection('_health').doc('test').get();
      
      return {
        status: 'healthy',
        latency: `${Date.now() - startTime}ms`,
        message: 'Firebase connection successful'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latency: `${Date.now() - startTime}ms`,
        message: error.message,
        error: true
      };
    }
  }

  /**
   * Check Plaid API accessibility
   */
  async checkPlaid(plaidClient) {
    const startTime = Date.now();
    try {
      // We can't make a real Plaid call without credentials,
      // so we just check if the client is configured
      if (!plaidClient) {
        return {
          status: 'unhealthy',
          latency: '0ms',
          message: 'Plaid client not configured',
          error: true
        };
      }

      // Check if environment variables are set
      const hasConfig = process.env.PLAID_CLIENT_ID && 
                       process.env.PLAID_SECRET;
      
      if (!hasConfig) {
        return {
          status: 'unhealthy',
          latency: `${Date.now() - startTime}ms`,
          message: 'Plaid credentials not configured',
          error: true
        };
      }

      return {
        status: 'healthy',
        latency: `${Date.now() - startTime}ms`,
        message: 'Plaid client configured'
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        latency: `${Date.now() - startTime}ms`,
        message: error.message,
        error: true
      };
    }
  }

  /**
   * Get comprehensive health status
   */
  async getHealthStatus(plaidClient) {
    const [firebaseHealth, plaidHealth] = await Promise.all([
      this.checkFirebase(),
      this.checkPlaid(plaidClient)
    ]);

    const allHealthy = 
      firebaseHealth.status === 'healthy' && 
      plaidHealth.status === 'healthy';

    return {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: this.getUptime(),
      services: {
        firebase: firebaseHealth,
        plaid: plaidHealth
      },
      performance: {
        totalRequests: this.requestCount,
        avgResponseTime: `${this.getAverageResponseTime()}ms`,
        requestsPerMinute: this.getRequestsPerMinute()
      }
    };
  }
}

// Singleton instance
const healthMonitor = new HealthMonitor();

export default healthMonitor;
