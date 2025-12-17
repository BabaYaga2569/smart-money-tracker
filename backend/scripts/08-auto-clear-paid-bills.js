/**
 * 08-auto-clear-paid-bills.js
 * 
 * One-time cleanup script to fix currently overdue bills.
 * 
 * This script:
 * - Scans transactions from last 60 days
 * - Matches them to overdue financialEvents
 * - Uses aiLearning/merchantAliases for fuzzy matching
 * - Auto-marks matched bills as PAID
 * - Advances recurringPatterns to correct next due date
 * - Generates next month bill instances
 * - Outputs detailed report
 * 
 * Usage: node scripts/08-auto-clear-paid-bills.js
 * Run from the backend directory
 */

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';

// Firebase initialization
const initializeFirebase = () => {
  if (admin.apps.length > 0) return admin.firestore();
  
  let serviceAccount;
  
  if (existsSync('./firebase-key.json')) {
    serviceAccount = JSON.parse(readFileSync('./firebase-key.json', 'utf8'));
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } else {
    console.error('❌ Firebase credentials not found!');
    console.error('   Please provide either:');
    console.error('   - ./firebase-key.json file');
    console.error('   - FIREBASE_SERVICE_ACCOUNT environment variable');
    process.exit(1);
  }
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  
  return admin.firestore();
};

const db = initializeFirebase();

// Configuration
const MAIN_USER_ID = 'MQWMkJUjTpTYVNJZAMWiSEk0ogj1';
const DAYS_LOOKBACK = 60;

/**
 * Load merchant aliases from aiLearning collection
 */
async function loadMerchantAliases(userId) {
  try {
    const aliasesDoc = await db.collection('users').doc(userId).collection('aiLearning').doc('merchantAliases').get();
    
    if (aliasesDoc.exists) {
      const data = aliasesDoc.data();
      console.log(`✅ Loaded ${Object.keys(data.aliases || {}).length} merchant aliases`);
      return data.aliases || {};
    }
    
    console.log('⚠️  No merchant aliases found');
    return {};
  } catch (error) {
    console.error('Error loading merchant aliases:', error);
    return {};
  }
}

/**
 * Normalize string for matching
 */
function normalizeString(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Calculate similarity between two strings (0-1)
 */
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  const normalized1 = normalizeString(str1);
  const normalized2 = normalizeString(str2);
  
  if (normalized1 === normalized2) return 1.0;
  
  // Simple substring matching
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    return 0.8;
  }
  
  // Levenshtein distance approximation
  const longer = normalized1.length > normalized2.length ? normalized1 : normalized2;
  const shorter = normalized1.length > normalized2.length ? normalized2 : normalized1;
  
  if (longer.length === 0) return 1.0;
  
  const costs = [];
  for (let i = 0; i <= longer.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= shorter.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (longer.charAt(i - 1) !== shorter.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[shorter.length] = lastValue;
  }
  
  return 1 - costs[shorter.length] / longer.length;
}

/**
 * Check if names match using fuzzy matching and aliases
 */
function isNameMatch(txName, billName, merchantNames = [], merchantAliases = {}) {
  if (!txName || !billName) return false;
  
  // Direct match
  if (calculateSimilarity(txName, billName) >= 0.75) return true;
  
  // Check bill's merchant name aliases
  for (const merchantName of merchantNames) {
    if (calculateSimilarity(txName, merchantName) >= 0.75) return true;
  }
  
  // Check global merchant aliases
  const billNameLower = billName.toLowerCase();
  const aliasEntry = merchantAliases[billNameLower];
  
  if (aliasEntry && aliasEntry.aliases) {
    for (const alias of aliasEntry.aliases) {
      if (calculateSimilarity(txName, alias) >= 0.75) return true;
    }
  }
  
  return false;
}

/**
 * Check if amounts match (within $0.50 tolerance)
 */
function isAmountMatch(txAmount, billAmount, tolerance = 0.50) {
  const txAbs = Math.abs(parseFloat(txAmount) || 0);
  const billAbs = Math.abs(parseFloat(billAmount) || 0);
  
  const difference = Math.abs(txAbs - billAbs);
  return difference <= tolerance;
}

/**
 * Check if dates match (within 7 days)
 */
function isDateMatch(txDate, billDueDate, daysTolerance = 7) {
  if (!txDate || !billDueDate) return false;
  
  const tx = new Date(txDate);
  const due = new Date(billDueDate);
  
  const daysDiff = Math.abs(Math.floor((tx - due) / (1000 * 60 * 60 * 24)));
  
  return daysDiff <= daysTolerance;
}

/**
 * Match a transaction to a bill
 */
