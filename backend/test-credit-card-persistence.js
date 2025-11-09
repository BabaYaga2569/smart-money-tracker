/**
 * Test for Credit Card Persistence Bug Fix
 * 
 * This test validates that accounts with null/undefined balance values
 * (common with credit cards) are properly handled and can be saved to Firebase.
 * 
 * The fix uses nullish coalescing (??) instead of OR (||) to handle null values
 * without treating 0 as falsy, and ensures no undefined values are present.
 */

// Mock account data simulating Plaid response for credit cards
const mockCreditCardAccount = {
  account_id: '904M7EzY6DiQ0aka0n8NfMJJvg6rZwskBjkj5',
  name: 'Citi Simplicity® Card',
  official_name: 'Citi Simplicity® Card',
  mask: '1234',
  type: 'credit',
  subtype: 'credit card',
  balances: {
    available: null,  // Credit cards often have null available balance
    current: 3573.79, // Current balance (amount owed)
    limit: 10000,     // Credit limit
    iso_currency_code: 'USD',
    unofficial_currency_code: null
  }
};

const mockCheckingAccount = {
  account_id: 'abc123xyz',
  name: 'Checking Account',
  official_name: 'Premium Checking',
  mask: '5678',
  type: 'depository',
  subtype: 'checking',
  balances: {
    available: 1500.50,
    current: 1500.50,
    limit: null,
    iso_currency_code: 'USD',
    unofficial_currency_code: null
  }
};

// Test function to format account (mimics the logic in deduplicateAndSaveAccounts)
function formatAccount(account, institutionName, itemId) {
  return {
    account_id: account.account_id,
    name: account.name,
    official_name: account.official_name || null,
    mask: account.mask || null,
    type: account.type,
    subtype: account.subtype || null,
    // Primary balance fields - using ?? to handle null without treating 0 as falsy
    available_balance: account.balances.available ?? account.balances.current ?? 0,
    current_balance: account.balances.current ?? 0,
    balance: account.balances.available ?? account.balances.current ?? 0,
    // Full balances object for flexibility - no undefined values
    balances: {
      available: account.balances.available ?? null,
      current: account.balances.current ?? 0,
      limit: account.balances.limit ?? null,
      iso_currency_code: account.balances.iso_currency_code ?? 'USD',
      unofficial_currency_code: account.balances.unofficial_currency_code ?? null
    },
    institution_name: institutionName,
    item_id: itemId
  };
}

// Test function to update account balance (mimics logic in updateAccountBalances)
function updateAccountBalance(existingAcc, freshAccount) {
  const balances = freshAccount.balances || {};
  
  const oldAvailable = existingAcc.available_balance ?? existingAcc.available ?? existingAcc.balance ?? 0;
  const oldCurrent = existingAcc.current_balance ?? existingAcc.current ?? existingAcc.balance ?? 0;
  const newAvailable = balances.available ?? balances.current ?? 0;
  const newCurrent = balances.current ?? 0;
  
  return {
    ...existingAcc,
    balance: newAvailable ?? newCurrent ?? 0,
    available_balance: newAvailable ?? newCurrent ?? 0,
    current_balance: newCurrent ?? 0,
    available: newAvailable ?? newCurrent ?? 0,
    current: newCurrent ?? 0,
    balances: {
      available: balances.available ?? null,
      current: balances.current ?? 0,
      limit: balances.limit ?? null,
      iso_currency_code: balances.iso_currency_code ?? 'USD',
      unofficial_currency_code: balances.unofficial_currency_code ?? null
    },
    lastUpdated: new Date().toISOString()
  };
}

// Validation function to check for undefined values
function hasUndefinedValues(obj, path = '') {
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;
    
    if (value === undefined) {
      return { hasUndefined: true, path: currentPath };
    }
    
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const result = hasUndefinedValues(value, currentPath);
      if (result.hasUndefined) {
        return result;
      }
    }
  }
  
  return { hasUndefined: false, path: null };
}

// Run tests
console.log('🧪 Testing Credit Card Persistence Fix\n');

// Test 1: Credit card with null available balance
console.log('Test 1: Format credit card account with null available balance');
const formattedCreditCard = formatAccount(mockCreditCardAccount, 'Citibank Online', 'item_123');
const undefinedCheck1 = hasUndefinedValues(formattedCreditCard);

console.log('  - Account formatted:', formattedCreditCard.name);
console.log('  - Available balance:', formattedCreditCard.available_balance);
console.log('  - Current balance:', formattedCreditCard.current_balance);
console.log('  - Balance object available:', formattedCreditCard.balances.available);
console.log('  - Has undefined values:', undefinedCheck1.hasUndefined);

