/**
 * 07-delete-old-collections.js
 * 
 * Phase 3: Final Cleanup (High Risk, Run Last!)
 * 
 * ⚠️  WARNING: This script permanently deletes data!
 * 
 * This script deletes old bill collections after migration:
 * - Waits 10 seconds with countdown (allows Ctrl+C to cancel)
 * - Deletes collections: billInstances, paidBills, bill_payments
 * - Logs each deletion
 * - Reports total documents deleted
 * 
 * Prerequisites:
 * - Run 00-backup-firebase.js to create backup
 * - Run 04-extract-bills-from-settings.js
 * - Run 05-merge-collections.js
 * - Verify all data is correctly migrated to financialEvents
 * 
 * Usage: node scripts/07-delete-old-collections.js
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
const COUNTDOWN_SECONDS = 10;

// Collections to delete
const COLLECTIONS_TO_DELETE = [
  'billInstances',
  'paidBills',
  'bill_payments'
];

// Helper: Confirm action
const confirm = async (message) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(`${message} (type 'DELETE' to confirm): `, (answer) => {
      rl.close();
      resolve(answer === 'DELETE');
    });
  });
};

// Helper: Sleep function
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Countdown timer
const countdown = async (seconds) => {
  console.log('');
  console.log('   ⏱️  Starting countdown... Press Ctrl+C to cancel');
  console.log('');
  
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\r   ${i} seconds remaining...      `);
    await sleep(1000);
  }
  
  process.stdout.write('\r                                    \r');
  console.log('   ⏱️  Countdown complete');
  console.log('');
};

// Helper: Delete all documents in a collection
const deleteCollection = async (collectionRef, batchSize = 100) => {
  let deleted = 0;
  
  const query = collectionRef.limit(batchSize);
  
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const snapshot = await query.get();
    
    if (snapshot.empty) {
      break;
    }
    
    const batch = db.batch();
    snapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    deleted += snapshot.size;
    
    console.log(`      Deleted batch of ${snapshot.size} documents (total: ${deleted})`);
  }
  
  return deleted;
};

// Main function
async function deleteOldCollections() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  ⚠️  DANGER: DELETE OLD COLLECTIONS                           ║');
  console.log('║                                                               ║');
  console.log('║  This operation PERMANENTLY DELETES data!                     ║');
  console.log('║  Make sure you have a backup before proceeding.               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log(`  User ID: ${MAIN_USER_ID}`);
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    const userRef = db.collection('users').doc(MAIN_USER_ID);
    
    // Check if financialEvents exists and has data
    console.log('📊 Verifying migration status...\n');
    
    const financialEventsSnapshot = await userRef.collection('financialEvents').get();
    
    if (financialEventsSnapshot.empty) {
      console.log('   ❌ ERROR: financialEvents collection is empty!');
      console.log('   Please run migration scripts first:');
      console.log('   - 04-extract-bills-from-settings.js');
      console.log('   - 05-merge-collections.js');
      console.log('');
      console.log('   Aborting to prevent data loss.');
      process.exit(1);
    }
    
    console.log(`   ✅ financialEvents has ${financialEventsSnapshot.size} documents`);
    console.log('');
    
    // Count documents in old collections
    console.log('📋 Collections to be deleted:');
    console.log('─'.repeat(50));
    
    let totalToDelete = 0;
    const collectionStats = [];
    
    for (const collectionName of COLLECTIONS_TO_DELETE) {
      const snapshot = await userRef.collection(collectionName).get();
      collectionStats.push({
        name: collectionName,
        count: snapshot.size
      });
      totalToDelete += snapshot.size;
      
      console.log(`   📁 ${collectionName}: ${snapshot.size} documents`);
    }
    
    console.log('');
    console.log(`   📊 TOTAL: ${totalToDelete} documents will be PERMANENTLY DELETED`);
    console.log('');
    
    if (totalToDelete === 0) {
      console.log('   ✅ No documents to delete - collections are already empty');
      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('  ✅ COMPLETE (no action needed)');
      console.log('═══════════════════════════════════════════════════════════════\n');
      process.exit(0);
    }
    
    // Double-check backup exists
    console.log('⚠️  SAFETY CHECK:');
    console.log('─'.repeat(50));
    console.log('   Have you:');
    console.log('   1. ✓ Run 00-backup-firebase.js to create a backup?');
    console.log('   2. ✓ Verified the backup file exists and is valid?');
    console.log('   3. ✓ Run migration scripts (04, 05) to move data?');
    console.log('   4. ✓ Verified financialEvents contains expected data?');
    console.log('');
    
    // Confirm deletion
    console.log('   ⚠️  THIS ACTION CANNOT BE UNDONE (without backup restore)');
    console.log('');
    
    const confirmed = await confirm('   Type DELETE to confirm permanent deletion');
    
    if (!confirmed) {
      console.log('\n   ❌ Operation cancelled by user');
      process.exit(0);
    }
    
    // Countdown
    await countdown(COUNTDOWN_SECONDS);
    
    console.log('🗑️  Deleting old collections...\n');
    
    let totalDeleted = 0;
    
    for (const stat of collectionStats) {
      if (stat.count === 0) {
        console.log(`   📁 ${stat.name}: Empty (skipping)`);
        continue;
      }
      
      console.log(`   📁 Deleting ${stat.name}...`);
      const deleted = await deleteCollection(userRef.collection(stat.name));
      totalDeleted += deleted;
      console.log(`   ✅ ${stat.name}: ${deleted} documents deleted\n`);
    }
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  ✅ DELETION COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Total documents deleted: ${totalDeleted}`);
    console.log('');
    console.log('  Deleted collections:');
    collectionStats.forEach(stat => {
      console.log(`    - ${stat.name}: ${stat.count} documents`);
    });
    console.log('');
    console.log('  If you need to restore, use:');
    console.log('  node scripts/99-restore-from-backup.js firebase-backup-TIMESTAMP.json');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Deletion failed:', error.message);
    console.error('\nError details:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the deletion
deleteOldCollections();