function matchTransactionToBill(transaction, bill, merchantAliases) {
  // Only match negative transactions (payments)
  if (parseFloat(transaction.amount) >= 0) return null;
  
  const txName = transaction.name || transaction.merchant_name || '';
  const txAmount = Math.abs(parseFloat(transaction.amount) || 0);
  const txDate = transaction.date;
  
  const billName = bill.name || '';
  const billAmount = parseFloat(bill.amount || 0);
  const billDueDate = bill.dueDate;
  const merchantNames = bill.merchantNames || [];
  
  // Check criteria
  const nameMatch = isNameMatch(txName, billName, merchantNames, merchantAliases);
  const amountMatch = isAmountMatch(txAmount, billAmount);
  const dateMatch = isDateMatch(txDate, billDueDate);
  
  // Count matches
  let matchCount = 0;
  if (nameMatch) matchCount++;
  if (amountMatch) matchCount++;
  if (dateMatch) matchCount++;
  
  // Require at least 2 of 3 (67% confidence)
  if (matchCount < 2) return null;
  
  const confidence = matchCount / 3;
  
  return {
    transaction,
    bill,
    confidence,
    matches: { name: nameMatch, amount: amountMatch, date: dateMatch },
    details: { txName, txAmount, txDate, billName, billAmount, billDueDate }
  };
}

/**
 * Calculate next occurrence date
 */
function calculateNextOccurrence(currentDate, frequency) {
  const date = new Date(currentDate);
  
  switch (frequency) {
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'bi-weekly':
      date.setDate(date.getDate() + 14);
      break;
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'quarterly':
      date.setMonth(date.getMonth() + 3);
      break;
    case 'annually':
      date.setFullYear(date.getFullYear() + 1);
      break;
    default:
      date.setMonth(date.getMonth() + 1);
  }
  
  return date.toISOString().split('T')[0];
}

/**
 * Main cleanup function
 */
