/**
 * 99-restore-from-backup.js
 * 
 * Emergency Restore
 * 
 * This script restores the Firebase database from a backup file:
 * - Accepts backup filename as argument
 * - Reads JSON backup file
 * - Restores all collections and documents
 * - Handles subcollections recursively
 * - Verifies restoration completed
 * 
 * Usage: node scripts/99-restore-from-backup.js <backup-filename>
 * Example: node scripts/99-restore-from-backup.js firebase-backup-2024-01-15T12-30-00.json
 * 
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

// Helper: Confirm action
const confirm = async (message) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(`${message} (type 'RESTORE' to confirm): `, (answer) => {
      rl.close();
      resolve(answer === 'RESTORE');
    });
  });
};

// Helper: Convert ISO date strings back to Firestore timestamps
const convertToTimestamps = (obj) => {
  if (obj === null || obj === undefined) return obj;
  
  // Check if it looks like an ISO date string
  if (typeof obj === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(obj)) {
      const date = new Date(obj);
      if (!isNaN(date.getTime())) {
        return admin.firestore.Timestamp.fromDate(date);
      }
    }
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => convertToTimestamps(item));
  }
  
  if (typeof obj === 'object') {
    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip internal metadata fields
      if (key.startsWith('_')) continue;
      converted[key] = convertToTimestamps(value);
    }
    return converted;
  }
  
  return obj;
};

// Helper: Restore a document and its subcollections
const restoreDocument = async (docRef, docData, depth = 0) => {
  const indent = '  '.repeat(depth);
  
  // Restore document data
  if (docData._data && Object.keys(docData._data).length > 0) {
    const data = convertToTimestamps(docData._data);
    await docRef.set(data);
  }
  
  // Restore subcollections
  if (docData._subcollections) {
    for (const [subcolName, subcolDocs] of Object.entries(docData._subcollections)) {
      console.log(`${indent}  📁 Restoring ${subcolName}/`);
      
      for (const [subDocId, subDocData] of Object.entries(subcolDocs)) {
        console.log(`${indent}    📄 ${subDocId}`);
        await restoreDocument(
          docRef.collection(subcolName).doc(subDocId),
          subDocData,
          depth + 2
        );
      }
    }
  }
};

// Main function
async function restoreFromBackup() {
  // Get backup filename from command line
  const backupFilename = process.argv[2];
  
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  🔄 RESTORE FROM BACKUP                                       ║');
  console.log('║                                                               ║');
  console.log('║  This will restore data from a backup file.                   ║');
  console.log('║  Existing documents will be OVERWRITTEN.                      ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  // Validate filename argument
  if (!backupFilename) {
    console.log('   ❌ ERROR: No backup filename provided');
    console.log('');
    console.log('   Usage: node scripts/99-restore-from-backup.js <backup-filename>');
    console.log('   Example: node scripts/99-restore-from-backup.js firebase-backup-2024-01-15T12-30-00.json');
    console.log('');
    process.exit(1);
  }
  
  // Check if file exists
  if (!existsSync(backupFilename)) {
    console.log(`   ❌ ERROR: Backup file not found: ${backupFilename}`);
    console.log('');
    console.log('   Available backup files:');
    
    const { readdirSync } = await import('fs');
    const backupFiles = readdirSync('.').filter(f => f.startsWith('firebase-backup-') && f.endsWith('.json'));
    
    if (backupFiles.length === 0) {
      console.log('   No backup files found in current directory');
    } else {
      backupFiles.forEach(f => console.log(`   - ${f}`));
    }
    console.log('');
    process.exit(1);
  }
  
  console.log(`   📁 Backup file: ${backupFilename}`);
  console.log(`   Started: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    // Load backup file
    console.log('📊 Loading backup file...\n');
    
    const backupContent = readFileSync(backupFilename, 'utf8');
    const backup = JSON.parse(backupContent);
    
    // Validate backup structure
    if (!backup._metadata || !backup.collections) {
      throw new Error('Invalid backup file format - missing _metadata or collections');
    }
    
    console.log('   📋 Backup metadata:');
    console.log(`      Created: ${backup._metadata.timestamp}`);
    console.log(`      Version: ${backup._metadata.version}`);
    console.log(`      Total documents: ${backup._metadata.totalDocuments}`);
    console.log('');
    
    // Count what will be restored
    const collections = Object.keys(backup.collections);
    let totalDocs = 0;
    
    console.log('   📋 Collections to restore:');
    for (const colName of collections) {
      const docCount = Object.keys(backup.collections[colName]).length;
      totalDocs += docCount;
      console.log(`      - ${colName}: ${docCount} documents`);
    }
    console.log('');
    console.log(`   📊 Total: ${collections.length} collections, ${totalDocs} documents`);
    console.log('');
    
    // Confirm restore
    console.log('   ⚠️  WARNING: This will overwrite existing documents');
    console.log('');
    
    const confirmed = await confirm('   Type RESTORE to confirm');
    
    if (!confirmed) {
      console.log('\n   ❌ Operation cancelled by user');
      process.exit(0);
    }
    
    console.log('\n');
    console.log('🔄 Restoring data...\n');
    
    let restoredDocs = 0;
    let restoredSubcollectionDocs = 0;
    
    // Restore each collection
    for (const [collectionName, documents] of Object.entries(backup.collections)) {
      console.log(`📁 Restoring: ${collectionName}/`);
      console.log('─'.repeat(50));
      
      for (const [docId, docData] of Object.entries(documents)) {
        console.log(`   📄 ${docId}`);
        
        const docRef = db.collection(collectionName).doc(docId);
        await restoreDocument(docRef, docData, 1);
        
        restoredDocs++;
        
        // Count subcollection docs
        const countSubDocs = (data) => {
          let count = 0;
          if (data._subcollections) {
            for (const subcol of Object.values(data._subcollections)) {
              count += Object.keys(subcol).length;
              for (const subDoc of Object.values(subcol)) {
                count += countSubDocs(subDoc);
              }
            }
          }
          return count;
        };
        
        restoredSubcollectionDocs += countSubDocs(docData);
      }
      
      console.log(`   ✅ ${Object.keys(documents).length} documents restored\n`);
    }
    
    // Verify restoration
    console.log('🔍 Verifying restoration...\n');
    
    let verifiedDocs = 0;
    for (const [collectionName, documents] of Object.entries(backup.collections)) {
      const snapshot = await db.collection(collectionName).get();
      verifiedDocs += snapshot.size;
      console.log(`   ✅ ${collectionName}: ${snapshot.size} documents`);
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  ✅ RESTORE COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Root documents restored: ${restoredDocs}`);
    console.log(`  Subcollection documents restored: ${restoredSubcollectionDocs}`);
    console.log(`  Total verified in database: ${verifiedDocs}`);
    console.log('');
    console.log('  Note: Timestamps have been converted back to Firestore format');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Restore failed:', error.message);
    console.error('\nError details:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the restore
restoreFromBackup();
