// AutoBillDetection.js - Automatic bill payment detection and processing
import { doc, updateDoc, serverTimestamp, arrayUnion, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { matchTransactionsToBills } from './BillPaymentMatcher.js';
import { formatDateForInput } from './DateUtils.js';

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
 * @returns {Promise<Object>} - New bill instance
 */
export async function generateNextBill(userId, bill) {
  try {
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
 * @returns {Promise<Object>} - Results summary
 */
export async function runAutoDetection(userId, transactions, bills) {
  console.log('🤖 AUTO-DETECTION: Starting...');
  
  try {
    // Filter to unpaid bills only
    const unpaidBills = bills.filter(b => !b.isPaid && b.status !== 'paid' && b.status !== 'skipped');
    
    console.log(`📊 Analyzing ${transactions.length} transactions against ${unpaidBills.length} unpaid bills`);
    
    // Run matching algorithm
    const matches = matchTransactionsToBills(transactions, unpaidBills);
    
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
    
    // Process each match
    for (const match of matches) {
      const { transaction, bill, confidence, matches: criteria, details } = match;
      
      console.log(`💰 Auto-marking paid: ${bill.name} ($${bill.amount}) - Matched with "${details.txName}" (${Math.round(confidence * 100)}% confidence)`);
      console.log(`   ✓ Name: ${criteria.name ? 'YES' : 'NO'} | Amount: ${criteria.amount ? 'YES' : 'NO'} | Date: ${criteria.date ? 'YES' : 'NO'}`);
      
      try {
        // Mark bill as paid
        await markBillAsPaid(userId, bill, transaction);
        paidBills.push(bill);
        
        // Generate next bill if recurring
        const nextBill = await generateNextBill(userId, bill);
        if (nextBill) {
          generatedBills.push(nextBill);
        }
      } catch (error) {
        console.error(`Failed to process bill: ${bill.name}`, error);
      }
    }
    
    console.log('🎉 AUTO-DETECTION: Complete');
    console.log(`   Paid: ${paidBills.length} bill(s)`);
    console.log(`   Generated: ${generatedBills.length} next bill(s)`);
    
    return {
      success: true,
      matchCount: matches.length,
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
