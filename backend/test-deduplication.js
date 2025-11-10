/**
 * Test Transaction Deduplication Logic
 * 
 * This test validates the deduplication logic added to prevent
 * duplicate transactions from being saved to Firebase.
 */

// Helper function to normalize strings (same as in server.js)
function normalizeString(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

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

console.log('🧪 Testing Transaction Deduplication Logic\n');

let passedTests = 0;
let totalTests = 0;

// Test 1: normalizeString function
totalTests++;
if (test('normalizeString removes special characters and converts to lowercase', () => {
  assert(normalizeString('Affirm') === 'affirm', 'Basic normalization failed');
  assert(normalizeString('AFFIRM') === 'affirm', 'Uppercase normalization failed');
  assert(normalizeString('A-f-f-i-r-m') === 'affirm', 'Special character removal failed');
  assert(normalizeString('Affirm!@#$%') === 'affirm', 'Special character removal failed');
  assert(normalizeString('  Affirm  ') === 'affirm', 'Whitespace trimming failed');
  assert(normalizeString('') === '', 'Empty string failed');
  assert(normalizeString(null) === '', 'Null handling failed');
})) passedTests++;

// Test 2: Duplicate detection by composite key
totalTests++;
if (test('Duplicate detection by composite key (date+amount+merchant+account)', () => {
  const existingTransactions = [
    {
      transaction_id: 'tx_001',
      date: '2025-10-17',
      amount: -20.66,
      name: 'Affirm',
      account_id: 'acc_123'
    },
    {
      transaction_id: 'tx_002',
      date: '2025-10-16',
      amount: -36.14,
      name: 'Affirm',
      account_id: 'acc_123'
    }
  ];

  // Test 1: Exact duplicate should be detected
  const duplicate1 = {
    transaction_id: 'tx_003',
    date: '2025-10-17',
    amount: 20.66, // Note: Plaid amount is positive (sign flipped in real code)
    name: 'Affirm',
    account_id: 'acc_123'
  };

  const foundDuplicate1 = existingTransactions.find(existing =>
    existing.date === duplicate1.date &&
    Math.abs(existing.amount - (-duplicate1.amount)) < 0.01 &&
    existing.account_id === duplicate1.account_id &&
    normalizeString(existing.name) === normalizeString(duplicate1.name)
  );

  assert(foundDuplicate1 !== undefined, 'Exact duplicate should be detected');
  assert(foundDuplicate1.transaction_id === 'tx_001', 'Wrong duplicate detected');

  // Test 2: Different amount should not be detected as duplicate
  const notDuplicate1 = {
    transaction_id: 'tx_004',
    date: '2025-10-17',
    amount: 25.00,
    name: 'Affirm',
    account_id: 'acc_123'
  };

  const foundDuplicate2 = existingTransactions.find(existing =>
    existing.date === notDuplicate1.date &&
    Math.abs(existing.amount - (-notDuplicate1.amount)) < 0.01 &&
    existing.account_id === notDuplicate1.account_id &&
    normalizeString(existing.name) === normalizeString(notDuplicate1.name)
  );

  assert(foundDuplicate2 === undefined, 'Different amount should not be duplicate');

  // Test 3: Different date should not be detected as duplicate
  const notDuplicate2 = {
    transaction_id: 'tx_005',
    date: '2025-10-18',
    amount: 20.66,
    name: 'Affirm',
    account_id: 'acc_123'
  };

  const foundDuplicate3 = existingTransactions.find(existing =>
    existing.date === notDuplicate2.date &&
    Math.abs(existing.amount - (-notDuplicate2.amount)) < 0.01 &&
    existing.account_id === notDuplicate2.account_id &&
    normalizeString(existing.name) === normalizeString(notDuplicate2.name)
  );

  assert(foundDuplicate3 === undefined, 'Different date should not be duplicate');

  // Test 4: Case-insensitive merchant name matching
  const duplicate2 = {
    transaction_id: 'tx_006',
    date: '2025-10-17',
    amount: 20.66,
    name: 'AFFIRM',
    account_id: 'acc_123'
  };

  const foundDuplicate4 = existingTransactions.find(existing =>
    existing.date === duplicate2.date &&
    Math.abs(existing.amount - (-duplicate2.amount)) < 0.01 &&
    existing.account_id === duplicate2.account_id &&
    normalizeString(existing.name) === normalizeString(duplicate2.name)
  );

  assert(foundDuplicate4 !== undefined, 'Case-insensitive duplicate should be detected');

  // Test 5: Merchant name with special characters
  const duplicate3 = {
    transaction_id: 'tx_007',
    date: '2025-10-17',
    amount: 20.66,
    name: 'A-f-f-i-r-m!',
    account_id: 'acc_123'
  };

  const foundDuplicate5 = existingTransactions.find(existing =>
    existing.date === duplicate3.date &&
    Math.abs(existing.amount - (-duplicate3.amount)) < 0.01 &&
    existing.account_id === duplicate3.account_id &&
    normalizeString(existing.name) === normalizeString(duplicate3.name)
  );

  assert(foundDuplicate5 !== undefined, 'Special character duplicate should be detected');
})) passedTests++;

// Test 3: Batch duplicate detection
totalTests++;
if (test('Batch duplicate detection using Set', () => {
  const processedInBatch = new Set();

  const transaction1 = { transaction_id: 'tx_100' };
  const transaction2 = { transaction_id: 'tx_101' };
  const transaction3 = { transaction_id: 'tx_100' }; // Duplicate of tx_100

  // First transaction should be allowed
  assert(!processedInBatch.has(transaction1.transaction_id), 'First tx should not be in batch');
  processedInBatch.add(transaction1.transaction_id);
  assert(processedInBatch.has(transaction1.transaction_id), 'First tx should be added to batch');

  // Second transaction should be allowed
  assert(!processedInBatch.has(transaction2.transaction_id), 'Second tx should not be in batch');
  processedInBatch.add(transaction2.transaction_id);
  assert(processedInBatch.has(transaction2.transaction_id), 'Second tx should be added to batch');

  // Third transaction (duplicate) should be detected
  assert(processedInBatch.has(transaction3.transaction_id), 'Duplicate should be detected in batch');
})) passedTests++;

// Test 4: Amount comparison with floating point tolerance
totalTests++;
if (test('Amount comparison handles floating point precision', () => {
  const amount1 = -20.66;
  const amount2 = 20.66;
  const amount3 = 20.6600001; // Slightly different due to floating point

  assert(Math.abs(amount1 - (-amount2)) < 0.01, 'Exact match should pass');
  assert(Math.abs(amount1 - (-amount3)) < 0.01, 'Close match should pass with tolerance');
  
  const amount4 = 20.67;
  assert(!(Math.abs(amount1 - (-amount4)) < 0.01), 'Different amount should fail');
})) passedTests++;

console.log(`\n📊 Test Results: ${passedTests}/${totalTests} tests passed`);

if (passedTests === totalTests) {
  console.log('✅ All tests passed!');
  process.exit(0);
} else {
  console.log('❌ Some tests failed');
  process.exit(1);
}
