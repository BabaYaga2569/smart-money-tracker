/**
 * Frontend Timezone Utilities
 * 
 * These utilities prevent timezone-related date bugs where dates shift by one day
 * due to UTC conversion. This is critical for date inputs that should represent
 * local calendar dates, not specific moments in time.
 */

/**
 * Parse a date string (YYYY-MM-DD) as local timezone midnight
 * This prevents the bug where date inputs are interpreted as UTC midnight,
 * causing off-by-one date errors.
 * 
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {Date} Date object representing local timezone midnight
 * 
 * @example
 * // Without this fix (PST, UTC-8):
 * new Date('2025-11-14') // => Nov 13, 4pm PST (stored as 2025-11-14T00:00:00.000Z)
 * 
 * // With this fix:
 * parseLocalDate('2025-11-14') // => Nov 14, 12am PST
 */
export function parseLocalDate(dateString) {
  if (!dateString) return null;
  
  // Split to get year, month, day
  const [year, month, day] = dateString.split('-').map(num => parseInt(num, 10));
  
  // Create date in local timezone (month is 0-indexed)
  return new Date(year, month - 1, day);
}

/**
 * Format a Date object as YYYY-MM-DD in local timezone
 * 
 * @param {Date} date - Date object to format
 * @returns {string} Date string in YYYY-MM-DD format
 */
export function formatLocalDate(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return '';
  
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Convert a local date string to Firestore-compatible format
 * This ensures the date is stored as the correct calendar date in Firestore
 * 
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {string} ISO string preserving the local date
 */
export function dateStringToFirestoreFormat(dateString) {
  const localDate = parseLocalDate(dateString);
  if (!localDate) return null;
  
  // Return ISO string from local date (maintains the calendar date)
  return localDate.toISOString();
}

/**
 * Convert Firestore date (ISO string or Timestamp) to local date string
 * 
 * @param {string|Object} firestoreDate - ISO string or Firestore Timestamp
 * @returns {string} Date string in YYYY-MM-DD format
 */
export function firestoreDateToLocalString(firestoreDate) {
  if (!firestoreDate) return '';
  
  let date;
  if (typeof firestoreDate === 'string') {
    date = new Date(firestoreDate);
  } else if (firestoreDate.toDate) {
    // Firestore Timestamp
    date = firestoreDate.toDate();
  } else if (firestoreDate.seconds) {
    // Firestore Timestamp object with seconds
    date = new Date(firestoreDate.seconds * 1000);
  } else {
    return '';
  }
  
  return formatLocalDate(date);
}

/**
 * Get today's date as YYYY-MM-DD in local timezone
 * 
 * @returns {string} Today's date
 */
export function getTodayLocal() {
  return formatLocalDate(new Date());
}

/**
 * Add days to a date string in local timezone
 * 
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @param {number} days - Number of days to add
 * @returns {string} New date string in YYYY-MM-DD format
 */
export function addDays(dateString, days) {
  const date = parseLocalDate(dateString);
  if (!date) return '';
  
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
}

/**
 * Check if a date is in the past (local timezone)
 * 
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {boolean} True if date is in the past
 */
export function isDateInPast(dateString) {
  const date = parseLocalDate(dateString);
  if (!date) return false;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return date < today;
}

export default {
  parseLocalDate,
  formatLocalDate,
  dateStringToFirestoreFormat,
  firestoreDateToLocalString,
  getTodayLocal,
  addDays,
  isDateInPast
};
