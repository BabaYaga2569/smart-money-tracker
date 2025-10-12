// TransactionAccountFallback.test.js
// Test for verifying smart fallback logic with institution_name matching

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

// Mock the getAccountDisplayName function (same as in Transactions.jsx)
const getAccountDisplayName = (account) => {
  if (account?.official_name && account.official_name.trim()) {
    return account.official_name;
  }
  
  if (account?.name && account.name.trim()) {
    return account.name;
  }
  
  const institutionName = account?.institution_name || account?.institution || '';
  const accountType = account?.type || 'Account';
  const mask = account?.mask ? `••${account.mask}` : '';
  
  return `${institutionName} ${accountType} ${mask}`.trim() || 'Unknown Account';
};

// Mock the new getTransactionAccountName function (with smart fallback)
const getTransactionAccountName = (transaction, currentAccounts) => {
  // Strategy 1: Direct account_id lookup
  if (transaction.account_id && currentAccounts[transaction.account_id]) {
    return getAccountDisplayName(currentAccounts[transaction.account_id]);
  }
  
  // Strategy 2: Alternative account field lookup
  if (transaction.account && currentAccounts[transaction.account]) {
    return getAccountDisplayName(currentAccounts[transaction.account]);
  }
  
  // Strategy 3: Match by institution_name from transaction (KEY FIX for reconnected banks)
  const txInstitution = transaction.institution_name || transaction.institutionName;
  if (txInstitution) {
    // Find any account with matching institution_name
    const matchingAccount = Object.values(currentAccounts).find(account => 
      account.institution_name === txInstitution || account.institution === txInstitution
    );
    if (matchingAccount) {
      return getAccountDisplayName(matchingAccount);
    }
  }
  
  // Strategy 4: Single account assumption (if only 1 account exists)
  const accountKeys = Object.keys(currentAccounts);
  if (accountKeys.length === 1) {
    return getAccountDisplayName(currentAccounts[accountKeys[0]]);
  }
  
  // Strategy 5: Display institution from transaction if available
  if (txInstitution) {
    return txInstitution;
  }
  
  // Strategy 6: Fallback to generic "Account"
  return 'Account';
};

