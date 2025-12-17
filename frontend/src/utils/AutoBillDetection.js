// AutoBillDetection.js - Automatic bill payment detection and processing
import { doc, updateDoc, serverTimestamp, arrayUnion, setDoc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { matchTransactionsToBills } from './BillPaymentMatcher.js';
import { formatDateForInput } from './DateUtils.js';

/**
 * Load merchant aliases from aiLearning/merchantAliases collection
 * @param {string} userId - User ID
 * @returns {Promise<Object>} - Merchant aliases mapping
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
 * Mark a bill as paid and link to transaction
 * @param {string} userId - User ID
 * @param {Object} bill - Bill instance to mark as paid
 * @param {Object} transaction - Plaid transaction that paid the bill
 * @returns {Promise<Object>} - Updated bill data with next due date
 */
export async function markBillAsPaid(userId, bill, transaction) {
  try {
    const billRef = doc(db, 'users', userId, 'billInstances', bill.id);
    
    // Update bill status
    await updateDoc(billRef, {
      isPaid: true,
      status: 'paid',
      lastPaidDate: serverTimestamp(),
      updatedAt: serverTimestamp(),
      linkedTransactionIds: arrayUnion(transaction.id),
      paymentHistory: arrayUnion({
        paidDate: new Date(transaction.date).toISOString(),
        amount: Math.abs(parseFloat(transaction.amount)),
        transactionId: transaction.id,
        transactionName: transaction.name || transaction.merchant_name,
        paymentMethod: 'auto-detected',
        source: 'plaid'
      })
    });
    
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
    
    // Only generate for recurring/subscription bills
    if (bill.recurrence !== 'monthly' && !bill.isSubscription) {
      console.log(`⏭️  Skipping next bill generation for non-recurring bill: ${bill.name}`);
      return null;
    }
    
    // Calculate next due date (one month from current due date)
    const currentDueDate = new Date(bill.dueDate);
    const nextDueDate = new Date(currentDueDate);
    nextDueDate.setMonth(nextDueDate.getMonth() + 1);
    
    // Create next bill instance
    // Generate unique ID using timestamp + random string for sufficient uniqueness
    const nextBillId = `bill_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    const nextBillInstance = {
      id: nextBillId,
      name: bill.name,
      amount: bill.amount,
      dueDate: formatDateForInput(nextDueDate),
      originalDueDate: bill.originalDueDate || bill.dueDate,
      isPaid: false,
      status: 'pending',
      category: bill.category,
      recurrence: bill.recurrence || 'monthly',
      isSubscription: bill.isSubscription || false,
      subscriptionId: bill.subscriptionId,
      paymentHistory: [],
      linkedTransactionIds: [],
      merchantNames: bill.merchantNames || [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    // Save to Firebase
    await setDoc(
      doc(db, 'users', userId, 'billInstances', nextBillId),
      nextBillInstance
    );
    
    console.log(`📅 Generated next bill: ${bill.name} due ${formatDateForInput(nextDueDate)}`);
    
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
    const enrichedBills = unpaidBills.map(bill => {
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
let skipped = 0;
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
