/**
 * BillMatchingService.js
 * 
 * Server-side bill matching and clearing service that:
 * 1. Matches transactions to unpaid bills using fuzzy matching
 * 2. Marks matched bills as PAID in Firebase
 * 3. Advances recurringPatterns to next due date
 * 4. Generates next month's bill instances
 * 
 * This provides automatic bill clearing after transaction sync.
 */

import { FieldValue } from 'firebase-admin/firestore';

// ===== MATCHING CONFIGURATION =====

// Matching thresholds
const NAME_SIMILARITY_THRESHOLD = 0.75; // 75% similarity for fuzzy name matching
const AMOUNT_TOLERANCE = 0.50; // ±$0.50 tolerance for amount matching
const DATE_TOLERANCE_DAYS = 7; // ±7 days tolerance for date matching
const MINIMUM_MATCH_COUNT = 2; // Require 2 of 3 criteria (67% confidence)

// Merchants that are too broad/ambiguous for changed-amount review matching.
const AMBIGUOUS_CHANGED_AMOUNT_MERCHANTS = [
  'walmart', 'amazon', 'target', 'costco', 'sams club',
  'paypal', 'venmo', 'zelle', 'cash app'
];

// Skip words for significant word extraction
const SKIP_WORDS = [
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
  'of', 'with', 'by', 'from', 'payment', 'bill', 'monthly', 'annual'
];

// ===== STRING UTILITIES =====

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1, str2) {
  if (!str1 || !str2) return Math.max(str1?.length || 0, str2?.length || 0);
  
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  if (s1 === s2) return 0;
  
  const len1 = s1.length;
  const len2 = s2.length;
  
  const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(0));
  
  for (let i = 0; i <= len1; i++) matrix[0][i] = i;
  for (let j = 0; j <= len2; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= len2; j++) {
    for (let i = 1; i <= len1; i++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + cost
      );
    }
  }
  
  return matrix[len2][len1];
}

/**
 * Normalize string for comparison
 */
