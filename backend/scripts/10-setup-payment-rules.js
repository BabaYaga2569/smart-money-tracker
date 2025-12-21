/**
 * 10-setup-payment-rules.js
 * 
 * Interactive CLI wizard for creating payment rules from unmatched transactions
 * 
 * This script:
 * - Finds unmatched transactions (no linkedEventId)
 * - Extracts payment patterns automatically
 * - Guides user through creating custom matching rules
 * - Saves rules to Firestore paymentRules collection
 * - Links transactions to bills based on created rules
 * 
 * Usage: node scripts/10-setup-payment-rules.js [USER_ID]
 * Run from the backend directory
 */

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import * as readline from 'readline';
import { PaymentPatternMatcher } from '../utils/PaymentPatternMatcher.js';

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
const paymentMatcher = new PaymentPatternMatcher();

// Configuration
const USER_ID = process.env.USER_ID || process.argv[2];

if (!USER_ID) {
  console.error('❌ Error: USER_ID is required!');
  console.error('\nUsage:');
  console.error('  node scripts/10-setup-payment-rules.js USER_ID');
  console.error('  or');
  console.error('  USER_ID=... node scripts/10-setup-payment-rules.js\n');
  process.exit(1);
}

// Helper: Ask question and get response
const ask = (question) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
};

// Helper: Confirm action
const confirm = async (message) => {
  const answer = await ask(`${message} (yes/no): `);
  return answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y';
};

// Helper: Extract keywords from text
const extractKeywords = (text) => {
  if (!text) return [];
  
  // Remove common words and extract meaningful keywords
  const stopWords = new Set(['the', 'and', 'for', 'from', 'with', 'to', 'of', 'in', 'on', 'at', 'by']);
  
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
};

// Helper: Generate rule ID
const generateRuleId = (billName) => {
  const sanitized = billName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 30);
  
  const timestamp = Date.now().toString(36);
  return `rule-${sanitized}-${timestamp}`;
};

/**
 * Main function
 */
