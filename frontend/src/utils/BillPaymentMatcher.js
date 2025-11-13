// BillPaymentMatcher.js - Smart fuzzy matching for transactions to bills
import { normalizeString, calculateSimilarity, containsString, extractSignificantWords } from './StringUtils.js';
import { parseDueDateLocal, daysBetweenLocal } from './dateHelpers.js';

/**
 * Check if transaction name matches bill name using fuzzy matching
 * @param {string} txName - Transaction merchant name
 * @param {string} billName - Bill name
 * @returns {boolean} - True if names match with high confidence
 */
export function isNameMatch(txName, billName) {
  if (!txName || !billName) return false;
  
  const normalizedTx = normalizeString(txName);
  const normalizedBill = normalizeString(billName);
  
  // Exact match after normalization
  if (normalizedTx === normalizedBill) return true;
  
  // Substring match
  if (containsString(txName, billName) || containsString(billName, txName)) return true;
  
  // Fuzzy similarity match (75% threshold)
  const similarity = calculateSimilarity(txName, billName);
  if (similarity >= 0.75) return true;
  
  // Check for significant word matches
  const txWords = extractSignificantWords(txName);
  const billWords = extractSignificantWords(billName);
  
  if (txWords.length > 0 && billWords.length > 0) {
    const commonWords = txWords.filter(word => billWords.includes(word));
    const matchRatio = commonWords.length / Math.min(txWords.length, billWords.length);
    if (matchRatio >= 0.5) return true;
  }
  
  // Check bill's merchant names if available
  // This is useful for subscriptions that might have multiple merchant name variations
  // (e.g., "Google One" subscription might appear as "GOOGLE*ONE" or "GOOGLE STORAGE")
  
  return false;
}

/**
 * Check if transaction amount matches bill amount (within tolerance)
 * @param {number} txAmount - Transaction amount (absolute value)
 * @param {number} billAmount - Bill amount
 * @param {number} tolerance - Acceptable difference (default $0.50)
 * @returns {boolean} - True if amounts match within tolerance
 */
export function isAmountMatch(txAmount, billAmount, tolerance = 0.50) {
  const txAbs = Math.abs(parseFloat(txAmount) || 0);
  const billAbs = Math.abs(parseFloat(billAmount) || 0);
  
  const difference = Math.abs(txAbs - billAbs);
  return difference <= tolerance;
}

/**
 * Check if transaction date is within acceptable range of bill due date
 * @param {string|Date} txDate - Transaction date
 * @param {string|Date} billDueDate - Bill due date
 * @param {number} daysTolerance - Days before/after due date (default 7)
 * @returns {boolean} - True if dates are within tolerance
 */
export function isDateMatch(txDate, billDueDate, daysTolerance = 7) {
  if (!txDate || !billDueDate) return false;
  
  // Use local timezone helpers to avoid off-by-one errors
  const daysDiff = Math.abs(daysBetweenLocal(txDate, billDueDate));
  
  return daysDiff <= daysTolerance;
}

/**
 * Match a single transaction to a single bill
 * Returns confidence score based on matching criteria
 * @param {Object} transaction - Plaid transaction
 * @param {Object} bill - Bill instance
 * @returns {Object|null} - Match result with confidence or null if no match
 */
export function matchTransactionToBill(transaction, bill) {
  // Include pending transactions in matching
  // Pending transactions represent valid payments that have already left the user's account
  // Users expect bills to be marked as paid immediately when the payment shows up
  // This matches the behavior of projected balance calculations which already account for pending transactions
  
  // Only match negative transactions (payments, not deposits)
  if (parseFloat(transaction.amount) >= 0) return null;
  
  // Get transaction details
  const txName = transaction.name || transaction.merchant_name || '';
  const txAmount = Math.abs(parseFloat(transaction.amount) || 0);
  const txDate = transaction.date;
  
  // Get bill details
  const billName = bill.name || '';
  const billAmount = parseFloat(bill.amount || 0);
  const billDueDate = bill.nextDueDate || bill.dueDate;
  
  // Check each criterion
  const nameMatch = isNameMatch(txName, billName);
  const amountMatch = isAmountMatch(txAmount, billAmount);
  const dateMatch = isDateMatch(txDate, billDueDate);
  
  // Count matches
  let matchCount = 0;
  if (nameMatch) matchCount++;
  if (amountMatch) matchCount++;
  if (dateMatch) matchCount++;
  
  // Calculate confidence (matches / 3)
  const confidence = matchCount / 3;
  
  // Require at least 2 of 3 criteria (67% confidence threshold)
  // Use matchCount >= 2 for clarity and consistency
  if (matchCount < 2) return null;
  
  return {
    transaction,
    bill,
    confidence,
    matches: {
      name: nameMatch,
      amount: amountMatch,
      date: dateMatch
    },
    details: {
      txName,
      txAmount,
      txDate,
      billName,
      billAmount,
      billDueDate
    }
  };
}

/**
 * Match multiple transactions to multiple bills
 * Returns array of matches sorted by confidence
 * @param {Array} transactions - Array of Plaid transactions
 * @param {Array} bills - Array of unpaid bill instances
 * @returns {Array} - Array of match objects with confidence scores
 */
export function matchTransactionsToBills(transactions, bills) {
  if (!transactions || !bills) return [];
  
  const matches = [];
  const matchedTransactionIds = new Set();
  const matchedBillIds = new Set();
  
  // Try to match each bill to a transaction
  for (const bill of bills) {
    // Skip already paid bills
    if (bill.isPaid || bill.status === 'paid') continue;
    
    // Skip bills already matched in this run
    if (matchedBillIds.has(bill.id)) continue;
    
    let bestMatch = null;
    
    for (const transaction of transactions) {
      // Skip already matched transactions
      if (matchedTransactionIds.has(transaction.id)) continue;
      
      // Skip if bill already linked to this transaction
      if (bill.linkedTransactionIds?.includes(transaction.id)) continue;
      
      const match = matchTransactionToBill(transaction, bill);
      
      if (match && (!bestMatch || match.confidence > bestMatch.confidence)) {
        bestMatch = match;
      }
    }
    
    if (bestMatch) {
      matches.push(bestMatch);
      matchedTransactionIds.add(bestMatch.transaction.id);
      matchedBillIds.add(bestMatch.bill.id);
    }
  }
  
  // Sort by confidence (highest first)
  return matches.sort((a, b) => b.confidence - a.confidence);
}
