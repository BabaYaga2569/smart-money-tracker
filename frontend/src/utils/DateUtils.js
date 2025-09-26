// DateUtils.js - Utility functions for handling dates without timezone conversion issues

/**
 * Parse a date string as a local date without applying UTC timezone conversion
 * This prevents the one-day shift issue when parsing CSV dates
 * @param {string} dateString - Date string in various formats (MM/DD/YYYY, YYYY-MM-DD, etc.)
 * @returns {Date} Date object representing the local date
 */
export const parseLocalDate = (dateString) => {
  if (!dateString) return null;
  
  // Convert to string if it's not already
  const dateStr = String(dateString);
  
  // Handle MM/DD/YYYY or M/D/YYYY format (common in CSV files)
  if (dateStr.includes('/')) {
    const parts = dateStr.split('/');
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
  if (dateStr.includes('-') && dateStr.match(/^\d{4}-\d{1,2}-\d{1,2}$/)) {
    const parts = dateStr.split('-');
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
  if (/^\d{1,2}$/.test(dateStr)) {
    const day = parseInt(dateStr);
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
  const fallbackDate = new Date(dateStr);
  if (!isNaN(fallbackDate.getTime())) {
    console.warn(`DateUtils.parseLocalDate: Using fallback Date constructor for "${dateStr}". This may cause timezone issues.`);
    return fallbackDate;
  }
  
  // If all parsing attempts failed, return null
  console.error(`DateUtils.parseLocalDate: Unable to parse date string "${dateStr}"`);
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
 * Get current time in Pacific Time using manual UTC offset calculation
 * NUCLEAR FIX: Completely manual calculation to avoid all timezone conversion issues
 * @returns {Date} Current date/time in Pacific Time
 */
export const getPacificTime = () => {
  const now = new Date();
  
  // MANUAL PACIFIC TIME CALCULATION
  // Pacific Standard Time is UTC - 8 hours
  // Pacific Daylight Time is UTC - 7 hours
  // For this nuclear fix, we'll use PST (UTC - 8) as specified in requirements
  const pacificOffset = 8 * 60 * 60 * 1000; // 8 hours in milliseconds
  const pacificTime = new Date(now.getTime() - pacificOffset);
  
  // Debug logging for manual calculation
  console.log('MANUAL PACIFIC TIME CALCULATION:', {
    utcNow: now.toISOString(),
    utcTimestamp: now.getTime(),
    pacificOffset: pacificOffset,
    pacificTimestamp: pacificTime.getTime(),
    pacificTime: pacificTime.toISOString(),
    pacificLocalString: pacificTime.toString(),
    calculationMethod: 'Manual UTC - 8 hours'
  });
  
  return pacificTime;
};

/**
 * Calculate days until a target date using manual Pacific Time calculation
 * NUCLEAR FIX: Bulletproof manual calculation as specified in requirements
 * @param {string|Date} targetDate - Target date (YYYY-MM-DD format or Date object)
 * @returns {number} Number of days until the target date
 */
export const getDaysUntilDateInPacific = (targetDate) => {
  // MANUAL PACIFIC TIME CALCULATION - NUCLEAR OPTION
  
  // Get current UTC time
  const now = new Date();
  
  // Manually subtract 8 hours for Pacific Standard Time
  const pacificOffset = 8 * 60 * 60 * 1000; // 8 hours in milliseconds
  const pacificTime = new Date(now.getTime() - pacificOffset);
  
  // Get just the date part (ignore time of day) 
  const today = new Date(
    pacificTime.getFullYear(), 
    pacificTime.getMonth(), 
    pacificTime.getDate()
  );
  
  // Parse payday date - handle both string and Date inputs
  let payday;
  if (typeof targetDate === 'string') {
    // Handle YYYY-MM-DD format
    if (targetDate.includes('-')) {
      const parts = targetDate.split('-');
      payday = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    } else {
      payday = new Date(targetDate);
    }
  } else {
    payday = new Date(targetDate);
  }
  
  // Set payday to start of day for accurate comparison
  payday.setHours(0, 0, 0, 0);
  
  // Calculate difference in milliseconds
  const timeDifference = payday.getTime() - today.getTime();
  
  // Convert to days and round up
  const daysDifference = Math.ceil(timeDifference / (1000 * 60 * 60 * 24));
  
  // NUCLEAR DEBUG LOGGING - exactly as specified in requirements
  console.log('MANUAL PAYDAY CALCULATION:', {
    utcNow: now,
    pacificTime: pacificTime,
    today: today,
    payday: payday,
    timeDifference: timeDifference,
    daysDifference: daysDifference,
    calculationDetails: {
      utcNowISO: now.toISOString(),
      pacificTimeISO: pacificTime.toISOString(),
      todayISO: today.toISOString(),
      paydayISO: payday.toISOString(),
      todayDateString: today.toDateString(),
      paydayDateString: payday.toDateString(),
      timeDiffDays: timeDifference / (1000 * 60 * 60 * 24),
      finalResult: Math.max(0, daysDifference)
    }
  });
  
  // Return the result, ensuring non-negative
  return Math.max(0, daysDifference);
};

/**
 * NUCLEAR OPTION: Manual Pacific Time payday calculation function
 * Exactly as specified in the requirements
 * @returns {number} Number of days until September 30, 2025
 */
export const getManualPacificDaysUntilPayday = () => {
  // Get current UTC time
  const now = new Date();
  
  // Manually subtract 8 hours for Pacific Standard Time
  const pacificOffset = 8 * 60 * 60 * 1000; // 8 hours in milliseconds
  const pacificTime = new Date(now.getTime() - pacificOffset);
  
  // Get just the date part (ignore time of day)
  const today = new Date(
    pacificTime.getFullYear(), 
    pacificTime.getMonth(), 
    pacificTime.getDate()
  );
  
  // Hard-code payday date: September 30, 2025
  const payday = new Date(2025, 8, 30); // Month is 0-indexed, so 8 = September
  
  // Calculate difference in milliseconds
  const timeDifference = payday.getTime() - today.getTime();
  
  // Convert to days and round up
  const daysDifference = Math.ceil(timeDifference / (1000 * 60 * 60 * 24));
  
  // Debug logging
  console.log('MANUAL PAYDAY CALCULATION:', {
    utcNow: now,
    pacificTime: pacificTime,
    today: today,
    payday: payday,
    timeDifference: timeDifference,
    daysDifference: daysDifference
  });
  
  return Math.max(0, daysDifference);
};