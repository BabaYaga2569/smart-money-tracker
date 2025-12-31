/**
 * AutoBillClearingService.js
 * 
 * Complete automatic bill clearing system that:
 * 1. Matches transactions to unpaid bills using merchant aliases
 * 2. Marks matched bills as PAID
 * 3. Advances recurringPatterns to next due date
 * 4. Generates next month's bill instances
 * 
 * This service provides the "one source of truth" automatic bill management.
 */

import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
  serverTimestamp,
  addDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { matchTransactionsToBills } from './BillPaymentMatcher.js';
import { RecurringManager } from './RecurringManager.js';
import { formatDateForInput } from './DateUtils.js';
import { getPacificTime } from './timezoneHelpers.js';

/**
 * Load merchant aliases from aiLearning/merchantAliases collection
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Merchant aliases mapping
 */
async function loadMerchantAliases(userId) {
  try {
    const aliasesDocRef = doc(db, 'users', userId, 'aiLearning', 'merchantAliases');
    const aliasesDoc = await getDoc(aliasesDocRef);
    
    if (aliasesDoc.exists()) {
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
 * Enrich bills with merchant aliases for better matching
 * @param {Array} bills - Array of bill instances
 * @param {Object} merchantAliases - Merchant aliases mapping
 * @returns {Array} - Bills enriched with aliases
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
 * Mark a bill in financialEvents as paid and record payment
 * @param {string} userId - User ID
 * @param {Object} bill - Bill from financialEvents
 * @param {Object} transaction - Matched transaction
 * @returns {Promise<void>}
 */
async function markBillAsPaid(userId, bill, transaction) {
  try {
    const billRef = doc(db, 'users', userId, 'financialEvents', bill.id);
    
    // Extract transaction ID consistently
    const transactionId = transaction.id || transaction.transaction_id;
    
    // Calculate days past due
    const now = new Date(transaction.date);
    const dueDate = new Date(bill.dueDate);
    const daysPastDue = Math.max(0, Math.floor((now - dueDate) / (1000 * 60 * 60 * 24)));
    
    // Update financialEvent to mark as paid with audit trail
    await updateDoc(billRef, {
      isPaid: true,
      status: 'paid',
      paidDate: transaction.date,
      paidAmount: Math.abs(parseFloat(transaction.amount)),
      linkedTransactionId: transactionId,
      // Audit trail fields
      markedBy: 'auto-bill-clearing',
      markedAt: serverTimestamp(),
      markedVia: 'auto-plaid-match',
      canBeUnmarked: true,
      updatedAt: serverTimestamp()
    });
    
    // Record payment in bill_payments collection
    const paymentsRef = collection(db, 'users', userId, 'bill_payments');
    const paidDateStr = transaction.date;
    const paymentYear = new Date(transaction.date).getFullYear();
    const paymentQuarter = `Q${Math.ceil((new Date(transaction.date).getMonth() + 1) / 3)}`;
    
    await addDoc(paymentsRef, {
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
      createdAt: serverTimestamp()
    });
    
    // Archive to paidBills collection
    const paidBillsRef = collection(db, 'users', userId, 'paidBills');
    await addDoc(paidBillsRef, {
      ...bill,
      isPaid: true,
      paidDate: transaction.date,
      paymentMonth: paidDateStr.slice(0, 7),
      year: paymentYear,
      quarter: paymentQuarter,
      paymentMethod: 'Auto (Plaid)',
      archivedAt: serverTimestamp()
    });
    
    console.log(`✅ [AutoClear] Marked bill as paid in financialEvents: ${bill.name} ($${bill.amount})`);
  } catch (error) {
    console.error(`[AutoClear] Error marking bill as paid: ${bill.name}`, error);
    throw error;
  }
}

/**
 * Advance recurring pattern to next occurrence
 * @param {string} userId - User ID
 * @param {string} patternId - Recurring pattern ID
 * @param {string} currentDueDate - Current due date that was paid
 * @param {string} frequency - Recurrence frequency
 * @returns {Promise<string|null>} - Next occurrence date or null
 */
async function advanceRecurringPattern(userId, patternId, currentDueDate, frequency, paidDate) {
  try {
    const patternRef = doc(db, 'users', userId, 'recurringPatterns', patternId);
    const patternDoc = await getDoc(patternRef);
    
    if (!patternDoc.exists()) {
      console.log(`⚠️ [AutoClear] Pattern not found: ${patternId}`);
      return null;
    }
    
    const pattern = patternDoc.data();
    
    // Only advance if current due date matches pattern's nextOccurrence
    if (pattern.nextOccurrence !== currentDueDate) {
      console.log(`⚠️ [AutoClear] Due date mismatch for ${pattern.name}: expected ${pattern.nextOccurrence}, got ${currentDueDate}`);
      return null;
    }
    
    // Calculate next occurrence
    const useFrequency = pattern.frequency || frequency || 'monthly';
    const nextOccurrence = RecurringManager.calculateNextOccurrenceAfterPayment(
      currentDueDate,
      useFrequency
    );
    
    const nextOccurrenceStr = nextOccurrence.toISOString().split('T')[0];
    
    // Update pattern (use paidDate from transaction, not current time)
    await updateDoc(patternRef, {
      nextOccurrence: nextOccurrenceStr,
      lastPaidDate: paidDate,
      updatedAt: serverTimestamp()
    });
    
    console.log(`✅ [AutoClear] Advanced pattern ${pattern.name}: ${currentDueDate} → ${nextOccurrenceStr}`);
    
    return nextOccurrenceStr;
  } catch (error) {
    console.error(`[AutoClear] Error advancing pattern ${patternId}:`, error);
    return null;
  }
}

/**
 * Generate next month's bill instance in financialEvents from recurring pattern
 * @param {string} userId - User ID
 * @param {Object} bill - Current bill from financialEvents
 * @param {string} nextOccurrence - Next due date
 * @returns {Promise<Object|null>} - New bill instance or null
 */
async function generateNextBill(userId, bill, nextOccurrence) {
  try {
    // Only generate for recurring bills
    if (!bill.recurringPatternId) {
      console.log(`⏭️ [AutoClear] Skipping next bill generation for non-recurring: ${bill.name}`);
      return null;
    }
    
    // Generate unique bill ID
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
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdFrom: 'auto-bill-clearing'
    };
    
    // Check if bill already exists for this date
    const existingQuery = query(
      collection(db, 'users', userId, 'financialEvents'),
      where('type', '==', 'bill'),
      where('recurringPatternId', '==', bill.recurringPatternId),
      where('dueDate', '==', nextOccurrence)
    );
    
    const existingBills = await getDocs(existingQuery);
    
    if (!existingBills.empty) {
      console.log(`⚠️ [AutoClear] Bill already exists for ${bill.name} on ${nextOccurrence}`);
      return null;
    }
    
    // Save to financialEvents collection
    await setDoc(
      doc(db, 'users', userId, 'financialEvents', nextBillId),
      nextBillInstance
    );
    
    console.log(`✅ [AutoClear] Generated next bill in financialEvents: ${bill.name} due ${nextOccurrence}`);
    
    return nextBillInstance;
  } catch (error) {
    console.error(`[AutoClear] Error generating next bill for ${bill.name}:`, error);
    return null;
  }
}

/**
 * Main automatic bill clearing service
 * Orchestrates the complete flow: match → mark paid → advance recurring → generate next
 * 
 * @param {string} userId - User ID
 * @param {Array} transactions - Array of Plaid transactions
 * @param {Array} bills - Array of unpaid bill instances
 * @param {Object} settings - User settings (optional)
 * @returns {Promise<Object>} - Results summary
 */
export async function runAutoBillClearing(userId, transactions, bills, settings = null) {
  console.log('🤖 [AutoClear] Starting automatic bill clearing...');
  
  // Check if auto-detection is disabled
  if (settings?.autoDetectBills === false || settings?.disableAutoGeneration === true) {
    console.log('[AutoClear] Auto-detection disabled in settings');
    return {
      success: true,
      cleared: 0,
      advanced: 0,
      generated: 0,
      message: 'Auto-detection disabled in settings'
    };
  }
  
  try {
    // Load merchant aliases
    const merchantAliases = await loadMerchantAliases(userId);
    
    // Filter to unpaid bills only
    const unpaidBills = bills.filter(b => !b.isPaid && b.status !== 'paid' && b.status !== 'skipped');
    
    // Enrich bills with aliases
    const enrichedBills = enrichBillsWithAliases(unpaidBills, merchantAliases);
    
    console.log(`📊 [AutoClear] Analyzing ${transactions.length} transactions against ${enrichedBills.length} unpaid bills`);
    console.log(`🔍 [AutoClear] Using merchant aliases for ${Object.keys(merchantAliases).length} merchants`);
    
    // Run matching algorithm (uses 67% confidence threshold)
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
    const results = [];
    
    // Process each match
    for (const match of matches) {
      const { transaction, bill, confidence, matches: criteria } = match;
      
      console.log(`\n💰 [AutoClear] Processing: ${bill.name} ($${bill.amount})`);
      console.log(`   Transaction: "${transaction.name}" ($${Math.abs(transaction.amount)})`);
      console.log(`   Confidence: ${Math.round(confidence * 100)}%`);
      console.log(`   ✓ Name: ${criteria.name ? 'YES' : 'NO'} | Amount: ${criteria.amount ? 'YES' : 'NO'} | Date: ${criteria.date ? 'YES' : 'NO'}`);
      
      try {
        // 1. Mark bill as paid
        await markBillAsPaid(userId, bill, transaction);
        cleared++;
        
        // 2. Advance recurring pattern (if applicable)
        let nextOccurrence = null;
        if (bill.recurringPatternId) {
          nextOccurrence = await advanceRecurringPattern(
            userId,
            bill.recurringPatternId,
            bill.dueDate,
            bill.recurrence,
            transaction.date
          );
          
          if (nextOccurrence) {
            advanced++;
            
            // 3. Generate next month's bill
            const nextBill = await generateNextBill(userId, bill, nextOccurrence);
            if (nextBill) {
              generated++;
            }
          }
        }
        
        results.push({
          billName: bill.name,
          amount: bill.amount,
          transactionName: transaction.name,
          transactionDate: transaction.date,
          nextOccurrence
        });
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
      generated,
      results
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

/**
 * Helper function to get recent transactions (last N days)
 * @param {string} userId - User ID
 * @param {number} days - Number of days to look back (default 60)
 * @returns {Promise<Array>} - Array of transactions
 */
export async function getRecentTransactions(userId, days = 60) {
  try {
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - days);
    
    const transactionsRef = collection(db, 'users', userId, 'transactions');
    const q = query(
      transactionsRef,
      where('date', '>=', daysAgo.toISOString().split('T')[0])
    );
    
    const snapshot = await getDocs(q);
    const transactions = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`✅ [AutoClear] Loaded ${transactions.length} recent transactions (last ${days} days)`);
    
    return transactions;
  } catch (error) {
    console.error('[AutoClear] Error loading transactions:', error);
    return [];
  }
}

/**
 * Helper function to get unpaid bills from financialEvents
 * @param {string} userId - User ID
 * @returns {Promise<Array>} - Array of unpaid bills
 */
export async function getUnpaidBills(userId) {
  try {
    const eventsRef = collection(db, 'users', userId, 'financialEvents');
    const q = query(
      eventsRef,
      where('type', '==', 'bill'),
      where('isPaid', '==', false)
    );
    
    const snapshot = await getDocs(q);
    const bills = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`✅ [AutoClear] Loaded ${bills.length} unpaid bills from financialEvents`);
    
    return bills;
  } catch (error) {
    console.error('[AutoClear] Error loading bills:', error);
    return [];
  }
}
