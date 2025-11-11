// formatters.js - Utility functions for formatting currency, dates, and other values

/**
 * Format a number as currency
 * @param {number} amount - Amount to format
 * @param {string} currency - Currency code (default: 'USD')
 * @returns {string} - Formatted currency string
 */
export function formatCurrency(amount, currency = 'USD') {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '$0.00';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a date in a readable format
 * @param {Date|string} date - Date to format
 * @param {string} format - Format type ('short', 'long', 'numeric')
 * @returns {string} - Formatted date string
 */
export function formatDate(date, format = 'short') {
  if (!date) return '';

  const dateObj = date instanceof Date ? date : new Date(date);

  if (isNaN(dateObj.getTime())) {
    return '';
  }

  const options = {
    short: { month: 'short', day: 'numeric', year: 'numeric' },
    long: { month: 'long', day: 'numeric', year: 'numeric' },
    numeric: { month: '2-digit', day: '2-digit', year: 'numeric' },
  };

  return new Intl.DateTimeFormat('en-US', options[format] || options.short).format(dateObj);
}

/**
 * Format a percentage value
 * @param {number} value - Value to format (0-1 or 0-100)
 * @param {boolean} isDecimal - Whether the value is in decimal format (0-1)
 * @returns {string} - Formatted percentage string
 */
export function formatPercentage(value, isDecimal = true) {
  if (value === null || value === undefined || isNaN(value)) {
    return '0%';
  }

  const percentage = isDecimal ? value * 100 : value;
  return `${percentage.toFixed(1)}%`;
}

/**
 * Format a number with commas for thousands
 * @param {number} num - Number to format
 * @returns {string} - Formatted number string
 */
export function formatNumber(num) {
  if (num === null || num === undefined || isNaN(num)) {
    return '0';
  }

  return new Intl.NumberFormat('en-US').format(num);
}

/**
 * Abbreviate large numbers (e.g., 1000 -> 1K, 1000000 -> 1M)
 * @param {number} num - Number to abbreviate
 * @returns {string} - Abbreviated number string
 */
export function abbreviateNumber(num) {
  if (num === null || num === undefined || isNaN(num)) {
    return '0';
  }

  if (num < 1000) {
    return num.toString();
  }

  const units = ['K', 'M', 'B', 'T'];
  let unitIndex = -1;
  let scaledNum = num;

  while (scaledNum >= 1000 && unitIndex < units.length - 1) {
    scaledNum /= 1000;
    unitIndex++;
  }

  return `${scaledNum.toFixed(1)}${units[unitIndex]}`;
}
