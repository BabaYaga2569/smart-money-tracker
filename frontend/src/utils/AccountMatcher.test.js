// AccountMatcher.test.js - Tests for institution-to-account matching
import { AccountMatcher } from './AccountMatcher.js';

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

export const runAccountMatcherTests = () => {
    console.log('🧪 Testing Account Matcher with Plaid Integration\n');

    let passedTests = 0;
    let totalTests = 0;

    // Sample Plaid accounts
    const sampleAccounts = {
        'plaid-acc-1': { 
            name: 'Chase Checking', 
            institution: 'Chase', 
            mask: '1234',
            type: 'checking'
        },
        'plaid-acc-2': { 
            name: 'Bank of America Savings', 
            institution: 'Bank of America', 
            mask: '5678',
            type: 'savings'
        },
        'plaid-acc-3': { 
            name: 'Capital One Credit Card', 
            institution: 'Capital One', 
            mask: '9012',
            type: 'credit'
        },
        'plaid-acc-4': { 
            name: 'USAA Checking', 
            institution: 'USAA Federal Savings Bank', 
            mask: '3456',
            type: 'checking'
        }
    };

    // Test 1: Exact institution name match
    totalTests++;
    if (test('Exact match - Chase', () => {
        const result = AccountMatcher.matchInstitution('Chase', sampleAccounts);
        assert(result.matched === true, 'Should match');
        assert(result.accountId === 'plaid-acc-1', 'Should match Chase account');
        assert(result.confidence === 100, 'Should have 100% confidence');
    })) passedTests++;

    // Test 2: Legacy name matching (Bank of America)
    totalTests++;
    if (test('Legacy match - Bank of America', () => {
        const result = AccountMatcher.matchInstitution('Bank of America', sampleAccounts);
        assert(result.matched === true, 'Should match');
        assert(result.accountId === 'plaid-acc-2', 'Should match BoA account');
        assert(result.confidence >= 90, 'Should have high confidence');
    })) passedTests++;

    // Test 3: Legacy alias matching (BoFA)
    totalTests++;
    if (test('Legacy alias - BoFA', () => {
        const result = AccountMatcher.matchInstitution('BoFA', sampleAccounts);
        assert(result.matched === true, 'Should match with alias');
        assert(result.accountId === 'plaid-acc-2', 'Should match BoA account');
    })) passedTests++;

    // Test 4: Case-insensitive matching
    totalTests++;
    if (test('Case insensitive - CHASE', () => {
        const result = AccountMatcher.matchInstitution('CHASE', sampleAccounts);
        assert(result.matched === true, 'Should match case-insensitively');
        assert(result.accountId === 'plaid-acc-1', 'Should match Chase account');
    })) passedTests++;

    // Test 5: Fuzzy matching
    totalTests++;
    if (test('Fuzzy match - Capital One Bank', () => {
        const result = AccountMatcher.matchInstitution('Capital One Bank', sampleAccounts);
        assert(result.matched === true, 'Should match with fuzzy logic');
        assert(result.accountId === 'plaid-acc-3', 'Should match Capital One account');
    })) passedTests++;

    // Test 6: No match for unknown institution
    totalTests++;
    if (test('No match - Wells Fargo (not in accounts)', () => {
        const result = AccountMatcher.matchInstitution('Wells Fargo', sampleAccounts);
        assert(result.matched === false, 'Should not match');
        assert(result.accountId === null, 'Should have no account ID');
    })) passedTests++;

    // Test 7: Batch matching with mixed results
    totalTests++;
    if (test('Batch match - multiple items', () => {
        const items = [
            { id: '1', name: 'Netflix', institutionName: 'Chase' },
            { id: '2', name: 'Electric Bill', institutionName: 'Bank of America' },
            { id: '3', name: 'Internet', institutionName: 'Wells Fargo' },
            { id: '4', name: 'Gym', institutionName: 'USAA' }
        ];
        
        const result = AccountMatcher.batchMatch(items, sampleAccounts);
        
        assert(result.matched.length === 3, 'Should match 3 items');
        assert(result.unmatched.length === 1, 'Should have 1 unmatched');
        assert(result.unmatched[0].institutionName === 'Wells Fargo', 'Wells Fargo should be unmatched');
    })) passedTests++;

    // Test 8: Custom mapping override
    totalTests++;
    if (test('Custom mapping - user-defined override', () => {
        const customMapping = {
            'Wells Fargo': 'plaid-acc-1' // Map Wells Fargo to Chase (custom user preference)
        };
        
        const result = AccountMatcher.matchInstitution('Wells Fargo', sampleAccounts, customMapping);
        assert(result.matched === true, 'Should match with custom mapping');
        assert(result.accountId === 'plaid-acc-1', 'Should use custom mapped account');
        assert(result.method === 'custom', 'Should indicate custom mapping');
    })) passedTests++;

    // Test 9: Empty institution name
    totalTests++;
    if (test('Empty institution name', () => {
        const result = AccountMatcher.matchInstitution('', sampleAccounts);
        assert(result.matched === false, 'Should not match empty string');
    })) passedTests++;

    // Test 10: Null/undefined institution name
    totalTests++;
    if (test('Null institution name', () => {
        const result = AccountMatcher.matchInstitution(null, sampleAccounts);
        assert(result.matched === false, 'Should handle null gracefully');
    })) passedTests++;

    // Test 11: Normalization test
    totalTests++;
    if (test('Name normalization - Bank of America N.A.', () => {
        const result = AccountMatcher.matchInstitution('Bank of America N.A.', sampleAccounts);
        assert(result.matched === true, 'Should match after normalization');
        assert(result.accountId === 'plaid-acc-2', 'Should match BoA account');
    })) passedTests++;

    // Test 12: Suggest mappings
    totalTests++;
    if (test('Suggest mappings for items', () => {
        const items = [
            { id: '1', institutionName: 'Chase' },
            { id: '2', institutionName: 'Bank of America' },
            { id: '3', institutionName: 'Unknown Bank' }
        ];
        
        const result = AccountMatcher.suggestMappings(items, sampleAccounts);
        
        assert(Object.keys(result.suggestions).length === 2, 'Should have 2 suggestions');
        assert(result.unmatchedInstitutions.length === 1, 'Should have 1 unmatched');
        assert(result.unmatchedInstitutions[0] === 'Unknown Bank', 'Should identify Unknown Bank');
    })) passedTests++;

    // Test 13: Get institution list
    totalTests++;
    if (test('Get unique institution list', () => {
        const institutions = AccountMatcher.getInstitutionList(sampleAccounts);
        assert(Array.isArray(institutions), 'Should return an array');
        assert(institutions.length === 4, 'Should have 4 unique institutions');
        assert(institutions.includes('Chase'), 'Should include Chase');
    })) passedTests++;

    // Test 14: Sandbox vs Production environment
    totalTests++;
    if (test('Environment agnostic matching', () => {
        // Same matching logic should work for both sandbox and production accounts
        const sandboxAccounts = {
            'sandbox-1': { name: 'Chase Sandbox', institution: 'Chase', mask: '0000' }
        };
        
        const prodAccounts = {
            'prod-1': { name: 'Chase Real', institution: 'Chase', mask: '1234' }
        };
        
        const sandboxResult = AccountMatcher.matchInstitution('Chase', sandboxAccounts);
        const prodResult = AccountMatcher.matchInstitution('Chase', prodAccounts);
        
        assert(sandboxResult.matched === true, 'Should match sandbox account');
        assert(prodResult.matched === true, 'Should match prod account');
    })) passedTests++;

    console.log(`\n📊 Test Results: ${passedTests}/${totalTests} passed`);
    
    if (passedTests === totalTests) {
        console.log('✅ All tests passed!');
    } else {
        console.log(`❌ ${totalTests - passedTests} test(s) failed`);
    }
    
    return passedTests === totalTests;
};

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runAccountMatcherTests();
}
