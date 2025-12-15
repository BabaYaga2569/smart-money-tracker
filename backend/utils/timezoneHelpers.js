/**
 * Timezone Helper Utilities
 * 
 * These utilities prevent timezone-related date bugs where dates shift by one day
 * due to UTC conversion. For example, selecting "Nov 14" in a date picker can
 * become "Nov 13" when the date is interpreted as UTC midnight and converted to PST.
 */

/**
 * Parse a date string (YYYY-MM-DD) as local timezone midnight
 * This prevents the common bug where date inputs are interpreted as UTC,
 * causing the date to shift when converted to local timezone.
 * 
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {Date} Date object representing local timezone midnight
 * 
 * @example
 * // Without this fix (PST, UTC-8):
 * new Date('2025-11-14') // => 2025-11-13T16:00:00.000Z (Nov 13, 4pm PST)
 * 
 * // With this fix:
 * parseLocalDate('2025-11-14') // => 2025-11-14T08:00:00.000Z (Nov 14, 12am PST)
 */
export function parseLocalDate(dateString) {
  if (!dateString) return null;

  // Split the date string to get year, month, day
  const [year, month, day] = dateString.split('-').map(num => parseInt(num, 10));

  // Validate that we got valid numbers
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return null;
  }

  // Create date in local timezone (month is 0-indexed)
  // This creates the date at local midnight, not UTC midnight
  const date = new Date(year, month - 1, day);

  // Validate the date is valid (e.g., not '2025-13-45')
  if (isNaN(date.getTime())) {
    return null;
  }

  return date;
}

/**
 * Format a Date object as YYYY-MM-DD in local timezone
 * Ensures the date string represents the same calendar date in local timezone
 * 
 * @param {Date} date - Date object to format
 * @returns {string} Date string in YYYY-MM-DD format
 * 
 * @example
 * const date = new Date(2025, 10, 14); // Nov 14, 2025 local time
 * formatLocalDate(date) // => '2025-11-14'
 */
export function formatLocalDate(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Parse a date string from frontend and convert to Firestore Timestamp
 * preserving the local date (not shifting due to timezone)
 * 
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {admin.firestore.Timestamp} Firestore Timestamp
 */
export function dateStringToFirestoreTimestamp(dateString, admin) {
  const localDate = parseLocalDate(dateString);
  return localDate ? admin.firestore.Timestamp.fromDate(localDate) : null;
}

/**
 * Convert Firestore Timestamp to local date string (YYYY-MM-DD)
 * 
 * @param {admin.firestore.Timestamp} timestamp - Firestore Timestamp
 * @returns {string} Date string in YYYY-MM-DD format
 */
export function firestoreTimestampToDateString(timestamp) {
  if (!timestamp || !timestamp.toDate) return '';
  const date = timestamp.toDate();
  return formatLocalDate(date);
}

/**
 * Get today's date as YYYY-MM-DD in local timezone
 * 
 * @returns {string} Today's date in YYYY-MM-DD format
 */
export function getTodayLocal() {
  return formatLocalDate(new Date());
}

/**
 * Check if a date string is in the past (local timezone comparison)
 * 
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {boolean} True if the date is in the past
 */
export function isDateInPast(dateString) {
  const date = parseLocalDate(dateString);
  if (!date) return false;

  // Validate date is valid before comparison
  if (isNaN(date.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today in local time

  return date < today;
}

/**
 * Add days to a date string, preserving local timezone
 * 
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @param {number} days - Number of days to add (can be negative)
 * @returns {string} New date string in YYYY-MM-DD format
 */
export function addDays(dateString, days) {
  const date = parseLocalDate(dateString);
  if (!date) return '';

  // Validate date is valid before manipulation
  if (isNaN(date.getTime())) return '';

  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

export default {
  parseLocalDate,
  formatLocalDate,
  dateStringToFirestoreTimestamp,
  firestoreTimestampToDateString,
  getTodayLocal,
  isDateInPast,
  addDays
};
