/**
 * 00-audit-current-state.js
 * 
 * Phase 0: Assessment & Safety
 * 
 * This script audits the current state of the Firebase database:
 * - Counts all documents in each collection
 * - Identifies redundant data
 * - Finds test user (steve-colburn)
 * - Checks for stale pending transactions
 * - Measures settings document size
 * - Generates "before" snapshot JSON report
 * 
 * Usage: node scripts/00-audit-current-state.js
 * Run from the backend directory
 */

import admin from 'firebase-admin';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// Firebase initialization
const initializeFirebase = () => {
  if (admin.apps.length > 0) return admin.firestore();
  
  let serviceAccount;
  
  // Try loading from file first
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
const TEST_USER_ID = 'steve-colburn';

// Helper: Count documents in a collection
const countCollection = async (collectionRef) => {
  const snapshot = await collectionRef.get();
  return snapshot.size;
};

// Helper: Get collection documents with data
const getCollectionDocs = async (collectionRef) => {
  const snapshot = await collectionRef.get();
  return snapshot.docs.map(doc => ({
    id: doc.id,
    data: doc.data()
  }));
};

// Helper: Calculate object size in bytes
const calculateSize = (obj) => {
  return Buffer.byteLength(JSON.stringify(obj), 'utf8');
};

// Helper: Normalize date for comparison
const normalizeDate = (date) => {
  if (!date) return null;
  if (date._seconds) {
    return new Date(date._seconds * 1000).toISOString().split('T')[0];
  }
  if (date instanceof Date) {
    return date.toISOString().split('T')[0];
  }
  if (typeof date === 'string') {
    return date.split('T')[0];
  }
  return null;
};

// Main audit function
async function auditCurrentState() {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  🔍 FIREBASE DATA AUDIT - CURRENT STATE ASSESSMENT');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  const report = {
    timestamp: new Date().toISOString(),
    summary: {},
    users: {},
    testUser: null,
    redundancy: {},
    settings: {},
    pendingTransactions: [],
    recommendations: []
  };

  try {
    // ============================================
    // SECTION 1: List all users
    // ============================================
    console.log('📁 SECTION 1: USER ACCOUNTS');
    console.log('─'.repeat(50));
    
    const usersSnapshot = await db.collection('users').get();
    console.log(`   Total user accounts: ${usersSnapshot.size}`);
    
    const users = [];
    for (const userDoc of usersSnapshot.docs) {
      const userData = {
        id: userDoc.id,
        isTestUser: userDoc.id === TEST_USER_ID,
        collections: {}
      };
      
      // Check for test user
      if (userDoc.id === TEST_USER_ID) {
        report.testUser = {
          id: userDoc.id,
          exists: true,
          collections: {}
        };
        console.log(`   ⚠️  Test user found: ${TEST_USER_ID}`);
      }
      
      users.push(userData);
    }
    report.users.count = usersSnapshot.size;
    report.users.list = users.map(u => u.id);
    console.log('');

    // ============================================
    // SECTION 2: Count all collections for main user
    // ============================================
    console.log('📁 SECTION 2: MAIN USER COLLECTIONS');
    console.log('─'.repeat(50));
    console.log(`   User ID: ${MAIN_USER_ID}`);
    console.log('');
    
    const userRef = db.collection('users').doc(MAIN_USER_ID);
    
    // List of known collections to check
    const collectionsToAudit = [
      'transactions',
      'bills',
      'billInstances',
      'paidBills',
      'bill_payments',
      'recurringPatterns',
      'financialEvents',
      'aiLearning',
      'plaid',
      'plaid_items',
      'settings',
      'budgets',
      'categories',
      'accounts'
    ];
    
    const collectionCounts = {};
    let totalDocuments = 0;
    
    for (const collectionName of collectionsToAudit) {
      const count = await countCollection(userRef.collection(collectionName));
      collectionCounts[collectionName] = count;
      totalDocuments += count;
      
      if (count > 0) {
        console.log(`   📄 ${collectionName}: ${count} document(s)`);
      }
    }
    
    // Also list any other collections
    const allCollections = await userRef.listCollections();
    for (const col of allCollections) {
      if (!collectionsToAudit.includes(col.id)) {
        const count = await countCollection(col);
        collectionCounts[col.id] = count;
        totalDocuments += count;
        console.log(`   📄 ${col.id}: ${count} document(s) (unlisted)`);
      }
    }
    
    report.summary.totalDocuments = totalDocuments;
    report.summary.collections = collectionCounts;
    console.log('');
    console.log(`   📊 TOTAL: ${totalDocuments} documents`);
    console.log('');

    // ============================================
    // SECTION 3: Analyze bill redundancy
    // ============================================
    console.log('📁 SECTION 3: BILL DATA REDUNDANCY ANALYSIS');
    console.log('─'.repeat(50));
    
    const billSources = {
      billInstances: [],
      paidBills: [],
      bill_payments: [],
      settingsBills: [],
      settingsRecurringItems: []
    };
    
    // Get billInstances
    const billInstancesDocs = await getCollectionDocs(userRef.collection('billInstances'));
    billSources.billInstances = billInstancesDocs.map(d => ({
      id: d.id,
      name: d.data.name || d.data.billName,
      amount: d.data.amount,
      dueDate: normalizeDate(d.data.dueDate)
    }));
    
    // Get paidBills
    const paidBillsDocs = await getCollectionDocs(userRef.collection('paidBills'));
    billSources.paidBills = paidBillsDocs.map(d => ({
      id: d.id,
      name: d.data.name || d.data.billName,
      amount: d.data.amount,
      dueDate: normalizeDate(d.data.dueDate),
      paidDate: normalizeDate(d.data.paidDate)
    }));
    
    // Get bill_payments
    const billPaymentsDocs = await getCollectionDocs(userRef.collection('bill_payments'));
    billSources.bill_payments = billPaymentsDocs.map(d => ({
      id: d.id,
      name: d.data.name || d.data.billName,
      amount: d.data.amount,
      dueDate: normalizeDate(d.data.dueDate)
    }));
    
    // Get settings document
    const settingsDoc = await userRef.collection('settings').doc('personal').get();
    if (settingsDoc.exists) {
      const settingsData = settingsDoc.data();
      
      if (settingsData.bills && Array.isArray(settingsData.bills)) {
        billSources.settingsBills = settingsData.bills.map((b, i) => ({
          index: i,
          name: b.name,
          amount: b.amount,
          dueDate: normalizeDate(b.dueDate)
        }));
      }
      
      if (settingsData.recurringItems && Array.isArray(settingsData.recurringItems)) {
        billSources.settingsRecurringItems = settingsData.recurringItems.map((r, i) => ({
          index: i,
          name: r.name,
          amount: r.amount,
          frequency: r.frequency
        }));
      }
    }
    
    // Print bill source counts
    console.log('   Bill data found in multiple locations:');
    console.log(`   📄 billInstances collection: ${billSources.billInstances.length}`);
    console.log(`   📄 paidBills collection: ${billSources.paidBills.length}`);
    console.log(`   📄 bill_payments collection: ${billSources.bill_payments.length}`);
    console.log(`   📄 settings.bills[] array: ${billSources.settingsBills.length}`);
    console.log(`   📄 settings.recurringItems[] array: ${billSources.settingsRecurringItems.length}`);
    console.log('');
    
    const totalBillRecords = billSources.billInstances.length + 
                             billSources.paidBills.length + 
                             billSources.bill_payments.length +
                             billSources.settingsBills.length + 
                             billSources.settingsRecurringItems.length;
    
    // Find duplicates (same name + similar date)
    const allBillNames = [
      ...billSources.billInstances.map(b => b.name?.toLowerCase()),
      ...billSources.paidBills.map(b => b.name?.toLowerCase()),
      ...billSources.bill_payments.map(b => b.name?.toLowerCase()),
      ...billSources.settingsBills.map(b => b.name?.toLowerCase()),
      ...billSources.settingsRecurringItems.map(b => b.name?.toLowerCase())
    ].filter(Boolean);
    
    const nameFrequency = {};
    allBillNames.forEach(name => {
      nameFrequency[name] = (nameFrequency[name] || 0) + 1;
    });
    
    const duplicateNames = Object.entries(nameFrequency)
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1]);
    
    if (duplicateNames.length > 0) {
      console.log('   ⚠️  Potential duplicate bills (same name in multiple places):');
      duplicateNames.slice(0, 10).forEach(([name, count]) => {
        console.log(`      - "${name}": appears ${count} times`);
      });
      if (duplicateNames.length > 10) {
        console.log(`      ... and ${duplicateNames.length - 10} more`);
      }
    }
    
    const uniqueBillNames = new Set(allBillNames).size;
    const redundancyRate = totalBillRecords > 0 ? 
      Math.round((1 - uniqueBillNames / totalBillRecords) * 100) : 0;
    
    report.redundancy = {
      totalBillRecords,
      uniqueBillNames,
      redundancyRate: `${redundancyRate}%`,
      billSources: {
        billInstances: billSources.billInstances.length,
        paidBills: billSources.paidBills.length,
        bill_payments: billSources.bill_payments.length,
        settingsBills: billSources.settingsBills.length,
        settingsRecurringItems: billSources.settingsRecurringItems.length
      },
      duplicates: duplicateNames
    };
    
    console.log('');
    console.log(`   📊 Total bill records: ${totalBillRecords}`);
    console.log(`   📊 Unique bill names: ${uniqueBillNames}`);
    console.log(`   📊 Estimated redundancy: ${redundancyRate}%`);
    console.log('');

    // ============================================
    // SECTION 4: Settings document analysis
    // ============================================
    console.log('📁 SECTION 4: SETTINGS DOCUMENT ANALYSIS');
    console.log('─'.repeat(50));
    
    if (settingsDoc.exists) {
      const settingsData = settingsDoc.data();
      const settingsSize = calculateSize(settingsData);
      
      console.log(`   📄 Settings document found`);
      console.log(`   📊 Total size: ${(settingsSize / 1024).toFixed(2)} KB`);
      console.log('');
      console.log('   Field breakdown:');
      
      const fieldSizes = {};
      for (const [key, value] of Object.entries(settingsData)) {
        const fieldSize = calculateSize(value);
        fieldSizes[key] = fieldSize;
        console.log(`      - ${key}: ${(fieldSize / 1024).toFixed(2)} KB`);
      }
      
      report.settings = {
        totalSizeBytes: settingsSize,
        totalSizeKB: (settingsSize / 1024).toFixed(2),
        fields: Object.keys(settingsData),
        fieldSizes: fieldSizes,
        billsCount: settingsData.bills?.length || 0,
        recurringItemsCount: settingsData.recurringItems?.length || 0
      };
      
      if (settingsSize > 40000) {
        console.log('');
        console.log('   ⚠️  Settings document is bloated (>40KB)!');
        console.log('   💡 Recommendation: Extract bills and recurringItems to separate collections');
      }
    } else {
      console.log('   ⚠️  No settings/personal document found');
      report.settings = { exists: false };
    }
    console.log('');

    // ============================================
    // SECTION 5: Stale pending transactions
    // ============================================
    console.log('📁 SECTION 5: STALE PENDING TRANSACTIONS');
    console.log('─'.repeat(50));
    
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    
    const transactionsSnapshot = await userRef.collection('transactions').get();
    const stalePending = [];
    
    transactionsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.pending === true) {
        const txDate = data.date ? new Date(data.date) : null;
        if (txDate && txDate < threeDaysAgo) {
          stalePending.push({
            id: doc.id,
            name: data.name || data.merchant_name,
            amount: data.amount,
            date: data.date,
            daysSincePending: Math.floor((new Date() - txDate) / (1000 * 60 * 60 * 24))
          });
        }
      }
    });
    
    console.log(`   Total transactions: ${transactionsSnapshot.size}`);
    console.log(`   Stale pending (>3 days): ${stalePending.length}`);
    
    if (stalePending.length > 0) {
      console.log('');
      console.log('   Stale pending transactions:');
      stalePending.slice(0, 10).forEach(tx => {
        console.log(`      - ${tx.name}: $${tx.amount} (${tx.daysSincePending} days ago)`);
      });
      if (stalePending.length > 10) {
        console.log(`      ... and ${stalePending.length - 10} more`);
      }
      
      const totalBalanceImpact = stalePending.reduce((sum, tx) => sum + (tx.amount || 0), 0);
      console.log('');
      console.log(`   💰 Total balance impact: $${Math.abs(totalBalanceImpact).toFixed(2)}`);
    }
    
    report.pendingTransactions = {
      total: transactionsSnapshot.size,
      stalePending: stalePending.length,
      details: stalePending
    };
    console.log('');

    // ============================================
    // SECTION 6: Test user analysis
    // ============================================
    console.log('📁 SECTION 6: TEST USER ANALYSIS');
    console.log('─'.repeat(50));
    
    const testUserRef = db.collection('users').doc(TEST_USER_ID);
    const testUserDoc = await testUserRef.get();
    
    if (testUserDoc.exists || report.testUser) {
      let testUserDocCount = testUserDoc.exists ? 1 : 0;
      
      // Count subcollections
      const testUserCollections = await testUserRef.listCollections();
      const testUserCollectionCounts = {};
      
      for (const col of testUserCollections) {
        const count = await countCollection(col);
        testUserCollectionCounts[col.id] = count;
        testUserDocCount += count;
      }
      
      console.log(`   ⚠️  Test user "${TEST_USER_ID}" exists`);
      console.log(`   📊 Total documents: ${testUserDocCount}`);
      console.log('');
      console.log('   Collections:');
      for (const [name, count] of Object.entries(testUserCollectionCounts)) {
        console.log(`      - ${name}: ${count}`);
      }
      
      report.testUser = {
        id: TEST_USER_ID,
        exists: true,
        totalDocuments: testUserDocCount,
        collections: testUserCollectionCounts
      };
      
      console.log('');
      console.log('   💡 Recommendation: Delete test user to clean up database');
    } else {
      console.log(`   ✅ No test user "${TEST_USER_ID}" found`);
      report.testUser = { id: TEST_USER_ID, exists: false };
    }
    console.log('');

    // ============================================
    // SECTION 7: Recommendations
    // ============================================
    console.log('📁 SECTION 7: RECOMMENDATIONS');
    console.log('─'.repeat(50));
    
    const recommendations = [];
    
    if (report.testUser?.exists) {
      recommendations.push({
        priority: 'HIGH',
        action: 'Delete test user',
        script: '01-cleanup-test-user.js',
        impact: `Remove ${report.testUser.totalDocuments || 0} documents`
      });
    }
    
    if (report.pendingTransactions?.stalePending > 0) {
      recommendations.push({
        priority: 'MEDIUM',
        action: 'Fix stale pending transactions',
        script: '02-fix-pending-transactions.js',
        impact: `Update ${report.pendingTransactions.stalePending} transactions`
      });
    }
    
    if (report.redundancy?.redundancyRate && parseInt(report.redundancy.redundancyRate) > 30) {
      recommendations.push({
        priority: 'HIGH',
        action: 'Consolidate bill data',
        script: '04-extract-bills-from-settings.js, 05-merge-collections.js',
        impact: `Reduce ~${report.redundancy.redundancyRate} redundancy`
      });
    }
    
    if (report.settings?.totalSizeBytes > 20000) {
      recommendations.push({
        priority: 'HIGH',
        action: 'Reduce settings document size',
        script: '04-extract-bills-from-settings.js',
        impact: `Reduce from ${report.settings.totalSizeKB}KB to ~2KB`
      });
    }
    
    recommendations.forEach((rec, i) => {
      console.log(`   ${i + 1}. [${rec.priority}] ${rec.action}`);
      console.log(`      Script: ${rec.script}`);
      console.log(`      Impact: ${rec.impact}`);
      console.log('');
    });
    
    report.recommendations = recommendations;

    // ============================================
    // SAVE REPORT
    // ============================================
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFilename = `audit-report-${timestamp}.json`;
    
    writeFileSync(reportFilename, JSON.stringify(report, null, 2));
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  📋 AUDIT COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Report saved to: ${reportFilename}`);
    console.log(`  Total documents audited: ${report.summary.totalDocuments}`);
    console.log(`  Recommendations: ${recommendations.length}`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Audit failed:', error.message);
    console.error('\nError details:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the audit
auditCurrentState();
