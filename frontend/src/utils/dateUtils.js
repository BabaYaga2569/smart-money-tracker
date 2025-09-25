// dateUtils.js - Utility functions for handling dates without timezone issues

/**
 * Parse a date string and return a Date object in local timezone
 * This prevents the UTC interpretation issue that causes dates to shift
 * @param {string} dateString - Date string in various formats
 * @returns {Date} Date object in local timezone
 */
export function parseLocalDate(dateString) {
  if (!dateString) return null;
  
  // Handle different date formats
  if (typeof dateString === 'string') {
    // If it's already in ISO format (YYYY-MM-DD), parse it as local date
    const isoMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      // Create date in local timezone by using Date constructor with separate components
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    
    // For other formats (MM/DD/YYYY, etc.), let JavaScript parse normally
    // These are typically interpreted as local time by default
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  return null;
}

/**
 * Format a Date object to YYYY-MM-DD string (local date components)
 * This ensures we get the local date components, not UTC components
 * @param {Date} date - Date object to format
 * @returns {string} Date string in YYYY-MM-DD format
 */
export function formatToLocalISOString(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return '';
  }
  
  // Use local date components to avoid timezone shifting
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Format a date string or Date object for display
 * @param {string|Date} dateInput - Date string or Date object
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date string
 */
export function formatDateForDisplay(dateInput, options = {}) {
  if (!dateInput) return '';
  
  let date;
  if (typeof dateInput === 'string') {
    date = parseLocalDate(dateInput);
  } else if (dateInput instanceof Date) {
    date = dateInput;
  } else {
    return '';
  }
  
  if (!date || isNaN(date.getTime())) {
    return '';
  }
  
  const defaultOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  };
  
  return date.toLocaleDateString('en-US', { ...defaultOptions, ...options });
}

/**
 * Create a date from individual components (year, month, day) in local timezone
 * @param {number} year - Full year (e.g., 2025)
 * @param {number} month - Month (1-12)
 * @param {number} day - Day of month (1-31)
 * @returns {Date} Date object in local timezone
 */
export function createLocalDate(year, month, day) {
  return new Date(year, month - 1, day);
}

/**
 * Check if two dates represent the same day (ignoring time)
 * @param {Date|string} date1 - First date
 * @param {Date|string} date2 - Second date
 * @returns {boolean} True if same day
 */
export function isSameDay(date1, date2) {
  const d1 = typeof date1 === 'string' ? parseLocalDate(date1) : date1;
  const d2 = typeof date2 === 'string' ? parseLocalDate(date2) : date2;
  
  if (!d1 || !d2) return false;
  
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}