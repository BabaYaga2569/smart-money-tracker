/**
 * Normalize any date format to YYYY-MM-DD string
 * Handles:  ISO strings, Date objects, Firestore Timestamps, MM/DD/YYYY, etc.
 */
export const getDateOnly = (dateValue) => {
  if (!dateValue) return '';
  
  try {
    // Already in YYYY-MM-DD format
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      return dateValue;
    }
    
    // Handle MM/DD/YYYY format (from date input fields)
    if (typeof dateValue === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(dateValue)) {
      const [month, day, year] = dateValue.split('/');
      return `${year}-${month. padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    
    // Handle ISO string with time (2025-01-08T00:00:00.000Z)
    if (typeof dateValue === 'string' && dateValue.includes('T')) {
      return dateValue.split('T')[0];
    }
    
    // Handle Date objects
    if (dateValue instanceof Date) {
      const year = dateValue.getFullYear();
      const month = String(dateValue.getMonth() + 1).padStart(2, '0');
      const day = String(dateValue.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    // Handle Firestore Timestamps
    if (dateValue. toDate && typeof dateValue.toDate === 'function') {
      const date = dateValue.toDate();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    // Try to parse as Date if string
    if (typeof dateValue === 'string') {
      const parsed = new Date(dateValue);
      if (!isNaN(parsed.getTime())) {
        const year = parsed.getFullYear();
        const month = String(parsed.getMonth() + 1).padStart(2, '0');
        const day = String(parsed.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    }
    
    console.warn('[getDateOnly] Could not normalize date:', dateValue);
    return String(dateValue);
  } catch (error) {
    console.error('[getDateOnly] Error normalizing date:', error, dateValue);
    return '';
  }
};

/**
 * Get YYYY-MM month from any date format
 */
export const getMonthOnly = (dateValue) => {
  const normalized = getDateOnly(dateValue);
  return normalized ?  normalized.substring(0, 7) : '';
};

/**
 * Compare two dates (returns true if they're the same day)
 */
export const isSameDate = (date1, date2) => {
  return getDateOnly(date1) === getDateOnly(date2);
};

/**
 * Format date for display (returns "Jan 8, 2026")
 */
export const formatDateForDisplay = (dateValue) => {
  const normalized = getDateOnly(dateValue);
  if (!normalized) return '';
  
  try {
    const date = new Date(normalized + 'T00:00:00');
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  } catch (error) {
    return normalized;
  }
};