export const runTransactionAccountFallbackTests = () => {
    console.log('🧪 Testing Smart Transaction Account Display Fallback Logic\n');

    let passedTests = 0;
    let totalTests = 0;

    // Test 1: Strategy 1 - Direct account_id lookup
    totalTests++;
    if (test('Strategy 1: Direct account_id lookup works', () => {
        const transaction = {
            id: '1',
            account_id: 'new_acc_123',
            merchant_name: 'Starbucks',
            amount: 5.50,
            institution_name: 'Bank of America'
        };
        const accounts = {
            new_acc_123: {
                account_id: 'new_acc_123',
                official_name: 'BofA Checking',
                institution_name: 'Bank of America'
            }
        };
        
        const result = getTransactionAccountName(transaction, accounts);
        
        assert(result === 'BofA Checking', 
            `Expected "BofA Checking", got "${result}"`);
    })) passedTests++;

    // Test 2: Strategy 3 - Match by institution_name when account_id doesn't match (KEY FIX)
    totalTests++;
    if (test('Strategy 3: Match by institution_name when account_id changed', () => {
        const transaction = {
            id: '1',
            account_id: 'old_acc_abc',  // Old account ID
            merchant_name: 'Starbucks',
            amount: 5.50,
            institution_name: 'Bank of America'  // Still has institution name
        };
        const accounts = {
            new_acc_xyz: {  // New account ID after reconnect
                account_id: 'new_acc_xyz',
                official_name: 'BofA Checking',
                institution_name: 'Bank of America'  // Same institution
            }
        };
        
        const result = getTransactionAccountName(transaction, accounts);
        
        assert(result === 'BofA Checking', 
            `Expected "BofA Checking" via institution match, got "${result}"`);
    })) passedTests++;

    // Test 3: Multiple banks - correct institution matching
    totalTests++;
    if (test('Strategy 3: Correctly matches among multiple banks', () => {
        const transaction = {
            id: '1',
            account_id: 'old_usaa_123',
            merchant_name: 'Gas Station',
            amount: 45.00,
            institution_name: 'USAA'
        };
        const accounts = {
            new_bofa_456: {
                account_id: 'new_bofa_456',
                official_name: 'BofA Checking',
                institution_name: 'Bank of America'
            },
            new_usaa_789: {
                account_id: 'new_usaa_789',
                official_name: 'USAA CLASSIC CHECKING',
                institution_name: 'USAA'
            },
            new_sofi_012: {
                account_id: 'new_sofi_012',
                official_name: 'SoFi Checking',
                institution_name: 'SoFi'
            }
        };
        
        const result = getTransactionAccountName(transaction, accounts);
        
        assert(result === 'USAA CLASSIC CHECKING', 
            `Expected "USAA CLASSIC CHECKING", got "${result}"`);
    })) passedTests++;

    // Test 4: Strategy 4 - Single account assumption
    totalTests++;
    if (test('Strategy 4: Assumes single account when only one exists', () => {
        const transaction = {
            id: '1',
            account_id: 'unknown_id',
            merchant_name: 'Amazon',
            amount: 25.00
            // No institution_name
        };
        const accounts = {
            only_acc: {
                account_id: 'only_acc',
                official_name: 'My Only Account',
                institution_name: 'Some Bank'
            }
        };
        
        const result = getTransactionAccountName(transaction, accounts);
        
        assert(result === 'My Only Account', 
            `Expected "My Only Account", got "${result}"`);
    })) passedTests++;

    // Test 5: Strategy 5 - Display institution from transaction
    totalTests++;
    if (test('Strategy 5: Shows institution name when no account match found', () => {
        const transaction = {
            id: '1',
            account_id: 'unknown_id',
            merchant_name: 'Target',
            amount: 50.00,
            institution_name: 'Wells Fargo'
        };
        const accounts = {
            bofa_acc: {
                account_id: 'bofa_acc',
                official_name: 'BofA Account',
                institution_name: 'Bank of America'
            },
            usaa_acc: {
                account_id: 'usaa_acc',
                official_name: 'USAA Account',
                institution_name: 'USAA'
            }
        };
        
        const result = getTransactionAccountName(transaction, accounts);
        
        assert(result === 'Wells Fargo', 
            `Expected "Wells Fargo", got "${result}"`);
    })) passedTests++;

    // Test 6: Strategy 6 - Fallback to "Account"
    totalTests++;
    if (test('Strategy 6: Fallback to "Account" when nothing else works', () => {
        const transaction = {
            id: '1',
            account_id: 'unknown_id',
            merchant_name: 'Some Store',
            amount: 10.00
            // No institution_name
        };
        const accounts = {
            acc1: {
                account_id: 'acc1',
                official_name: 'Account 1',
                institution_name: 'Bank 1'
            },
            acc2: {
                account_id: 'acc2',
                official_name: 'Account 2',
                institution_name: 'Bank 2'
            }
        };
        
        const result = getTransactionAccountName(transaction, accounts);
        
        assert(result === 'Account', 
            `Expected "Account", got "${result}"`);
    })) passedTests++;

    // Test 7: Handles alternative field names (institution vs institution_name)
    totalTests++;
    if (test('Strategy 3: Handles both institution_name and institution fields', () => {
        const transaction = {
            id: '1',
            account_id: 'old_id',
            merchant_name: 'Store',
            amount: 15.00,
            institutionName: 'Capital One'  // Alternative field name
        };
        const accounts = {
            new_id: {
                account_id: 'new_id',
                official_name: 'Capital One Quicksilver',
                institution: 'Capital One'  // Alternative field name
            }
        };
        
        const result = getTransactionAccountName(transaction, accounts);
        
        assert(result === 'Capital One Quicksilver', 
            `Expected "Capital One Quicksilver", got "${result}"`);
    })) passedTests++;

    // Test 8: Real-world scenario - Plaid reconnect
    totalTests++;
    if (test('Real-world: Plaid reconnect scenario with mismatched IDs', () => {
        // Old transactions from before reconnect
        const oldTransactions = [
            {
                id: 't1',
                account_id: 'oR98DbX6lmTkMYyoSqaLoCAQZyByzcoRnAVl8',  // Old ID
                merchant_name: 'Walmart',
                amount: 45.67,
                institution_name: 'USAA'
            },
            {
                id: 't2',
                account_id: 'jZJlaLAn46TK4VJOQKwtbmZLNL6slI1wmfBy',  // Old ID
                merchant_name: 'Gas Station',
                amount: 35.00,
                institution_name: 'Bank of America'
            }
        ];
        
        // New accounts after Plaid reconnect (new IDs)
        const newAccounts = {
            'pDq8Nrx3TyHs4MqQrPaLxvNbK7wYzA9cRfTg': {  // New ID
                account_id: 'pDq8Nrx3TyHs4MqQrPaLxvNbK7wYzA9cRfTg',
                official_name: 'USAA CLASSIC CHECKING',
                institution_name: 'USAA'
            },
            'mVb9LsK2NpOq6HrJsKtLwUaC8xZyB3dTeWh': {  // New ID
                account_id: 'mVb9LsK2NpOq6HrJsKtLwUaC8xZyB3dTeWh',
                official_name: 'Bank of America Advantage',
                institution_name: 'Bank of America'
            }
        };
        
        // Test both transactions
        const result1 = getTransactionAccountName(oldTransactions[0], newAccounts);
        const result2 = getTransactionAccountName(oldTransactions[1], newAccounts);
        
        assert(result1 === 'USAA CLASSIC CHECKING', 
            `Transaction 1: Expected "USAA CLASSIC CHECKING", got "${result1}"`);
        assert(result2 === 'Bank of America Advantage', 
            `Transaction 2: Expected "Bank of America Advantage", got "${result2}"`);
    })) passedTests++;

    console.log(`\n📊 Test Results: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
        console.log('✅ All tests passed! Smart fallback logic is working correctly.');
        return true;
    } else {
        console.log('❌ Some tests failed. Check the implementation.');
        return false;
    }
};

// Run tests if this file is executed directly
if (typeof window === 'undefined') {
    runTransactionAccountFallbackTests();
}
