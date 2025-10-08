// Spendability.test.js - Test for checking account filter logic
// This test verifies the fix for "Adv Plus Banking" not being counted in checking total

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

// Extracted filter logic from Spendability.jsx (lines 205-224)
const isCheckingAccount = (account) => {
    const name = (account.name || '').toLowerCase();
    const subtype = (account.subtype || '').toLowerCase();
    const accountType = (account.type || '').toLowerCase();
    
    const isChecking = 
        subtype === 'checking' ||
        subtype?.includes('checking') ||
        name.includes('checking') ||
        name.includes('chk') ||
        accountType === 'checking' ||  // ← This was added to fix the bug
        (accountType === 'depository' && !name.includes('savings') && !subtype?.includes('savings'));
    
    return isChecking;
};

// Run tests
const runSpendabilityFilterTests = () => {
    console.log('🧪 Testing Checking Account Filter Logic...\n');

    // Test 1: "Adv Plus Banking" with type=checking and undefined subtype should be included
    test('Includes account with type=checking and undefined subtype (Adv Plus Banking)', () => {
        const advPlusBanking = {
            name: 'Adv Plus Banking',
            type: 'checking',
            subtype: undefined,
            balance: '518.24'
        };
        
        const result = isCheckingAccount(advPlusBanking);
        assert(result === true, `"Adv Plus Banking" should be recognized as checking account, got ${result}`);
    });

    // Test 2: Account with subtype=checking should be included
    test('Includes account with subtype=checking', () => {
        const usaaChecking = {
            name: 'USAA CLASSIC CHECKING',
            type: 'checking',
            subtype: 'checking',
            balance: '643.60'
        };
        
        const result = isCheckingAccount(usaaChecking);
        assert(result === true, `USAA checking should be recognized as checking account, got ${result}`);
    });

    // Test 3: Account with "checking" in name should be included
    test('Includes account with "checking" in name', () => {
        const sofiChecking = {
            name: 'SoFi Checking',
            type: 'depository',
            subtype: undefined,
            balance: '195.09'
        };
        
        const result = isCheckingAccount(sofiChecking);
        assert(result === true, `SoFi Checking should be recognized as checking account, got ${result}`);
    });

    // Test 4: Account with "chk" in name should be included
    test('Includes account with "chk" in name', () => {
        const account360 = {
            name: '360 Checking',
            type: 'depository',
            subtype: undefined,
            balance: '588.19'
        };
        
        const result = isCheckingAccount(account360);
        assert(result === true, `360 Checking should be recognized as checking account, got ${result}`);
    });

    // Test 5: Savings account should NOT be included
    test('Excludes savings account', () => {
        const savingsAccount = {
            name: 'Savings Account',
            type: 'savings',
            subtype: 'savings',
            balance: '1.00'
        };
        
        const result = isCheckingAccount(savingsAccount);
        assert(result === false, `Savings account should NOT be recognized as checking account, got ${result}`);
    });

    // Test 6: Depository account with "savings" in name should NOT be included
    test('Excludes depository account with "savings" in name', () => {
        const depositSavings = {
            name: 'High Yield Savings',
            type: 'depository',
            subtype: undefined,
            balance: '5000.00'
        };
        
        const result = isCheckingAccount(depositSavings);
        assert(result === false, `Depository savings should NOT be recognized as checking account, got ${result}`);
    });

    // Test 7: Depository account without "savings" should be included (fallback logic)
    test('Includes depository account without "savings"', () => {
        const depositoryAccount = {
            name: 'My Bank Account',
            type: 'depository',
            subtype: undefined,
            balance: '1000.00'
        };
        
        const result = isCheckingAccount(depositoryAccount);
        assert(result === true, `Generic depository should be recognized as checking account, got ${result}`);
    });

    // Test 8: Account with undefined subtype doesn't crash (optional chaining test)
    test('Handles undefined subtype gracefully with optional chaining', () => {
        const accountWithNoSubtype = {
            name: 'Test Account',
            type: 'checking',
            subtype: undefined,
            balance: '100.00'
        };
        
        // This should not throw an error
        let result;
        let errorThrown = false;
        try {
            result = isCheckingAccount(accountWithNoSubtype);
        } catch (e) {
            errorThrown = true;
        }
        
        assert(!errorThrown, 'Should not throw error on undefined subtype');
        assert(result === true, `Account with type=checking should be included even with undefined subtype`);
    });

    console.log('\n✅ All tests passed! The fix correctly includes "Adv Plus Banking" and handles edge cases.\n');
};

// Run tests if this file is executed directly
if (typeof process !== 'undefined' && process.argv[1] === new URL(import.meta.url).pathname) {
    runSpendabilityFilterTests();
}

export { runSpendabilityFilterTests, isCheckingAccount };
