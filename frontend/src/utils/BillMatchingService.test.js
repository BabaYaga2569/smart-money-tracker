// BillMatchingService.test.js - Tests for automated bill matching with Plaid transactions
import { PlaidIntegrationManager } from './PlaidIntegrationManager.js';

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

export const runBillMatchingTests = () => {
    console.log('🧪 Testing Automated Bill Detection and Matching\n');

    let passedTests = 0;
    let totalTests = 0;

    // Test 1: Fuzzy name matching with Levenshtein distance
    totalTests++;
    if (test('Fuzzy name matching - exact match', () => {
        const result = PlaidIntegrationManager.fuzzyMatch('Netflix', 'Netflix', 0.7);
        assert(result === true, 'Exact match should return true');
    })) passedTests++;

    totalTests++;
    if (test('Fuzzy name matching - partial match', () => {
        const result = PlaidIntegrationManager.fuzzyMatch('Netflix Subscription', 'Netflix', 0.7);
        assert(result === true, 'Partial match should return true');
    })) passedTests++;

    totalTests++;
    if (test('Fuzzy name matching - similar strings', () => {
        const result = PlaidIntegrationManager.fuzzyMatch('Comcast', 'Xfinity', 0.7);
        assert(result === false, 'Different strings should not match with default threshold');
    })) passedTests++;

    totalTests++;
    if (test('Fuzzy name matching - case insensitive', () => {
        const result = PlaidIntegrationManager.fuzzyMatch('NETFLIX', 'netflix', 0.7);
        assert(result === true, 'Case insensitive match should work');
    })) passedTests++;

    // Test 2: Match confidence calculation
    totalTests++;
    if (test('Match confidence - perfect match', () => {
        const bill = {
            name: 'Netflix',
            amount: 15.99,
            nextDueDate: '2025-01-15'
        };
        const transaction = {
            merchant_name: 'Netflix',
            amount: 15.99,
            date: '2025-01-15'
        };
        const confidence = PlaidIntegrationManager.calculateMatchConfidence(bill, transaction);
        assert(confidence === 100, `Perfect match should have 100% confidence, got ${confidence}`);
    })) passedTests++;

    totalTests++;
    if (test('Match confidence - amount tolerance', () => {
        const bill = {
            name: 'Netflix',
            amount: 15.99,
            nextDueDate: '2025-01-15'
        };
        const transaction = {
            merchant_name: 'Netflix',
            amount: 16.50, // Within 5% tolerance
            date: '2025-01-15'
        };
        const confidence = PlaidIntegrationManager.calculateMatchConfidence(bill, transaction);
        assert(confidence >= 60, `Should have reasonable confidence with small amount difference, got ${confidence}`);
    })) passedTests++;

    totalTests++;
    if (test('Match confidence - date proximity', () => {
        const bill = {
            name: 'Netflix',
            amount: 15.99,
            nextDueDate: '2025-01-15'
        };
        const transaction = {
            merchant_name: 'Netflix',
            amount: 15.99,
            date: '2025-01-18' // 3 days after due date
        };
        const confidence = PlaidIntegrationManager.calculateMatchConfidence(bill, transaction);
        assert(confidence > 70, `Should have reasonable confidence within 5 days, got ${confidence}`);
    })) passedTests++;

    totalTests++;
    if (test('Match confidence - partial name match', () => {
        const bill = {
            name: 'Electric Bill',
            amount: 125.50,
            nextDueDate: '2025-01-20'
        };
        const transaction = {
            merchant_name: 'PG&E Electric',
            amount: 125.50,
            date: '2025-01-20'
        };
        const confidence = PlaidIntegrationManager.calculateMatchConfidence(bill, transaction);
        assert(confidence > 50, `Should have moderate confidence with partial name match, got ${confidence}`);
    })) passedTests++;

    // Test 3: Transaction already used check
    totalTests++;
    if (test('Transaction already used - duplicate prevention', () => {
        const transactionId = 'txn_123';
        const bills = [
            {
                name: 'Netflix',
                amount: 15.99,
                paymentHistory: [
                    { transactionId: 'txn_123', paidDate: '2025-01-15' }
                ]
            },
            {
                name: 'Spotify',
                amount: 9.99,
                paymentHistory: []
            }
        ];
        const result = PlaidIntegrationManager.checkTransactionAlreadyUsed(transactionId, bills);
        assert(result !== null, 'Should find transaction already used');
        assert(result.name === 'Netflix', 'Should identify correct bill');
    })) passedTests++;

    totalTests++;
    if (test('Transaction not used - allows new match', () => {
        const transactionId = 'txn_456';
        const bills = [
            {
                name: 'Netflix',
                amount: 15.99,
                paymentHistory: [
                    { transactionId: 'txn_123', paidDate: '2025-01-15' }
                ]
            }
        ];
        const result = PlaidIntegrationManager.checkTransactionAlreadyUsed(transactionId, bills);
        assert(result === undefined || result === null, 'Should not find transaction');
    })) passedTests++;

    // Test 4: Bill matching algorithm - amount tolerance
    totalTests++;
    if (test('Bill matching - amount within 5% tolerance', async () => {
        // Set up a bills provider
        PlaidIntegrationManager.setBillsProvider(async () => [
            {
                name: 'Netflix',
                amount: 15.99,
                status: 'pending',
                nextDueDate: '2025-01-15'
            }
        ]);

        const matches = await PlaidIntegrationManager.findMatchingBills({
            amount: 16.50, // ~3% difference
            merchantName: 'Netflix',
            date: '2025-01-15',
            tolerance: 0.05
        });

        assert(matches.length === 1, `Should find 1 match, found ${matches.length}`);
    })) passedTests++;

    totalTests++;
    if (test('Bill matching - amount outside tolerance', async () => {
        PlaidIntegrationManager.setBillsProvider(async () => [
            {
                name: 'Netflix',
                amount: 15.99,
                status: 'pending',
                nextDueDate: '2025-01-15'
            }
        ]);

        const matches = await PlaidIntegrationManager.findMatchingBills({
            amount: 20.00, // >5% difference
            merchantName: 'Netflix',
            date: '2025-01-15',
            tolerance: 0.05
        });

        assert(matches.length === 0, `Should find 0 matches, found ${matches.length}`);
    })) passedTests++;

    // Test 5: Date proximity matching
    totalTests++;
    if (test('Bill matching - date within 5 days', async () => {
        PlaidIntegrationManager.setBillsProvider(async () => [
            {
                name: 'Phone Bill',
                amount: 65.00,
                status: 'pending',
                nextDueDate: '2025-01-15'
            }
        ]);

        const matches = await PlaidIntegrationManager.findMatchingBills({
            amount: 65.00,
            merchantName: 'Phone Bill',
            date: '2025-01-18', // 3 days after
            tolerance: 0.05
        });

        assert(matches.length === 1, `Should find 1 match within 5 days, found ${matches.length}`);
    })) passedTests++;

    totalTests++;
    if (test('Bill matching - date outside 5 days', async () => {
        PlaidIntegrationManager.setBillsProvider(async () => [
            {
                name: 'Phone Bill',
                amount: 65.00,
                status: 'pending',
                nextDueDate: '2025-01-15'
            }
        ]);

        const matches = await PlaidIntegrationManager.findMatchingBills({
            amount: 65.00,
            merchantName: 'Phone Bill',
            date: '2025-01-25', // 10 days after
            tolerance: 0.05
        });

        assert(matches.length === 0, `Should find 0 matches outside 5 days, found ${matches.length}`);
    })) passedTests++;

    // Test 6: Skip already paid bills
    totalTests++;
    if (test('Bill matching - skip paid bills', async () => {
        PlaidIntegrationManager.setBillsProvider(async () => [
            {
                name: 'Netflix',
                amount: 15.99,
                status: 'paid',
                isPaid: true,
                nextDueDate: '2025-01-15'
            },
            {
                name: 'Spotify',
                amount: 9.99,
                status: 'pending',
                nextDueDate: '2025-01-15'
            }
        ]);

        const matches = await PlaidIntegrationManager.findMatchingBills({
            amount: 15.99,
            merchantName: 'Netflix',
            date: '2025-01-15',
            tolerance: 0.05
        });

        assert(matches.length === 0, `Should skip paid bills, found ${matches.length} matches`);
    })) passedTests++;

    // Test 7: Merchant name fuzzy matching
    totalTests++;
    if (test('Bill matching - fuzzy merchant name', async () => {
        PlaidIntegrationManager.setBillsProvider(async () => [
            {
                name: 'Electric Bill',
                amount: 125.50,
                status: 'pending',
                nextDueDate: '2025-01-20'
            }
        ]);

        const matches = await PlaidIntegrationManager.findMatchingBills({
            amount: 125.50,
            merchantName: 'Electric Bill Payment', // Contains "Electric Bill"
            date: '2025-01-20',
            tolerance: 0.05
        });

        assert(matches.length === 1, `Should match with fuzzy name matching, found ${matches.length}`);
    })) passedTests++;

    // Test 8: Multiple bills - match most relevant
    totalTests++;
    if (test('Bill matching - multiple potential matches', async () => {
        PlaidIntegrationManager.setBillsProvider(async () => [
            {
                name: 'Netflix Basic',
                amount: 9.99,
                status: 'pending',
                nextDueDate: '2025-01-15'
            },
            {
                name: 'Netflix Premium',
                amount: 15.99,
                status: 'pending',
                nextDueDate: '2025-01-15'
            }
        ]);

        const matches = await PlaidIntegrationManager.findMatchingBills({
            amount: 15.99,
            merchantName: 'Netflix',
            date: '2025-01-15',
            tolerance: 0.05
        });

        assert(matches.length >= 1, `Should find at least 1 match, found ${matches.length}`);
        // Should prioritize exact amount match
        const exactMatch = matches.find(m => parseFloat(m.amount) === 15.99);
        assert(exactMatch !== undefined, 'Should include exact amount match');
    })) passedTests++;

    // Test 9: Levenshtein distance calculation
    totalTests++;
    if (test('Levenshtein distance - identical strings', () => {
        const distance = PlaidIntegrationManager.levenshteinDistance('test', 'test');
        assert(distance === 0, `Identical strings should have 0 distance, got ${distance}`);
    })) passedTests++;

    totalTests++;
    if (test('Levenshtein distance - single character difference', () => {
        const distance = PlaidIntegrationManager.levenshteinDistance('test', 'best');
        assert(distance === 1, `Single char difference should have distance 1, got ${distance}`);
    })) passedTests++;

    totalTests++;
    if (test('Levenshtein distance - completely different', () => {
        const distance = PlaidIntegrationManager.levenshteinDistance('abc', 'xyz');
        assert(distance === 3, `Completely different should have distance 3, got ${distance}`);
    })) passedTests++;

    // Test 10: Integration status
    totalTests++;
    if (test('Integration status tracking', () => {
        const status = PlaidIntegrationManager.getStatus();
        assert(status.hasOwnProperty('enabled'), 'Status should have enabled property');
        assert(status.hasOwnProperty('transactionTolerance'), 'Status should have transactionTolerance');
        assert(status.hasOwnProperty('autoMarkPaid'), 'Status should have autoMarkPaid');
    })) passedTests++;

    // Summary
    console.log(`\n📊 Bill Matching Tests Complete: ${passedTests}/${totalTests} passed`);
    
    if (passedTests === totalTests) {
        console.log('✨ All tests passed! Bill matching is working correctly.\n');
    } else {
        console.log(`⚠️  ${totalTests - passedTests} test(s) failed.\n`);
    }

    return { passedTests, totalTests };
};

// Auto-run if executed directly
if (typeof window === 'undefined') {
    runBillMatchingTests();
}
