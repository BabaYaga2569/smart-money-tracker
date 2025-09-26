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

/**
 * Get current time in Pacific Standard Time using multiple methods for reliability
 * @returns {Date} Current date/time in Pacific Time
 */
export const getPacificTime = () => {
  const now = new Date();
  
  // Method 1: Using toLocaleString with Pacific timezone (reliable and preserves time)
  const method1 = new Date(now.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles"
  }));
  
  // Method 2: Using toLocaleString with Swedish locale (more reliable formatting)
  const method2 = new Date(now.toLocaleString("sv-SE", {
    timeZone: "America/Los_Angeles"
  }));
  
  // Method 3: Using Intl.DateTimeFormat with parts for full control
  const method3Parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(now);
  
  const method3 = new Date(
    `${method3Parts.find(p => p.type === 'year').value}-` +
    `${method3Parts.find(p => p.type === 'month').value}-` +
    `${method3Parts.find(p => p.type === 'day').value}T` +
    `${method3Parts.find(p => p.type === 'hour').value}:` +
    `${method3Parts.find(p => p.type === 'minute').value}:` +
    `${method3Parts.find(p => p.type === 'second').value}`
  );
  
  // Debug logging for timezone calculations
  console.log('Pacific Time Debug:', {
    utc: now.toISOString(),
    method1: method1.toISOString(),
    method2: method2.toISOString(),
    method3: method3.toISOString(),
    selected: 'method2 (sv-SE locale - most reliable)'
  });
  
  // Use Method 2 (sv-SE locale) as it's most reliable for date parsing
  return method2;
};

/**
 * Calculate days until a target date using Pacific Time with bulletproof calculation
 * @param {string|Date} targetDate - Target date (YYYY-MM-DD format or Date object)
 * @returns {number} Number of days until the target date
 */
export const getDaysUntilDateInPacific = (targetDate) => {
  const today = getPacificTime();
  const payday = new Date(targetDate);
  
  // Set both dates to start of day for accurate day counting
  today.setHours(0, 0, 0, 0);
  payday.setHours(0, 0, 0, 0);
  
  const timeDiff = payday.getTime() - today.getTime();
  const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
  
  // Enhanced debugging for payday calculation
  console.log('Payday Calculation Debug:', {
    today: today.toISOString(),
    todayLocal: today.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }),
    payday: payday.toISOString(),
    paydayLocal: payday.toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }),
    timeDiffMs: timeDiff,
    timeDiffDays: timeDiff / (1000 * 60 * 60 * 24),
    daysDiffCeil: daysDiff,
    finalResult: Math.max(0, daysDiff)
  });
  
  // Ensure non-negative result
  return Math.max(0, daysDiff);
};