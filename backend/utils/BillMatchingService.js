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

/**
 * Match a single transaction to a single bill
 */
function matchTransactionToBill(transaction, bill) {
  const txName = transaction.name || '';
  const txAmount = Math.abs(parseFloat(transaction.amount) || 0);
  const txDate = transaction.date;
  
  const billName = bill.name || '';
  const billAmount = Math.abs(parseFloat(bill.amount) || 0);
  const billDueDate = bill.dueDate;
  const merchantNames = bill.merchantNames || [];
  
  const nameMatch = isNameMatch(txName, billName, merchantNames);
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
  
  // Require date + at least one of name/amount
  if (matchCount < MINIMUM_MATCH_COUNT) return null;
  
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
function calculateNextOccurrence(currentDate, frequency) {
  const current = parseDueDateLocal(currentDate);
  if (!current) return null;

  let next;

  switch (frequency) {
    case 'weekly':
      next = new Date(current);
      next.setDate(current.getDate() + 7);
      break;
    case 'biweekly':
      next = new Date(current);
      next.setDate(current.getDate() + 14);
      break;
    case 'monthly':
      next = new Date(current);
      next.setMonth(current.getMonth() + 1);
      break;
    case 'quarterly':
      next = new Date(current);
      next.setMonth(current.getMonth() + 3);
      break;
    case 'yearly':
      next = new Date(current);
      next.setFullYear(current.getFullYear() + 1);
      break;
    default:
      next = new Date(current);
      next.setMonth(current.getMonth() + 1);
  }

  return next;
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

/**
 * Atomically apply one matched transaction to one canonical bill occurrence.
 *
 * For recurring bills, the bill payment, payment history, paid archive,
 * pattern advancement, and next occurrence are committed together or not at
 * all. Deterministic document IDs make retries idempotent.
 */
export async function applyMatchedBillPayment(db, userId, bill, transaction) {
  const transactionId = transaction?.id || transaction?.transaction_id;
  if (!transactionId) {
    return { success: false, skipped: true, reason: 'MISSING_TRANSACTION_ID' };
  }

  const userRef = db.collection('users').doc(userId);
  const billRef = userRef.collection('financialEvents').doc(bill.id);
  const paymentRef = userRef
    .collection('bill_payments')
    .doc(deterministicPaymentId(bill.id, transactionId));
  const paidArchiveRef = userRef
    .collection('paidBills')
    .doc(deterministicPaymentId(bill.id, transactionId));

  return db.runTransaction(async firestoreTransaction => {
    // Firestore transactions require reads before writes.
    const billSnapshot = await firestoreTransaction.get(billRef);
    if (!billSnapshot.exists) {
      return { success: false, skipped: true, reason: 'BILL_NOT_FOUND' };
    }

    const liveBill = { id: billSnapshot.id, ...billSnapshot.data() };

    if (liveBill.isPaid || liveBill.status === 'paid') {
      if (liveBill.linkedTransactionId === transactionId) {
        return {
          success: true,
          idempotent: true,
          cleared: false,
          advanced: false,
          generated: false
        };
      }

      return {
        success: false,
        skipped: true,
        reason: 'BILL_ALREADY_PAID'
      };
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
        return {
          success: false,
          skipped: true,
          reason: 'RECURRING_PATTERN_NOT_FOUND'
        };
      }

      pattern = patternSnapshot.data();
      const currentDueDate = liveBill.dueDate;

      // Do not silently advance an already-divergent recurring chain.
      if (pattern.nextOccurrence && pattern.nextOccurrence !== currentDueDate) {
        return {
          success: false,
          skipped: true,
          reason: 'RECURRING_PATTERN_OUT_OF_SYNC',
          expectedDueDate: pattern.nextOccurrence,
          billDueDate: currentDueDate
        };
      }

      const nextDate = calculateNextOccurrence(
        currentDueDate,
        pattern.frequency || liveBill.recurrence || 'monthly'
      );
      nextOccurrence = toDateOnlyString(nextDate);

      if (!nextOccurrence) {
        return {
          success: false,
          skipped: true,
          reason: 'NEXT_OCCURRENCE_INVALID'
        };
      }

      nextBillRef = userRef
        .collection('financialEvents')
        .doc(deterministicNextBillId(liveBill.recurringPatternId, nextOccurrence));

      const nextBillSnapshot = await firestoreTransaction.get(nextBillRef);
      nextBillExists = nextBillSnapshot.exists;
    }

    const paidDateStr = transaction.date;
    const paidDate = parseDueDateLocal(paidDateStr);
    const dueDate = parseDueDateLocal(liveBill.dueDate);
    const daysPastDue = paidDate && dueDate
      ? Math.max(0, Math.floor((paidDate - dueDate) / (1000 * 60 * 60 * 24)))
      : 0;
    const paymentYear = paidDate?.getFullYear() || Number(paidDateStr?.slice(0, 4)) || null;
    const paymentQuarter = paidDate
      ? `Q${Math.ceil((paidDate.getMonth() + 1) / 3)}`
      : null;
    const paidAmount = Math.abs(parseFloat(transaction.amount) || 0);

    firestoreTransaction.update(billRef, {
      isPaid: true,
      status: 'paid',
      paidDate: paidDateStr,
      paidAmount,
      linkedTransactionId: transactionId,
      markedBy: 'canonical-bill-engine',
      markedAt: FieldValue.serverTimestamp(),
      markedVia: 'auto-plaid-match',
      canBeUnmarked: true,
      updatedAt: FieldValue.serverTimestamp()
    });

    firestoreTransaction.set(paymentRef, {
      billId: liveBill.id,
      billName: liveBill.name,
      amount: paidAmount,
      category: liveBill.category || 'Bills & Utilities',
      dueDate: liveBill.dueDate,
      paidDate: paidDateStr,
      paymentMonth: paidDateStr?.slice(0, 7) || null,
      year: paymentYear,
      quarter: paymentQuarter,
      paymentMethod: 'Auto (Plaid)',
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
      paidDate: paidDateStr,
      paidAmount,
      linkedTransactionId: transactionId,
      paymentMonth: paidDateStr?.slice(0, 7) || null,
      year: paymentYear,
      quarter: paymentQuarter,
      paymentMethod: 'Auto (Plaid)',
      archivedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    if (patternRef && pattern && nextOccurrence) {
      firestoreTransaction.update(patternRef, {
        nextOccurrence,
        lastPaidDate: paidDateStr,
        updatedAt: FieldValue.serverTimestamp()
      });

      if (!nextBillExists) {
        const nextBillId = nextBillRef.id;
        firestoreTransaction.set(nextBillRef, {
          id: nextBillId,
          type: 'bill',
          name: liveBill.name,
          amount: liveBill.amount,
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

    return {
      success: true,
      idempotent: false,
      cleared: true,
      advanced: Boolean(patternRef),
      generated: Boolean(patternRef && !nextBillExists),
      nextOccurrence
    };
  });
}

/**
 * Main bill matching and clearing function
 */
export async function runBillMatching(db, userId, transactions, bills) {
  console.log('🤖 [AutoClear] Starting automatic bill clearing...');
  
  try {
    // Load merchant aliases
    const merchantAliases = await loadMerchantAliases(db, userId);
    
    // Filter to unpaid bills
    const unpaidBills = bills.filter(b => !b.isPaid && b.status !== 'paid' && b.status !== 'skipped');
    
    // Enrich bills with aliases
    const enrichedBills = enrichBillsWithAliases(unpaidBills, merchantAliases);
    
    console.log(`📊 [AutoClear] Analyzing ${transactions.length} transactions against ${enrichedBills.length} unpaid bills`);
    
    // Run matching
    const matches = matchTransactionsToBills(transactions, enrichedBills);
    
    if (matches.length === 0) {
      console.log('❌ [AutoClear] No matches found');
      return {
        success: true,
        cleared: 0,
        advanced: 0,
        generated: 0
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
      generated
    };
  } catch (error) {
    console.error('❌ [AutoClear] Error:', error);
    return {
      success: false,
      error: error.message,
      cleared: 0,
      advanced: 0,
      generated: 0
    };
  }
}