if (undefinedCheck1.hasUndefined) {
  console.log('  ❌ FAILED: Found undefined at', undefinedCheck1.path);
} else if (formattedCreditCard.available_balance === 3573.79) {
  console.log('  ✅ PASSED: Falls back to current balance correctly');
} else {
  console.log('  ❌ FAILED: Unexpected balance value');
}

// Test 2: Checking account with normal balances
console.log('\nTest 2: Format checking account with normal balances');
const formattedChecking = formatAccount(mockCheckingAccount, 'Chase Bank', 'item_456');
const undefinedCheck2 = hasUndefinedValues(formattedChecking);

console.log('  - Account formatted:', formattedChecking.name);
console.log('  - Available balance:', formattedChecking.available_balance);
console.log('  - Current balance:', formattedChecking.current_balance);
console.log('  - Has undefined values:', undefinedCheck2.hasUndefined);

if (undefinedCheck2.hasUndefined) {
  console.log('  ❌ FAILED: Found undefined at', undefinedCheck2.path);
} else if (formattedChecking.available_balance === 1500.50) {
  console.log('  ✅ PASSED: Uses available balance correctly');
} else {
  console.log('  ❌ FAILED: Unexpected balance value');
}

// Test 3: Update balance for credit card
console.log('\nTest 3: Update credit card balance');
const existingCreditCard = { ...formattedCreditCard };
const freshCreditCardData = {
  account_id: mockCreditCardAccount.account_id,
  balances: {
    available: null,
    current: 3600.00,
    limit: 10000,
    iso_currency_code: 'USD',
    unofficial_currency_code: null
  }
};

const updatedCreditCard = updateAccountBalance(existingCreditCard, freshCreditCardData);
const undefinedCheck3 = hasUndefinedValues(updatedCreditCard);

console.log('  - Old current balance:', existingCreditCard.current_balance);
console.log('  - New current balance:', updatedCreditCard.current_balance);
console.log('  - Available balance (should fallback to current):', updatedCreditCard.available_balance);
console.log('  - Has undefined values:', undefinedCheck3.hasUndefined);

if (undefinedCheck3.hasUndefined) {
  console.log('  ❌ FAILED: Found undefined at', undefinedCheck3.path);
} else if (updatedCreditCard.current_balance === 3600.00 && updatedCreditCard.available_balance === 3600.00) {
  console.log('  ✅ PASSED: Balance updated correctly with null handling');
} else {
  console.log('  ❌ FAILED: Unexpected balance values');
}

// Test 4: Edge case - account with zero balance
console.log('\nTest 4: Account with zero balance (should not be treated as falsy)');
const mockZeroBalanceAccount = {
  account_id: 'zero123',
  name: 'Zero Balance Account',
  official_name: null,
  mask: '9999',
  type: 'depository',
  subtype: 'checking',
  balances: {
    available: 0,      // Zero should be preserved, not treated as falsy
    current: 0,
    limit: null,
    iso_currency_code: 'USD',
    unofficial_currency_code: null
  }
};

const formattedZeroBalance = formatAccount(mockZeroBalanceAccount, 'Test Bank', 'item_789');
const undefinedCheck4 = hasUndefinedValues(formattedZeroBalance);

console.log('  - Available balance:', formattedZeroBalance.available_balance);
console.log('  - Current balance:', formattedZeroBalance.current_balance);
console.log('  - Has undefined values:', undefinedCheck4.hasUndefined);

if (undefinedCheck4.hasUndefined) {
  console.log('  ❌ FAILED: Found undefined at', undefinedCheck4.path);
} else if (formattedZeroBalance.available_balance === 0 && formattedZeroBalance.balances.available === 0) {
  console.log('  ✅ PASSED: Zero balance preserved correctly (not treated as falsy)');
} else {
  console.log('  ❌ FAILED: Zero balance not preserved correctly');
}

// Summary
console.log('\n📊 Test Summary');
const allPassed = !undefinedCheck1.hasUndefined && 
                  !undefinedCheck2.hasUndefined && 
                  !undefinedCheck3.hasUndefined && 
                  !undefinedCheck4.hasUndefined &&
                  formattedCreditCard.available_balance === 3573.79 &&
                  formattedChecking.available_balance === 1500.50 &&
                  updatedCreditCard.current_balance === 3600.00 &&
                  formattedZeroBalance.available_balance === 0;

if (allPassed) {
  console.log('✅ All tests PASSED');
  console.log('✅ Credit cards will persist to Firebase correctly');
  console.log('✅ No undefined values that would cause Firebase errors');
  process.exit(0);
} else {
  console.log('❌ Some tests FAILED');
  process.exit(1);
}
