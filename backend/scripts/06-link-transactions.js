/**
 * 06-link-transactions.js
 * 
 * Phase 2: Data Restructuring (Medium Risk, Non-Destructive)
 * 
 * This script links transactions to financial events:
 * - For each financialEvent without linkedTransactionId
 * - Searches transactions for matches based on:
 *   - Amount match (exact or within $0.50)
 *   - Date within ±3 days of dueDate/paidDate
 *   - Merchant name fuzzy match using aliases (70%+ similarity)
 * - Updates financialEvent with linkedTransactionId
 * - Updates transaction with linkedEventId
 * - Logs confidence score for each match
 * 
 * Usage: node scripts/06-link-transactions.js
 * Run from the backend directory
 */

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import * as readline from 'readline';
import { TransactionMatcher } from '../utils/TransactionMatcher.js';

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
const FUZZY_MATCH_THRESHOLD = 0.70;

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

// Main function
async function linkTransactions() {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🔗 LINK TRANSACTIONS TO FINANCIAL EVENTS');
  console.log('  (Using Multi-Strategy Transaction Matcher)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  User ID: ${MAIN_USER_ID}`);
  console.log(`  Fuzzy match threshold: ${FUZZY_MATCH_THRESHOLD * 100}%`);
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    const userRef = db.collection('users').doc(MAIN_USER_ID);
    
    // Initialize TransactionMatcher
    console.log('🔧 Initializing TransactionMatcher...\n');
    const matcher = new TransactionMatcher(db, MAIN_USER_ID);
    await matcher.initialize();
    console.log('');
    
    // Load financial events without links
    console.log('📊 Loading financial events...\n');
    
    const eventsSnapshot = await userRef.collection('financialEvents').get();
    const unlinkedEvents = eventsSnapshot.docs.filter(doc => {
      const data = doc.data();
      return !data.linkedTransactionId;
    });
    
    console.log(`   Total financial events: ${eventsSnapshot.size}`);
    console.log(`   Unlinked events: ${unlinkedEvents.length}`);
    console.log('');
    
    if (unlinkedEvents.length === 0) {
      console.log('   ✅ All events already have linked transactions');
      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('  ✅ COMPLETE (no action needed)');
      console.log('═══════════════════════════════════════════════════════════════\n');
      process.exit(0);
    }
    
    // Load transactions
    console.log('📊 Loading transactions...\n');
    
    const transactionsSnapshot = await userRef.collection('transactions').get();
    const transactions = transactionsSnapshot.docs.map(doc => ({
      id: doc.id,
      ref: doc.ref,
      data: doc.data()
    }));
    
    console.log(`   Total transactions: ${transactions.length}`);
    console.log('');
    
    // Find matches using TransactionMatcher
    console.log('🔍 Finding matches using multi-strategy engine...\n');
    
    const matches = [];
    let checkedCount = 0;
    const strategyStats = {};
    
    for (const eventDoc of unlinkedEvents) {
      const event = { ...eventDoc.data(), id: eventDoc.id };
      const match = await matcher.findMatch(event, transactions);
      
      if (match && match.confidence >= FUZZY_MATCH_THRESHOLD) {
        matches.push({
          eventDoc,
          event,
          match
        });
        
        // Track strategy usage
        strategyStats[match.strategy] = (strategyStats[match.strategy] || 0) + 1;
      }
      
      checkedCount++;
      if (checkedCount % 50 === 0) {
        console.log(`   Checked ${checkedCount}/${unlinkedEvents.length} events...`);
      }
    }
    
    console.log('');
    console.log(`   📊 Matches found: ${matches.length}/${unlinkedEvents.length}`);
    console.log('');
    console.log('   Strategy breakdown:');
    Object.entries(strategyStats).forEach(([strategy, count]) => {
      console.log(`     - ${strategy}: ${count}`);
    });
    console.log('');
    
    if (matches.length === 0) {
      console.log('   ⚠️  No matches found');
      console.log('   💡 Consider creating payment rules for unmatched transactions');
      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('  ✅ COMPLETE (no matches to link)');
      console.log('═══════════════════════════════════════════════════════════════\n');
      process.exit(0);
    }
    
    // Show sample matches
    console.log('📋 Sample matches:');
    console.log('─'.repeat(60));
    
    matches.slice(0, 10).forEach(({ event, match }, i) => {
      const tx = match.transaction.data;
      console.log(`   ${i + 1}. ${event.name} → ${tx.merchant_name || tx.name}`);
      console.log(`      Event: $${Math.abs(event.amount || 0).toFixed(2)}, ${(event.paidDate || event.dueDate || '').split('T')[0] || 'no date'}`);
      console.log(`      Transaction: $${Math.abs(tx.amount || 0).toFixed(2)}, ${tx.date || 'no date'}`);
      console.log(`      Confidence: ${(match.confidence * 100).toFixed(1)}% (${match.strategy})`);
      if (match.scores) {
        console.log(`      Scores: name=${(match.scores.name * 100).toFixed(0)}%, amount=${(match.scores.amount * 100).toFixed(0)}%, date=${(match.scores.date * 100).toFixed(0)}%`);
      }
      if (match.paymentType) {
        console.log(`      Payment Type: ${match.paymentType}, Recipient: ${match.recipient}`);
      }
      console.log('');
    });
    
    if (matches.length > 10) {
      console.log(`   ... and ${matches.length - 10} more matches`);
    }
    console.log('');
    
    // Confirm action
    const confirmed = await confirm('   Link these transactions?');
    
    if (!confirmed) {
      console.log('\n   ❌ Operation cancelled by user');
      process.exit(0);
    }
    
    console.log('\n');
    console.log('🔗 Creating links...\n');
    
    // Create links
    let linkedCount = 0;
    const batchSize = 500;
    let batch = db.batch();
    let batchCount = 0;
    
    for (const { eventDoc, event, match } of matches) {
      const tx = match.transaction;
      
      // Update event with transaction link
      batch.update(eventDoc.ref, {
        linkedTransactionId: tx.id,
        linkedAt: admin.firestore.FieldValue.serverTimestamp(),
        linkConfidence: match.confidence,
        linkStrategy: match.strategy,
        linkScores: match.scores || null,
        linkPaymentType: match.paymentType || null
      });
      
      // Update transaction with event link
      batch.update(tx.ref, {
        linkedEventId: eventDoc.id,
        linkedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      linkedCount++;
      batchCount += 2; // Two updates per match
      
      console.log(`   ✅ Linked: ${event.name} ↔ ${tx.data.merchant_name || tx.data.name} (${(match.confidence * 100).toFixed(1)}%, ${match.strategy})`);
      
      if (batchCount >= batchSize) {
        await batch.commit();
        console.log(`\n   💾 Committed batch of ${batchCount / 2} links\n`);
        batch = db.batch();
        batchCount = 0;
      }
    }
    
    // Commit remaining
    if (batchCount > 0) {
      await batch.commit();
      console.log(`\n   💾 Committed final batch of ${batchCount / 2} links\n`);
    }
    
    // Calculate stats
    const avgConfidence = matches.reduce((sum, m) => sum + m.match.confidence, 0) / matches.length;
    const highConfidence = matches.filter(m => m.match.confidence >= 0.85).length;
    const mediumConfidence = matches.filter(m => m.match.confidence >= 0.70 && m.match.confidence < 0.85).length;
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  ✅ LINKING COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Total links created: ${linkedCount}`);
    console.log(`  Average confidence: ${(avgConfidence * 100).toFixed(1)}%`);
    console.log('');
    console.log('  Confidence breakdown:');
    console.log(`    - High (≥85%): ${highConfidence}`);
    console.log(`    - Medium (70-84%): ${mediumConfidence}`);
    console.log('');
    console.log('  Strategy usage:');
    Object.entries(strategyStats).forEach(([strategy, count]) => {
      console.log(`    - ${strategy}: ${count}`);
    });
    console.log('');
    console.log('  Note: Links can be manually corrected if needed');
    console.log('  Note: Transactions updated with linkedEventId');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Linking failed:', error.message);
    console.error('\nError details:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the linking
linkTransactions();
