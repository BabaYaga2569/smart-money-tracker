// dateHelpers.js - Utility functions for accurate date calculations without timezone issues

/**
 * Normalize a date to midnight (00:00:00) for day-level comparisons
 * Prevents off-by-one errors when comparing dates with different time components
 * @param {Date|string} date - Date to normalize
 * @returns {Date} - Date normalized to midnight
 */
export const normalizeToMidnight = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Calculate days between two dates (day-level precision)
 * Normalizes both dates to midnight before comparison to avoid off-by-one errors
 * @param {Date|string} date1 - First date
 * @param {Date|string} date2 - Second date
 * @returns {number} - Days between dates (positive if date2 is in future relative to date1)
 */
export const daysBetween = (date1, date2) => {
  const d1 = normalizeToMidnight(date1);
  const d2 = normalizeToMidnight(date2);
  const diffTime = d2 - d1;
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
};

/**
 * Calculate days until a target date from today
 * @param {Date|string} targetDate - Target date
 * @returns {number} - Days until target (negative if in past, 0 if today, positive if in future)
 */
export const daysUntil = (targetDate) => {
  return daysBetween(new Date(), targetDate);
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