async function cleanupPaidBills(userId) {
  console.log('🚀 Starting automatic bill clearing cleanup...\n');
  
  const report = {
    scanned: 0,
    matched: 0,
    cleared: 0,
    advanced: 0,
    generated: 0,
    errors: [],
    details: []
  };
  
  try {
    // 1. Load merchant aliases
    console.log('📚 Loading merchant aliases...');
    const merchantAliases = await loadMerchantAliases(userId);
    
    // 2. Load transactions from last 60 days
    console.log(`📊 Loading transactions from last ${DAYS_LOOKBACK} days...`);
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - DAYS_LOOKBACK);
    const cutoffDate = daysAgo.toISOString().split('T')[0];
    
    const transactionsSnapshot = await db.collection('users').doc(userId).collection('transactions')
      .where('date', '>=', cutoffDate)
      .get();
    
    const transactions = transactionsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`✅ Loaded ${transactions.length} transactions\n`);
    
    // 3. Load unpaid financialEvents
    console.log('📋 Loading unpaid bills...');
    const billsSnapshot = await db.collection('users').doc(userId).collection('financialEvents')
      .where('isPaid', '==', false)
      .get();
    
    const bills = billsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`✅ Loaded ${bills.length} unpaid bills\n`);
    
    report.scanned = bills.length;
    
    // 4. Match transactions to bills
    console.log('🔍 Matching transactions to bills...\n');
    const matchedTransactionIds = new Set();
    const matchedBillIds = new Set();
    
    for (const bill of bills) {
      if (matchedBillIds.has(bill.id)) continue;
      
      let bestMatch = null;
      
      for (const transaction of transactions) {
        if (matchedTransactionIds.has(transaction.id)) continue;
        
        const match = matchTransactionToBill(transaction, bill, merchantAliases);
        
        if (match && (!bestMatch || match.confidence > bestMatch.confidence)) {
          bestMatch = match;
        }
      }
      
      if (bestMatch) {
        report.matched++;
        matchedTransactionIds.add(bestMatch.transaction.id);
        matchedBillIds.add(bestMatch.bill.id);
        
        const { transaction, bill, confidence, matches, details } = bestMatch;
        
        console.log(`💰 Match Found (${Math.round(confidence * 100)}% confidence):`);
        console.log(`   Bill: ${bill.name} ($${bill.amount}) due ${bill.dueDate}`);
        console.log(`   Transaction: "${details.txName}" ($${details.txAmount}) on ${details.txDate}`);
        console.log(`   ✓ Name: ${matches.name ? 'YES' : 'NO'} | Amount: ${matches.amount ? 'YES' : 'NO'} | Date: ${matches.date ? 'YES' : 'NO'}\n`);
        
        try {
          // Mark bill as paid
          await db.collection('users').doc(userId).collection('financialEvents').doc(bill.id).update({
            isPaid: true,
            status: 'paid',
            paidDate: transaction.date,
            linkedTransactionId: transaction.id,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          
          report.cleared++;
          console.log(`   ✅ Marked as PAID`);
          
          // Record payment
          const daysPastDue = Math.max(0, Math.floor((new Date(transaction.date) - new Date(bill.dueDate)) / (1000 * 60 * 60 * 24)));
          
          await db.collection('users').doc(userId).collection('bill_payments').add({
            billId: bill.id,
            billName: bill.name,
            amount: Math.abs(parseFloat(transaction.amount)),
            category: bill.category || 'Bills & Utilities',
            dueDate: bill.dueDate,
            paidDate: transaction.date,
            paymentMonth: transaction.date.slice(0, 7),
            year: new Date(transaction.date).getFullYear(),
            quarter: `Q${Math.ceil((new Date(transaction.date).getMonth() + 1) / 3)}`,
            paymentMethod: 'Auto-Cleared (Script)',
            recurringPatternId: bill.recurringPatternId || null,
            linkedTransactionId: transaction.id,
            isOverdue: daysPastDue > 0,
            daysPastDue: daysPastDue,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
          
          // Advance recurring pattern if applicable
          if (bill.recurringPatternId) {
            const patternDoc = await db.collection('users').doc(userId).collection('recurringPatterns').doc(bill.recurringPatternId).get();
            
            if (patternDoc.exists) {
              const pattern = patternDoc.data();
              
              // Only advance if bill's due date matches pattern's nextOccurrence
              if (pattern.nextOccurrence === bill.dueDate) {
                const nextOccurrence = calculateNextOccurrence(bill.dueDate, bill.recurrence || pattern.frequency);
                
                await patternDoc.ref.update({
                  nextOccurrence: nextOccurrence,
                  lastPaidDate: transaction.date,
                  updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                
                report.advanced++;
                console.log(`   ✅ Advanced pattern: ${bill.dueDate} → ${nextOccurrence}`);
                
                // Generate next month's bill
                const nextBillId = `bill_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
                
                // Check if bill already exists
                const existingBills = await db.collection('users').doc(userId).collection('financialEvents')
                  .where('recurringPatternId', '==', bill.recurringPatternId)
                  .where('dueDate', '==', nextOccurrence)
                  .get();
                
                if (existingBills.empty) {
                  await db.collection('users').doc(userId).collection('financialEvents').doc(nextBillId).set({
                    id: nextBillId,
                    name: bill.name,
                    amount: bill.amount,
                    dueDate: nextOccurrence,
                    originalDueDate: nextOccurrence,
                    isPaid: false,
                    status: 'pending',
                    category: bill.category,
                    recurrence: bill.recurrence || 'monthly',
                    recurringPatternId: bill.recurringPatternId,
                    merchantNames: bill.merchantNames || [],
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    createdFrom: 'auto-clear-script'
                  });
                  
                  report.generated++;
                  console.log(`   ✅ Generated next bill due ${nextOccurrence}`);
                } else {
                  console.log(`   ⚠️  Next bill already exists for ${nextOccurrence}`);
                }
              } else {
                console.log(`   ⚠️  Due date mismatch: pattern=${pattern.nextOccurrence}, bill=${bill.dueDate}`);
              }
            }
          }
          
          report.details.push({
            billName: bill.name,
            amount: bill.amount,
            dueDate: bill.dueDate,
            paidDate: transaction.date,
            transactionName: details.txName,
            confidence: Math.round(confidence * 100)
          });
          
          console.log('');
        } catch (error) {
          console.error(`   ❌ Error processing bill ${bill.name}:`, error.message);
          report.errors.push(`${bill.name}: ${error.message}`);
        }
      }
    }
    
    // 5. Print report
    console.log('\n' + '='.repeat(60));
    console.log('📊 CLEANUP REPORT');
    console.log('='.repeat(60));
    console.log(`Transactions scanned: ${transactions.length}`);
    console.log(`Bills scanned: ${report.scanned}`);
    console.log(`Matches found: ${report.matched}`);
    console.log(`Bills cleared: ${report.cleared}`);
    console.log(`Patterns advanced: ${report.advanced}`);
    console.log(`Next bills generated: ${report.generated}`);
    console.log(`Errors: ${report.errors.length}`);
    
    if (report.errors.length > 0) {
      console.log('\n❌ Errors encountered:');
      report.errors.forEach(error => console.log(`   - ${error}`));
    }
    
    if (report.details.length > 0) {
      console.log('\n✅ Bills cleared:');
      report.details.forEach(detail => {
        console.log(`   - ${detail.billName} ($${detail.amount}) due ${detail.dueDate}`);
        console.log(`     Paid on ${detail.paidDate} via "${detail.transactionName}" (${detail.confidence}% match)`);
      });
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ Cleanup complete!');
    console.log('='.repeat(60));
    
  } catch (error) {
    console.error('❌ Fatal error during cleanup:', error);
    process.exit(1);
  }
}

// Run cleanup
cleanupPaidBills(MAIN_USER_ID)
  .then(() => {
    console.log('\n✨ Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error);
    process.exit(1);
  });