async function setupPaymentRules() {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🔧 PAYMENT RULES SETUP WIZARD');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  User ID: ${USER_ID}`);
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    const userRef = db.collection('users').doc(USER_ID);
    
    // 1. Load unmatched transactions
    console.log('📊 Loading unmatched transactions...\n');
    
    const transactionsSnapshot = await userRef.collection('transactions').get();
    const unmatchedTransactions = transactionsSnapshot.docs
      .map(doc => ({
        id: doc.id,
        ref: doc.ref,
        ...doc.data()
      }))
      .filter(tx => !tx.linkedEventId && parseFloat(tx.amount) < 0); // Only expenses
    
    console.log(`   Total transactions: ${transactionsSnapshot.size}`);
    console.log(`   Unmatched expenses: ${unmatchedTransactions.length}`);
    console.log('');
    
    if (unmatchedTransactions.length === 0) {
      console.log('   ✅ All transactions are already matched!');
      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('  ✅ COMPLETE (no action needed)');
      console.log('═══════════════════════════════════════════════════════════════\n');
      process.exit(0);
    }
    
    // 2. Load bills for matching
    console.log('📊 Loading bills...\n');
    
    const billsSnapshot = await userRef.collection('financialEvents')
      .where('type', '==', 'bill')
      .get();
    
    const bills = billsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`   Total bills: ${bills.length}`);
    console.log('');
    
    // 3. Analyze unmatched transactions for P2P payments
    console.log('🔍 Analyzing unmatched transactions...\n');
    
    const p2pTransactions = [];
    const regularTransactions = [];
    
    for (const tx of unmatchedTransactions) {
      const paymentInfo = paymentMatcher.extractPaymentInfo(tx);
      
      if (paymentInfo) {
        p2pTransactions.push({
          transaction: tx,
          paymentInfo: paymentInfo
        });
      } else {
        regularTransactions.push(tx);
      }
    }
    
    console.log(`   P2P Payments detected: ${p2pTransactions.length}`);
    console.log(`   Regular transactions: ${regularTransactions.length}`);
    console.log('');
    
    // 4. Show P2P payments and let user create rules
    if (p2pTransactions.length > 0) {
      console.log('💳 P2P Payments (Zelle/Venmo/CashApp/etc):');
      console.log('─'.repeat(70));
      console.log('');
      
      for (let i = 0; i < p2pTransactions.length; i++) {
        const { transaction: tx, paymentInfo } = p2pTransactions[i];
        
        console.log(`   [${i + 1}] ${tx.merchant_name || tx.name}`);
        console.log(`       Amount: $${Math.abs(tx.amount).toFixed(2)}`);
        console.log(`       Date: ${tx.date}`);
        console.log(`       Type: ${paymentInfo.paymentType}`);
        console.log(`       Recipient: ${paymentInfo.recipient}`);
        console.log(`       Keywords: ${paymentInfo.keywords.join(', ')}`);
        console.log('');
      }
      
      console.log('─'.repeat(70));
      console.log('');
      
      const createRules = await confirm('Would you like to create rules for these P2P payments?');
      
      if (createRules) {
        console.log('');
        console.log('🔧 Creating payment rules...\n');
        
        for (let i = 0; i < p2pTransactions.length; i++) {
          const { transaction: tx, paymentInfo } = p2pTransactions[i];
          
          console.log(`\n📝 Setting up rule for: ${tx.merchant_name || tx.name}`);
          console.log(`   Amount: $${Math.abs(tx.amount).toFixed(2)}`);
          console.log(`   Recipient: ${paymentInfo.recipient}`);
          console.log('');
          
          // Show possible bill matches
          console.log('   Possible bill matches:');
          bills.forEach((bill, idx) => {
            console.log(`   [${idx + 1}] ${bill.name} ($${Math.abs(bill.amount || 0).toFixed(2)})`);
          });
          console.log('   [0] Skip this transaction');
          console.log('');
          
          const billChoice = await ask('   Select bill to match (enter number): ');
          const billIndex = parseInt(billChoice) - 1;
          
          if (billIndex < 0 || billIndex >= bills.length) {
            console.log('   ⏭️  Skipped');
            continue;
          }
          
          const selectedBill = bills[billIndex];
          
          // Create rule
          console.log('');
          console.log('   Creating rule...');
          
          const ruleId = generateRuleId(selectedBill.name);
          const rule = {
            ruleId: ruleId,
            billName: selectedBill.name,
            billId: selectedBill.id,
            matchCriteria: {
              amountExact: Math.abs(tx.amount),
              amountTolerance: 0.50,
              requiredKeywords: paymentInfo.keywords,
              optionalKeywords: [],
              transactionTypes: [paymentInfo.paymentType],
              dateWindow: {
                daysBefore: 3,
                daysAfter: 5
              }
            },
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: 'cli_wizard',
            matchCount: 0,
            confidence: 0.95,
            enabled: true,
            source: 'manual'
          };
          
          await userRef.collection('paymentRules').doc(ruleId).set(rule);
          
          // Link this transaction to the bill
          const eventRef = userRef.collection('financialEvents').doc(selectedBill.id);
          
          await eventRef.update({
            linkedTransactionId: tx.id,
            linkedAt: admin.firestore.FieldValue.serverTimestamp(),
            linkConfidence: 0.95,
            linkStrategy: 'manual_rule',
            linkRuleId: ruleId
          });
          
          await tx.ref.update({
            linkedEventId: selectedBill.id,
            linkedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          
          console.log(`   ✅ Rule created: "${selectedBill.name}" → ${paymentInfo.recipient}`);
          console.log(`   ✅ Transaction linked to bill`);
        }
      }
    }
    
    // 5. Show regular unmatched transactions
    if (regularTransactions.length > 0) {
      console.log('\n');
      console.log('📋 Other unmatched transactions:');
      console.log('─'.repeat(70));
      console.log('');
      
      regularTransactions.slice(0, 20).forEach((tx, i) => {
        console.log(`   [${i + 1}] ${tx.merchant_name || tx.name}`);
        console.log(`       Amount: $${Math.abs(tx.amount).toFixed(2)}, Date: ${tx.date}`);
      });
      
      if (regularTransactions.length > 20) {
        console.log(`\n   ... and ${regularTransactions.length - 20} more`);
      }
      
      console.log('');
      console.log('─'.repeat(70));
      console.log('');
      console.log('   💡 Tip: You can create custom rules for these transactions too.');
      console.log('   💡 Use the Payment Rules Manager in the web UI for more control.');
      console.log('');
    }
    
    // 6. Summary
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  ✅ SETUP COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  Payment rules have been created and saved.');
    console.log('  These rules will automatically match future transactions.');
    console.log('');
    console.log('  Next steps:');
    console.log('  - Run script 06-link-transactions.js to apply rules');
    console.log('  - Use Payment Rules Manager in web UI to edit rules');
    console.log('  - Create additional rules for other unmatched transactions');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.error('\nError details:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the setup wizard
setupPaymentRules();
