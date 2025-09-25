// DateUtils.js - Utility functions for handling dates without timezone conversion issues

/**
 * Parse a date string as a local date without applying UTC timezone conversion
 * This prevents the one-day shift issue when parsing CSV dates
 * @param {string} dateString - Date string in various formats (MM/DD/YYYY, YYYY-MM-DD, etc.)
 * @returns {Date} Date object representing the local date
 */
export const parseLocalDate = (dateString) => {
  if (!dateString) return null;
  
  // Handle MM/DD/YYYY or M/D/YYYY format (common in CSV files)
  if (dateString.includes('/')) {
    const parts = dateString.split('/');
    if (parts.length === 3) {
      const month = parseInt(parts[0]) - 1; // Month is 0-indexed in Date constructor
      const day = parseInt(parts[1]);
      const year = parseInt(parts[2]);
      
      // Validate the parsed values
      if (!isNaN(month) && !isNaN(day) && !isNaN(year) && 
          month >= 0 && month <= 11 && 
          day >= 1 && day <= 31 && 
          year >= 1900) {
        return new Date(year, month, day);
      }
    }
  }
  
  // Handle YYYY-MM-DD format (ISO-like but ensure local interpretation)
  if (dateString.includes('-') && dateString.match(/^\d{4}-\d{1,2}-\d{1,2}$/)) {
    const parts = dateString.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1; // Month is 0-indexed
      const day = parseInt(parts[2]);
      
      // Validate the parsed values
      if (!isNaN(year) && !isNaN(month) && !isNaN(day) && 
          month >= 0 && month <= 11 && 
          day >= 1 && day <= 31 && 
          year >= 1900) {
        return new Date(year, month, day);
      }
    }
  }
  
  // Handle single numbers (day of month)
  if (/^\d{1,2}$/.test(dateString.toString())) {
    const day = parseInt(dateString);
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const thisMonth = new Date(year, month, day);
    
    // If the date is in the past, assume next month
    if (thisMonth < today) {
      return new Date(year, month + 1, day);
    } else {
      return thisMonth;
    }
  }
  
  // Fallback: try the original Date constructor but warn about potential issues
  const fallbackDate = new Date(dateString);
  if (!isNaN(fallbackDate.getTime())) {
    console.warn(`DateUtils.parseLocalDate: Using fallback Date constructor for "${dateString}". This may cause timezone issues.`);
    return fallbackDate;
  }
  
  // If all parsing attempts failed, return null
  console.error(`DateUtils.parseLocalDate: Unable to parse date string "${dateString}"`);
  return null;
};

/**
 * Format a date for display in a consistent way
 * @param {Date|string} date - Date object or date string to format
 * @param {string} format - Format type ('short', 'long', 'iso')
 * @returns {string} Formatted date string
 */
export const formatDateForDisplay = (date, format = 'short') => {
  if (!date) return 'No date';
  
  // Convert string to Date object if needed
  let dateObj = date;
  if (typeof date === 'string') {
    dateObj = parseLocalDate(date);
    if (!dateObj) return date; // Return original string if parsing failed
  }
  
  if (!(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
    return 'Invalid date';
  }
  
  switch (format) {
    case 'short':
      return dateObj.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    case 'long':
      return dateObj.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    case 'iso':
      return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    case 'numeric':
      return dateObj.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    default:
      return dateObj.toLocaleDateString('en-US');
  }
};

/**
 * Format a date for use in HTML date input fields (YYYY-MM-DD format)
 * @param {Date|string} date - Date to format
 * @returns {string} Date in YYYY-MM-DD format
 */
export const formatDateForInput = (date) => {
  return formatDateForDisplay(date, 'iso');
};