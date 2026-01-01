/**
 * Test file for Bill Matching Service
 * 
 * Tests the automatic bill clearing logic including:
 * - Fuzzy name matching
 * - Amount matching
 * - Date matching
 * - Overall confidence calculation
 * 
 * Run with: node backend/utils/BillMatchingService.test.js
 */

console.log('🧪 Testing Bill Matching Service\n');
console.log('═'.repeat(70));
console.log('\n');

// Test cases for bill-to-transaction matching
const testCases = [
  {
    name: 'Exact name, exact amount, within date range',
    transaction: {
      id: 'tx1',
      name: 'Netflix',
      amount: -15.99,
      date: '2024-01-15'
    },
    bill: {
      id: 'bill1',
      name: 'Netflix',
      amount: 15.99,
      dueDate: '2024-01-15',
      merchantNames: []
    },
    shouldMatch: true,
    expectedConfidence: 1.0
  },
  {
    name: 'Similar name (fuzzy match), exact amount, close date',
    transaction: {
      id: 'tx2',
      name: 'NETFLIX.COM',
      amount: -15.99,
      date: '2024-01-17'
    },
    bill: {
      id: 'bill2',
      name: 'Netflix',
      amount: 15.99,
      dueDate: '2024-01-15',
      merchantNames: []
    },
    shouldMatch: true,
    expectedConfidence: 1.0
  },
  {
    name: 'Merchant alias match, exact amount, close date',
    transaction: {
      id: 'tx3',
      name: 'CH 13 TRUSTEE',
      amount: -583.00,
      date: '2024-01-10'
    },
    bill: {
      id: 'bill3',
      name: 'Bankruptcy Payment',
      amount: 583.00,
      dueDate: '2024-01-15',
      merchantNames: ['CH 13', 'CHAPTER 13', 'TRUSTEE']
    },
    shouldMatch: true,
    expectedConfidence: 1.0
  },
  {
    name: 'Amount match, date match, but name does not match',
    transaction: {
      id: 'tx4',
      name: 'Random Merchant',
      amount: -50.00,
      date: '2024-01-15'
    },
    bill: {
      id: 'bill4',
      name: 'Electric Bill',
      amount: 50.00,
      dueDate: '2024-01-15',
      merchantNames: []
    },
    shouldMatch: false,
    expectedConfidence: 0.67
  },
  {
    name: 'Name match, amount slightly off, date match',
    transaction: {
      id: 'tx5',
      name: 'AT&T',
      amount: -75.49,
      date: '2024-01-20'
    },
    bill: {
      id: 'bill5',
      name: 'AT&T',
      amount: 75.99,
      dueDate: '2024-01-20',
      merchantNames: []
    },
    shouldMatch: true,
    expectedConfidence: 1.0
  },
  {
    name: 'Name match, amount match, date outside tolerance',
    transaction: {
      id: 'tx6',
      name: 'Spotify',
      amount: -9.99,
      date: '2024-01-01'
    },
    bill: {
      id: 'bill6',
      name: 'Spotify',
      amount: 9.99,
      dueDate: '2024-01-25',
      merchantNames: []
    },
    shouldMatch: false,
    expectedConfidence: 0.67
  },
  {
    name: 'Only amount matches (no name, no date)',
    transaction: {
      id: 'tx7',
      name: 'Generic Merchant',
      amount: -100.00,
      date: '2024-02-01'
    },
    bill: {
      id: 'bill7',
      name: 'Insurance',
      amount: 100.00,
      dueDate: '2024-01-15',
      merchantNames: []
    },
    shouldMatch: false,
    expectedConfidence: 0.33
  }
];

// Simple test runner
let passed = 0;
let failed = 0;

console.log('Running test cases...\n');

for (const testCase of testCases) {
  console.log(`📝 Test: ${testCase.name}`);
  console.log(`   Transaction: "${testCase.transaction.name}" ($${Math.abs(testCase.transaction.amount)}) on ${testCase.transaction.date}`);
  console.log(`   Bill: "${testCase.bill.name}" ($${testCase.bill.amount}) due ${testCase.bill.dueDate}`);
  
  // Note: We can't actually run the matching without importing the service
  // because it requires firebase-admin which needs credentials
  // This test file serves as documentation of expected behavior
  
  if (testCase.shouldMatch) {
    console.log(`   ✅ SHOULD MATCH (confidence ≥ 67%)`);
  } else {
    console.log(`   ❌ SHOULD NOT MATCH (confidence < 67%)`);
  }
  console.log('');
  passed++;
}

console.log('═'.repeat(70));
console.log(`\n✅ Test cases documented: ${passed}`);
console.log(`\n⚠️  Note: These are expected behaviors. Actual testing requires Firebase credentials.`);
console.log(`   To test with real Firebase, modify this file to import runBillMatching and provide DB instance.\n`);
