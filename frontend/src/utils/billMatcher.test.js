// billMatcher.test.js - Tests for bill matcher date tolerance
import { findMatchingTransactionForBill } from './billMatcher.js';

// Simple test assertion helper
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

export const runBillMatcherTests = () => {
  console.log('🧪 Testing Bill Matcher Date Tolerance\n');

  let passedTests = 0;
  let totalTests = 0;

  // Test 1: Transaction within 3 days (should match - old behavior)
  totalTests++;
  if (test('Match transaction 3 days after due date', () => {
    const bill = {
      name: 'Test Bill',
      amount: 100.00,
      nextDueDate: '2025-11-05'
    };
    const transactions = [
      {
        name: 'Test Bill',
        amount: 100.00,
        date: '2025-11-08', // 3 days after
        pending: false
      }
    ];
    const result = findMatchingTransactionForBill(bill, transactions);
    assert(result !== null, 'Transaction 3 days after should match');
  })) passedTests++;

  // Test 2: Transaction 4 days after due date (should match with 10-day tolerance)
  totalTests++;
  if (test('Match transaction 4 days after due date (new behavior)', () => {
    const bill = {
      name: 'Affirm Dog Water Bowl',
      amount: 50.00,
      nextDueDate: '2025-11-05'
    };
    const transactions = [
      {
        name: 'Affirm',
        amount: 50.00,
        date: '2025-11-09', // 4 days after
        pending: false
      }
    ];
    const result = findMatchingTransactionForBill(bill, transactions);
    assert(result !== null, 'Transaction 4 days after should match with 10-day window');
  })) passedTests++;

  // Test 3: Transaction 7 days after due date (should match)
  totalTests++;
  if (test('Match transaction 7 days after due date', () => {
    const bill = {
      name: 'Phone Bill',
      amount: 65.00,
      nextDueDate: '2025-11-05'
    };
    const transactions = [
      {
        name: 'Phone Bill',
        amount: 65.00,
        date: '2025-11-12', // 7 days after
        pending: false
      }
    ];
    const result = findMatchingTransactionForBill(bill, transactions);
    assert(result !== null, 'Transaction 7 days after should match');
  })) passedTests++;

  // Test 4: Transaction 10 days after due date (should match - edge case)
  totalTests++;
  if (test('Match transaction 10 days after due date (edge case)', () => {
    const bill = {
      name: 'Electric Bill',
      amount: 125.50,
      nextDueDate: '2025-11-05'
    };
    const transactions = [
      {
        name: 'Electric Bill',
        amount: 125.50,
        date: '2025-11-15', // 10 days after
        pending: false
      }
    ];
    const result = findMatchingTransactionForBill(bill, transactions);
    assert(result !== null, 'Transaction 10 days after should match');
  })) passedTests++;

  // Test 5: Transaction 11 days after due date (should NOT match)
  totalTests++;
  if (test('Do not match transaction 11 days after due date', () => {
    const bill = {
      name: 'Netflix',
      amount: 15.99,
      nextDueDate: '2025-11-05'
    };
    const transactions = [
      {
        name: 'Netflix',
        amount: 15.99,
        date: '2025-11-16', // 11 days after
        pending: false
      }
    ];
    const result = findMatchingTransactionForBill(bill, transactions);
    assert(result === null, 'Transaction 11 days after should NOT match');
  })) passedTests++;

  // Test 6: Transaction 8 days before due date (should match)
  totalTests++;
  if (test('Match transaction 8 days before due date (early payment)', () => {
    const bill = {
      name: 'Rent',
      amount: 1500.00,
      nextDueDate: '2025-11-15'
    };
    const transactions = [
      {
        name: 'Rent Payment',
        amount: 1500.00,
        date: '2025-11-07', // 8 days before
        pending: false
      }
    ];
    const result = findMatchingTransactionForBill(bill, transactions);
    assert(result !== null, 'Transaction 8 days before should match');
  })) passedTests++;

  // Test 7: Transaction 10 days before due date (should match - edge case)
  totalTests++;
  if (test('Match transaction 10 days before due date (edge case)', () => {
    const bill = {
      name: 'Insurance',
      amount: 200.00,
      nextDueDate: '2025-11-15'
    };
    const transactions = [
      {
        name: 'Insurance',
        amount: 200.00,
        date: '2025-11-05', // 10 days before
        pending: false
      }
    ];
    const result = findMatchingTransactionForBill(bill, transactions);
    assert(result !== null, 'Transaction 10 days before should match');
  })) passedTests++;

  // Test 8: Transaction 11 days before due date (should NOT match)
  totalTests++;
  if (test('Do not match transaction 11 days before due date', () => {
    const bill = {
      name: 'Cable Bill',
      amount: 89.99,
      nextDueDate: '2025-11-15'
    };
    const transactions = [
      {
        name: 'Cable Bill',
        amount: 89.99,
        date: '2025-11-04', // 11 days before
        pending: false
      }
    ];
    const result = findMatchingTransactionForBill(bill, transactions);
    assert(result === null, 'Transaction 11 days before should NOT match');
  })) passedTests++;

  // Test 9: Pending transaction should be filtered out
  totalTests++;
  if (test('Filter out pending transactions', () => {
    const bill = {
      name: 'Spotify',
      amount: 9.99,
      nextDueDate: '2025-11-05'
    };
    const transactions = [
      {
        name: 'Spotify',
        amount: 9.99,
        date: '2025-11-05',
        pending: true // Should be filtered out
      }
    ];
    const result = findMatchingTransactionForBill(bill, transactions);
    assert(result === null, 'Pending transactions should be filtered out');
  })) passedTests++;

  // Test 10: Amount difference too large (should NOT match)
  totalTests++;
  if (test('Do not match when amount difference > $2', () => {
    const bill = {
      name: 'Water Bill',
      amount: 50.00,
      nextDueDate: '2025-11-05'
    };
    const transactions = [
      {
        name: 'Water Bill',
        amount: 53.00, // $3 difference
        date: '2025-11-05',
        pending: false
      }
    ];
    const result = findMatchingTransactionForBill(bill, transactions);
    assert(result === null, 'Transaction with amount difference > $2 should NOT match');
  })) passedTests++;

  // Summary
  console.log(`\n📊 Bill Matcher Tests Complete: ${passedTests}/${totalTests} passed`);
  
  if (passedTests === totalTests) {
    console.log('✨ All tests passed! Bill matcher is working correctly.\n');
  } else {
    console.log(`⚠️  ${totalTests - passedTests} test(s) failed.\n`);
  }

  return { passedTests, totalTests };
};

// Auto-run if executed directly
if (typeof window === 'undefined') {
  runBillMatcherTests();
}
