// TransactionsCSVExport.test.js - Tests for CSV export functionality
// This test verifies that the CSV export properly maps transaction fields

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

// Simulate the CSV export logic (extracted from Transactions.jsx)
const generateCSVData = (transactions, accounts) => {
  return transactions.map(tx => {
    // Find account name from account_id
    const account = accounts[tx.account_id] || accounts[tx.account];
    
    // Determine type from amount (negative = expense, positive = income)
    const type = tx.amount < 0 ? 'Expense' : 'Income';
    
    // Get name from multiple possible fields
    const description = tx.name || tx.merchant_name || tx.description || 'Unknown';
    
    return {
      Date: tx.date || '',
      Description: description,
      Category: tx.category || tx.personal_finance_category?.primary || 'Uncategorized',
      Account: account?.name || account?.official_name || 'Unknown Account',
      Amount: tx.amount || 0,
      Type: type,
      Notes: tx.notes || '',
      Pending: tx.pending ? 'Yes' : 'No'
    };
  });
};

// Helper to escape CSV values
const escapeCSVValue = (value) => {
  if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

// Run tests
const runCSVExportTests = () => {
  console.log('🧪 Testing CSV Export Functionality...\n');

  // Test 1: Description field mapping
  test('Description: uses name field first', () => {
    const transactions = [{ name: 'Starbucks', amount: -5.50, date: '2025-01-01' }];
    const accounts = {};
    const result = generateCSVData(transactions, accounts);
    assert(result[0].Description === 'Starbucks', `Expected 'Starbucks', got '${result[0].Description}'`);
  });

  test('Description: falls back to merchant_name', () => {
    const transactions = [{ merchant_name: 'Amazon', amount: -25.00, date: '2025-01-01' }];
    const accounts = {};
    const result = generateCSVData(transactions, accounts);
    assert(result[0].Description === 'Amazon', `Expected 'Amazon', got '${result[0].Description}'`);
  });

  test('Description: falls back to description field', () => {
    const transactions = [{ description: 'Grocery Store', amount: -50.00, date: '2025-01-01' }];
    const accounts = {};
    const result = generateCSVData(transactions, accounts);
    assert(result[0].Description === 'Grocery Store', `Expected 'Grocery Store', got '${result[0].Description}'`);
  });

  test('Description: defaults to Unknown when all fields missing', () => {
    const transactions = [{ amount: -10.00, date: '2025-01-01' }];
    const accounts = {};
    const result = generateCSVData(transactions, accounts);
    assert(result[0].Description === 'Unknown', `Expected 'Unknown', got '${result[0].Description}'`);
  });

  // Test 2: Type field derivation
  test('Type: derives Expense from negative amount', () => {
    const transactions = [{ name: 'Store', amount: -10.50, date: '2025-01-01' }];
    const accounts = {};
    const result = generateCSVData(transactions, accounts);
    assert(result[0].Type === 'Expense', `Expected 'Expense', got '${result[0].Type}'`);
  });

  test('Type: derives Income from positive amount', () => {
    const transactions = [{ name: 'Paycheck', amount: 2500.00, date: '2025-01-01' }];
    const accounts = {};
    const result = generateCSVData(transactions, accounts);
    assert(result[0].Type === 'Income', `Expected 'Income', got '${result[0].Type}'`);
  });

  // Test 3: Account field mapping
  test('Account: resolves account name from account_id', () => {
    const transactions = [{ name: 'Store', amount: -10.00, date: '2025-01-01', account_id: 'acc123' }];
    const accounts = { acc123: { name: '360 Checking' } };
    const result = generateCSVData(transactions, accounts);
    assert(result[0].Account === '360 Checking', `Expected '360 Checking', got '${result[0].Account}'`);
  });

  test('Account: uses official_name if name is missing', () => {
    const transactions = [{ name: 'Store', amount: -10.00, date: '2025-01-01', account_id: 'acc456' }];
    const accounts = { acc456: { official_name: 'Capital One 360' } };
    const result = generateCSVData(transactions, accounts);
    assert(result[0].Account === 'Capital One 360', `Expected 'Capital One 360', got '${result[0].Account}'`);
  });

  test('Account: defaults to Unknown Account when not found', () => {
    const transactions = [{ name: 'Store', amount: -10.00, date: '2025-01-01', account_id: 'missing' }];
    const accounts = {};
    const result = generateCSVData(transactions, accounts);
    assert(result[0].Account === 'Unknown Account', `Expected 'Unknown Account', got '${result[0].Account}'`);
  });

  // Test 4: Category field mapping
  test('Category: uses category field', () => {
    const transactions = [{ name: 'Store', amount: -10.00, date: '2025-01-01', category: 'Groceries' }];
    const accounts = {};
    const result = generateCSVData(transactions, accounts);
    assert(result[0].Category === 'Groceries', `Expected 'Groceries', got '${result[0].Category}'`);
  });

  test('Category: falls back to personal_finance_category.primary', () => {
    const transactions = [{ 
      name: 'Store', 
      amount: -10.00, 
      date: '2025-01-01', 
      personal_finance_category: { primary: 'Food and Drink' }
    }];
    const accounts = {};
    const result = generateCSVData(transactions, accounts);
    assert(result[0].Category === 'Food and Drink', `Expected 'Food and Drink', got '${result[0].Category}'`);
  });

  test('Category: defaults to Uncategorized', () => {
    const transactions = [{ name: 'Store', amount: -10.00, date: '2025-01-01' }];
    const accounts = {};
    const result = generateCSVData(transactions, accounts);
    assert(result[0].Category === 'Uncategorized', `Expected 'Uncategorized', got '${result[0].Category}'`);
  });

  // Test 5: Pending field
  test('Pending: shows Yes when transaction is pending', () => {
    const transactions = [{ name: 'Store', amount: -10.00, date: '2025-01-01', pending: true }];
    const accounts = {};
    const result = generateCSVData(transactions, accounts);
    assert(result[0].Pending === 'Yes', `Expected 'Yes', got '${result[0].Pending}'`);
  });

  test('Pending: shows No when transaction is not pending', () => {
    const transactions = [{ name: 'Store', amount: -10.00, date: '2025-01-01', pending: false }];
    const accounts = {};
    const result = generateCSVData(transactions, accounts);
    assert(result[0].Pending === 'No', `Expected 'No', got '${result[0].Pending}'`);
  });

  // Test 6: Notes field
  test('Notes: includes notes when present', () => {
    const transactions = [{ name: 'Store', amount: -10.00, date: '2025-01-01', notes: 'Business expense' }];
    const accounts = {};
    const result = generateCSVData(transactions, accounts);
    assert(result[0].Notes === 'Business expense', `Expected 'Business expense', got '${result[0].Notes}'`);
  });

  test('Notes: empty string when notes missing', () => {
    const transactions = [{ name: 'Store', amount: -10.00, date: '2025-01-01' }];
    const accounts = {};
    const result = generateCSVData(transactions, accounts);
    assert(result[0].Notes === '', `Expected empty string, got '${result[0].Notes}'`);
  });

  // Test 7: CSV escaping
  test('CSV escaping: handles commas in merchant name', () => {
    const value = 'Amazon, Inc.';
    const escaped = escapeCSVValue(value);
    assert(escaped === '"Amazon, Inc."', `Expected '"Amazon, Inc."', got '${escaped}'`);
  });

  test('CSV escaping: handles quotes in merchant name', () => {
    const value = 'Joe\'s "Best" Coffee';
    const escaped = escapeCSVValue(value);
    assert(escaped === '"Joe\'s ""Best"" Coffee"', `Expected '"Joe\'s ""Best"" Coffee"', got '${escaped}'`);
  });

  test('CSV escaping: leaves simple values unchanged', () => {
    const value = 'Starbucks';
    const escaped = escapeCSVValue(value);
    assert(escaped === 'Starbucks', `Expected 'Starbucks', got '${escaped}'`);
  });

  // Test 8: Complete transaction mapping
  test('Complete transaction: all fields map correctly', () => {
    const transactions = [{
      name: 'WM SUPERCENTER',
      amount: -10.76,
      date: '2025-11-09',
      account_id: 'acc123',
      category: 'Groceries',
      notes: 'Weekly shopping',
      pending: false
    }];
    const accounts = {
      acc123: { name: '360 Checking', official_name: 'Capital One 360 Checking' }
    };
    const result = generateCSVData(transactions, accounts);
    
    assert(result[0].Date === '2025-11-09', `Date mismatch: got '${result[0].Date}'`);
    assert(result[0].Description === 'WM SUPERCENTER', `Description mismatch: got '${result[0].Description}'`);
    assert(result[0].Category === 'Groceries', `Category mismatch: got '${result[0].Category}'`);
    assert(result[0].Account === '360 Checking', `Account mismatch: got '${result[0].Account}'`);
    assert(result[0].Amount === -10.76, `Amount mismatch: got '${result[0].Amount}'`);
    assert(result[0].Type === 'Expense', `Type mismatch: got '${result[0].Type}'`);
    assert(result[0].Notes === 'Weekly shopping', `Notes mismatch: got '${result[0].Notes}'`);
    assert(result[0].Pending === 'No', `Pending mismatch: got '${result[0].Pending}'`);
  });

  console.log('\n✅ All CSV export tests passed!');
};

// Run tests
if (typeof window === 'undefined') {
  runCSVExportTests();
}

export { generateCSVData, escapeCSVValue };
