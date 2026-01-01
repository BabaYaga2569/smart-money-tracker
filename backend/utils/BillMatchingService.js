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
  
  const skipWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
                     'of', 'with', 'by', 'from', 'payment', 'bill', 'monthly', 'annual'];
  
  const normalized = normalizeString(str);
  const words = normalized.split(' ').filter(word => 
    word.length > 2 && !skipWords.includes(word)
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
  if (similarity >= 0.75) return true;
  
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
      if (merchantSimilarity >= 0.75) return true;
      
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
function isAmountMatch(txAmount, billAmount, tolerance = 0.50) {
  const txAbs = Math.abs(parseFloat(txAmount) || 0);
  const billAbs = Math.abs(parseFloat(billAmount) || 0);
  
  const difference = Math.abs(txAbs - billAbs);
  return difference <= tolerance;
}

/**
 * Check if transaction date is within acceptable range
 */
function isDateMatch(txDate, billDueDate, daysTolerance = 7) {
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
  
  // Count matches
  let matchCount = 0;
  if (nameMatch) matchCount++;
  if (amountMatch) matchCount++;
  if (dateMatch) matchCount++;
  
  // Calculate confidence
  const confidence = matchCount / 3;
  
  // Require at least 2 of 3 criteria (67% threshold)
  if (matchCount < 2) return null;
  
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
function matchTransactionsToBills(transactions, bills) {
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
 * Mark bill as paid and record payment
 */
async function markBillAsPaid(db, userId, bill, transaction) {
  try {
    const billRef = db.collection('users').doc(userId)
      .collection('financialEvents').doc(bill.id);
    
    const transactionId = transaction.id || transaction.transaction_id;
    
    const now = new Date(transaction.date);
    const dueDate = new Date(bill.dueDate);
    const daysPastDue = Math.max(0, Math.floor((now - dueDate) / (1000 * 60 * 60 * 24)));
    
    // Update bill as paid
    await billRef.update({
      isPaid: true,
      status: 'paid',
      paidDate: transaction.date,
      paidAmount: Math.abs(parseFloat(transaction.amount)),
      linkedTransactionId: transactionId,
      markedBy: 'auto-bill-clearing',
      markedAt: FieldValue.serverTimestamp(),
      markedVia: 'auto-plaid-match',
      canBeUnmarked: true,
      updatedAt: FieldValue.serverTimestamp()
    });
    
    // Record payment
    const paymentsRef = db.collection('users').doc(userId).collection('bill_payments');
    const paidDateStr = transaction.date;
    const paymentYear = new Date(transaction.date).getFullYear();
    const paymentQuarter = `Q${Math.ceil((new Date(transaction.date).getMonth() + 1) / 3)}`;
    
    await paymentsRef.add({
      billId: bill.id,
      billName: bill.name,
      amount: Math.abs(parseFloat(transaction.amount)),
      category: bill.category || 'Bills & Utilities',
      dueDate: bill.dueDate,
      paidDate: paidDateStr,
      paymentMonth: paidDateStr.slice(0, 7),
      year: paymentYear,
      quarter: paymentQuarter,
      paymentMethod: 'Auto (Plaid)',
      recurringPatternId: bill.recurringPatternId || null,
      linkedTransactionId: transactionId,
      isOverdue: daysPastDue > 0,
      daysPastDue: daysPastDue,
      createdAt: FieldValue.serverTimestamp()
    });
    
    // Archive to paidBills
    const paidBillsRef = db.collection('users').doc(userId).collection('paidBills');
    await paidBillsRef.add({
      ...bill,
      isPaid: true,
      paidDate: transaction.date,
      paymentMonth: paidDateStr.slice(0, 7),
      year: paymentYear,
      quarter: paymentQuarter,
      paymentMethod: 'Auto (Plaid)',
      archivedAt: FieldValue.serverTimestamp()
    });
    
    console.log(`✅ [AutoClear] Marked bill as paid: ${bill.name} ($${bill.amount})`);
  } catch (error) {
    console.error(`[AutoClear] Error marking bill as paid: ${bill.name}`, error);
    throw error;
  }
}

/**
 * Calculate next occurrence for recurring pattern
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

/**
 * Advance recurring pattern
 */
async function advanceRecurringPattern(db, userId, patternId, currentDueDate, frequency, paidDate) {
  try {
    const patternRef = db.collection('users').doc(userId)
      .collection('recurringPatterns').doc(patternId);
    const patternDoc = await patternRef.get();
    
    if (!patternDoc.exists) {
      console.log(`⚠️ [AutoClear] Pattern not found: ${patternId}`);
      return null;
    }
    
    const pattern = patternDoc.data();
    
    if (pattern.nextOccurrence !== currentDueDate) {
      console.log(`⚠️ [AutoClear] Due date mismatch for ${pattern.name}`);
      return null;
    }
    
    const useFrequency = pattern.frequency || frequency || 'monthly';
    const nextOccurrence = calculateNextOccurrence(currentDueDate, useFrequency);
    
    if (!nextOccurrence) return null;
    
    const nextOccurrenceStr = nextOccurrence.toISOString().split('T')[0];
    
    await patternRef.update({
      nextOccurrence: nextOccurrenceStr,
      lastPaidDate: paidDate,
      updatedAt: FieldValue.serverTimestamp()
    });
    
    console.log(`✅ [AutoClear] Advanced pattern ${pattern.name}: ${currentDueDate} → ${nextOccurrenceStr}`);
    
    return nextOccurrenceStr;
  } catch (error) {
    console.error(`[AutoClear] Error advancing pattern ${patternId}:`, error);
    return null;
  }
}

/**
 * Generate next bill instance
 */
async function generateNextBill(db, userId, bill, nextOccurrence) {
  try {
    if (!bill.recurringPatternId) {
      console.log(`⏭️ [AutoClear] Skipping next bill generation for non-recurring: ${bill.name}`);
      return null;
    }
    
    const nextBillId = `bill_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    
    const nextBillInstance = {
      id: nextBillId,
      type: 'bill',
      name: bill.name,
      amount: bill.amount,
      dueDate: nextOccurrence,
      originalDueDate: nextOccurrence,
      isPaid: false,
      status: 'pending',
      paidDate: null,
      paidAmount: null,
      linkedTransactionId: null,
      category: bill.category,
      recurrence: bill.recurrence || 'monthly',
      recurringPatternId: bill.recurringPatternId,
      merchantNames: bill.merchantNames || [],
      autoPayEnabled: bill.autoPayEnabled || false,
      paymentHistory: [],
      notes: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdFrom: 'auto-bill-clearing'
    };
    
    // Check if bill already exists
    const existingQuery = await db.collection('users').doc(userId)
      .collection('financialEvents')
      .where('type', '==', 'bill')
      .where('recurringPatternId', '==', bill.recurringPatternId)
      .where('dueDate', '==', nextOccurrence)
      .get();
    
    if (!existingQuery.empty) {
      console.log(`⚠️ [AutoClear] Bill already exists for ${bill.name} on ${nextOccurrence}`);
      return null;
    }
    
    // Save to financialEvents
    await db.collection('users').doc(userId)
      .collection('financialEvents').doc(nextBillId).set(nextBillInstance);
    
    console.log(`✅ [AutoClear] Generated next bill: ${bill.name} due ${nextOccurrence}`);
    
    return nextBillInstance;
  } catch (error) {
    console.error(`[AutoClear] Error generating next bill for ${bill.name}:`, error);
    return null;
  }
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
        // Mark bill as paid
        await markBillAsPaid(db, userId, bill, transaction);
        cleared++;
        
        // Advance recurring pattern
        let nextOccurrence = null;
        if (bill.recurringPatternId) {
          nextOccurrence = await advanceRecurringPattern(
            db,
            userId,
            bill.recurringPatternId,
            bill.dueDate,
            bill.recurrence,
            transaction.date
          );
          
          if (nextOccurrence) {
            advanced++;
            
            // Generate next bill
            const nextBill = await generateNextBill(db, userId, bill, nextOccurrence);
            if (nextBill) {
              generated++;
            }
          }
        }
      } catch (error) {
        console.error(`[AutoClear] Failed to process bill: ${bill.name}`, error);
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
