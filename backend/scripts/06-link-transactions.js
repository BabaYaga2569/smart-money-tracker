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
const AMOUNT_TOLERANCE = 0.50;
const DATE_TOLERANCE_DAYS = 3;
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

// Helper: Fuzzy match two strings (Levenshtein-based similarity)
const fuzzyMatch = (str1, str2) => {
  if (!str1 || !str2) return 0;
  
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;
  
  // Levenshtein distance
  const matrix = Array(s2.length + 1).fill(null).map(() => 
    Array(s1.length + 1).fill(null)
  );
  
  for (let i = 0; i <= s1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= s2.length; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= s2.length; j++) {
    for (let i = 1; i <= s1.length; i++) {
      const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }
  
  const distance = matrix[s2.length][s1.length];
  const maxLength = Math.max(s1.length, s2.length);
  
  return (maxLength - distance) / maxLength;
};

// Helper: Normalize date to Date object
const normalizeToDate = (date) => {
  if (!date) return null;
  
  if (date._seconds !== undefined) {
    return new Date(date._seconds * 1000);
  }
  
  if (date instanceof admin.firestore.Timestamp) {
    return date.toDate();
  }
  
  if (date instanceof Date) {
    return date;
  }
  
  if (typeof date === 'string') {
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  
  return null;
};

// Helper: Check if dates are within N days
const isWithinDays = (date1, date2, days) => {
  const d1 = normalizeToDate(date1);
  const d2 = normalizeToDate(date2);
  
  if (!d1 || !d2) return false;
  
  const diffMs = Math.abs(d1 - d2);
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  
  return diffDays <= days;
};

// Helper: Check if amounts match within tolerance
const amountsMatch = (amount1, amount2, tolerance) => {
  const a1 = Math.abs(amount1 || 0);
  const a2 = Math.abs(amount2 || 0);
  
  return Math.abs(a1 - a2) <= tolerance;
};

// Helper: Find best matching transaction
const findMatchingTransaction = (event, transactions, merchantAliases) => {
  const eventName = (event.name || '').toLowerCase();
  const eventAliases = event.merchantNames || [eventName];
  const eventAmount = Math.abs(event.amount || 0);
  const eventDate = event.paidDate || event.dueDate;
  
  let bestMatch = null;
  let bestScore = 0;
  
  for (const tx of transactions) {
    const txName = (tx.data.merchant_name || tx.data.name || '').toLowerCase();
    const txAmount = Math.abs(tx.data.amount || 0);
    const txDate = tx.data.date;
    
    // Skip already linked transactions
    if (tx.data.linkedEventId) continue;
    
    // Check amount match (required)
    if (!amountsMatch(eventAmount, txAmount, AMOUNT_TOLERANCE)) continue;
    
    // Check date match (required if we have dates)
    if (eventDate && txDate) {
      if (!isWithinDays(eventDate, txDate, DATE_TOLERANCE_DAYS)) continue;
    }
    
    // Calculate name similarity
    let nameSimilarity = 0;
    
    // Check against event name directly
    nameSimilarity = Math.max(nameSimilarity, fuzzyMatch(eventName, txName));
    
    // Check against event aliases
    for (const alias of eventAliases) {
      nameSimilarity = Math.max(nameSimilarity, fuzzyMatch(alias, txName));
    }
    
    // Check against merchant aliases database
    if (merchantAliases && merchantAliases.merchants) {
      for (const [, merchant] of Object.entries(merchantAliases.merchants)) {
        if (merchant.aliases) {
          for (const alias of merchant.aliases) {
            if (fuzzyMatch(alias, eventName) > 0.7 || 
                eventAliases.some(ea => fuzzyMatch(alias, ea) > 0.7)) {
              nameSimilarity = Math.max(nameSimilarity, fuzzyMatch(merchant.canonicalName, txName));
              for (const txAlias of merchant.aliases) {
                nameSimilarity = Math.max(nameSimilarity, fuzzyMatch(txAlias, txName));
              }
            }
          }
        }
      }
    }
    
    // Skip if name similarity is too low
    if (nameSimilarity < FUZZY_MATCH_THRESHOLD) continue;
    
    // Calculate overall confidence score
    const amountScore = amountsMatch(eventAmount, txAmount, 0.01) ? 1.0 : 0.8;
    const dateScore = isWithinDays(eventDate, txDate, 1) ? 1.0 : 0.8;
    
    const confidence = (nameSimilarity * 0.5) + (amountScore * 0.3) + (dateScore * 0.2);
    
    if (confidence > bestScore) {
      bestScore = confidence;
      bestMatch = {
        transaction: tx,
        confidence,
        scores: {
          name: nameSimilarity,
          amount: amountScore,
          date: dateScore
        }
      };
    }
  }
  
  return bestMatch;
};

// Main function
async function linkTransactions() {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🔗 LINK TRANSACTIONS TO FINANCIAL EVENTS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  User ID: ${MAIN_USER_ID}`);
  console.log(`  Amount tolerance: $${AMOUNT_TOLERANCE}`);
  console.log(`  Date tolerance: ±${DATE_TOLERANCE_DAYS} days`);
  console.log(`  Fuzzy match threshold: ${FUZZY_MATCH_THRESHOLD * 100}%`);
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    const userRef = db.collection('users').doc(MAIN_USER_ID);
    
    // Load merchant aliases
    console.log('📊 Loading merchant aliases...\n');
    
    let merchantAliases = null;
    const aliasesDoc = await userRef.collection('aiLearning').doc('merchantAliases').get();
    if (aliasesDoc.exists) {
      merchantAliases = aliasesDoc.data();
      console.log(`   Loaded ${Object.keys(merchantAliases.merchants || {}).length} merchant profiles`);
    } else {
      console.log('   ⚠️  No merchant aliases found (run 03-create-merchant-aliases.js first)');
    }
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
    
    // Find matches
    console.log('🔍 Finding matches...\n');
    
    const matches = [];
    let checkedCount = 0;
    
    for (const eventDoc of unlinkedEvents) {
      const event = eventDoc.data();
      const match = findMatchingTransaction(event, transactions, merchantAliases);
      
      if (match) {
        matches.push({
          eventDoc,
          event,
          match
        });
      }
      
      checkedCount++;
      if (checkedCount % 50 === 0) {
        console.log(`   Checked ${checkedCount}/${unlinkedEvents.length} events...`);
      }
    }
    
    console.log('');
    console.log(`   📊 Matches found: ${matches.length}/${unlinkedEvents.length}`);
    console.log('');
    
    if (matches.length === 0) {
      console.log('   ⚠️  No matches found');
      console.log('   💡 Try running 03-create-merchant-aliases.js to improve matching');
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
      console.log(`      Confidence: ${(match.confidence * 100).toFixed(1)}%`);
      console.log(`      Scores: name=${(match.scores.name * 100).toFixed(0)}%, amount=${(match.scores.amount * 100).toFixed(0)}%, date=${(match.scores.date * 100).toFixed(0)}%`);
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
        linkScores: match.scores
      });
      
      // Update transaction with event link
      batch.update(tx.ref, {
        linkedEventId: eventDoc.id,
        linkedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      linkedCount++;
      batchCount += 2; // Two updates per match
      
      console.log(`   ✅ Linked: ${event.name} ↔ ${tx.data.merchant_name || tx.data.name} (${(match.confidence * 100).toFixed(1)}%)`);
      
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
