// dateHelpers.js - Utility functions for accurate date calculations without timezone issues

/**
 * Get current date at LOCAL midnight, not UTC midnight
 * This prevents timezone-related off-by-one errors
 * @returns {Date} - Current date at local midnight
 */
export const getLocalMidnight = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
};

/**
 * Parse a date string (YYYY-MM-DD format) as a LOCAL date, not UTC
 * This prevents the off-by-one day error for users in negative UTC offset timezones
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {Date} - Date object in local timezone
 */
export const parseDueDateLocal = (dateString) => {
  if (!dateString) return null;
  
  // If it's already a Date object, normalize it to local midnight
  if (dateString instanceof Date) {
    return new Date(dateString.getFullYear(), dateString.getMonth(), dateString.getDate(), 0, 0, 0, 0);
  }
  
  // Parse YYYY-MM-DD string as local date (not UTC)
  const dateStr = String(dateString);
  const parts = dateStr.split('-');
  
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // month is 0-indexed
    const day = parseInt(parts[2], 10);
    
    // Validate parsed values
    if (!isNaN(year) && !isNaN(month) && !isNaN(day) &&
        month >= 0 && month <= 11 &&
        day >= 1 && day <= 31 &&
        year >= 1900) {
      // Create date in LOCAL timezone, not UTC
      return new Date(year, month, day, 0, 0, 0, 0);
    }
  }
  
  // Fallback: try parsing as-is
  const fallback = new Date(dateString);
  if (!isNaN(fallback.getTime())) {
    return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate(), 0, 0, 0, 0);
  }
  
  return null;
};

/**
 * Normalize a date to midnight (00:00:00) for day-level comparisons
 * Prevents off-by-one errors when comparing dates with different time components
 * @param {Date|string} date - Date to normalize
 * @returns {Date} - Date normalized to midnight
 */
export const normalizeToMidnight = (date) => {
  // Use parseDueDateLocal for strings to ensure proper local timezone handling
  if (typeof date === 'string') {
    return parseDueDateLocal(date);
  }
  
  const d = new Date(date);
  // Use local timezone for midnight, not UTC
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
};

/**
 * Calculate days between two dates (day-level precision)
 * Normalizes both dates to LOCAL midnight before comparison to avoid off-by-one errors
 * @param {Date|string} date1 - First date
 * @param {Date|string} date2 - Second date
 * @returns {number} - Days between dates (positive if date2 is in future relative to date1)
 */
export const daysBetween = (date1, date2) => {
  // Parse dates as LOCAL dates to avoid timezone issues
  const d1 = typeof date1 === 'string' ? parseDueDateLocal(date1) : normalizeToMidnight(date1);
  const d2 = typeof date2 === 'string' ? parseDueDateLocal(date2) : normalizeToMidnight(date2);
  
  if (!d1 || !d2) return 0;
  
  const diffTime = d2 - d1;
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * Calculate days until a target date from today
 * Uses LOCAL timezone to avoid off-by-one errors
 * @param {Date|string} targetDate - Target date
 * @returns {number} - Days until target (negative if in past, 0 if today, positive if in future)
 */
export const daysUntil = (targetDate) => {
  const today = getLocalMidnight();
  const target = typeof targetDate === 'string' ? parseDueDateLocal(targetDate) : normalizeToMidnight(targetDate);
  
  if (!target) return 0;
  
  const diffTime = target - today;
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * Get relative date text (e.g., "Due today", "2 days ago")
 * @param {Date|string} dueDate - Due date to compare
 * @returns {string} - Human-readable relative date
 */
export const getRelativeDateText = (dueDate) => {
  const daysUntilDue = daysUntil(dueDate);
  
  if (daysUntilDue < 0) {
    const daysAgo = Math.abs(daysUntilDue);
    return `${daysAgo} day${daysAgo !== 1 ? 's' : ''} ago`;
  } else if (daysUntilDue === 0) {
    return 'Due today';
  } else if (daysUntilDue === 1) {
    return 'Due tomorrow';
  } else {
    return `Due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}`;
  }
};

/**
 * Get status text for overdue/upcoming bills
 * @param {Date|string} dueDate - Due date to compare
 * @returns {string} - Status text (e.g., "OVERDUE by 3 days", "DUE TODAY", "Due in 5 days")
 */
export const getBillStatusText = (dueDate) => {
  const daysUntilDue = daysUntil(dueDate);
  
  if (daysUntilDue < 0) {
    const daysOverdue = Math.abs(daysUntilDue);
    return `OVERDUE by ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''}`;
  } else if (daysUntilDue === 0) {
    return 'DUE TODAY';
  } else if (daysUntilDue === 1) {
    return 'Due tomorrow';
  } else {
    return `Due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}`;
  }
};

/**
 * Format Date object to YYYY-MM-DD string (local timezone)
 * @param {Date} date - Date object
 * @returns {string} Date in YYYY-MM-DD format
 */
export const formatDateLocal = (date) => {
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Calculate days between two date strings (YYYY-MM-DD)
 * @param {string} date1Str - First date
 * @param {string} date2Str - Second date
 * @returns {number} Days difference
 */
export const daysBetweenLocal = (date1Str, date2Str) => {
  const date1 = parseDueDateLocal(date1Str);
  const date2 = parseDueDateLocal(date2Str);
  if (!date1 || !date2) return 0;
  const diffTime = date2 - date1;
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * Get relative date string (e.g., "Due TODAY", "Due in 3 days")
 * @param {string} dueDateStr - Due date in YYYY-MM-DD format
 * @returns {string} Formatted relative date string
 */
export const getRelativeDateString = (dueDateStr) => {
  const dueDate = parseDueDateLocal(dueDateStr);
  if (!dueDate) return 'No date';
  
  const today = getLocalMidnight();
  
  const daysDiff = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
  
  if (daysDiff < 0) {
    return `Overdue by ${Math.abs(daysDiff)} day${Math.abs(daysDiff) !== 1 ? 's' : ''}`;
  } else if (daysDiff === 0) {
    return 'Due TODAY';
  } else if (daysDiff === 1) {
    return 'Due TOMORROW';
  } else if (daysDiff <= 7) {
    return `Due in ${daysDiff} days`;
  } else {
    return `Due: ${dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }
};
