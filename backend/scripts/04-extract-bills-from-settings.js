/**
 * 04-extract-bills-from-settings.js
 * 
 * Phase 2: Data Restructuring (Medium Risk, Non-Destructive)
 * 
 * This script extracts bill data from settings document:
 * - Reads settings/personal document
 * - Extracts bills array → creates financialEvents documents
 * - Extracts recurringItems array → creates recurringPatterns documents
 * - Removes bills and recurringItems from settings using FieldValue.delete()
 * - Keeps all other settings fields intact
 * - Does NOT delete old collections
 * 
 * Usage: node scripts/04-extract-bills-from-settings.js
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
  
  // Handle Firestore Timestamp
  if (date._seconds !== undefined) {
    return new Date(date._seconds * 1000).toISOString();
  }
  
  // Handle Firestore Timestamp object
  if (date instanceof admin.firestore.Timestamp) {
    return date.toDate().toISOString();
  }
  
  // Handle Date object
  if (date instanceof Date) {
    return date.toISOString();
  }
  
  // Handle string date
  if (typeof date === 'string') {
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
    return date;
  }
  
  return null;
};

// Helper: Generate merchant aliases from name
const generateAliases = (name) => {
  if (!name) return [];
  
  const aliases = [name.toLowerCase()];
  
  // Add variations
  const noSpaces = name.toLowerCase().replace(/\s+/g, '');
  if (noSpaces !== aliases[0]) {
    aliases.push(noSpaces);
  }
  
  // Add acronym for multi-word names
  const words = name.split(/\s+/);
  if (words.length > 1) {
    const acronym = words.map(w => w[0]?.toLowerCase()).filter(Boolean).join('');
    if (acronym.length > 1) {
      aliases.push(acronym);
    }
  }
  
  return aliases;
};

// Helper: Generate document ID from name
const generateDocId = (name) => {
  if (!name) return `doc_${Date.now()}`;
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 50);
};

// Main function
async function extractBillsFromSettings() {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  📤 EXTRACT BILLS FROM SETTINGS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  User ID: ${MAIN_USER_ID}`);
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    const userRef = db.collection('users').doc(MAIN_USER_ID);
    const settingsRef = userRef.collection('settings').doc('personal');
    
    // Read settings document
    console.log('📊 Reading settings document...\n');
    const settingsDoc = await settingsRef.get();
    
    if (!settingsDoc.exists) {
      console.log('   ❌ Settings document not found');
      process.exit(1);
    }
    
    const settingsData = settingsDoc.data();
    const bills = settingsData.bills || [];
    const recurringItems = settingsData.recurringItems || [];
    
    console.log(`   📄 Settings document found`);
    console.log(`   📋 Bills array: ${bills.length} items`);
    console.log(`   📋 Recurring items array: ${recurringItems.length} items`);
    console.log('');
    
    if (bills.length === 0 && recurringItems.length === 0) {
      console.log('   ✅ No bills or recurring items to extract');
      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log('  ✅ COMPLETE (no action needed)');
      console.log('═══════════════════════════════════════════════════════════════\n');
      process.exit(0);
    }
    
    // Show what will be extracted
    console.log('📋 Bills to extract:');
    console.log('─'.repeat(50));
    bills.slice(0, 10).forEach((bill, i) => {
      console.log(`   ${i + 1}. ${bill.name || 'Unnamed'}`);
      console.log(`      Amount: $${bill.amount || 0}`);
      console.log(`      Due: ${bill.dueDate || 'Not set'}`);
    });
    if (bills.length > 10) {
      console.log(`   ... and ${bills.length - 10} more`);
    }
    console.log('');
    
    console.log('📋 Recurring items to extract:');
    console.log('─'.repeat(50));
    recurringItems.slice(0, 10).forEach((item, i) => {
      console.log(`   ${i + 1}. ${item.name || 'Unnamed'}`);
      console.log(`      Amount: $${item.amount || 0}`);
      console.log(`      Frequency: ${item.frequency || 'Not set'}`);
    });
    if (recurringItems.length > 10) {
      console.log(`   ... and ${recurringItems.length - 10} more`);
    }
    console.log('');
    
    // Confirm action
    const confirmed = await confirm('   Proceed with extraction?');
    
    if (!confirmed) {
      console.log('\n   ❌ Operation cancelled by user');
      process.exit(0);
    }
    
    console.log('\n');
    
    // Create financialEvents collection
    console.log('📝 Creating financialEvents documents...\n');
    
    const financialEventsRef = userRef.collection('financialEvents');
    let eventsCreated = 0;
    
    for (const bill of bills) {
      const docId = generateDocId(bill.name) || `bill_${Date.now()}_${eventsCreated}`;
      
      const financialEvent = {
        type: 'bill',
        name: bill.name || 'Unknown Bill',
        amount: bill.amount || 0,
        dueDate: normalizeDate(bill.dueDate),
        status: bill.status || 'pending',
        isPaid: bill.isPaid || false,
        paidDate: normalizeDate(bill.paidDate),
        linkedTransactionId: bill.linkedTransactionId || null,
        recurringPatternId: null,
        category: bill.category || 'Uncategorized',
        merchantNames: generateAliases(bill.name),
        autoPayEnabled: bill.autoPayEnabled || bill.isAutoPay || false,
        paymentHistory: bill.paymentHistory || [],
        notes: bill.notes || null,
        originalData: bill,
        migratedFrom: 'settings.bills',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      await financialEventsRef.doc(docId).set(financialEvent);
      eventsCreated++;
      
      console.log(`   ✅ Created: ${bill.name || docId}`);
    }
    
    console.log(`\n   📊 Total financialEvents created: ${eventsCreated}\n`);
    
    // Create recurringPatterns collection
    console.log('📝 Creating recurringPatterns documents...\n');
    
    const recurringPatternsRef = userRef.collection('recurringPatterns');
    let patternsCreated = 0;
    
    for (const item of recurringItems) {
      const docId = generateDocId(item.name) || `pattern_${Date.now()}_${patternsCreated}`;
      
      // Extract day of month from dueDate if available
      let dayOfMonth = item.dayOfMonth;
      if (!dayOfMonth && item.dueDate) {
        const date = new Date(item.dueDate);
        if (!isNaN(date.getTime())) {
          dayOfMonth = date.getDate();
        }
      }
      
      const recurringPattern = {
        name: item.name || 'Unknown Pattern',
        amount: item.amount || 0,
        frequency: item.frequency || 'monthly',
        dayOfMonth: dayOfMonth || 1,
        merchantNames: generateAliases(item.name),
        category: item.category || 'Uncategorized',
        confidence: 0.85,
        linkedTransactionIds: item.linkedTransactionIds || [],
        autoPayEnabled: item.autoPayEnabled || item.isAutoPay || false,
        status: item.status || 'active',
        userConfirmed: true,
        lastGenerated: normalizeDate(item.lastGenerated),
        nextOccurrence: normalizeDate(item.nextOccurrence),
        notes: item.notes || null,
        originalData: item,
        migratedFrom: 'settings.recurringItems',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      await recurringPatternsRef.doc(docId).set(recurringPattern);
      patternsCreated++;
      
      console.log(`   ✅ Created: ${item.name || docId}`);
    }
    
    console.log(`\n   📊 Total recurringPatterns created: ${patternsCreated}\n`);
    
    // Remove bills and recurringItems from settings
    console.log('🔧 Updating settings document...\n');
    
    await settingsRef.update({
      bills: admin.firestore.FieldValue.delete(),
      recurringItems: admin.firestore.FieldValue.delete(),
      billsMigratedAt: admin.firestore.FieldValue.serverTimestamp(),
      recurringItemsMigratedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log('   ✅ Removed bills array from settings');
    console.log('   ✅ Removed recurringItems array from settings');
    console.log('   ✅ Added migration timestamps');
    
    // Verify settings size reduction
    const updatedSettingsDoc = await settingsRef.get();
    const newSize = Buffer.byteLength(JSON.stringify(updatedSettingsDoc.data()), 'utf8');
    const oldSize = Buffer.byteLength(JSON.stringify(settingsData), 'utf8');
    const reduction = ((oldSize - newSize) / oldSize * 100).toFixed(1);
    
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  ✅ EXTRACTION COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  financialEvents created: ${eventsCreated}`);
    console.log(`  recurringPatterns created: ${patternsCreated}`);
    console.log('');
    console.log(`  Settings size: ${(oldSize / 1024).toFixed(2)} KB → ${(newSize / 1024).toFixed(2)} KB`);
    console.log(`  Reduction: ${reduction}%`);
    console.log('');
    console.log('  Note: Original data preserved in new documents (originalData field)');
    console.log('  Note: Old collections NOT deleted - run 07-delete-old-collections.js later');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Extraction failed:', error.message);
    console.error('\nError details:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the extraction
extractBillsFromSettings();