function normalizeString(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate similarity percentage between two strings
 */
function calculateSimilarity(str1, str2) {
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
 * Check if one string contains another
 */
function containsString(haystack, needle) {
  if (!haystack || !needle) return false;
  
  const normalizedHaystack = normalizeString(haystack);
  const normalizedNeedle = normalizeString(needle);
  
  return normalizedHaystack.includes(normalizedNeedle);
}

/**
 * Extract significant words from a string
 */
function extractSignificantWords(str) {
  if (!str) return [];
  
  const normalized = normalizeString(str);
  const words = normalized.split(' ').filter(word => 
    word.length > 2 && !SKIP_WORDS.includes(word)
  );
  
  return words;
}

// ===== DATE UTILITIES =====

/**
 * Parse date string as local date
 */
function parseDueDateLocal(dateString) {
  if (!dateString) return null;
  
  if (dateString instanceof Date) {
    return new Date(dateString.getFullYear(), dateString.getMonth(), dateString.getDate(), 0, 0, 0, 0);
  }
  
  const dateStr = String(dateString);
  const parts = dateStr.split('-');
  
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    
    if (!isNaN(year) && !isNaN(month) && !isNaN(day) &&
        month >= 0 && month <= 11 &&
        day >= 1 && day <= 31 &&
        year >= 1900) {
      return new Date(year, month, day, 0, 0, 0, 0);
    }
  }
  
  return null;
}

/**
 * Calculate days between two dates
 */
function daysBetweenLocal(date1Str, date2Str) {
  const date1 = parseDueDateLocal(date1Str);
  const date2 = parseDueDateLocal(date2Str);
  if (!date1 || !date2) return 0;
  const diffTime = date2 - date1;
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

// ===== MATCHING LOGIC =====

/**
 * Check if transaction name matches bill name
 */
function isNameMatch(txName, billName, merchantNames = []) {
  if (!txName || !billName) return false;
  
  const normalizedTx = normalizeString(txName);
  const normalizedBill = normalizeString(billName);
  
  // Exact match
  if (normalizedTx === normalizedBill) return true;
  
  // Substring match
  if (containsString(txName, billName) || containsString(billName, txName)) return true;
  
  // Fuzzy similarity (75% threshold)
  const similarity = calculateSimilarity(txName, billName);
  if (similarity >= NAME_SIMILARITY_THRESHOLD) return true;
  
  // Significant word matches
  const txWords = extractSignificantWords(txName);
  const billWords = extractSignificantWords(billName);
  
  if (txWords.length > 0 && billWords.length > 0) {
    const commonWords = txWords.filter(word => billWords.includes(word));
    const matchRatio = commonWords.length / Math.min(txWords.length, billWords.length);
    if (matchRatio >= 0.5) return true;
  }
  
  // Check merchant aliases
  if (merchantNames && Array.isArray(merchantNames) && merchantNames.length > 0) {
    for (const merchantName of merchantNames) {
      if (!merchantName) continue;
      
      const normalizedMerchant = normalizeString(merchantName);
      
      if (normalizedTx === normalizedMerchant) return true;
      if (containsString(txName, merchantName) || containsString(merchantName, txName)) return true;
      
      const merchantSimilarity = calculateSimilarity(txName, merchantName);
      if (merchantSimilarity >= NAME_SIMILARITY_THRESHOLD) return true;
      
      const merchantWords = extractSignificantWords(merchantName);
      if (merchantWords.length > 0) {
        const commonMerchantWords = txWords.filter(word => merchantWords.includes(word));
        const merchantMatchRatio = commonMerchantWords.length / merchantWords.length;
        if (merchantMatchRatio >= 0.5) return true;
      }
    }
  }
  
  return false;
}

/**
 * Check if transaction amount matches bill amount
 */
function isAmountMatch(txAmount, billAmount, tolerance = AMOUNT_TOLERANCE) {
  const txAbs = Math.abs(parseFloat(txAmount) || 0);
  const billAbs = Math.abs(parseFloat(billAmount) || 0);
  
  const difference = Math.abs(txAbs - billAbs);
  return difference <= tolerance;
}

/**
 * Check if transaction date is within acceptable range
 */
function isDateMatch(txDate, billDueDate, daysTolerance = DATE_TOLERANCE_DAYS) {
  if (!txDate || !billDueDate) return false;
  
  const daysDiff = Math.abs(daysBetweenLocal(txDate, billDueDate));
  
  return daysDiff <= daysTolerance;
}

function isEligibleBillPaymentTransaction(transaction) {
  const source = String(transaction?.source || '').toLowerCase();
  const amount = Number(transaction?.amount);

  // Canonical Plaid storage uses negative numbers for money leaving the
  // household and positive numbers for refunds/income. Never let an incoming
  // Plaid credit satisfy, protect, or review-match a bill.
  if (source === 'plaid' && Number.isFinite(amount) && amount >= 0) {
    return false;
  }

  return true;
}

/**
 * Match a single transaction to a single bill
 */
function matchTransactionToBill(transaction, bill) {
  if (!isEligibleBillPaymentTransaction(transaction)) return null;

  const txName = transaction.name || '';
  const txMerchantName = transaction.merchant_name || transaction.merchantName || '';
  const txAmount = Math.abs(parseFloat(transaction.amount) || 0);
  const txDate = transaction.date;
  
  const billName = bill.name || '';
  const billAmount = Math.abs(parseFloat(bill.amount) || 0);
  const billDueDate = bill.dueDate;
  const merchantNames = bill.merchantNames || [];
  
  // Plaid frequently preserves a noisy institution-supplied name while also
  // providing a clean merchant_name. Either may establish the merchant/name
  // criterion, but amount and date proximity are still mandatory.
  const nameMatch =
    isNameMatch(txName, billName, merchantNames) ||
    isNameMatch(txMerchantName, billName, merchantNames);
  const amountMatch = isAmountMatch(txAmount, billAmount);
  const dateMatch = isDateMatch(txDate, billDueDate);
  
  // DATE PROXIMITY IS MANDATORY.
  // Without this, a transaction from months ago with the right name+amount
  // matches this month's bill (2-of-3), pays it, advances the pattern, and
  // repeats across history — observed in production on 2026-07-15/16, where
  // bills were advanced 3-6 periods into the future by old transactions.
  if (!dateMatch) return null;

  // Count matches
  let matchCount = 0;
  if (nameMatch) matchCount++;
  if (amountMatch) matchCount++;
  if (dateMatch) matchCount++;
  
  // Calculate confidence
  const confidence = matchCount / 3;
  
  // MONEY SAFETY RULE:
  // Automatic and pending bill matching is deliberately conservative.
  // A transaction must match merchant/name, amount, AND date proximity.
  // Amount+date alone is unsafe: a $40 Zelle must never become a $40
  // Optimum Internet payment just because the numbers line up.
  if (!nameMatch || !amountMatch || !dateMatch) return null;

  if (matchCount < 3) return null;
  
  return {
    transaction,
    bill,
    confidence,
    matches: {
      name: nameMatch,
      amount: amountMatch,
      date: dateMatch
    }
  };
}

/**
 * Match multiple transactions to multiple bills
 */
export function matchTransactionsToBills(transactions, bills) {
  if (!transactions || !bills) return [];
  
  const matches = [];
  const matchedTransactionIds = new Set();
  const matchedBillIds = new Set();
  
  // Sort bills by due date (oldest first) for priority matching
  const sortedBills = [...bills].sort((a, b) => {
    const dateA = parseDueDateLocal(a.dueDate);
    const dateB = parseDueDateLocal(b.dueDate);
    if (!dateA || !dateB) return 0;
    return dateA - dateB;
  });
  
  // Try to match each bill to a transaction
  for (const bill of sortedBills) {
    if (matchedBillIds.has(bill.id)) continue;
    
    let bestMatch = null;
    let bestConfidence = 0;
    
    for (const transaction of transactions) {
      const txId = transaction.id || transaction.transaction_id;
      if (matchedTransactionIds.has(txId)) continue;
      // Never match on pending transactions — they can change or vanish.
      // The bill stays unpaid until the payment actually posts.
      if (transaction.pending) continue;
      
      const match = matchTransactionToBill(transaction, bill);
      
      if (match && match.confidence > bestConfidence) {
        bestMatch = match;
        bestConfidence = match.confidence;
      }
    }
    
    if (bestMatch) {
      matches.push(bestMatch);
      matchedBillIds.add(bill.id);
      const txId = bestMatch.transaction.id || bestMatch.transaction.transaction_id;
      matchedTransactionIds.add(txId);
    }
  }
  
  // Sort by confidence (highest first)
  return matches.sort((a, b) => b.confidence - a.confidence);
}


/**
 * Match pending Plaid transactions to unpaid bills without clearing them.
 * This uses the same canonical match criteria as posted-payment matching.
 */
function isAmbiguousChangedAmountMerchant(transaction, bill) {
  const values = [
    transaction?.merchant_name,
    transaction?.merchantName,
    transaction?.name,
    bill?.name
  ].map(normalizeString).filter(Boolean);

  return AMBIGUOUS_CHANGED_AMOUNT_MERCHANTS.some(term =>
    values.some(value => value.includes(term))
  );
}

function isReasonableAmountChange(txAmount, billAmount) {
  const tx = Math.abs(Number(txAmount) || 0);
  const bill = Math.abs(Number(billAmount) || 0);
  if (!tx || !bill) return false;

  const delta = Math.abs(tx - bill);
  const allowedDelta = Math.max(10, bill * 0.25);
  return delta <= allowedDelta;
}

export function matchChangedAmountTransactionsToBills(transactions, bills) {
  if (!transactions || !bills) return [];

  const matches = [];
  const usedTransactions = new Set();
  const usedBills = new Set();

  for (const bill of bills) {
    if (!bill?.id || bill.isPaid || bill.status === 'paid' || bill.status === 'skipped') continue;
    if (bill.pendingPayment === true) continue;
    if (usedBills.has(bill.id)) continue;

    let best = null;

    for (const transaction of transactions) {
      const txId = transaction.id || transaction.transaction_id;
      if (!txId || usedTransactions.has(txId)) continue;
      if (!isEligibleBillPaymentTransaction(transaction)) continue;
      if (isAmbiguousChangedAmountMerchant(transaction, bill)) continue;

      const txName = transaction.name || '';
      const txMerchantName = transaction.merchant_name || transaction.merchantName || '';
      const merchantNames = bill.merchantNames || [];
      const nameMatch =
        isNameMatch(txName, bill.name || '', merchantNames) ||
        isNameMatch(txMerchantName, bill.name || '', merchantNames);
      const dateMatch = isDateMatch(transaction.date, bill.dueDate);
      const amountMatch = isAmountMatch(transaction.amount, bill.amount);

      if (!nameMatch || !dateMatch || amountMatch) continue;
      if (!isReasonableAmountChange(transaction.amount, bill.amount)) continue;

      const billAmount = Math.abs(Number(bill.amount) || 0);
      const txAmount = Math.abs(Number(transaction.amount) || 0);
      const amountDelta = Math.abs(txAmount - billAmount);
      const score = 1 - Math.min(1, amountDelta / Math.max(billAmount, 1));

      if (!best || score > best.score) {
        best = { transaction, bill, score, amountDelta };
      }
    }

    if (best) {
      matches.push(best);
      usedBills.add(bill.id);
      usedTransactions.add(best.transaction.id || best.transaction.transaction_id);
    }
  }

  return matches;
}

export async function reconcileChangedAmountReviewCandidates(db, userId, transactions, bills) {
  const matches = matchChangedAmountTransactionsToBills(transactions, bills);
  const byBillId = new Map(matches.map(match => [match.bill.id, match]));
  const batch = db.batch();
  let writes = 0;
  let reviewMarked = 0;
  let reviewCleared = 0;

  for (const bill of bills) {
    if (!bill?.id || bill.isPaid || bill.status === 'paid' || bill.status === 'skipped') continue;

    const billRef = db.collection('users').doc(userId)
      .collection('financialEvents').doc(bill.id);
    const match = byBillId.get(bill.id);

    if (match) {
      const tx = match.transaction;
      batch.set(billRef, {
        paymentReviewCandidate: true,
        paymentReviewTransactionId: tx.id || tx.transaction_id,
        paymentReviewDate: tx.date || null,
        paymentReviewExpectedAmount: Math.abs(Number(bill.amount) || 0),
        paymentReviewActualAmount: Math.abs(Number(tx.amount) || 0),
        paymentReviewName: tx.merchant_name || tx.merchantName || tx.name || null,
        paymentReviewPending: Boolean(tx.pending),
        paymentReviewReason: 'AMOUNT_CHANGED',
        paymentReviewDetectedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      writes++;
      reviewMarked++;
    } else if (
      bill.paymentReviewCandidate === true ||
      bill.paymentReviewTransactionId ||
      bill.paymentReviewReason
    ) {
      batch.set(billRef, {
        paymentReviewCandidate: FieldValue.delete(),
        paymentReviewTransactionId: FieldValue.delete(),
        paymentReviewDate: FieldValue.delete(),
        paymentReviewExpectedAmount: FieldValue.delete(),
        paymentReviewActualAmount: FieldValue.delete(),
        paymentReviewName: FieldValue.delete(),
        paymentReviewPending: FieldValue.delete(),
        paymentReviewReason: FieldValue.delete(),
        paymentReviewDetectedAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      writes++;
      reviewCleared++;
    }
  }

  if (writes > 0) await batch.commit();

  return { matches, reviewMarked, reviewCleared };
}

export function matchPendingTransactionsToBills(transactions, bills) {
  if (!transactions || !bills) return [];

  const pendingTransactions = transactions.filter(transaction =>
    transaction?.pending === true ||
    transaction?.pending === 'true' ||
    String(transaction?.status || '').toLowerCase() === 'pending'
  );

  const matches = [];
  const matchedTransactionIds = new Set();
  const matchedBillIds = new Set();

  const sortedBills = [...bills].sort((a, b) => {
    const dateA = parseDueDateLocal(a.dueDate);
    const dateB = parseDueDateLocal(b.dueDate);
    if (!dateA || !dateB) return 0;
    return dateA - dateB;
  });

  for (const bill of sortedBills) {
    if (bill?.isPaid || bill?.status === 'paid' || bill?.status === 'skipped') continue;
    if (matchedBillIds.has(bill.id)) continue;

    let bestMatch = null;
    let bestConfidence = 0;

    for (const transaction of pendingTransactions) {
      const txId = transaction.id || transaction.transaction_id;
      if (!txId || matchedTransactionIds.has(txId)) continue;

      const match = matchTransactionToBill(transaction, bill);
      if (match && match.confidence > bestConfidence) {
        bestMatch = match;
        bestConfidence = match.confidence;
      }
    }

    if (bestMatch) {
      matches.push(bestMatch);
      matchedBillIds.add(bill.id);
      matchedTransactionIds.add(
        bestMatch.transaction.id || bestMatch.transaction.transaction_id
      );
    }
  }

  return matches.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Persist transient Pending Payment metadata on financialEvents.
 * These fields never mark a bill paid or advance a recurring pattern.
 * They are removed automatically when the pending transaction disappears.
 */
export async function reconcilePendingPaymentMatches(db, userId, transactions, bills) {
  const matches = matchPendingTransactionsToBills(transactions, bills);
  const byBillId = new Map(matches.map(match => [match.bill.id, match]));
  const batch = db.batch();
  let writes = 0;
  let pendingMarked = 0;
  let pendingCleared = 0;

  for (const bill of bills) {
    if (!bill?.id || bill.isPaid || bill.status === 'paid' || bill.status === 'skipped') {
      continue;
    }

    const billRef = db.collection('users').doc(userId)
      .collection('financialEvents').doc(bill.id);
    const match = byBillId.get(bill.id);

    if (match) {
      const transaction = match.transaction;
      const transactionId = transaction.id || transaction.transaction_id;

      batch.set(billRef, {
        pendingPayment: true,
        pendingPaymentTransactionId: transactionId,
        pendingPaymentDate: transaction.date || null,
        pendingPaymentAmount: Math.abs(Number(transaction.amount) || 0),
        pendingPaymentName: transaction.name || transaction.merchant_name || null,
        pendingPaymentConfidence: match.confidence,
        pendingPaymentMatchedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      writes++;
      pendingMarked++;
    } else if (
      bill.pendingPayment === true ||
      bill.pendingPaymentTransactionId ||
      bill.pendingPaymentDate ||
      bill.pendingPaymentAmount
    ) {
      batch.set(billRef, {
        pendingPayment: FieldValue.delete(),
        pendingPaymentTransactionId: FieldValue.delete(),
        pendingPaymentDate: FieldValue.delete(),
        pendingPaymentAmount: FieldValue.delete(),
        pendingPaymentName: FieldValue.delete(),
        pendingPaymentConfidence: FieldValue.delete(),
        pendingPaymentMatchedAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      writes++;
      pendingCleared++;
    }
  }

  if (writes > 0) {
    await batch.commit();
  }

  return {
    matches,
    pendingMarked,
    pendingCleared
  };
}

// ===== BILL OPERATIONS =====

/**
 * Load merchant aliases
 */
async function loadMerchantAliases(db, userId) {
  try {
    const aliasesDoc = await db.collection('users').doc(userId)
      .collection('aiLearning').doc('merchantAliases').get();
    
    if (aliasesDoc.exists) {
      const data = aliasesDoc.data();
      console.log(`✅ [AutoClear] Loaded ${Object.keys(data.aliases || {}).length} merchant aliases`);
      return data.aliases || {};
    }
    
    console.log('⚠️ [AutoClear] No merchant aliases found');
    return {};
  } catch (error) {
    console.error('[AutoClear] Error loading merchant aliases:', error);
    return {};
  }
}

/**
 * Enrich bills with merchant aliases
 */
function enrichBillsWithAliases(bills, merchantAliases) {
  return bills.map(bill => {
    const billName = bill.name?.toLowerCase() || '';
    const aliasEntry = merchantAliases[billName];
    
    if (aliasEntry && aliasEntry.aliases) {
      return {
        ...bill,
        merchantNames: [
          ...(bill.merchantNames || []),
          ...aliasEntry.aliases
        ]
      };
    }
    
    return bill;
  });
}

/**
 * Calculate next occurrence for recurring pattern.
 * Keep date-generation semantics isolated from payment persistence so the
 * lifecycle can be committed atomically.
 */
function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function dateAtDay(year, monthIndex, day) {
  return new Date(year, monthIndex, Math.min(day, daysInMonth(year, monthIndex)));
}

function addMonthsPreserveSchedule(current, months, preferredDay = null) {
  const targetMonthIndex = current.getMonth() + months;
  const targetYear = current.getFullYear() + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const day = preferredDay || current.getDate();
  return dateAtDay(targetYear, normalizedMonth, day);
}

function calculateNextOccurrence(currentDate, frequency, pattern = {}) {
  const current = parseDueDateLocal(currentDate);
  if (!current) return null;

  const scheduleRule = pattern.scheduleRule || {};
  const preferredDay =
    scheduleRule.kind === 'dayOfMonth' && Number(scheduleRule.day)
      ? Number(scheduleRule.day)
      : current.getDate();

  let next;

  switch (frequency) {
    case 'weekly':
      next = new Date(current);
      next.setDate(current.getDate() + 7);
      break;
    case 'biweekly':
    case 'bi-weekly':
      next = new Date(current);
      next.setDate(current.getDate() + 14);
      break;
    case 'monthly':
      next = addMonthsPreserveSchedule(current, 1, preferredDay);
      break;
    case 'quarterly':
      if (scheduleRule.kind === 'quarterEndLastDay') {
        const target = addMonthsPreserveSchedule(current, 3, 1);
        next = new Date(
          target.getFullYear(),
          target.getMonth(),
          daysInMonth(target.getFullYear(), target.getMonth())
        );
      } else {
        next = addMonthsPreserveSchedule(current, 3, preferredDay);
      }
      break;
    case 'yearly':
    case 'annually':
    case 'annual':
      next = dateAtDay(
        current.getFullYear() + 1,
        current.getMonth(),
        preferredDay
      );
      break;
    default:
      next = addMonthsPreserveSchedule(current, 1, preferredDay);
  }

  const activeMonths = Array.isArray(pattern.activeMonths)
    ? pattern.activeMonths.map(Number).filter(month => month >= 1 && month <= 12)
    : [];

  if (activeMonths.length > 0) {
    let guard = 0;
    while (!activeMonths.includes(next.getMonth() + 1) && guard < 24) {
      next = addMonthsPreserveSchedule(next, 1, preferredDay);
      guard += 1;
    }
  }

  return next;
}

function isFinalInstallment(pattern, currentDueDate) {
  if (!pattern?.installmentPlan) return false;

  const remainingPayments = Number(pattern.remainingPayments);
  if (Number.isFinite(remainingPayments) && remainingPayments <= 1) {
    return true;
  }

  const endDate = String(pattern.endDate || '').slice(0, 10);
  return Boolean(endDate && endDate === String(currentDueDate || '').slice(0, 10));
}

function amountForNextOccurrence(pattern, liveBill, nextOccurrence) {
  const endDate = String(pattern?.endDate || '').slice(0, 10);
  const finalPaymentAmount = Number(pattern?.finalPaymentAmount);

  if (
    pattern?.installmentPlan &&
    endDate &&
    nextOccurrence === endDate &&
    Number.isFinite(finalPaymentAmount)
  ) {
    return Math.abs(finalPaymentAmount);
  }

  const patternAmount = Number(pattern?.amount);
  if (Number.isFinite(patternAmount)) return Math.abs(patternAmount);

  return Math.abs(Number(liveBill?.amount) || 0);
}

function toDateOnlyString(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function deterministicPaymentId(billId, transactionId) {
  return `auto_${billId}_${transactionId}`;
}

function deterministicNextBillId(patternId, nextOccurrence) {
  return `bill_${patternId}_${nextOccurrence}`;
}

function isPendingTransaction(transaction) {
  return transaction?.pending === true ||
    transaction?.pending === 'true' ||
    String(transaction?.status || '').toLowerCase() === 'pending';
}

async function findPaymentForOtherBill(firestoreTransaction, userRef, transactionId, billId) {
  const snapshot = await firestoreTransaction.get(
    userRef.collection('bill_payments').where('linkedTransactionId', '==', transactionId)
  );
  const other = snapshot.docs.find(doc => doc.data()?.billId !== billId);
  return other ? { paymentRecordId: other.id, billId: other.data()?.billId || null } : null;
}

function toCents(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) : null;
}

/**
 * Validate that a bank transaction may be claimed by this bill. Returns a
 * refusal result, or { liveTransaction } when the claim is allowed. Reads
 * only; the caller writes the claim onto the transaction document in the
 * same transaction and pays from the live amount and date.
 *
 * A transaction is already consumed when any of these point at another bill:
 * - transactions.linkedEventId (current links and legacy manual links)
 * - a bill_payments record with linkedTransactionId (current and legacy
 *   automatic matches, including payments recorded before linkedEventId
 *   was written for automatic matches)
 * - the same evidence on the pending transaction this posted one replaced
 */
async function checkTransactionClaim(firestoreTransaction, {
  userRef,
  transactionRef,
  transactionId,
  billId,
  expectedAmount,
  expectedDate
}) {
  const transactionSnapshot = await firestoreTransaction.get(transactionRef);
  if (!transactionSnapshot.exists) {
    return { success: false, skipped: true, reason: 'TRANSACTION_NOT_FOUND' };
  }

  const liveTransaction = transactionSnapshot.data() || {};

  // Matching (or the user's confirmation) was based on an earlier snapshot.
  // If Plaid changed the amount or date since, refuse rather than record a
  // payment from stale values; the next engine run re-evaluates fresh data.
  const liveCents = toCents(liveTransaction.amount);
  const expectedCents = toCents(expectedAmount);
  const liveDate = String(liveTransaction.date || '').slice(0, 10);
  const snapshotDate = String(expectedDate || '').slice(0, 10);
  if (
    liveCents === null ||
    !liveDate ||
    (expectedCents !== null && liveCents !== expectedCents) ||
    (snapshotDate && liveDate !== snapshotDate)
  ) {
    return {
      success: false,
      skipped: true,
      reason: 'TRANSACTION_CHANGED',
      expectedAmount: expectedAmount ?? null,
      liveAmount: liveTransaction.amount ?? null,
      expectedDate: snapshotDate || null,
      liveDate: liveDate || null
    };
  }

  // A pending charge can change amount or disappear, and posts under a new
  // transaction ID. It can only protect a bill (pendingPayment), never pay it.
  if (isPendingTransaction(liveTransaction)) {
    return { success: false, skipped: true, reason: 'TRANSACTION_PENDING' };
  }

  if (!isEligibleBillPaymentTransaction(liveTransaction)) {
    return { success: false, skipped: true, reason: 'TRANSACTION_NOT_OUTFLOW' };
  }

  const existingLink = liveTransaction.linkedEventId || null;
  if (existingLink && existingLink !== billId) {
    return {
      success: false,
      skipped: true,
      reason: 'TRANSACTION_ALREADY_LINKED',
      linkedEventId: existingLink
    };
  }

  const priorPayment = await findPaymentForOtherBill(
    firestoreTransaction, userRef, transactionId, billId
  );
  if (priorPayment) {
    return {
      success: false,
      skipped: true,
      reason: 'TRANSACTION_ALREADY_USED',
      linkedEventId: priorPayment.billId,
      paymentRecordId: priorPayment.paymentRecordId
    };
  }

  const pendingId = liveTransaction.pending_transaction_id || null;
  if (pendingId && pendingId !== transactionId) {
    const pendingSnapshot = await firestoreTransaction.get(
      userRef.collection('transactions').doc(pendingId)
    );
    const pendingLink = pendingSnapshot.exists
      ? pendingSnapshot.data()?.linkedEventId || null
      : null;
    if (pendingLink && pendingLink !== billId) {
      return {
        success: false,
        skipped: true,
        reason: 'TRANSACTION_ALREADY_LINKED',
        linkedEventId: pendingLink,
        viaPendingTransactionId: pendingId
      };
    }

    const pendingPayment = await findPaymentForOtherBill(
      firestoreTransaction, userRef, pendingId, billId
    );
    if (pendingPayment) {
      return {
        success: false,
        skipped: true,
        reason: 'TRANSACTION_ALREADY_USED',
        linkedEventId: pendingPayment.billId,
        paymentRecordId: pendingPayment.paymentRecordId,
        viaPendingTransactionId: pendingId
      };
    }
  }

  return { liveTransaction };
}

/**
 * Atomically apply one matched transaction to one canonical bill occurrence.
 *
 * For recurring bills, the bill payment, payment history, paid archive,
 * pattern advancement, and next occurrence are committed together or not at
 * all. Deterministic document IDs make retries idempotent.
 */
async function applyBillPaymentLifecycle(db, userId, billId, payment) {
  const {
    paidDate: requestedPaidDate,
    amount: requestedAmount,
    transactionId = null,
    paymentRecordId,
    paymentMethod,
    markedBy,
    markedVia,
    requiredReviewTransactionId = null
  } = payment;

  if (!billId) {
    return { success: false, skipped: true, reason: 'MISSING_BILL_ID' };
  }
  if (!requestedPaidDate) {
    return { success: false, skipped: true, reason: 'MISSING_PAID_DATE' };
  }
  if (!paymentRecordId) {
    return { success: false, skipped: true, reason: 'MISSING_PAYMENT_RECORD_ID' };
  }

  const userRef = db.collection('users').doc(userId);
  const billRef = userRef.collection('financialEvents').doc(billId);
  const paymentRef = userRef.collection('bill_payments').doc(paymentRecordId);
  const paidArchiveRef = userRef.collection('paidBills').doc(paymentRecordId);
  const transactionRef = transactionId
    ? userRef.collection('transactions').doc(transactionId)
    : null;

  return db.runTransaction(async firestoreTransaction => {
    let paidDate = requestedPaidDate;
    let amount = requestedAmount;
    let liveTransaction = null;

    // Every transaction-backed payment (automatic, manual link, review
    // acceptance) claims the bank transaction inside this Firestore
    // transaction. Reading and then writing the transaction document makes
    // concurrent claims conflict, so a losing run re-reads the claim and is
    // refused instead of paying a second bill.
    if (transactionRef) {
      const claim = await checkTransactionClaim(firestoreTransaction, {
        userRef,
        transactionRef,
        transactionId,
        billId,
        expectedAmount: requestedAmount,
        expectedDate: requestedPaidDate
      });
      if (!claim.liveTransaction) return claim;

      // Pay from the stored transaction read inside this transaction, never
      // from the caller's snapshot.
      liveTransaction = claim.liveTransaction;
      paidDate = String(liveTransaction.date).slice(0, 10);
      amount = liveTransaction.amount;
    }

    const billSnapshot = await firestoreTransaction.get(billRef);
    if (!billSnapshot.exists) {
      return { success: false, skipped: true, reason: 'BILL_NOT_FOUND' };
    }

    const liveBill = { id: billSnapshot.id, ...billSnapshot.data() };

    if (requiredReviewTransactionId) {
      if (liveBill.paymentReviewCandidate !== true) {
        return { success: false, skipped: true, reason: 'REVIEW_CANDIDATE_NOT_ACTIVE' };
      }

      if (liveBill.paymentReviewTransactionId !== requiredReviewTransactionId) {
        return {
          success: false,
          skipped: true,
          reason: 'REVIEW_TRANSACTION_CHANGED',
          expectedTransactionId: liveBill.paymentReviewTransactionId || null
        };
      }

      // The user confirmed the reviewed amount and date. If Plaid has since
      // changed the debit, fail closed so they review the new values.
      const reviewedCents = toCents(liveBill.paymentReviewActualAmount);
      const reviewedDate = String(liveBill.paymentReviewDate || '').slice(0, 10);
      const liveCents = toCents(Math.abs(Number(liveTransaction?.amount)));
      if (
        (reviewedCents !== null && liveCents !== reviewedCents) ||
        (reviewedDate && reviewedDate !== paidDate)
      ) {
        return {
          success: false,
          skipped: true,
          reason: 'REVIEW_AMOUNT_CHANGED',
          reviewedAmount: liveBill.paymentReviewActualAmount ?? null,
          liveAmount: liveTransaction?.amount ?? null,
          reviewedDate: reviewedDate || null,
          liveDate: paidDate
        };
      }
    }

    if (liveBill.isPaid || liveBill.status === 'paid') {
      if (liveBill.paymentRecordId === paymentRecordId ||
          (transactionId && liveBill.linkedTransactionId === transactionId)) {
        return {
          success: true,
          idempotent: true,
          cleared: false,
          advanced: false,
          generated: false
        };
      }

      return { success: false, skipped: true, reason: 'BILL_ALREADY_PAID' };
    }

    let patternRef = null;
    let pattern = null;
    let nextOccurrence = null;
    let nextBillRef = null;
    let nextBillExists = false;

    if (liveBill.recurringPatternId) {
      patternRef = userRef
        .collection('recurringPatterns')
        .doc(liveBill.recurringPatternId);

      const patternSnapshot = await firestoreTransaction.get(patternRef);
      if (!patternSnapshot.exists) {
        return { success: false, skipped: true, reason: 'RECURRING_PATTERN_NOT_FOUND' };
      }

      pattern = patternSnapshot.data();
      const currentDueDate = liveBill.dueDate || liveBill.nextDueDate;

      if (pattern.nextOccurrence && pattern.nextOccurrence !== currentDueDate) {
        return {
          success: false,
          skipped: true,
          reason: 'RECURRING_PATTERN_OUT_OF_SYNC',
          expectedDueDate: pattern.nextOccurrence,
          billDueDate: currentDueDate
        };
      }

      const finalInstallment = isFinalInstallment(pattern, currentDueDate);

      if (!finalInstallment) {
        const nextDate = calculateNextOccurrence(
          currentDueDate,
          pattern.frequency || liveBill.recurrence || 'monthly',
          pattern
        );
        nextOccurrence = toDateOnlyString(nextDate);

        if (!nextOccurrence) {
          return { success: false, skipped: true, reason: 'NEXT_OCCURRENCE_INVALID' };
        }

        if (
          pattern.installmentPlan &&
          pattern.endDate &&
          nextOccurrence > String(pattern.endDate).slice(0, 10)
        ) {
          return {
            success: false,
            skipped: true,
            reason: 'INSTALLMENT_NEXT_OCCURRENCE_AFTER_END_DATE',
            nextOccurrence,
            endDate: String(pattern.endDate).slice(0, 10)
          };
        }

        nextBillRef = userRef
          .collection('financialEvents')
          .doc(deterministicNextBillId(liveBill.recurringPatternId, nextOccurrence));

        const nextBillSnapshot = await firestoreTransaction.get(nextBillRef);
        nextBillExists = nextBillSnapshot.exists;
      }
    }

    const parsedPaidDate = parseDueDateLocal(paidDate);
    const dueDate = parseDueDateLocal(liveBill.dueDate || liveBill.nextDueDate);
    const daysPastDue = parsedPaidDate && dueDate
      ? Math.max(0, Math.floor((parsedPaidDate - dueDate) / (1000 * 60 * 60 * 24)))
      : 0;
    const paymentYear = parsedPaidDate?.getFullYear() || Number(paidDate.slice(0, 4)) || null;
    const paymentQuarter = parsedPaidDate
      ? `Q${Math.ceil((parsedPaidDate.getMonth() + 1) / 3)}`
      : null;
    const paidAmount = Math.abs(parseFloat(amount ?? liveBill.amount) || 0);

    firestoreTransaction.update(billRef, {
      isPaid: true,
      status: 'paid',
      paidDate,
      paidAmount,
      linkedTransactionId: transactionId,
      paymentRecordId,
      markedBy,
      markedAt: FieldValue.serverTimestamp(),
      markedVia,
      canBeUnmarked: markedVia === 'manual-payment',
      lifecyclePreviousDueDate: liveBill.dueDate || liveBill.nextDueDate || null,
      lifecyclePreviousPatternState: pattern
        ? {
            nextOccurrence: pattern.nextOccurrence || null,
            status: pattern.status || 'active',
            remainingPayments: pattern.remainingPayments ?? null,
            remainingBalance: pattern.remainingBalance ?? null,
            completedAt: pattern.completedAt || null
          }
        : null,
      lifecycleNextOccurrence: nextOccurrence,
      lifecycleNextBillId: nextBillRef?.id || null,
      pendingPayment: FieldValue.delete(),
      pendingPaymentTransactionId: FieldValue.delete(),
      pendingPaymentDate: FieldValue.delete(),
      pendingPaymentAmount: FieldValue.delete(),
      pendingPaymentName: FieldValue.delete(),
      pendingPaymentConfidence: FieldValue.delete(),
      pendingPaymentMatchedAt: FieldValue.delete(),
      paymentReviewCandidate: FieldValue.delete(),
      paymentReviewTransactionId: FieldValue.delete(),
      paymentReviewDate: FieldValue.delete(),
      paymentReviewExpectedAmount: FieldValue.delete(),
      paymentReviewActualAmount: FieldValue.delete(),
      paymentReviewName: FieldValue.delete(),
      paymentReviewPending: FieldValue.delete(),
      paymentReviewReason: FieldValue.delete(),
      paymentReviewDetectedAt: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp()
    });

    if (transactionRef) {
      firestoreTransaction.update(transactionRef, {
        linkedEventId: billId,
        linkedAt: FieldValue.serverTimestamp(),
        linkedPaymentRecordId: paymentRecordId
      });
    }

    firestoreTransaction.set(paymentRef, {
      billId: liveBill.id,
      billName: liveBill.name,
      amount: paidAmount,
      category: liveBill.category || 'Bills & Utilities',
      dueDate: liveBill.dueDate || liveBill.nextDueDate,
      paidDate,
      paymentMonth: paidDate.slice(0, 7),
      year: paymentYear,
      quarter: paymentQuarter,
      paymentMethod,
      recurringPatternId: liveBill.recurringPatternId || null,
      linkedTransactionId: transactionId,
      isOverdue: daysPastDue > 0,
      daysPastDue,
      createdAt: FieldValue.serverTimestamp()
    }, { merge: true });

    firestoreTransaction.set(paidArchiveRef, {
      ...liveBill,
      isPaid: true,
      status: 'paid',
      paidDate,
      paidAmount,
      linkedTransactionId: transactionId,
      paymentRecordId,
      paymentMonth: paidDate.slice(0, 7),
      year: paymentYear,
      quarter: paymentQuarter,
      paymentMethod,
      archivedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    if (patternRef && pattern) {
      const finalInstallment = isFinalInstallment(
        pattern,
        liveBill.dueDate || liveBill.nextDueDate
      );

      const currentRemainingPayments = Number(pattern.remainingPayments);
      const nextRemainingPayments =
        pattern.installmentPlan && Number.isFinite(currentRemainingPayments)
          ? Math.max(0, currentRemainingPayments - 1)
          : pattern.remainingPayments;

      const currentRemainingBalance = Number(pattern.remainingBalance);
      const nextRemainingBalance =
        pattern.installmentPlan && Number.isFinite(currentRemainingBalance)
          ? Math.max(0, Math.round((currentRemainingBalance - paidAmount) * 100) / 100)
          : pattern.remainingBalance;

      if (finalInstallment) {
        firestoreTransaction.update(patternRef, {
          nextOccurrence: null,
          status: 'ended',
          remainingPayments: 0,
          remainingBalance: 0,
          lastPaidDate: paidDate,
          completedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        });
      } else {
        const patternUpdate = {
          nextOccurrence,
          lastPaidDate: paidDate,
          updatedAt: FieldValue.serverTimestamp()
        };

        if (nextRemainingPayments !== undefined) {
          patternUpdate.remainingPayments = nextRemainingPayments;
        }

        if (nextRemainingBalance !== undefined) {
          patternUpdate.remainingBalance = nextRemainingBalance;
        }

        firestoreTransaction.update(patternRef, patternUpdate);

        if (!nextBillExists) {
          firestoreTransaction.set(nextBillRef, {
            id: nextBillRef.id,
            type: 'bill',
            name: liveBill.name,
            amount: amountForNextOccurrence(pattern, liveBill, nextOccurrence),
            dueDate: nextOccurrence,
            originalDueDate: nextOccurrence,
            isPaid: false,
            status: 'pending',
            paidDate: null,
            paidAmount: null,
            linkedTransactionId: null,
            category: liveBill.category,
            recurrence: liveBill.recurrence || pattern.frequency || 'monthly',
            recurringPatternId: liveBill.recurringPatternId,
            merchantNames: liveBill.merchantNames || [],
            autoPayEnabled: liveBill.autoPayEnabled || false,
            paymentHistory: [],
            notes: null,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            createdFrom: 'canonical-bill-engine'
          });
        }
      }
    }

    return {
      success: true,
      idempotent: false,
      cleared: true,
      advanced: Boolean(patternRef),
      generated: Boolean(patternRef && nextBillRef && !nextBillExists),
      completed: Boolean(patternRef && pattern && isFinalInstallment(
        pattern,
        liveBill.dueDate || liveBill.nextDueDate
      )),
      nextOccurrence,
      paymentRecordId
    };
  });
}

export async function applyMatchedBillPayment(db, userId, bill, transaction) {
  const transactionId = transaction?.id || transaction?.transaction_id;
  if (!transactionId) {
    return { success: false, skipped: true, reason: 'MISSING_TRANSACTION_ID' };
  }

  return applyBillPaymentLifecycle(db, userId, bill.id, {
    paidDate: transaction.date,
    amount: transaction.amount,
    transactionId,
    paymentRecordId: deterministicPaymentId(bill.id, transactionId),
    paymentMethod: 'Auto (Plaid)',
    markedBy: 'canonical-bill-engine',
    markedVia: 'auto-plaid-match'
  });
}

export async function applyLinkedBillPayment(db, userId, billId, transaction, options = {}) {
  const transactionId = transaction?.id || transaction?.transaction_id;
  if (!transactionId) {
    return { success: false, skipped: true, reason: 'MISSING_TRANSACTION_ID' };
  }

  const amount = Number(transaction?.amount);
  if (
    String(transaction?.source || '').toLowerCase() === 'plaid' &&
    Number.isFinite(amount) &&
    amount >= 0
  ) {
    return { success: false, skipped: true, reason: 'TRANSACTION_NOT_OUTFLOW' };
  }

  if (!transaction?.date) {
    return { success: false, skipped: true, reason: 'MISSING_TRANSACTION_DATE' };
  }

  return applyBillPaymentLifecycle(db, userId, billId, {
    paidDate: transaction.date,
    amount: transaction.amount,
    transactionId,
    paymentRecordId: `link_${billId}_${transactionId}`,
    paymentMethod: options.paymentMethod || 'Linked Bank Transaction',
    markedBy: options.markedBy || 'user',
    markedVia: 'manual-transaction-link'
  });
}

export async function applyReviewCandidateBillPayment(db, userId, billId, transaction, options = {}) {
  const transactionId = transaction?.id || transaction?.transaction_id;
  if (!transactionId) {
    return { success: false, skipped: true, reason: 'MISSING_TRANSACTION_ID' };
  }

  const amount = Number(transaction?.amount);
  if (
    String(transaction?.source || '').toLowerCase() === 'plaid' &&
    Number.isFinite(amount) &&
    amount >= 0
  ) {
    return { success: false, skipped: true, reason: 'TRANSACTION_NOT_OUTFLOW' };
  }

  if (!transaction?.date) {
    return { success: false, skipped: true, reason: 'MISSING_TRANSACTION_DATE' };
  }

  return applyBillPaymentLifecycle(db, userId, billId, {
    paidDate: transaction.date,
    amount: transaction.amount,
    transactionId,
    paymentRecordId: `review_${billId}_${transactionId}`,
    paymentMethod: options.paymentMethod || 'Accepted Changed Bank Amount',
    markedBy: options.markedBy || 'user',
    markedVia: 'changed-amount-review',
    requiredReviewTransactionId: transactionId
  });
}

export async function applyManualBillPayment(db, userId, billId, options = {}) {
  const paidDate = options.paidDate || toDateOnlyString(new Date());
  const paymentRecordId = `manual_${billId}_${paidDate}`;

  return applyBillPaymentLifecycle(db, userId, billId, {
    paidDate,
    amount: options.amount,
    transactionId: null,
    paymentRecordId,
    paymentMethod: options.paymentMethod || 'Manual',
    markedBy: options.markedBy || 'user',
    markedVia: 'manual-payment'
  });
}

async function reverseCanonicalBillPayment(db, userId, billId, expectedMarkedVia) {
  const userRef = db.collection('users').doc(userId);
  const billRef = userRef.collection('financialEvents').doc(billId);

  return db.runTransaction(async firestoreTransaction => {
    const billSnapshot = await firestoreTransaction.get(billRef);
    if (!billSnapshot.exists) {
      return { success: false, skipped: true, reason: 'BILL_NOT_FOUND' };
    }

    const liveBill = { id: billSnapshot.id, ...billSnapshot.data() };

    if (!liveBill.isPaid && liveBill.status !== 'paid') {
      return { success: true, idempotent: true, unmarked: false };
    }

    if (liveBill.markedVia !== expectedMarkedVia || !liveBill.paymentRecordId) {
      return {
        success: false,
        skipped: true,
        reason: 'PAYMENT_REVERSAL_MARKED_VIA_MISMATCH',
        expectedMarkedVia,
        actualMarkedVia: liveBill.markedVia || null
      };
    }

    const paymentRef = userRef.collection('bill_payments').doc(liveBill.paymentRecordId);
    const paidArchiveRef = userRef.collection('paidBills').doc(liveBill.paymentRecordId);

    // Release the bank-transaction claim made by this payment so a corrected
    // payment can use it. Only a claim pointing at this bill is released.
    let linkedTransactionRef = null;
    if (liveBill.linkedTransactionId) {
      const candidateRef = userRef.collection('transactions').doc(liveBill.linkedTransactionId);
      const linkedSnapshot = await firestoreTransaction.get(candidateRef);
      if (linkedSnapshot.exists && linkedSnapshot.data()?.linkedEventId === billId) {
        linkedTransactionRef = candidateRef;
      }
    }

    let patternRef = null;
    let nextBillRef = null;

    if (liveBill.recurringPatternId) {
      const hasNewReversalState = Boolean(liveBill.lifecyclePreviousPatternState);
      const hasLegacyReversalState = Boolean(
        liveBill.lifecycleNextOccurrence && liveBill.lifecycleNextBillId
      );

      if (!hasNewReversalState && !hasLegacyReversalState) {
        return { success: false, skipped: true, reason: 'MISSING_LIFECYCLE_REVERSAL_DATA' };
      }

      patternRef = userRef
        .collection('recurringPatterns')
        .doc(liveBill.recurringPatternId);

      if (liveBill.lifecycleNextBillId) {
        nextBillRef = userRef
          .collection('financialEvents')
          .doc(liveBill.lifecycleNextBillId);
      }

      const patternSnapshot = await firestoreTransaction.get(patternRef);
      const nextBillSnapshot = nextBillRef
        ? await firestoreTransaction.get(nextBillRef)
        : null;

      if (!patternSnapshot.exists) {
        return { success: false, skipped: true, reason: 'RECURRING_PATTERN_NOT_FOUND' };
      }

      const pattern = patternSnapshot.data();

      if (liveBill.lifecycleNextOccurrence) {
        if (pattern.nextOccurrence !== liveBill.lifecycleNextOccurrence) {
          return {
            success: false,
            skipped: true,
            reason: 'RECURRING_PATTERN_HAS_MOVED_FORWARD'
          };
        }
      } else {
        const finalPaymentStillReversible =
          pattern.nextOccurrence == null &&
          pattern.status === 'ended' &&
          Number(pattern.remainingPayments) === 0;

        if (!finalPaymentStillReversible) {
          return {
            success: false,
            skipped: true,
            reason: 'RECURRING_PATTERN_HAS_MOVED_FORWARD'
          };
        }
      }

      if (nextBillSnapshot?.exists) {
        const nextBill = nextBillSnapshot.data();
        if (nextBill.isPaid || nextBill.status === 'paid') {
          return { success: false, skipped: true, reason: 'NEXT_BILL_ALREADY_PAID' };
        }
        if (nextBill.createdFrom !== 'canonical-bill-engine') {
          return { success: false, skipped: true, reason: 'NEXT_BILL_NOT_SAFE_TO_REMOVE' };
        }
      }
    }

    firestoreTransaction.update(billRef, {
      isPaid: false,
      status: 'pending',
      paidDate: null,
      paidAmount: null,
      linkedTransactionId: null,
      paymentRecordId: null,
      markedBy: null,
      markedAt: null,
      markedVia: null,
      canBeUnmarked: false,
      lifecyclePreviousPatternState: null,
      lifecycleNextOccurrence: null,
      lifecycleNextBillId: null,
      updatedAt: FieldValue.serverTimestamp()
    });

    if (linkedTransactionRef) {
      firestoreTransaction.update(linkedTransactionRef, {
        linkedEventId: FieldValue.delete(),
        linkedAt: FieldValue.delete(),
        linkedPaymentRecordId: FieldValue.delete()
      });
    }

    firestoreTransaction.delete(paymentRef);
    firestoreTransaction.delete(paidArchiveRef);

    if (patternRef) {
      const previousPatternState = liveBill.lifecyclePreviousPatternState || null;
      const restorePattern = previousPatternState
        ? {
            nextOccurrence:
              previousPatternState.nextOccurrence ||
              liveBill.lifecyclePreviousDueDate ||
              null,
            status: previousPatternState.status || 'active',
            remainingPayments: previousPatternState.remainingPayments ?? null,
            remainingBalance: previousPatternState.remainingBalance ?? null,
            completedAt: previousPatternState.completedAt ?? null,
            lastPaidDate: null,
            updatedAt: FieldValue.serverTimestamp()
          }
        : {
            nextOccurrence: liveBill.lifecyclePreviousDueDate,
            lastPaidDate: null,
            updatedAt: FieldValue.serverTimestamp()
          };

      firestoreTransaction.update(patternRef, restorePattern);

      if (nextBillRef) {
        firestoreTransaction.delete(nextBillRef);
      }
    }

    return { success: true, idempotent: false, unmarked: true };
  });
}

export async function unmarkManualBillPayment(db, userId, billId) {
  return reverseCanonicalBillPayment(db, userId, billId, 'manual-payment');
}

export async function reverseIncorrectAutoBillMatch(db, userId, billId) {
  return reverseCanonicalBillPayment(db, userId, billId, 'auto-plaid-match');
}

export async function filterCurrentRecurringOccurrences(db, userId, bills = []) {
  const recurringIds = [...new Set(
    bills
      .map(bill => bill?.recurringPatternId)
      .filter(Boolean)
  )];

  const patternMap = new Map();
  await Promise.all(recurringIds.map(async patternId => {
    try {
      const snap = await db.collection('users').doc(userId)
        .collection('recurringPatterns').doc(patternId).get();
      if (snap.exists) patternMap.set(patternId, snap.data());
    } catch (error) {
      console.warn(`[AutoClear] Unable to validate recurring pattern ${patternId}:`, error.message);
    }
  }));

  const current = [];
  const stale = [];

  for (const bill of bills) {
    if (!bill?.recurringPatternId) {
      current.push(bill);
      continue;
    }

    const pattern = patternMap.get(bill.recurringPatternId);
    if (!pattern) {
      current.push(bill);
      continue;
    }

    const billDue = String(bill.dueDate || bill.nextDueDate || '').slice(0, 10);
    const patternDue = String(pattern.nextOccurrence || '').slice(0, 10);

    if (billDue && patternDue && billDue !== patternDue) {
      stale.push({
        id: bill.id,
        name: bill.name,
        billDue,
        patternDue,
        recurringPatternId: bill.recurringPatternId
      });
      continue;
    }

    current.push(bill);
  }

  if (stale.length > 0) {
    console.warn(
      `⚠️ [AutoClear] Ignoring ${stale.length} stale recurring occurrence(s) whose pattern already moved forward`,
      stale
    );
  }

  return { current, stale };
}

/**
 * Main bill matching and clearing function
 */
export async function runBillMatching(db, userId, transactions, bills) {
  console.log('🤖 [AutoClear] Starting automatic bill clearing...');
  
  try {
    // Load merchant aliases
    const merchantAliases = await loadMerchantAliases(db, userId);
    
    // Filter to unpaid bills, then ignore stale recurring occurrences whose
    // recurring pattern has already advanced to another due date.
    const unpaidBills = bills.filter(b => !b.isPaid && b.status !== 'paid' && b.status !== 'skipped');
    const { current: currentUnpaidBills, stale: staleOccurrences } =
      await filterCurrentRecurringOccurrences(db, userId, unpaidBills);
    
    // Enrich bills with aliases
    const enrichedBills = enrichBillsWithAliases(currentUnpaidBills, merchantAliases);
    
    console.log(`📊 [AutoClear] Analyzing ${transactions.length} transactions against ${enrichedBills.length} unpaid bills`);
    
    // Posted transactions can clear bills. Pending transactions only create
    // a transient Pending Payment state so Spendability does not reserve twice.
    const matches = matchTransactionsToBills(transactions, enrichedBills);
    const pendingResult = await reconcilePendingPaymentMatches(
      db,
      userId,
      transactions,
      enrichedBills
    );
    const reviewResult = await reconcileChangedAmountReviewCandidates(
      db,
      userId,
      transactions,
      enrichedBills
    );

    if (matches.length === 0) {
      console.log('ℹ️ [AutoClear] No posted bill matches found');
      return {
        success: true,
        cleared: 0,
        advanced: 0,
        generated: 0,
        pendingMarked: pendingResult.pendingMarked,
        pendingCleared: pendingResult.pendingCleared,
        reviewMarked: reviewResult.reviewMarked,
        reviewCleared: reviewResult.reviewCleared,
        staleSkipped: staleOccurrences.length
      };
    }
    
    console.log(`✅ [AutoClear] Found ${matches.length} match(es)`);
    
    let cleared = 0;
    let advanced = 0;
    let generated = 0;
    
    // Process each match
    for (const match of matches) {
      const { transaction, bill, confidence, matches: criteria } = match;
      
      console.log(`\n💰 [AutoClear] Processing: ${bill.name} ($${bill.amount})`);
      console.log(`   Transaction: "${transaction.name}" ($${Math.abs(transaction.amount)})`);
      console.log(`   Confidence: ${Math.round(confidence * 100)}%`);
      console.log(`   ✓ Name: ${criteria.name ? 'YES' : 'NO'} | Amount: ${criteria.amount ? 'YES' : 'NO'} | Date: ${criteria.date ? 'YES' : 'NO'}`);
      
      try {
        const lifecycle = await applyMatchedBillPayment(db, userId, bill, transaction);

        if (lifecycle.cleared) cleared++;
        if (lifecycle.advanced) advanced++;
        if (lifecycle.generated) generated++;

        if (lifecycle.skipped) {
          console.warn(
            `⚠️ [AutoClear] Skipped ${bill.name}: ${lifecycle.reason}`,
            lifecycle
          );
        } else if (lifecycle.idempotent) {
          console.log(`⏭️ [AutoClear] Already processed: ${bill.name}`);
        }
      } catch (error) {
        console.error(`[AutoClear] Failed atomic lifecycle for bill: ${bill.name}`, error);
      }
    }
    
    console.log('\n🎉 [AutoClear] Complete!');
    console.log(`   Cleared: ${cleared} bill(s)`);
    console.log(`   Advanced: ${advanced} pattern(s)`);
    console.log(`   Generated: ${generated} next bill(s)`);
    
    return {
      success: true,
      cleared,
      advanced,
      generated,
      pendingMarked: pendingResult.pendingMarked,
      pendingCleared: pendingResult.pendingCleared,
      reviewMarked: reviewResult.reviewMarked,
      reviewCleared: reviewResult.reviewCleared,
      staleSkipped: staleOccurrences.length
    };
  } catch (error) {
    console.error('❌ [AutoClear] Error:', error);
    return {
      success: false,
      error: error.message,
      cleared: 0,
      advanced: 0,
      generated: 0,
      pendingMarked: 0,
      pendingCleared: 0,
      reviewMarked: 0,
      reviewCleared: 0,
      staleSkipped: 0
    };
  }
}
