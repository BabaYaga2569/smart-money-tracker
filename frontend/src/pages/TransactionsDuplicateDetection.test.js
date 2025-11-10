// TransactionsDuplicateDetection.test.js - Tests for duplicate detection logic
// This test verifies that the duplicate detection normalization functions work correctly

// Simple assertion helper
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
};

// Test helper function
const test = (name, fn) => {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(error.message);
    process.exit(1);
  }
};

// Helper function to normalize merchant name (same as in Transactions.jsx)
const normalizeName = (tx) => {
  const name = tx.name || tx.merchant_name || '';
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
};

// Helper function to normalize amount (same as in Transactions.jsx)
const normalizeAmount = (amount) => {
  return parseFloat(amount || 0).toFixed(2);
};

// Run tests
const runDuplicateDetectionTests = () => {
  console.log('🧪 Testing Duplicate Detection Normalization...\n');

  // Name Normalization Tests
  test('normalizeName: handles case differences', () => {
    const tx1 = { name: 'Affirm' };
    const tx2 = { name: 'AFFIRM' };
    const tx3 = { name: 'affirm' };
    
    const result1 = normalizeName(tx1);
    const result2 = normalizeName(tx2);
    const result3 = normalizeName(tx3);
    
    assert(result1 === result2 && result2 === result3, 
      `Expected all to match, got: '${result1}', '${result2}', '${result3}'`);
  });

  test('normalizeName: removes special characters', () => {
    const tx1 = { name: 'Affirm, Inc.' };
    const tx2 = { name: 'Affirm Inc' };
    const tx3 = { name: 'AffirmInc' };
    
    const result1 = normalizeName(tx1);
    const result2 = normalizeName(tx2);
    const result3 = normalizeName(tx3);
    
    assert(result1 === result2 && result2 === result3, 
      `Expected all to match, got: '${result1}', '${result2}', '${result3}'`);
  });

  test('normalizeName: removes whitespace', () => {
    const tx1 = { name: '  Affirm  ' };
    const tx2 = { name: 'Affirm' };
    
    const result1 = normalizeName(tx1);
    const result2 = normalizeName(tx2);
    
    assert(result1 === result2, 
      `Expected match, got: '${result1}', '${result2}'`);
  });

  test('normalizeName: falls back to merchant_name', () => {
    const tx = { merchant_name: 'Affirm' };
    
    const result = normalizeName(tx);
    
    assert(result === 'affirm', 
      `Expected 'affirm', got '${result}'`);
  });

  test('normalizeName: handles missing name', () => {
    const tx = {};
    
    const result = normalizeName(tx);
    
    assert(result === '', 
      `Expected empty string, got '${result}'`);
  });

  // Amount Normalization Tests
  test('normalizeAmount: handles trailing decimals', () => {
    const result1 = normalizeAmount(-20.66);
    const result2 = normalizeAmount(-20.660000);
    
    assert(result1 === result2, 
      `Expected match, got: '${result1}', '${result2}'`);
  });

  test('normalizeAmount: handles string amounts', () => {
    const result1 = normalizeAmount('-20.66');
    const result2 = normalizeAmount(-20.66);
    
    assert(result1 === result2, 
      `Expected match, got: '${result1}', '${result2}'`);
  });

  test('normalizeAmount: handles missing decimals', () => {
    const result1 = normalizeAmount(-20);
    const result2 = normalizeAmount(-20.00);
    
    assert(result1 === result2, 
      `Expected match, got: '${result1}', '${result2}'`);
  });

  test('normalizeAmount: rounds to 2 decimal places', () => {
    const result = normalizeAmount(-20.666);
    
    assert(result === '-20.67', 
      `Expected '-20.67', got '${result}'`);
  });

  test('normalizeAmount: handles undefined/null', () => {
    const result = normalizeAmount(null);
    
    assert(result === '0.00', 
      `Expected '0.00', got '${result}'`);
  });

  // Composite Key Tests
  test('composite key: identifies duplicates correctly', () => {
    const tx1 = {
      name: 'Affirm',
      amount: -20.66,
      date: '2025-10-17',
      account_id: 'acct123'
    };
    
    const tx2 = {
      name: 'AFFIRM',
      amount: -20.660000,
      date: '2025-10-17',
      account_id: 'acct123'
    };
    
    const key1 = `${tx1.date}_${normalizeAmount(tx1.amount)}_${normalizeName(tx1)}_${tx1.account_id}`;
    const key2 = `${tx2.date}_${normalizeAmount(tx2.amount)}_${normalizeName(tx2)}_${tx2.account_id}`;
    
    assert(key1 === key2, 
      `Expected matching keys, got: '${key1}', '${key2}'`);
  });

  test('composite key: distinguishes different transactions', () => {
    const tx1 = {
      name: 'Affirm',
      amount: -20.66,
      date: '2025-10-17',
      account_id: 'acct123'
    };
    
    const tx2 = {
      name: 'Affirm',
      amount: -36.14,  // Different amount
      date: '2025-10-17',
      account_id: 'acct123'
    };
    
    const key1 = `${tx1.date}_${normalizeAmount(tx1.amount)}_${normalizeName(tx1)}_${tx1.account_id}`;
    const key2 = `${tx2.date}_${normalizeAmount(tx2.amount)}_${normalizeName(tx2)}_${tx2.account_id}`;
    
    assert(key1 !== key2, 
      `Expected different keys, got: '${key1}', '${key2}'`);
  });

  console.log('\n✅ All Duplicate Detection tests passed!');
};

// Run tests if executed directly (Node.js)
if (typeof process !== 'undefined' && process.argv) {
  runDuplicateDetectionTests();
}

export { runDuplicateDetectionTests };
