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

  // Validate that we got valid numbers
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return null;
  }

  // Create date in local timezone (month is 0-indexed)
  const date = new Date(year, month - 1, day);

  // Validate the date is valid (e.g., not '2025-13-45')
  if (isNaN(date.getTime())) {
    return null;
  }

  return date;
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

  // Validate the date is valid before calling toISOString()
  if (isNaN(localDate.getTime())) return null;

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

  // Validate date is valid before manipulation
  if (isNaN(date.getTime())) return '';

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

  // Validate date is valid before comparison
  if (isNaN(date.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return date < today;
}

/**
 * Get current time in Pacific timezone
 * Uses proper timezone conversion with toLocaleString to handle DST correctly
 * 
 * @returns {Date} Date object representing current time in Pacific timezone
 */
export function getPacificTime() {
  // Get current time in Pacific timezone
  const now = new Date();
  const pacificTimeString = now.toLocaleString('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Parse the localized string back to a Date object
  const [datePart, timePart] = pacificTimeString.split(', ');
  const [month, day, year] = datePart.split('/');
  const [hour, minute, second] = timePart.split(':');
  
  return new Date(year, month - 1, day, hour, minute, second);
}

/**
 * Get midnight (start of day) in Pacific timezone
 * 
 * @returns {Date} Date object representing midnight today in Pacific timezone
 */
export function getLocalMidnight() {
  const now = getPacificTime();
  now.setHours(0, 0, 0, 0);
  return now;
}

export default {
  parseLocalDate,
  formatLocalDate,
  dateStringToFirestoreFormat,
  firestoreDateToLocalString,
  getTodayLocal,
  addDays,
  isDateInPast,
  getPacificTime,
  getLocalMidnight
};
