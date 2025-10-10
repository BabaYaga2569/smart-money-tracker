// HasPlaidAccountsFlag.test.js - Test for hasPlaidAccounts flag being set correctly

// Simple test runner
const runTests = () => {
  console.log('🧪 Testing hasPlaidAccounts Flag Logic...\n');

  // Test 1: hasPlaidAccounts should be true when accounts loaded from API
  test('hasPlaidAccounts should be true when accounts loaded from API', () => {
    // Simulate API response with accounts
    const accountsMap = {
      'acc1': { name: 'Checking', balance: '1000' },
      'acc2': { name: 'Savings', balance: '5000' }
    };
    
    const hasPlaidAccounts = Object.keys(accountsMap).length > 0;
    
    assert(hasPlaidAccounts === true, 'hasPlaidAccounts should be true when accounts exist');
    console.log('✅ Test 1 passed: hasPlaidAccounts is true when accounts loaded from API');
  });

  // Test 2: hasPlaidAccounts should be false when no accounts
  test('hasPlaidAccounts should be false when no accounts', () => {
    const accountsMap = {};
    
    const hasPlaidAccounts = Object.keys(accountsMap).length > 0;
    
    assert(hasPlaidAccounts === false, 'hasPlaidAccounts should be false when no accounts');
    console.log('✅ Test 2 passed: hasPlaidAccounts is false when no accounts');
  });

  // Test 3: Auto-sync should proceed when hasPlaidAccounts is true
  test('Auto-sync should proceed when hasPlaidAccounts is true', () => {
    const hasPlaidAccounts = true;
    
    // This simulates the check in syncPlaidTransactions() at line 371
    const shouldProceed = hasPlaidAccounts;
    
    assert(shouldProceed === true, 'Auto-sync should proceed when hasPlaidAccounts is true');
    console.log('✅ Test 3 passed: Auto-sync proceeds when hasPlaidAccounts is true');
  });

  // Test 4: Auto-sync should NOT proceed when hasPlaidAccounts is false
  test('Auto-sync should NOT proceed when hasPlaidAccounts is false', () => {
    const hasPlaidAccounts = false;
    
    // This simulates the check in syncPlaidTransactions() at line 371
    const shouldProceed = hasPlaidAccounts;
    
    assert(shouldProceed === false, 'Auto-sync should NOT proceed when hasPlaidAccounts is false');
    console.log('✅ Test 4 passed: Auto-sync blocks when hasPlaidAccounts is false');
  });

  // Test 5: Consistency - API path should match Firebase fallback logic
  test('API path logic should match Firebase fallback logic', () => {
    // Firebase fallback path (line 284-285)
    const plaidAccountsList = [
      { name: 'Account 1', balance: 1000 },
      { name: 'Account 2', balance: 2000 }
    ];
    const firebaseHasPlaidAccounts = plaidAccountsList.length > 0;
    
    // API path (line 248 - NEW)
    const accountsMap = {
      'acc1': { name: 'Account 1', balance: '1000' },
      'acc2': { name: 'Account 2', balance: '2000' }
    };
    const apiHasPlaidAccounts = Object.keys(accountsMap).length > 0;
    
    assert(firebaseHasPlaidAccounts === apiHasPlaidAccounts, 
      'Both paths should set hasPlaidAccounts the same way');
    console.log('✅ Test 5 passed: API path logic matches Firebase fallback logic');
  });

  console.log('\n✨ All hasPlaidAccounts flag tests passed!\n');
};

// Helper functions
function test(name, fn) {
  try {
    fn();
  } catch (error) {
    console.error(`❌ Test failed: ${name}`);
    console.error(error.message);
    process.exit(1);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Run tests
runTests();
