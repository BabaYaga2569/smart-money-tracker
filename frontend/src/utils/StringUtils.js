// StringUtils.js - String manipulation utilities for fuzzy matching

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy string matching to determine similarity
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Edit distance between strings
 */
export function levenshteinDistance(str1, str2) {
  if (!str1 || !str2) return Math.max(str1?.length || 0, str2?.length || 0);
  
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  if (s1 === s2) return 0;
  
  const len1 = s1.length;
  const len2 = s2.length;
  
  // Create matrix
  const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(0));
  
  // Initialize first row and column
  for (let i = 0; i <= len1; i++) matrix[0][i] = i;
  for (let j = 0; j <= len2; j++) matrix[j][0] = j;
  
  // Calculate distances
  for (let j = 1; j <= len2; j++) {
    for (let i = 1; i <= len1; i++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,      // Deletion
        matrix[j - 1][i] + 1,      // Insertion
        matrix[j - 1][i - 1] + cost // Substitution
      );
    }
  }
  
  return matrix[len2][len1];
}

/**
 * Normalize string for comparison
 * Removes special characters, converts to lowercase, trims whitespace
 * @param {string} str - String to normalize
 * @returns {string} - Normalized string
 */
export function normalizeString(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ')         // Normalize whitespace
    .trim();
}

/**
 * Calculate similarity percentage between two strings
 * Uses Levenshtein distance normalized by string length
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} - Similarity percentage (0-1)
 */
export function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  const normalized1 = normalizeString(str1);
  const normalized2 = normalizeString(str2);
  
  if (normalized1 === normalized2) return 1;
  
  const distance = levenshteinDistance(normalized1, normalized2);
  const maxLength = Math.max(normalized1.length, normalized2.length);
  
  if (maxLength === 0) return 0;
  
  return 1 - (distance / maxLength);
}

/**
 * Check if one string contains another (case-insensitive, normalized)
 * @param {string} haystack - String to search in
 * @param {string} needle - String to search for
 * @returns {boolean} - True if needle found in haystack
 */
export function containsString(haystack, needle) {
  if (!haystack || !needle) return false;
  
  const normalizedHaystack = normalizeString(haystack);
  const normalizedNeedle = normalizeString(needle);
  
  return normalizedHaystack.includes(normalizedNeedle);
}

/**
 * Extract significant words from a string (removes common filler words)
 * @param {string} str - Input string
 * @returns {string[]} - Array of significant words
 */
export function extractSignificantWords(str) {
  if (!str) return [];
  
  const skipWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
                     'of', 'with', 'by', 'from', 'payment', 'bill', 'monthly', 'annual'];
  
  const normalized = normalizeString(str);
  const words = normalized.split(' ').filter(word => 
    word.length > 2 && !skipWords.includes(word)
  );
  
  return words;
}
