/**
 * 00-backup-firebase.js
 * 
 * Phase 0: Assessment & Safety
 * 
 * This script creates a complete backup of the Firebase database:
 * - Exports all collections and subcollections
 * - Saves with timestamp: firebase-backup-{timestamp}.json
 * - Verifies backup file was created successfully
 * 
 * Usage: node scripts/00-backup-firebase.js
 * Run from the backend directory
 */

import admin from 'firebase-admin';
import { readFileSync, writeFileSync, existsSync, statSync } from 'fs';

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

// Helper: Convert Firestore timestamps to ISO strings
const convertTimestamps = (obj) => {
  if (obj === null || obj === undefined) return obj;
  
  if (obj._seconds !== undefined && obj._nanoseconds !== undefined) {
    return new Date(obj._seconds * 1000 + obj._nanoseconds / 1000000).toISOString();
  }
  
  if (obj instanceof admin.firestore.Timestamp) {
    return obj.toDate().toISOString();
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => convertTimestamps(item));
  }
  
  if (typeof obj === 'object') {
    const converted = {};
    for (const [key, value] of Object.entries(obj)) {
      converted[key] = convertTimestamps(value);
    }
    return converted;
  }
  
  return obj;
};

// Helper: Export a collection recursively
const exportCollection = async (collectionRef, depth = 0) => {
  const indent = '  '.repeat(depth);
  const snapshot = await collectionRef.get();
  
  if (snapshot.empty) {
    return {};
  }
  
  const documents = {};
  
  for (const doc of snapshot.docs) {
    console.log(`${indent}📄 ${doc.id}`);
    
    const docData = {
      _id: doc.id,
      _data: convertTimestamps(doc.data()),
      _subcollections: {}
    };
    
    // Get subcollections
    const subcollections = await doc.ref.listCollections();
    for (const subcol of subcollections) {
      console.log(`${indent}  📁 ${subcol.id}/`);
      docData._subcollections[subcol.id] = await exportCollection(subcol, depth + 2);
    }
    
    documents[doc.id] = docData;
  }
  
  return documents;
};

// Main backup function
async function backupFirebase() {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  💾 FIREBASE COMPLETE BACKUP');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const backup = {
    _metadata: {
      timestamp: new Date().toISOString(),
      type: 'full_backup',
      version: '1.0.0'
    },
    collections: {}
  };

  try {
    // Get all root collections
    console.log('📊 Discovering collections...\n');
    const collections = await db.listCollections();
    
    console.log(`   Found ${collections.length} root collection(s):`);
    collections.forEach(col => console.log(`   - ${col.id}`));
    console.log('\n');
    
    let totalDocuments = 0;
    
    // Export each collection
    for (const collection of collections) {
      console.log(`📁 Exporting: ${collection.id}/`);
      console.log('─'.repeat(50));
      
      const collectionData = await exportCollection(collection, 1);
      backup.collections[collection.id] = collectionData;
      
      const docCount = Object.keys(collectionData).length;
      totalDocuments += docCount;
      
      console.log(`   ✅ ${docCount} document(s) exported\n`);
    }
    
    // Count subcollection documents
    const countSubcollectionDocs = (data) => {
      let count = 0;
      for (const doc of Object.values(data)) {
        if (doc._subcollections) {
          for (const subcol of Object.values(doc._subcollections)) {
            count += Object.keys(subcol).length;
            count += countSubcollectionDocs(subcol);
          }
        }
      }
      return count;
    };
    
    for (const colData of Object.values(backup.collections)) {
      totalDocuments += countSubcollectionDocs(colData);
    }
    
    backup._metadata.totalDocuments = totalDocuments;
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `firebase-backup-${timestamp}.json`;
    
    // Save backup
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  💾 SAVING BACKUP');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    const jsonContent = JSON.stringify(backup, null, 2);
    writeFileSync(filename, jsonContent);
    
    // Verify backup
    if (existsSync(filename)) {
      const stats = statSync(filename);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      
      console.log('   ✅ Backup file created successfully!');
      console.log('');
      console.log('   📋 Backup Details:');
      console.log(`      File: ${filename}`);
      console.log(`      Size: ${fileSizeMB} MB`);
      console.log(`      Documents: ${totalDocuments}`);
      console.log(`      Collections: ${collections.length}`);
      console.log('');
      
      // Verify JSON is valid by parsing it
      const verifyContent = readFileSync(filename, 'utf8');
      JSON.parse(verifyContent);
      console.log('   ✅ Backup file verified (valid JSON)');
      
    } else {
      throw new Error('Backup file was not created');
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  ✅ BACKUP COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  File: ${filename}`);
    console.log(`  Use scripts/99-restore-from-backup.js to restore if needed`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Backup failed:', error.message);
    console.error('\nError details:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the backup
backupFirebase();
