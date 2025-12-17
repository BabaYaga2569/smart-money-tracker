/**
 * 09-migrate-billInstances-to-financialEvents.js
 * 
 * Migration script to move remaining billInstances to financialEvents.
 * 
 * This script:
 * - Reads all documents from billInstances collection (8 docs)
 * - Checks if they already exist in financialEvents
 * - Migrates missing documents to financialEvents
 * - Adds 'type: bill' field and other required fields
 * - Does NOT delete billInstances (for backup)
 * - Outputs detailed report
 * 
 * Usage: node scripts/09-migrate-billInstances-to-financialEvents.js USER_ID
 * Run from the backend directory
 */

import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';

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
const USER_ID = process.env.USER_ID || process.argv[2];

// Validate user ID is provided
if (!USER_ID) {
  console.error('❌ Error: USER_ID is required!');
  console.error('\nUsage:');
  console.error('  node scripts/09-migrate-billInstances-to-financialEvents.js USER_ID');
  console.error('  or');
  console.error('  USER_ID=... node scripts/09-migrate-billInstances-to-financialEvents.js\n');
  process.exit(1);
}

/**
 * Generate merchant aliases from name
 */
function generateMerchantAliases(name) {
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
}

/**
 * Transform billInstance to financialEvent structure
 */
function transformToFinancialEvent(billInstance) {
  return {
    type: 'bill',
    name: billInstance.name,
    amount: billInstance.amount || 0,
    dueDate: billInstance.dueDate || billInstance.nextDueDate,
    originalDueDate: billInstance.originalDueDate || billInstance.dueDate,
    status: billInstance.status || (billInstance.isPaid ? 'paid' : 'pending'),
    isPaid: billInstance.isPaid || false,
    paidDate: billInstance.paidDate || null,
    paidAmount: billInstance.paidAmount || null,
    linkedTransactionId: billInstance.linkedTransactionId || billInstance.linkedTransactionIds?.[0] || null,
    recurringPatternId: billInstance.recurringPatternId || billInstance.recurringTemplateId || null,
    category: billInstance.category || 'Bills & Utilities',
    recurrence: billInstance.recurrence || 'monthly',
    merchantNames: billInstance.merchantNames || generateMerchantAliases(billInstance.name),
    autoPayEnabled: billInstance.autoPayEnabled || false,
    paymentHistory: billInstance.paymentHistory || [],
    notes: billInstance.notes || null,
    createdAt: billInstance.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    migratedFrom: 'billInstances',
    originalId: billInstance.id,
    createdFrom: billInstance.createdFrom || 'migration-09'
  };
}

/**
 * Check if bill already exists in financialEvents
 */
async function checkDuplicate(userId, bill) {
  try {
    const eventsRef = db.collection('users').doc(userId).collection('financialEvents');
    const query = eventsRef
      .where('type', '==', 'bill')
      .where('name', '==', bill.name)
      .where('dueDate', '==', bill.dueDate);
    
    const snapshot = await query.get();
    return !snapshot.empty;
  } catch (error) {
    console.error('Error checking duplicate:', error);
    return false;
  }
}

/**
 * Main migration function
 */
async function migrateBillInstances() {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  📦 MIGRATE BILLINSTANCES TO FINANCIALEVENTS');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  User ID: ${USER_ID}`);
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    const userRef = db.collection('users').doc(USER_ID);
    
    // Step 1: Get all billInstances
    console.log('📊 Step 1: Loading billInstances...\n');
    const billInstancesSnapshot = await userRef.collection('billInstances').get();
    
    if (billInstancesSnapshot.empty) {
      console.log('   ✅ No billInstances found - nothing to migrate\n');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log('  ✅ MIGRATION COMPLETE (no action needed)');
      console.log('═══════════════════════════════════════════════════════════════\n');
      process.exit(0);
    }
    
    console.log(`   Found ${billInstancesSnapshot.size} billInstances\n`);
    
    // Step 2: Check existing financialEvents
    console.log('📊 Step 2: Checking existing financialEvents...\n');
    const financialEventsSnapshot = await userRef.collection('financialEvents').where('type', '==', 'bill').get();
    console.log(`   Found ${financialEventsSnapshot.size} existing bill events\n`);
    
    // Step 3: Process each billInstance
    console.log('📝 Step 3: Processing billInstances...\n');
    
    let migrated = 0;
    let skipped = 0;
    const migratedBills = [];
    const skippedBills = [];
    
    for (const doc of billInstancesSnapshot.docs) {
      const billInstance = { id: doc.id, ...doc.data() };
      
      // Check if already exists
      const isDuplicate = await checkDuplicate(USER_ID, billInstance);
      
      if (isDuplicate) {
        console.log(`   ⏭️  Skipped (duplicate): ${billInstance.name} - ${billInstance.dueDate}`);
        skipped++;
        skippedBills.push({
          name: billInstance.name,
          amount: billInstance.amount,
          dueDate: billInstance.dueDate,
          reason: 'Already exists in financialEvents'
        });
      } else {
        // Transform and migrate
        const financialEvent = transformToFinancialEvent(billInstance);
        
        // Use same ID for traceability
        await userRef.collection('financialEvents').doc(billInstance.id).set(financialEvent);
        
        console.log(`   ✅ Migrated: ${billInstance.name} - ${billInstance.dueDate}`);
        migrated++;
        migratedBills.push({
          name: billInstance.name,
          amount: billInstance.amount,
          dueDate: billInstance.dueDate,
          isPaid: billInstance.isPaid || false
        });
      }
    }
    
    console.log('');
    
    // Step 4: Summary
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  📊 MIGRATION SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Total billInstances: ${billInstancesSnapshot.size}`);
    console.log(`  ✅ Migrated: ${migrated}`);
    console.log(`  ⏭️  Skipped (duplicates): ${skipped}`);
    console.log('═══════════════════════════════════════════════════════════════');
    
    if (migratedBills.length > 0) {
      console.log('\n✅ Migrated Bills:');
      migratedBills.forEach(bill => {
        const paidStatus = bill.isPaid ? '✅ PAID' : '⏳ UNPAID';
        console.log(`   - ${bill.name} ($${bill.amount}) - ${bill.dueDate} [${paidStatus}]`);
      });
    }
    
    if (skippedBills.length > 0) {
      console.log('\n⏭️  Skipped Bills:');
      skippedBills.forEach(bill => {
        console.log(`   - ${bill.name} ($${bill.amount}) - ${bill.dueDate} (${bill.reason})`);
      });
    }
    
    console.log('\n📝 Note: Original billInstances collection has NOT been deleted.');
    console.log('   It remains as a backup. You can delete it manually after verification.\n');
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  ✅ MIGRATION COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run migration
migrateBillInstances();
