/**
 * Safe Data Access Utilities
 * Prevents crashes from undefined/null access
 */

/**
 * Safely get nested object property
 * @example safeGet(user, 'address.city', 'Unknown')
 */
export const safeGet = (obj, path, defaultValue = null) => {
  if (!obj) return defaultValue;
  
  const keys = path.split('.');
  let result = obj;
  
  for (const key of keys) {
    if (result === null || result === undefined) {
      return defaultValue;
    }
    result = result[key];
  }
  
  return result !== undefined ? result : defaultValue;
};

/**
 * Safely parse number
 */
export const safeNumber = (value, fallback = 0) => {
  if (value === null || value === undefined) return fallback;
  const num = Number(value);
  return isNaN(num) ? fallback : num;
};

/**
 * Safely format currency
 */
export const safeCurrency = (value, fallback = '$0.00') => {
  const num = safeNumber(value);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(num);
  } catch (error) {
    console.warn('[safeCurrency] Formatting error:', error);
    return fallback;
  }
};

/**
 * Safely access array
 */
export const safeArray = (value, fallback = []) => {
  return Array.isArray(value) ? value : fallback;
};

/**
 * Safely access string
 */
export const safeString = (value, fallback = '') => {
  return typeof value === 'string' ? value : String(fallback);
};

/**
 * Check if value exists and is not empty
 */
export const hasValue = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
};

/**
 * Safely execute function with fallback
 */
export const safeTry = (fn, fallback = null) => {
  try {
    return fn();
  } catch (error) {
    console.warn('[safeTry] Function execution failed:', error);
    return fallback;
  }
};

export default {
  safeGet,
  safeNumber,
  safeCurrency,
  safeArray,
  safeString,
  hasValue,
  safeTry
};
