/**
 * 05-merge-collections.js
 * 
 * Phase 2: Data Restructuring (Medium Risk, Non-Destructive)
 * 
 * This script merges bill collections into financialEvents:
 * - Merges billInstances, paidBills, and bill_payments into financialEvents
 * - Checks for duplicates (same name + dueDate)
 * - Transforms old structure to new financialEvent structure
 * - Preserves all payment history
 * - Standardizes date formats to ISO strings
 * - Does NOT delete old collections
 * 
 * Usage: node scripts/05-merge-collections.js
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

// Helper: Normalize date to ISO string
const normalizeDate = (date) => {
  if (!date) return null;
  
  if (date._seconds !== undefined) {
    return new Date(date._seconds * 1000).toISOString();
  }
  
  if (date instanceof admin.firestore.Timestamp) {
    return date.toDate().toISOString();
  }
  
  if (date instanceof Date) {
    return date.toISOString();
  }
  
  if (typeof date === 'string') {
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
    return date;
  }
  
  return null;
};

// Helper: Get date part for comparison
const getDatePart = (date) => {
  const normalized = normalizeDate(date);
  if (!normalized) return null;
  return normalized.split('T')[0];
};

// Helper: Generate merchant aliases from name
const generateAliases = (name) => {
  if (!name) return [];
  
  const aliases = [name.toLowerCase()];
  const noSpaces = name.toLowerCase().replace(/\s+/g, '');
  if (noSpaces !== aliases[0]) {
    aliases.push(noSpaces);
  }
  
  const words = name.split(/\s+/);
  if (words.length > 1) {
    const acronym = words.map(w => w[0]?.toLowerCase()).filter(Boolean).join('');
    if (acronym.length > 1) {
      aliases.push(acronym);
    }
  }
  
  return aliases;
};

// Helper: Generate unique key for deduplication
const generateDuplicateKey = (name, dueDate) => {
  const normalizedName = (name || '').toLowerCase().trim();
  const normalizedDate = getDatePart(dueDate) || 'no-date';
  return `${normalizedName}__${normalizedDate}`;
};

// Helper: Transform document to financialEvent structure
const transformToFinancialEvent = (doc, source) => {
  const data = doc.data();
  const name = data.name || data.billName || 'Unknown';
  
  return {
    type: data.type || 'bill',
    name: name,
    amount: data.amount || 0,
    dueDate: normalizeDate(data.dueDate),
    status: data.status || (data.isPaid ? 'paid' : 'pending'),
    isPaid: data.isPaid || data.status === 'paid' || false,
    paidDate: normalizeDate(data.paidDate || data.paymentDate),
    paidAmount: data.paidAmount || data.amount,
    linkedTransactionId: data.linkedTransactionId || data.transactionId || null,
    recurringPatternId: data.recurringPatternId || data.patternId || null,
    category: data.category || 'Uncategorized',
    merchantNames: data.merchantNames || generateAliases(name),
    autoPayEnabled: data.autoPayEnabled || data.isAutoPay || false,
    paymentHistory: data.paymentHistory || [],
    notes: data.notes || null,
    originalId: doc.id,
    originalData: data,
    migratedFrom: source,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
};

// Main function
async function mergeCollections() {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🔀 MERGE BILL COLLECTIONS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  User ID: ${MAIN_USER_ID}`);
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    const userRef = db.collection('users').doc(MAIN_USER_ID);
    const financialEventsRef = userRef.collection('financialEvents');
    
    // Collections to merge
    const collectionsToMerge = [
      { name: 'billInstances', ref: userRef.collection('billInstances') },
      { name: 'paidBills', ref: userRef.collection('paidBills') },
      { name: 'bill_payments', ref: userRef.collection('bill_payments') }
    ];
    
    // Get existing financialEvents for deduplication
    console.log('📊 Checking existing financialEvents...\n');
    
    const existingEventsSnapshot = await financialEventsRef.get();
    const existingKeys = new Set();
    
    existingEventsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      const key = generateDuplicateKey(data.name, data.dueDate);
      existingKeys.add(key);
    });
    
    console.log(`   Existing financialEvents: ${existingEventsSnapshot.size}`);
    console.log('');
    
    // Collect all documents to merge
    console.log('📋 Scanning collections to merge...\n');
    
    const documentsToMerge = [];
    const duplicateCount = { total: 0, byCollection: {} };
    
    for (const collection of collectionsToMerge) {
      const snapshot = await collection.ref.get();
      console.log(`   📁 ${collection.name}: ${snapshot.size} documents`);
      
      duplicateCount.byCollection[collection.name] = 0;
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const key = generateDuplicateKey(data.name || data.billName, data.dueDate);
        
        if (existingKeys.has(key)) {
          duplicateCount.total++;
          duplicateCount.byCollection[collection.name]++;
        } else {
          documentsToMerge.push({
            doc,
            source: collection.name
          });
          existingKeys.add(key); // Prevent duplicates within merge
        }
      });
    }
    
    console.log('');
    console.log(`   📊 Total new documents to merge: ${documentsToMerge.length}`);
    console.log(`   ⚠️  Duplicates skipped: ${duplicateCount.total}`);
    
    if (duplicateCount.total > 0) {
      console.log('      Breakdown:');
      for (const [col, count] of Object.entries(duplicateCount.byCollection)) {
        if (count > 0) {
          console.log(`        - ${col}: ${count}`);
        }
      }
    }
    console.log('');
    
    if (documentsToMerge.length === 0) {
      console.log('   ✅ No new documents to merge (all already exist or duplicates)');
      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('  ✅ COMPLETE (no action needed)');
      console.log('═══════════════════════════════════════════════════════════════\n');
      process.exit(0);
    }
    
    // Show sample of documents to merge
    console.log('📋 Sample documents to merge:');
    console.log('─'.repeat(50));
    
    documentsToMerge.slice(0, 5).forEach(({ doc, source }, i) => {
      const data = doc.data();
      console.log(`   ${i + 1}. ${data.name || data.billName || 'Unnamed'} (from ${source})`);
      console.log(`      Amount: $${data.amount || 0}`);
      console.log(`      Due: ${getDatePart(data.dueDate) || 'Not set'}`);
    });
    
    if (documentsToMerge.length > 5) {
      console.log(`   ... and ${documentsToMerge.length - 5} more`);
    }
    console.log('');
    
    // Confirm action
    const confirmed = await confirm('   Proceed with merge?');
    
    if (!confirmed) {
      console.log('\n   ❌ Operation cancelled by user');
      process.exit(0);
    }
    
    console.log('\n');
    console.log('📝 Merging documents into financialEvents...\n');
    
    let mergedCount = 0;
    const mergeStats = { billInstances: 0, paidBills: 0, bill_payments: 0 };
    
    // Process in batches
    const batchSize = 500;
    let batch = db.batch();
    let batchCount = 0;
    
    for (const { doc, source } of documentsToMerge) {
      const financialEvent = transformToFinancialEvent(doc, source);
      
      // Generate a unique document ID
      const docId = `${source}_${doc.id}`;
      
      batch.set(financialEventsRef.doc(docId), financialEvent);
      
      mergedCount++;
      mergeStats[source]++;
      batchCount++;
      
      if (mergedCount <= 10) {
        console.log(`   ✅ Merged: ${financialEvent.name} (from ${source})`);
      }
      
      if (batchCount >= batchSize) {
        await batch.commit();
        console.log(`\n   💾 Committed batch of ${batchCount} documents\n`);
        batch = db.batch();
        batchCount = 0;
      }
    }
    
    // Commit remaining
    if (batchCount > 0) {
      await batch.commit();
      console.log(`\n   💾 Committed final batch of ${batchCount} documents\n`);
    }
    
    if (mergedCount > 10) {
      console.log(`   ... and ${mergedCount - 10} more merged\n`);
    }
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  ✅ MERGE COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Documents merged: ${mergedCount}`);
    console.log('');
    console.log('  Breakdown by source:');
    for (const [source, count] of Object.entries(mergeStats)) {
      if (count > 0) {
        console.log(`    - ${source}: ${count}`);
      }
    }
    console.log('');
    console.log(`  Duplicates skipped: ${duplicateCount.total}`);
    console.log('');
    console.log('  Note: Original collections NOT deleted');
    console.log('  Note: Run 07-delete-old-collections.js to cleanup after verification');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Merge failed:', error.message);
    console.error('\nError details:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the merge
mergeCollections();
