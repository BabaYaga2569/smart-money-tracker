/**
 * Structured Logging Utility
 * Provides consistent logging with levels, categories, and context
 */

import chalk from 'chalk';

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  PERFORMANCE: 4
};

class Logger {
  constructor() {
    this.level = process.env.LOG_LEVEL || 'INFO';
    this.isDevelopment = process.env.NODE_ENV !== 'production';
  }

  /**
   * Format log message for output
   */
  formatMessage(level, category, message, data = {}) {
    const timestamp = new Date().toISOString();
    
    if (this.isDevelopment) {
      // Pretty format for development with colors
      return {
        level,
        category,
        message,
        data,
        timestamp
      };
    } else {
      // JSON format for production
      return JSON.stringify({
        level,
        category,
        message,
        data,
        timestamp,
        environment: process.env.NODE_ENV
      });
    }
  }

  /**
   * Pretty print for development
   */
  prettyPrint(level, category, message, data) {
    const timestamp = new Date().toISOString();
    
    // Color-code by level
    let levelColor;
    switch(level) {
      case 'DEBUG': levelColor = chalk.gray; break;
      case 'INFO': levelColor = chalk.blue; break;
      case 'WARN': levelColor = chalk.yellow; break;
      case 'ERROR': levelColor = chalk.red; break;
      case 'PERFORMANCE': levelColor = chalk.magenta; break;
      default: levelColor = chalk.white;
    }

    console.log(
      levelColor(`[${level}]`),
      chalk.cyan(`[${category}]`),
      message
    );

    if (Object.keys(data).length > 0) {
      console.log(chalk.gray('  '), data);
    }
    
    console.log(chalk.gray(`  timestamp: ${timestamp}\n`));
  }

  /**
   * Check if log level should be logged
   */
  shouldLog(level) {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  /**
   * Debug level logging
   */
  debug(category, message, data = {}) {
    if (!this.shouldLog('DEBUG')) return;
    
    if (this.isDevelopment) {
      this.prettyPrint('DEBUG', category, message, data);
    } else {
      console.log(this.formatMessage('DEBUG', category, message, data));
    }
  }

  /**
   * Info level logging
   */
  info(category, message, data = {}) {
    if (!this.shouldLog('INFO')) return;
    
    if (this.isDevelopment) {
      this.prettyPrint('INFO', category, message, data);
    } else {
      console.log(this.formatMessage('INFO', category, message, data));
    }
  }

  /**
   * Warning level logging
   */
  warn(category, message, data = {}) {
    if (!this.shouldLog('WARN')) return;
    
    if (this.isDevelopment) {
      this.prettyPrint('WARN', category, message, data);
    } else {
      console.warn(this.formatMessage('WARN', category, message, data));
    }
  }

  /**
   * Error level logging
   */
  error(category, message, error = null, data = {}) {
    if (!this.shouldLog('ERROR')) return;
    
    const errorData = {
      ...data,
      error: error ? {
        message: error.message,
        code: error.code,
        stack: this.isDevelopment ? error.stack : undefined
      } : undefined
    };
    
    if (this.isDevelopment) {
      this.prettyPrint('ERROR', category, message, errorData);
    } else {
      console.error(this.formatMessage('ERROR', category, message, errorData));
    }
  }

  /**
   * Performance logging
   */
  performance(category, operation, duration, data = {}) {
    if (!this.shouldLog('PERFORMANCE')) return;
    
    const perfData = {
      ...data,
      duration: `${duration}ms`,
      slow: duration > 1000
    };
    
    const message = `${operation} completed in ${duration}ms`;
    
    if (this.isDevelopment) {
      this.prettyPrint('PERFORMANCE', category, message, perfData);
    } else {
      console.log(this.formatMessage('PERFORMANCE', category, message, perfData));
    }
  }

  /**
   * Log API request
   */
  request(method, path, data = {}) {
    // Sanitize sensitive data
    const sanitized = this.sanitize(data);
    this.info('API_REQUEST', `${method} ${path}`, sanitized);
  }

  /**
   * Log API response
   */
  response(method, path, statusCode, duration, data = {}) {
    const sanitized = this.sanitize(data);
    this.info('API_RESPONSE', `${method} ${path} [${statusCode}]`, {
      ...sanitized,
      duration: `${duration}ms`
    });
  }

  /**
   * Sanitize sensitive data
   */
  sanitize(data) {
    if (!data || typeof data !== 'object') return data;
    
    const sanitized = { ...data };
    const sensitiveFields = [
      'access_token',
      'public_token',
      'password',
      'secret',
      'apiKey',
      'authorization'
    ];
    
    // Recursively sanitize nested objects
    Object.keys(sanitized).forEach(key => {
      if (sensitiveFields.includes(key)) {
        sanitized[key] = '[REDACTED]';
      } else if (sanitized[key] && typeof sanitized[key] === 'object' && !Array.isArray(sanitized[key])) {
        sanitized[key] = this.sanitize(sanitized[key]);
      }
    });
    
    return sanitized;
  }

  /**
   * Time a function execution
   */
  async time(category, operation, fn) {
    const startTime = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      this.performance(category, operation, duration);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.error(category, `${operation} failed after ${duration}ms`, error);
      throw error;
    }
  }
}

// Singleton instance
const logger = new Logger();

export default logger;
