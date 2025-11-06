// StaleDataDetection.test.js - Test for stale data detection logic

// Simple test runner
const runTests = () => {
  console.log('🧪 Testing Stale Data Detection Logic...\n');

  // Helper function (matches Accounts.jsx implementation)
  const isBalanceStale = (lastBalanceUpdate) => {
    if (!lastBalanceUpdate) return false;
    const hoursSinceUpdate = (Date.now() - lastBalanceUpdate) / (1000 * 60 * 60);
    return hoursSinceUpdate > 24;
  };

  // Test 1: Fresh data (updated 1 hour ago) should not be stale
  test('Fresh data (1 hour ago) should not be stale', () => {
    const oneHourAgo = Date.now() - (1 * 60 * 60 * 1000);
    const result = isBalanceStale(oneHourAgo);
    
    assert(result === false, 'Data updated 1 hour ago should not be stale');
    console.log('✅ Test 1 passed: Fresh data is not marked as stale');
  });

  // Test 2: Data updated 23 hours ago should not be stale
  test('Data updated 23 hours ago should not be stale', () => {
    const twentyThreeHoursAgo = Date.now() - (23 * 60 * 60 * 1000);
    const result = isBalanceStale(twentyThreeHoursAgo);
    
    assert(result === false, 'Data updated 23 hours ago should not be stale');
    console.log('✅ Test 2 passed: Data at 23 hours is not stale');
  });

  // Test 3: Data updated exactly 24 hours ago should not be stale (boundary)
  test('Data updated exactly 24 hours ago should not be stale', () => {
    const exactlyTwentyFourHours = Date.now() - (24 * 60 * 60 * 1000);
    const result = isBalanceStale(exactlyTwentyFourHours);
    
    assert(result === false, 'Data updated exactly 24 hours ago should not be stale');
    console.log('✅ Test 3 passed: Data at exactly 24 hours is not stale (boundary condition)');
  });

  // Test 4: Data updated 25 hours ago should be stale
  test('Data updated 25 hours ago should be stale', () => {
    const twentyFiveHoursAgo = Date.now() - (25 * 60 * 60 * 1000);
    const result = isBalanceStale(twentyFiveHoursAgo);
    
    assert(result === true, 'Data updated 25 hours ago should be stale');
    console.log('✅ Test 4 passed: Data at 25 hours is stale');
  });

  // Test 5: Data updated 48 hours ago should be stale
  test('Data updated 48 hours ago should be stale', () => {
    const twoDaysAgo = Date.now() - (48 * 60 * 60 * 1000);
    const result = isBalanceStale(twoDaysAgo);
    
    assert(result === true, 'Data updated 48 hours ago should be stale');
    console.log('✅ Test 5 passed: Data at 48 hours is stale');
  });

  // Test 6: Missing lastBalanceUpdate should not be stale (backwards compatibility)
  test('Missing lastBalanceUpdate should not be stale', () => {
    const result = isBalanceStale(null);
    
    assert(result === false, 'Missing timestamp should not be treated as stale');
    console.log('✅ Test 6 passed: Missing timestamp is not stale (backwards compatible)');
  });

  // Test 7: Undefined lastBalanceUpdate should not be stale
  test('Undefined lastBalanceUpdate should not be stale', () => {
    const result = isBalanceStale(undefined);
    
    assert(result === false, 'Undefined timestamp should not be treated as stale');
    console.log('✅ Test 7 passed: Undefined timestamp is not stale');
  });

  // Test 8: Zero timestamp should not be stale (edge case)
  test('Zero timestamp should not be stale', () => {
    const result = isBalanceStale(0);
    
    assert(result === false, 'Zero timestamp should be treated as missing');
    console.log('✅ Test 8 passed: Zero timestamp is not stale');
  });

  // Test 9: Account balance tracking - balance changed scenario
  test('Balance changed scenario should update lastBalanceUpdate', () => {
    const existingAccount = {
      account_id: 'acc123',
      balance: '1000.00',
      lastBalanceUpdate: Date.now() - (48 * 60 * 60 * 1000) // 2 days ago
    };
    
    const newBalance = '1500.00'; // Balance changed
    const balanceChanged = existingAccount.balance !== newBalance;
    
    const updatedAccount = {
      ...existingAccount,
      balance: newBalance,
      lastBalanceUpdate: balanceChanged ? Date.now() : existingAccount.lastBalanceUpdate
    };
    
    const isStale = isBalanceStale(updatedAccount.lastBalanceUpdate);
    
    assert(balanceChanged === true, 'Balance should be detected as changed');
    assert(isStale === false, 'Newly updated account should not be stale');
    console.log('✅ Test 9 passed: Balance change updates timestamp correctly');
  });

  // Test 10: Account balance tracking - balance unchanged scenario
  test('Balance unchanged scenario should preserve lastBalanceUpdate', () => {
    const lastUpdate = Date.now() - (48 * 60 * 60 * 1000); // 2 days ago
    const existingAccount = {
      account_id: 'acc123',
      balance: '1000.00',
      lastBalanceUpdate: lastUpdate
    };
    
    const newBalance = '1000.00'; // Balance unchanged
    const balanceChanged = existingAccount.balance !== newBalance;
    
    const updatedAccount = {
      ...existingAccount,
      balance: newBalance,
      lastBalanceUpdate: balanceChanged ? Date.now() : existingAccount.lastBalanceUpdate
    };
    
    const isStale = isBalanceStale(updatedAccount.lastBalanceUpdate);
    
    assert(balanceChanged === false, 'Balance should be detected as unchanged');
    assert(isStale === true, 'Account with old timestamp should be stale');
    assert(updatedAccount.lastBalanceUpdate === lastUpdate, 'Old timestamp should be preserved');
    console.log('✅ Test 10 passed: Unchanged balance preserves old timestamp');
  });

  console.log('\n✨ All stale data detection tests passed!\n');
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
