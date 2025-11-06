/**
 * Data Validation Utilities
 * Validates incoming data before processing
 */

import { createError } from '../middleware/errorHandler.js';

const validators = {
  /**
   * Validate Plaid account structure
   */
  validateAccount: (account) => {
    const errors = [];

    if (!account.account_id) {
      errors.push('Missing account_id');
    }

    if (!account.balances) {
      errors.push('Missing balances object');
    } else {
      // Check that balances are numbers (not strings)
      if (account.balances.current !== null && 
          typeof account.balances.current !== 'number') {
        errors.push('Invalid current balance (must be number)');
      }
      
      if (account.balances.available !== null && 
          account.balances.available !== undefined &&
          typeof account.balances.available !== 'number') {
        errors.push('Invalid available balance (must be number)');
      }
    }

    if (!account.name || typeof account.name !== 'string') {
      errors.push('Invalid or missing account name');
    }

    if (errors.length > 0) {
      throw createError.validationError('Account validation failed', errors);
    }

    return true;
  },

  /**
   * Validate transaction structure
   */
  validateTransaction: (transaction) => {
    const errors = [];

    if (!transaction.transaction_id && !transaction.id) {
      errors.push('Missing transaction_id');
    }

    if (typeof transaction.amount !== 'number') {
      errors.push('Invalid amount (must be number)');
    }

    if (!transaction.date || !/^\d{4}-\d{2}-\d{2}$/.test(transaction.date)) {
      errors.push('Invalid date format (must be YYYY-MM-DD)');
    }

    if (!transaction.name || typeof transaction.name !== 'string') {
      errors.push('Invalid or missing transaction name');
    }

    if (errors.length > 0) {
      throw createError.validationError('Transaction validation failed', errors);
    }

    return true;
  },

  /**
   * Validate user ID
   */
  validateUserId: (userId) => {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      throw createError.badRequest('Valid user ID required', 'MISSING_USER_ID');
    }
    return true;
  },

  /**
   * Ensure value is a number
   */
  ensureNumber: (value, fieldName = 'value', fallback = 0) => {
    if (value === null || value === undefined) return fallback;
    const num = Number(value);
    if (isNaN(num)) {
      console.warn(`[VALIDATOR] ${fieldName} is not a number, using fallback:`, value);
      return fallback;
    }
    return num;
  },

  /**
   * Sanitize object for logging (remove sensitive data)
   */
  sanitize: (obj) => {
    const sanitized = { ...obj };
    const sensitiveFields = ['access_token', 'public_token', 'password', 'secret'];
    
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });
    
    return sanitized;
  }
};

export default validators;
