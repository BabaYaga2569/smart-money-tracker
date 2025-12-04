/**
 * 02-fix-pending-transactions.js
 * 
 * Phase 1: Quick Wins (Safe, Low Risk)
 * 
 * This script fixes stale pending transactions:
 * - Finds transactions marked pending: true older than 3 days
 * - Updates them to pending: false
 * - Logs each fix with transaction details
 * - Reports total balance impact
 * 
 * Usage: node scripts/02-fix-pending-transactions.js
 * Run from the backend directory
 */

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import * as readline from 'readline';

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
const STALE_DAYS = 3;

// Helper: Confirm action
const confirm = async (message) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(`${message} (yes/no): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
};

// Helper: Calculate days ago
const daysAgo = (date) => {
  const txDate = new Date(date);
  const now = new Date();
  return Math.floor((now - txDate) / (1000 * 60 * 60 * 24));
};

// Main fix function
async function fixPendingTransactions() {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🔧 FIX STALE PENDING TRANSACTIONS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  User ID: ${MAIN_USER_ID}`);
  console.log(`  Stale threshold: ${STALE_DAYS} days`);
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    const userRef = db.collection('users').doc(MAIN_USER_ID);
    const transactionsRef = userRef.collection('transactions');
    
    // Get all transactions
    console.log('📊 Scanning transactions...\n');
    const snapshot = await transactionsRef.get();
    
    console.log(`   Total transactions: ${snapshot.size}`);
    
    // Find stale pending transactions
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - STALE_DAYS);
    
    const stalePending = [];
    let totalAmount = 0;
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.pending === true) {
        const txDate = data.date ? new Date(data.date) : null;
        if (txDate && txDate < cutoffDate) {
          stalePending.push({
            id: doc.id,
            ref: doc.ref,
            name: data.name || data.merchant_name || 'Unknown',
            amount: data.amount || 0,
            date: data.date,
            daysOld: daysAgo(data.date),
            account_id: data.account_id
          });
          totalAmount += Math.abs(data.amount || 0);
        }
      }
    });
    
    console.log(`   Stale pending (>${STALE_DAYS} days): ${stalePending.length}`);
    console.log('');
    
    if (stalePending.length === 0) {
      console.log('   ✅ No stale pending transactions found');
      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('  ✅ COMPLETE (no action needed)');
      console.log('═══════════════════════════════════════════════════════════════\n');
      process.exit(0);
    }
    
    // Display stale transactions
    console.log('   Stale pending transactions to fix:');
    console.log('   ─'.repeat(30));
    
    stalePending.forEach((tx, i) => {
      console.log(`   ${i + 1}. ${tx.name}`);
      console.log(`      Amount: $${Math.abs(tx.amount).toFixed(2)}`);
      console.log(`      Date: ${tx.date} (${tx.daysOld} days ago)`);
      console.log('');
    });
    
    console.log('   ─'.repeat(30));
    console.log(`   💰 Total balance impact: $${totalAmount.toFixed(2)}`);
    console.log('');
    
    // Confirm action
    const confirmed = await confirm('   Update these transactions to pending: false?');
    
    if (!confirmed) {
      console.log('\n   ❌ Operation cancelled by user');
      process.exit(0);
    }
    
    console.log('\n');
    console.log('🔧 Fixing transactions...\n');
    
    // Update in batches
    const batchSize = 500;
    let updatedCount = 0;
    let batch = db.batch();
    let batchCount = 0;
    
    for (const tx of stalePending) {
      batch.update(tx.ref, {
        pending: false,
        pendingFixedAt: admin.firestore.FieldValue.serverTimestamp(),
        originalPending: true
      });
      
      console.log(`   ✅ Fixed: ${tx.name} ($${Math.abs(tx.amount).toFixed(2)})`);
      
      batchCount++;
      updatedCount++;
      
      if (batchCount >= batchSize) {
        await batch.commit();
        console.log(`\n   💾 Committed batch of ${batchCount} updates\n`);
        batch = db.batch();
        batchCount = 0;
      }
    }
    
    // Commit remaining
    if (batchCount > 0) {
      await batch.commit();
      console.log(`\n   💾 Committed final batch of ${batchCount} updates\n`);
    }
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  ✅ FIX COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Transactions updated: ${updatedCount}`);
    console.log(`  Balance impact: $${totalAmount.toFixed(2)}`);
    console.log('');
    console.log('  Note: Original pending status saved as "originalPending: true"');
    console.log('        Timestamp saved as "pendingFixedAt"');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Fix failed:', error.message);
    console.error('\nError details:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the fix
fixPendingTransactions();
