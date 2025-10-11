// AccountDisplayName.test.js - Test for account display name helper function
// This test validates the getAccountDisplayName function logic

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

// Replicate the getAccountDisplayName function for testing
const getAccountDisplayName = (account) => {
  // Priority 1: official_name from Plaid (most reliable)
  if (account.official_name && account.official_name.trim()) {
    return account.official_name;
  }
  
  // Priority 2: name from Plaid
  if (account.name && account.name.trim()) {
    return account.name;
  }
  
  // Priority 3: Construct from institution_name (fallback only)
  const institutionName = account.institution_name || '';
  const accountType = account.type || 'Account';
  const mask = account.mask ? `••${account.mask}` : '';
  
  return `${institutionName} ${accountType} ${mask}`.trim() || 'Account';
};

export const runAccountDisplayNameTests = () => {
    console.log('🧪 Testing Account Display Name Helper Function\n');

    let passedTests = 0;
    let totalTests = 0;

    // Test 1: Priority 1 - Use official_name when available
    totalTests++;
    if (test('Uses official_name when available', () => {
        const account = {
            official_name: 'USAA CLASSIC CHECKING',
            name: 'USAA Checking',
            institution_name: 'USAA',
            type: 'checking',
            mask: '1783'
        };
        const result = getAccountDisplayName(account);
        assert(result === 'USAA CLASSIC CHECKING', `Expected 'USAA CLASSIC CHECKING', got '${result}'`);
    })) passedTests++;

    // Test 2: Priority 2 - Use name when official_name is missing
    totalTests++;
    if (test('Uses name when official_name is missing', () => {
        const account = {
            name: 'Chase Total Checking',
            institution_name: 'Chase',
            type: 'checking',
            mask: '4567'
        };
        const result = getAccountDisplayName(account);
        assert(result === 'Chase Total Checking', `Expected 'Chase Total Checking', got '${result}'`);
    })) passedTests++;

    // Test 3: Priority 3 - Construct from institution_name when both official_name and name are missing
    totalTests++;
    if (test('Constructs from institution_name as fallback', () => {
        const account = {
            institution_name: 'Bank of America',
            type: 'savings',
            mask: '9876'
        };
        const result = getAccountDisplayName(account);
        assert(result === 'Bank of America savings ••9876', `Expected 'Bank of America savings ••9876', got '${result}'`);
    })) passedTests++;

    // Test 4: Handle empty official_name (whitespace only)
    totalTests++;
    if (test('Skips empty official_name with whitespace', () => {
        const account = {
            official_name: '   ',
            name: 'Wells Fargo Checking',
            institution_name: 'Wells Fargo',
            type: 'checking',
            mask: '1234'
        };
        const result = getAccountDisplayName(account);
        assert(result === 'Wells Fargo Checking', `Expected 'Wells Fargo Checking', got '${result}'`);
    })) passedTests++;

    // Test 5: Handle completely empty account (all fields missing)
    totalTests++;
    if (test('Returns "Account" for completely empty account', () => {
        const account = {};
        const result = getAccountDisplayName(account);
        assert(result === 'Account', `Expected 'Account', got '${result}'`);
    })) passedTests++;

    // Test 6: Handle account with only type and mask
    totalTests++;
    if (test('Constructs from type and mask only', () => {
        const account = {
            type: 'credit',
            mask: '5555'
        };
        const result = getAccountDisplayName(account);
        assert(result === 'credit ••5555', `Expected 'credit ••5555', got '${result}'`);
    })) passedTests++;

    // Test 7: Handle manual account (name only)
    totalTests++;
    if (test('Works for manual account with name only', () => {
        const account = {
            name: 'My Cash Account',
            type: 'checking'
        };
        const result = getAccountDisplayName(account);
        assert(result === 'My Cash Account', `Expected 'My Cash Account', got '${result}'`);
    })) passedTests++;

    // Test 8: Prefer official_name over name even if both exist
    totalTests++;
    if (test('Prefers official_name over name when both exist', () => {
        const account = {
            official_name: 'USAA SAVINGS',
            name: 'USAA SAV',
            institution_name: 'USAA',
            type: 'savings',
            mask: '4321'
        };
        const result = getAccountDisplayName(account);
        assert(result === 'USAA SAVINGS', `Expected 'USAA SAVINGS', got '${result}'`);
    })) passedTests++;

    // Test 9: Handle null values
    totalTests++;
    if (test('Handles null values gracefully', () => {
        const account = {
            official_name: null,
            name: null,
            institution_name: 'TD Bank',
            type: 'checking',
            mask: null
        };
        const result = getAccountDisplayName(account);
        assert(result === 'TD Bank checking', `Expected 'TD Bank checking', got '${result}'`);
    })) passedTests++;

    // Test 10: Real-world USAA example from the issue
    totalTests++;
    if (test('Real-world USAA example from Firebase', () => {
        const account = {
            account_id: 'RvvJSZ7j4LTLXyt0zpQycsZnyONMENCqepYBv',
            name: 'USAA CLASSIC CHECKING',
            official_name: 'USAA CLASSIC CHECKING',
            institution_name: 'USAA',
            mask: '1783',
            type: 'checking'
        };
        const result = getAccountDisplayName(account);
        assert(result === 'USAA CLASSIC CHECKING', `Expected 'USAA CLASSIC CHECKING', got '${result}'`);
    })) passedTests++;

    console.log(`\n📊 Test Results: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
        console.log('✅ All tests passed!');
    } else {
        console.log(`❌ ${totalTests - passedTests} test(s) failed`);
    }

    return passedTests === totalTests;
};

// Export for use in other test files
export { getAccountDisplayName };

// Auto-run tests (for ES modules)
runAccountDisplayNameTests();
