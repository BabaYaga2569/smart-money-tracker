// AutoBillDetection.js - Automatic bill payment detection and processing
import { doc, updateDoc, serverTimestamp, arrayUnion, setDoc, getDoc, collection, getDocs, addDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { matchTransactionsToBills } from './BillPaymentMatcher.js';
import { formatDateForInput, parseLocalDate } from './DateUtils.js';
import { RecurringManager } from './RecurringManager.js';
import { getDateOnly } from './dateNormalization.js';

/**
 * Load merchant aliases from aiLearning/merchantAliases collection
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Merchant aliases mapping (empty object on error)
 * @throws Never throws - returns empty object on any error to prevent breaking bill matching
 */
export async function loadMerchantAliases(userId) {
  try {
    const aliasesDocRef = doc(db, 'users', userId, 'aiLearning', 'merchantAliases');
    const aliasesDoc = await getDoc(aliasesDocRef);
    
    if (aliasesDoc.exists()) {
      const data = aliasesDoc.data();
      console.log(`✅ Loaded merchant aliases: ${Object.keys(data.aliases || {}).length} merchants`);
      return data.aliases || {};
    }
    
    console.log('⚠️ No merchant aliases found in aiLearning collection');
    return {};
  } catch (error) {
    console.error('Error loading merchant aliases:', error);
    return {};
  }
}

/**
 * Enrich a bill with merchant name aliases for better matching
 * @param {Object} bill - Bill instance
 * @param {Object} merchantAliases - Merchant aliases mapping
 * @returns {Object} - Bill enriched with merchant name aliases
 */
function enrichBillWithAliases(bill, merchantAliases) {
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
}

/**
 * Mark a bill as paid and link to transaction
 * @param {string} userId - User ID
 * @param {Object} bill - Bill instance to mark as paid
 * @param {Object} transaction - Plaid transaction that paid the bill
 * @returns {Promise<Object>} - Updated bill data with next due date
 */
export async function markBillAsPaid(userId, bill, transaction) {
  try {
    const billRef = doc(db, 'users', userId, 'billInstances', bill.id);
    
    // Extract transaction ID consistently
    const transactionId = transaction.id || transaction.transaction_id;
    
    // Calculate days past due
    const now = parseLocalDate(transaction.date);
    const dueDate = parseLocalDate(bill.dueDate);
    const daysPastDue = Math.max(0, Math.floor((now - dueDate) / (1000 * 60 * 60 * 24)));
    
    // Update bill status
    await updateDoc(billRef, {
      isPaid: true,
      status: 'paid',
      paidDate: transaction.date,
      updatedAt: serverTimestamp(),
      linkedTransactionIds: arrayUnion(transactionId),
      paymentHistory: arrayUnion({
        paidDate: parseLocalDate(transaction.date).toISOString(),
        amount: Math.abs(parseFloat(transaction.amount)),
        transactionId: transactionId,
        transactionName: transaction.name || transaction.merchant_name,
        paymentMethod: 'auto-detected',
        source: 'plaid'
      })
    });
    
    // Record payment in bill_payments collection
    const paymentsRef = collection(db, 'users', userId, 'bill_payments');
    const paidDateStr = transaction.date;
    const transactionDateObj = parseLocalDate(transaction.date);
    const paymentYear = transactionDateObj.getFullYear();
    const paymentQuarter = `Q${Math.ceil((transactionDateObj.getMonth() + 1) / 3)}`;
    
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
    
    // ✅ NEW: Advance recurring pattern if applicable
    if (bill.recurringPatternId) {
      try {
        const patternRef = doc(db, 'users', userId, 'recurringPatterns', bill.recurringPatternId);
        const patternDoc = await getDoc(patternRef);
        
        if (patternDoc.exists()) {
          const pattern = patternDoc.data();
          
          // Only advance if bill's due date matches pattern's nextOccurrence
          // Use date comparison to handle timezone and format variations
          const patternDate = getDateOnly(pattern.nextOccurrence);
          const billDate = getDateOnly(bill.dueDate);
          
          if (patternDate === billDate) {
            const frequency = pattern.frequency || bill.recurrence || 'monthly';
            const nextOccurrence = RecurringManager.calculateNextOccurrenceAfterPayment(
              bill.dueDate,
              frequency
            );
            
            const nextOccurrenceStr = nextOccurrence.toISOString().split('T')[0];
            
            await updateDoc(patternRef, {
              nextOccurrence: nextOccurrenceStr,
              lastPaidDate: transaction.date,
              updatedAt: serverTimestamp()
            });
            
            console.log(`✅ Advanced recurring pattern ${pattern.name}: ${bill.dueDate} → ${nextOccurrenceStr}`);
          }
        }
      } catch (error) {
        console.error(`Error advancing recurring pattern for ${bill.name}:`, error);
        // Don't fail the entire operation if pattern advancement fails
      }
    }
    
    console.log(`✅ Marked bill as paid: ${bill.name} ($${bill.amount})`);
    
    // Return bill data for next bill generation
    return bill;
  } catch (error) {
    console.error(`Error marking bill as paid: ${bill.name}`, error);
    throw error;
  }
}

/**
 * Generate next month's bill for recurring bills
 * @param {string} userId - User ID
 * @param {Object} bill - Current bill instance
 * @param {Object} settings - User settings (optional)
 * @returns {Promise<Object>} - New bill instance
 */
export async function generateNextBill(userId, bill, settings = null) {
  try {
    // Check if auto-generation is disabled in user settings
    if (settings?.disableAutoGeneration === true || settings?.autoDetectBills === false) {
      console.log(`[AutoBillDetection] Auto-generation is disabled in settings, skipping: ${bill.name}`);
      return null;
    }
    
    // Check if merchant is in ignored list
    const ignoredMerchants = settings?.ignoredMerchants || [];
    const merchantLower = bill.name.toLowerCase();
    // Use startsWith, endsWith, or exact match to avoid false positives
    const isIgnored = ignoredMerchants.some(ignored => {
      const ignoredLower = ignored.toLowerCase();
      return merchantLower === ignoredLower || 
             merchantLower.startsWith(ignoredLower + ' ') || 
             merchantLower.endsWith(' ' + ignoredLower);
    });
    if (isIgnored) {
      console.log(`[AutoBillDetection] Merchant is ignored, skipping: ${bill.name}`);
      return null;
    }
    
    // Only generate for recurring/subscription bills or bills with recurringPatternId
    if (!bill.recurringPatternId && bill.recurrence !== 'monthly' && !bill.isSubscription) {
      console.log(`⏭️  Skipping next bill generation for non-recurring bill: ${bill.name}`);
      return null;
    }
    
    // ✅ NEW: Get next occurrence from recurring pattern if available
    let nextDueDateStr;
    
    if (bill.recurringPatternId) {
      try {
        const patternRef = doc(db, 'users', userId, 'recurringPatterns', bill.recurringPatternId);
        const patternDoc = await getDoc(patternRef);
        
        if (patternDoc.exists()) {
          const pattern = patternDoc.data();
          nextDueDateStr = pattern.nextOccurrence;
          console.log(`Using next occurrence from pattern: ${nextDueDateStr}`);
        }
      } catch (error) {
        console.error(`Error loading recurring pattern:`, error);
      }
    }
    
    // Fallback: Calculate next due date (one month from current due date)
    if (!nextDueDateStr) {
      const currentDueDate = parseLocalDate(bill.dueDate);
      const nextDueDate = new Date(currentDueDate);
      nextDueDate.setMonth(nextDueDate.getMonth() + 1);
      nextDueDateStr = formatDateForInput(nextDueDate);
    }
    
    // ✅ NEW: Check if bill already exists for this date
    if (bill.recurringPatternId) {
      // First try exact match query
      const existingQuery = query(
        collection(db, 'users', userId, 'billInstances'),
        where('recurringPatternId', '==', bill.recurringPatternId),
        where('dueDate', '==', nextDueDateStr)
      );
      
      const existingBills = await getDocs(existingQuery);
      
      if (!existingBills.empty) {
        console.log(`⚠️  Bill already exists for ${bill.name} on ${nextDueDateStr}`);
        return null;
      }
      
      // Also check with date-only comparison in case of format mismatch
      const allBillsQuery = query(
        collection(db, 'users', userId, 'billInstances'),
        where('recurringPatternId', '==', bill.recurringPatternId)
      );
      
      const allBills = await getDocs(allBillsQuery);
      const nextDateOnly = getDateOnly(nextDueDateStr);
      const duplicateFound = allBills.docs.some(doc => {
        const billDate = getDateOnly(doc.data().dueDate);
        return billDate === nextDateOnly;
      });
      
      if (duplicateFound) {
        console.log(`⚠️  Bill already exists (date-only match) for ${bill.name} on ${nextDateOnly}`);
        return null;
      }
    }
    
    // Create next bill instance
    // Generate unique ID using timestamp + random string for sufficient uniqueness
    const nextBillId = `bill_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    const nextBillInstance = {
      id: nextBillId,
      name: bill.name,
      amount: bill.amount,
      dueDate: nextDueDateStr,
      originalDueDate: bill.originalDueDate || bill.dueDate,
      isPaid: false,
      status: 'pending',
      category: bill.category,
      recurrence: bill.recurrence || 'monthly',
      recurringPatternId: bill.recurringPatternId || null,
      isSubscription: bill.isSubscription || false,
      subscriptionId: bill.subscriptionId,
      paymentHistory: [],
      linkedTransactionIds: [],
      merchantNames: bill.merchantNames || [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdFrom: 'auto-bill-detection'
    };
    
    // Save to Firebase
    await setDoc(
      doc(db, 'users', userId, 'billInstances', nextBillId),
      nextBillInstance
    );
    
    console.log(`📅 Generated next bill: ${bill.name} due ${nextDueDateStr}`);
    
    return nextBillInstance;
  } catch (error) {
    console.error(`Error generating next bill for: ${bill.name}`, error);
    throw error;
  }
}

/**
 * Main auto-detection workflow
 * Matches transactions to bills, marks bills as paid, generates next bills
 * @param {string} userId - User ID
 * @param {Array} transactions - Array of Plaid transactions
 * @param {Array} bills - Array of unpaid bill instances
 * @param {Object} settings - User settings (optional)
 * @returns {Promise<Object>} - Results summary
 */
export async function runAutoDetection(userId, transactions, bills, settings = null) {
  console.log('🤖 AUTO-DETECTION: Starting...');
  
  // Check if auto-detection is disabled in user settings
  if (settings?.autoDetectBills === false || settings?.disableAutoGeneration === true) {
    console.log('[AutoBillDetection] Auto-detection is disabled in settings, skipping');
    return {
      success: true,
      matchCount: 0,
      autoApproved: 0,
      skipped: 0,
      rejected: 0,
      paidBills: [],
      generatedBills: [],
      message: 'Auto-detection is disabled in settings'
    };
  }
  
  try {
    // ✅ NEW: Load merchant aliases from aiLearning collection
    const merchantAliases = await loadMerchantAliases(userId);
    
    // Filter to unpaid bills only
    const unpaidBills = bills.filter(b => !b.isPaid && b.status !== 'paid' && b.status !== 'skipped');
    
    // ✅ NEW: Enrich bills with merchant aliases before matching
    const enrichedBills = unpaidBills.map(bill => enrichBillWithAliases(bill, merchantAliases));
    
    console.log(`📊 Analyzing ${transactions.length} transactions against ${enrichedBills.length} unpaid bills`);
    console.log(`🔍 Using merchant aliases for ${Object.keys(merchantAliases).length} merchants`);
    
    // Run matching algorithm with enriched bills
    const matches = matchTransactionsToBills(transactions, enrichedBills);
    
    if (matches.length === 0) {
      console.log('❌ No matches found');
      return {
        success: true,
        matchCount: 0,
        paidBills: [],
        generatedBills: []
      };
    }
    
    console.log(`✅ Found ${matches.length} potential match(es)`);
    
    const paidBills = [];
    const generatedBills = [];
    
   // Process each match with confidence-based decisions
let autoApproved = 0;
const skipped = 0;
let rejected = 0;

for (const match of matches) {
  const { transaction, bill, confidence, matches: criteria, details } = match;
  
  console.log(`\n💰 Evaluating: ${bill.name} ($${bill.amount})`);
  console.log(`   Transaction: "${details.txName}" ($${Math.abs(transaction.amount)})`);
  console.log(`   Confidence: ${Math.round(confidence * 100)}%`);
  console.log(`   ✓ Name: ${criteria.name ? 'YES' : 'NO'} | Amount: ${criteria.amount ? 'YES' : 'NO'} | Date: ${criteria.date ? 'YES' : 'NO'}`);
  
  // ✅ NEW: Confidence-based decision with 67% threshold (2 of 3 criteria)
  if (confidence >= 0.67) {
    console.log(`   ✅ AUTO-APPROVED (≥67% confidence - 2 of 3 criteria matched)`);
    
    try {
      // Mark bill as paid
      await markBillAsPaid(userId, bill, transaction);
      paidBills.push(bill);
      autoApproved++;
      
      // Generate next bill if recurring
      const nextBill = await generateNextBill(userId, bill, settings);
      if (nextBill) {
        generatedBills.push(nextBill);
      }
    } catch (error) {
      console.error(`Failed to process bill: ${bill.name}`, error);
    }
    
  } else {
    console.log(`   ❌ REJECTED (low confidence - less than 2 of 3 criteria matched)`);
    rejected++;
  }
}

console.log('\n🎉 AUTO-DETECTION: Complete');
console.log(`   Auto-Approved: ${autoApproved} bill(s)`);
console.log(`   Skipped: ${skipped} bill(s)`);
console.log(`   Rejected: ${rejected} bill(s)`);
    
    console.log('🎉 AUTO-DETECTION: Complete');
    console.log(`   Paid: ${paidBills.length} bill(s)`);
    console.log(`   Generated: ${generatedBills.length} next bill(s)`);
    
    return {
  success: true,
  matchCount: matches.length,
  autoApproved: autoApproved,
  skipped: skipped,
  rejected: rejected,
  paidBills,
  generatedBills
};
  } catch (error) {
    console.error('❌ AUTO-DETECTION: Error', error);
    return {
      success: false,
      error: error.message,
      matchCount: 0,
      paidBills: [],
      generatedBills: []
    };
  }
}
