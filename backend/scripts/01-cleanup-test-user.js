/**
 * 01-cleanup-test-user.js
 * 
 * Phase 1: Quick Wins (Safe, Low Risk)
 * 
 * This script deletes the test user 'steve-colburn' and all subcollections:
 * - Confirms before deleting
 * - Deletes all subcollections first
 * - Deletes the user document
 * - Logs each deletion
 * 
 * Usage: node scripts/01-cleanup-test-user.js
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
const TEST_USER_ID = 'steve-colburn';

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
    
    console.log(`      Deleted batch of ${snapshot.size} documents...`);
  }
  
  return deleted;
};

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

// Main cleanup function
async function cleanupTestUser() {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🧹 CLEANUP TEST USER');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Test User ID: ${TEST_USER_ID}`);
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    const userRef = db.collection('users').doc(TEST_USER_ID);
    const userDoc = await userRef.get();
    
    // Check if user exists
    console.log('📊 Checking for test user...\n');
    
    // List subcollections even if document doesn't exist
    const subcollections = await userRef.listCollections();
    
    if (!userDoc.exists && subcollections.length === 0) {
      console.log(`   ✅ Test user "${TEST_USER_ID}" not found - nothing to delete`);
      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('  ✅ CLEANUP COMPLETE (no action needed)');
      console.log('═══════════════════════════════════════════════════════════════\n');
      process.exit(0);
    }
    
    // Count documents to be deleted
    let totalDocuments = userDoc.exists ? 1 : 0;
    const subcollectionCounts = {};
    
    for (const subcol of subcollections) {
      const snapshot = await subcol.get();
      subcollectionCounts[subcol.id] = snapshot.size;
      totalDocuments += snapshot.size;
    }
    
    // Display what will be deleted
    console.log(`   ⚠️  Found test user "${TEST_USER_ID}"`);
    console.log('');
    console.log('   Documents to be deleted:');
    if (userDoc.exists) {
      console.log('      - User document: 1');
    }
    for (const [name, count] of Object.entries(subcollectionCounts)) {
      console.log(`      - ${name}: ${count}`);
    }
    console.log('');
    console.log(`   📊 Total documents: ${totalDocuments}`);
    console.log('');
    
    // Confirm deletion
    const confirmed = await confirm('   ⚠️  Are you sure you want to delete all these documents?');
    
    if (!confirmed) {
      console.log('\n   ❌ Operation cancelled by user');
      process.exit(0);
    }
    
    console.log('\n');
    console.log('🗑️  Deleting test user data...\n');
    
    let deletedCount = 0;
    
    // Delete subcollections first
    for (const subcol of subcollections) {
      console.log(`   📁 Deleting ${subcol.id}/...`);
      const deleted = await deleteCollection(subcol);
      deletedCount += deleted;
      console.log(`      ✅ Deleted ${deleted} document(s)`);
      console.log('');
    }
    
    // Delete user document
    if (userDoc.exists) {
      console.log('   📄 Deleting user document...');
      await userRef.delete();
      deletedCount += 1;
      console.log('      ✅ User document deleted');
      console.log('');
    }
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  ✅ CLEANUP COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Test user "${TEST_USER_ID}" has been removed`);
    console.log(`  Total documents deleted: ${deletedCount}`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Cleanup failed:', error.message);
    console.error('\nError details:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the cleanup
cleanupTestUser();
