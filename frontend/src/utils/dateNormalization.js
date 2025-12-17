/**
 * Helper function to extract date-only portion (YYYY-MM-DD) from date strings
 * This normalizes different date formats for accurate comparison:
 * - "2025-12-23T00:00:00.000Z" (ISO timestamp) -> "2025-12-23"
 * - "2025-12-23" (date only) -> "2025-12-23"
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
