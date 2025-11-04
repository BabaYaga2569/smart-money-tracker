// BillPaymentMatcher.test.js - Tests for bill payment matching logic

import { 
  isNameMatch, 
  isAmountMatch, 
  isDateMatch,
  matchTransactionToBill,
  matchTransactionsToBills
} from './BillPaymentMatcher.js';

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

// Run tests
const runBillPaymentMatcherTests = () => {
  console.log('🧪 Testing BillPaymentMatcher...\n');

  // Name Matching Tests
  test('isNameMatch: exact match', () => {
    const result = isNameMatch('Netflix', 'Netflix');
    assert(result === true, `Expected true, got ${result}`);
  });

  test('isNameMatch: case insensitive', () => {
    const result = isNameMatch('GOOGLE*ONE', 'Google One');
    assert(result === true, `Expected true, got ${result}`);
  });

  test('isNameMatch: significant word match', () => {
    const result = isNameMatch('NETFLIX SUBSCRIPTION', 'Netflix');
    assert(result === true, `Expected true, got ${result}`);
  });

  test('isNameMatch: fuzzy match with special chars', () => {
    const result = isNameMatch('GOOGLE*STORAGE', 'Google Storage');
    assert(result === true, `Expected true, got ${result}`);
  });

  test('isNameMatch: no match for different names', () => {
    const result = isNameMatch('Netflix', 'Amazon Prime');
    assert(result === false, `Expected false, got ${result}`);
  });

  // Amount Matching Tests
  test('isAmountMatch: exact match', () => {
    const result = isAmountMatch(571.32, 571.32);
    assert(result === true, `Expected true, got ${result}`);
  });

  test('isAmountMatch: within tolerance', () => {
    const result = isAmountMatch(571.32, 571.50, 0.50);
    assert(result === true, `Expected true, got ${result}`);
  });

  test('isAmountMatch: beyond tolerance', () => {
    const result = isAmountMatch(571.32, 572.00, 0.50);
    assert(result === false, `Expected false, got ${result}`);
  });

  test('isAmountMatch: handles negative amounts', () => {
    const result = isAmountMatch(-571.32, 571.32);
    assert(result === true, `Expected true for absolute values, got ${result}`);
  });

  // Date Matching Tests
  test('isDateMatch: exact date', () => {
    const result = isDateMatch('2024-11-01', '2024-11-01');
    assert(result === true, `Expected true, got ${result}`);
  });

  test('isDateMatch: within 7 days tolerance', () => {
    const result = isDateMatch('2024-11-01', '2024-11-05', 7);
    assert(result === true, `Expected true, got ${result}`);
  });

  test('isDateMatch: beyond tolerance', () => {
    const result = isDateMatch('2024-11-01', '2024-11-10', 7);
    assert(result === false, `Expected false, got ${result}`);
  });

  test('isDateMatch: works with Date objects', () => {
    const result = isDateMatch(new Date('2024-11-01'), new Date('2024-11-03'), 7);
    assert(result === true, `Expected true, got ${result}`);
  });

  // Transaction to Bill Matching Tests
  test('matchTransactionToBill: perfect match (all 3 criteria)', () => {
    const transaction = {
      id: 'tx1',
      name: 'GOOGLE*ONE',
      amount: -19.99,
      date: '2024-11-01',
      pending: false
    };
    
    const bill = {
      id: 'bill1',
      name: 'Google One',
      amount: 19.99,
      dueDate: '2024-11-01'
    };
    
    const result = matchTransactionToBill(transaction, bill);
    assert(result !== null, 'Expected a match');
    assert(result.confidence === 1, `Expected confidence 1, got ${result.confidence}`);
  });

  test('matchTransactionToBill: all 3 criteria match', () => {
    const transaction = {
      id: 'tx1',
      name: 'NETFLIX',
      amount: -15.49,
      date: '2024-11-06', // 5 days after due date (within 7-day tolerance)
      pending: false
    };
    
    const bill = {
      id: 'bill1',
      name: 'Netflix',
      amount: 15.49,
      dueDate: '2024-11-01'
    };
    
    const result = matchTransactionToBill(transaction, bill);
    // Should match because all 3 criteria match (name, amount, date)
    assert(result !== null, 'Expected a match with all 3 criteria');
    assert(result.confidence === 1, `Expected confidence 1, got ${result.confidence}`);
  });

  test('matchTransactionToBill: 2 of 3 criteria (amount + date, no name)', () => {
    const transaction = {
      id: 'tx1',
      name: 'MERCHANT ABC',  // Different name
      amount: -15.49,
      date: '2024-11-01',
      pending: false
    };
    
    const bill = {
      id: 'bill1',
      name: 'Netflix',
      amount: 15.49,
      dueDate: '2024-11-01'
    };
    
    const result = matchTransactionToBill(transaction, bill);
    // Should match because amount and date match (2/3 = 67%)
    assert(result !== null, 'Expected a match with 2 of 3 criteria');
    assert(result.confidence > 0.65, `Expected confidence > 0.65, got ${result.confidence}`);
    assert(result.matches.amount === true, 'Expected amount match');
    assert(result.matches.date === true, 'Expected date match');
    assert(result.matches.name === false, 'Expected no name match');
  });

  test('matchTransactionToBill: skips pending transactions', () => {
    const transaction = {
      id: 'tx1',
      name: 'Netflix',
      amount: -15.49,
      date: '2024-11-01',
      pending: true
    };
    
    const bill = {
      id: 'bill1',
      name: 'Netflix',
      amount: 15.49,
      dueDate: '2024-11-01'
    };
    
    const result = matchTransactionToBill(transaction, bill);
    assert(result === null, 'Expected no match for pending transaction');
  });

  test('matchTransactionToBill: skips positive amounts (deposits)', () => {
    const transaction = {
      id: 'tx1',
      name: 'Netflix',
      amount: 15.49, // Positive = deposit
      date: '2024-11-01',
      pending: false
    };
    
    const bill = {
      id: 'bill1',
      name: 'Netflix',
      amount: 15.49,
      dueDate: '2024-11-01'
    };
    
    const result = matchTransactionToBill(transaction, bill);
    assert(result === null, 'Expected no match for positive transaction');
  });

  test('matchTransactionToBill: insufficient match (only 1 criterion)', () => {
    const transaction = {
      id: 'tx1',
      name: 'RANDOM MERCHANT',
      amount: -100.00,
      date: '2024-12-01',
      pending: false
    };
    
    const bill = {
      id: 'bill1',
      name: 'Netflix',
      amount: 15.49,
      dueDate: '2024-11-01'
    };
    
    const result = matchTransactionToBill(transaction, bill);
    assert(result === null, 'Expected no match with only 1 criterion');
  });

  // Batch Matching Tests
  test('matchTransactionsToBills: matches multiple bills', () => {
    const transactions = [
      { id: 'tx1', name: 'NETFLIX', amount: -15.49, date: '2024-11-01', pending: false },
      { id: 'tx2', name: 'GOOGLE*ONE', amount: -19.99, date: '2024-11-05', pending: false }
    ];
    
    const bills = [
      { id: 'bill1', name: 'Netflix', amount: 15.49, dueDate: '2024-11-01', isPaid: false },
      { id: 'bill2', name: 'Google One', amount: 19.99, dueDate: '2024-11-05', isPaid: false }
    ];
    
    const results = matchTransactionsToBills(transactions, bills);
    assert(results.length === 2, `Expected 2 matches, got ${results.length}`);
  });

  test('matchTransactionsToBills: skips already paid bills', () => {
    const transactions = [
      { id: 'tx1', name: 'NETFLIX', amount: -15.49, date: '2024-11-01', pending: false }
    ];
    
    const bills = [
      { id: 'bill1', name: 'Netflix', amount: 15.49, dueDate: '2024-11-01', isPaid: true }
    ];
    
    const results = matchTransactionsToBills(transactions, bills);
    assert(results.length === 0, `Expected 0 matches, got ${results.length}`);
  });

  test('matchTransactionsToBills: avoids duplicate matches', () => {
    const transactions = [
      { id: 'tx1', name: 'NETFLIX', amount: -15.49, date: '2024-11-01', pending: false }
    ];
    
    const bills = [
      { id: 'bill1', name: 'Netflix', amount: 15.49, dueDate: '2024-11-01', isPaid: false },
      { id: 'bill2', name: 'Netflix', amount: 15.49, dueDate: '2024-11-02', isPaid: false }
    ];
    
    const results = matchTransactionsToBills(transactions, bills);
    // Should only match once (best match)
    assert(results.length === 1, `Expected 1 match, got ${results.length}`);
  });

  test('matchTransactionsToBills: picks best match for each bill', () => {
    const transactions = [
      { id: 'tx1', name: 'STORE', amount: -100.00, date: '2024-11-01', pending: false }
    ];
    
    const bills = [
      { id: 'bill1', name: 'Store Payment', amount: 100.00, dueDate: '2024-12-01', isPaid: false },
      { id: 'bill2', name: 'Store Payment', amount: 100.00, dueDate: '2024-11-01', isPaid: false }
    ];
    
    const results = matchTransactionsToBills(transactions, bills);
    // Should match one bill (the one with matching date gets picked first)
    assert(results.length === 1, `Expected 1 match, got ${results.length}`);
    // The matched bill should have confidence >= 2/3
    assert(results[0].confidence > 0.65, `Expected confidence > 0.65, got ${results[0].confidence}`);
  });

  console.log('\n✅ All BillPaymentMatcher tests passed!');
};

// Run tests if executed directly (Node.js)
if (typeof process !== 'undefined' && process.argv && import.meta.url.endsWith(process.argv[1])) {
  runBillPaymentMatcherTests();
}

export { runBillPaymentMatcherTests };
