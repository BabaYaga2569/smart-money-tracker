/**
 * Helper function to extract date-only portion (YYYY-MM-DD) from date strings
 * This normalizes different date formats for accurate comparison:
 * - "2025-12-23T00:00:00.000Z" (ISO timestamp) -> "2025-12-23"
 * - "2025-12-23" (date only) -> "2025-12-23"
 * 
 * The function works by splitting on 'T' and taking the first part:
 * - For ISO timestamps with 'T', returns everything before 'T' (the date)
 * - For date-only strings without 'T', split returns array with one element (the whole string)
 * 
 * @param {string|null|undefined} dateStr - Date string in any format
 * @returns {string|null} Date in YYYY-MM-DD format, or null if input is falsy
 */
export const getDateOnly = (dateStr) => {
  if (!dateStr) return null;
  return dateStr.split('T')[0];
};

/**
 * Extract month portion (YYYY-MM) from a date string
 * @param {string|null|undefined} dateStr - Date string in any format
 * @returns {string|null} Month in YYYY-MM format, or null if input is falsy
 */
export const getMonthOnly = (dateStr) => {
  const dateOnly = getDateOnly(dateStr);
  return dateOnly ? dateOnly.substring(0, 7) : null;
};

/**
 * Ensures a date is stored as YYYY-MM-DD string without timezone conversion
 * Handles both "2026-01-13" and "2026-01-13T00:00:00.000Z" formats
 * IMPORTANT: Never uses Date constructor to avoid timezone shifts
 * 
 * @param {string|Date|null|undefined} dateInput - Date in any format
 * @returns {string|null} Date in YYYY-MM-DD format, or null if input is falsy
 */
export const normalizeToDateString = (dateInput) => {
  if (!dateInput) return null;
  
  // If already a simple YYYY-MM-DD string, return as-is
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return dateInput;
  }
  
  // If ISO string with time, extract just the date part
  if (typeof dateInput === 'string' && dateInput.includes('T')) {
    return dateInput.split('T')[0];
  }
  
  // If Date object, format as YYYY-MM-DD using LOCAL timezone
  if (dateInput instanceof Date) {
    const year = dateInput.getFullYear();
    const month = String(dateInput.getMonth() + 1).padStart(2, '0');
    const day = String(dateInput.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // Fallback: extract date part from any string format
  return String(dateInput).split('T')[0];
};
