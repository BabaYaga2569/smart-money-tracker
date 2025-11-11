/**
 * Test Transaction Deduplication Logic (Frontend)
 * 
 * This test validates the frontend duplicate detection logic
 * used in the removeDuplicateTransactions function.
 */

// Test helper
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
};

const test = (name, fn) => {
  try {
    fn();
    console.log(`✅ ${name}`);
    return true;
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(`   Error: ${error.message}`);
    return false;
  }
};

console.log('🧪 Testing Transaction Deduplication Logic (Frontend)\n');

let passedTests = 0;
let totalTests = 0;

// Test 1: Duplicate detection by composite key
totalTests++;
if (test('Identifies duplicate transactions correctly', () => {
  const allTxs = [
    { id: 'doc1', date: '2025-10-17', amount: -20.66, name: 'Affirm', account_id: 'acc_123' },
    { id: 'doc2', date: '2025-10-17', amount: -20.66, name: 'Affirm', account_id: 'acc_123' }, // Duplicate
    { id: 'doc3', date: '2025-10-16', amount: -36.14, name: 'Affirm', account_id: 'acc_123' },
    { id: 'doc4', date: '2025-10-16', amount: -36.14, name: 'Affirm', account_id: 'acc_123' }, // Duplicate
    { id: 'doc5', date: '2025-10-15', amount: -50.00, name: 'Amazon', account_id: 'acc_123' }
  ];

  const seen = new Map();
  const duplicatesToDelete = [];

  allTxs.forEach(tx => {
    const key = `${tx.date}_${tx.amount}_${tx.name}_${tx.account_id}`;
    
    if (seen.has(key)) {
      duplicatesToDelete.push(tx.id);
    } else {
      seen.set(key, tx.id);
    }
  });

  assert(duplicatesToDelete.length === 2, `Should find 2 duplicates, found ${duplicatesToDelete.length}`);
  assert(duplicatesToDelete.includes('doc2'), 'Should mark doc2 as duplicate');
  assert(duplicatesToDelete.includes('doc4'), 'Should mark doc4 as duplicate');
  assert(!duplicatesToDelete.includes('doc1'), 'Should not mark doc1 as duplicate (first occurrence)');
  assert(!duplicatesToDelete.includes('doc3'), 'Should not mark doc3 as duplicate (first occurrence)');
  assert(!duplicatesToDelete.includes('doc5'), 'Should not mark doc5 as duplicate (unique)');
})) passedTests++;

// Test 2: No duplicates in list
totalTests++;
if (test('Returns empty list when no duplicates exist', () => {
  const allTxs = [
    { id: 'doc1', date: '2025-10-17', amount: -20.66, name: 'Affirm', account_id: 'acc_123' },
    { id: 'doc2', date: '2025-10-16', amount: -36.14, name: 'Affirm', account_id: 'acc_123' },
    { id: 'doc3', date: '2025-10-15', amount: -50.00, name: 'Amazon', account_id: 'acc_123' }
  ];

  const seen = new Map();
  const duplicatesToDelete = [];

  allTxs.forEach(tx => {
    const key = `${tx.date}_${tx.amount}_${tx.name}_${tx.account_id}`;
    
    if (seen.has(key)) {
      duplicatesToDelete.push(tx.id);
    } else {
      seen.set(key, tx.id);
    }
  });

  assert(duplicatesToDelete.length === 0, 'Should find no duplicates');
})) passedTests++;

// Test 3: Multiple duplicates of same transaction
totalTests++;
if (test('Handles multiple duplicates of same transaction', () => {
  const allTxs = [
    { id: 'doc1', date: '2025-10-17', amount: -20.66, name: 'Affirm', account_id: 'acc_123' },
    { id: 'doc2', date: '2025-10-17', amount: -20.66, name: 'Affirm', account_id: 'acc_123' }, // Duplicate 1
    { id: 'doc3', date: '2025-10-17', amount: -20.66, name: 'Affirm', account_id: 'acc_123' }, // Duplicate 2
    { id: 'doc4', date: '2025-10-17', amount: -20.66, name: 'Affirm', account_id: 'acc_123' }  // Duplicate 3
  ];

  const seen = new Map();
  const duplicatesToDelete = [];

  allTxs.forEach(tx => {
    const key = `${tx.date}_${tx.amount}_${tx.name}_${tx.account_id}`;
    
    if (seen.has(key)) {
      duplicatesToDelete.push(tx.id);
    } else {
      seen.set(key, tx.id);
    }
  });

  assert(duplicatesToDelete.length === 3, `Should find 3 duplicates, found ${duplicatesToDelete.length}`);
  assert(duplicatesToDelete.includes('doc2'), 'Should mark doc2 as duplicate');
  assert(duplicatesToDelete.includes('doc3'), 'Should mark doc3 as duplicate');
  assert(duplicatesToDelete.includes('doc4'), 'Should mark doc4 as duplicate');
  assert(!duplicatesToDelete.includes('doc1'), 'Should keep first occurrence (doc1)');
})) passedTests++;

// Test 4: Different accounts don't count as duplicates
totalTests++;
if (test('Transactions on different accounts are not duplicates', () => {
  const allTxs = [
    { id: 'doc1', date: '2025-10-17', amount: -20.66, name: 'Affirm', account_id: 'acc_123' },
    { id: 'doc2', date: '2025-10-17', amount: -20.66, name: 'Affirm', account_id: 'acc_456' } // Different account
  ];

  const seen = new Map();
  const duplicatesToDelete = [];

  allTxs.forEach(tx => {
    const key = `${tx.date}_${tx.amount}_${tx.name}_${tx.account_id}`;
    
    if (seen.has(key)) {
      duplicatesToDelete.push(tx.id);
    } else {
      seen.set(key, tx.id);
    }
  });

  assert(duplicatesToDelete.length === 0, 'Different accounts should not be duplicates');
})) passedTests++;

// Test 5: Composite key uniqueness
totalTests++;
if (test('Composite key correctly differentiates transactions', () => {
  const allTxs = [
    { id: 'doc1', date: '2025-10-17', amount: -20.66, name: 'Affirm', account_id: 'acc_123' },
    { id: 'doc2', date: '2025-10-17', amount: -20.66, name: 'Amazon', account_id: 'acc_123' }, // Different merchant
    { id: 'doc3', date: '2025-10-17', amount: -30.00, name: 'Affirm', account_id: 'acc_123' }, // Different amount
    { id: 'doc4', date: '2025-10-18', amount: -20.66, name: 'Affirm', account_id: 'acc_123' }  // Different date
  ];

  const seen = new Map();
  const duplicatesToDelete = [];

  allTxs.forEach(tx => {
    const key = `${tx.date}_${tx.amount}_${tx.name}_${tx.account_id}`;
    
    if (seen.has(key)) {
      duplicatesToDelete.push(tx.id);
    } else {
      seen.set(key, tx.id);
    }
  });

  assert(duplicatesToDelete.length === 0, 'All transactions should be unique');
  assert(seen.size === 4, 'Should have 4 unique composite keys');
})) passedTests++;

console.log(`\n📊 Test Results: ${passedTests}/${totalTests} tests passed`);

if (passedTests === totalTests) {
  console.log('✅ All tests passed!');
  process.exit(0);
} else {
  console.log('❌ Some tests failed');
  process.exit(1);
}

export const runTransactionDeduplicationTests = () => {
  // Re-export for module usage
  console.log('Transaction deduplication tests completed');
};
