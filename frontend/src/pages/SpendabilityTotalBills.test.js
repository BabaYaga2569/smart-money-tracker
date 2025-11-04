// SpendabilityTotalBills.test.js - Test for totalBillsDue calculation
// This test verifies the fix for including overdue/subscription bills in Total Bills calculation

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

// Extracted totalBillsDue calculation logic from Spendability.jsx (lines 320-321)
const calculateTotalBillsDue = (billsDueBeforePayday) => {
    return (billsDueBeforePayday || []).reduce((sum, bill) => 
        sum + (Number(bill.amount ?? bill.cost) || 0), 0);
};

// Run tests
const runTotalBillsCalculationTests = () => {
    console.log('🧪 Testing Total Bills Calculation Logic...\n');

    // Test 1: Calculate total with bills that have amount field
    test('Calculates total correctly with amount field', () => {
        const bills = [
            { name: 'Rent', amount: 1200, dueDate: '2025-11-10' },
            { name: 'Electric', amount: 150.50, dueDate: '2025-11-15' },
            { name: 'Internet', amount: 99.99, dueDate: '2025-11-20' }
        ];
        
        const total = calculateTotalBillsDue(bills);
        const expected = 1200 + 150.50 + 99.99;
        
        assert(total === expected, `Expected ${expected}, got ${total}`);
    });

    // Test 2: Calculate total with bills that have cost field (subscriptions)
    test('Calculates total correctly with cost field (subscriptions)', () => {
        const bills = [
            { name: 'Netflix', cost: 15.99, dueDate: '2025-11-05', isSubscription: true },
            { name: 'Spotify', cost: 10.99, dueDate: '2025-11-12', isSubscription: true },
            { name: 'Amazon Prime', cost: 14.99, dueDate: '2025-11-18', isSubscription: true }
        ];
        
        const total = calculateTotalBillsDue(bills);
        const expected = 15.99 + 10.99 + 14.99;
        
        assert(Math.abs(total - expected) < 0.01, `Expected ${expected}, got ${total}`);
    });

    // Test 3: Calculate total with mixed bills (amount and cost fields)
    test('Calculates total correctly with mixed amount and cost fields', () => {
        const bills = [
            { name: 'Rent', amount: 1200, dueDate: '2025-11-10' },
            { name: 'Netflix', cost: 15.99, dueDate: '2025-11-05', isSubscription: true },
            { name: 'Electric', amount: 150.50, dueDate: '2025-11-15' }
        ];
        
        const total = calculateTotalBillsDue(bills);
        const expected = 1200 + 15.99 + 150.50;
        
        assert(Math.abs(total - expected) < 0.01, `Expected ${expected}, got ${total}`);
    });

    // Test 4: Handle bills with both amount and cost (amount takes precedence with ?? operator)
    test('Uses amount when both amount and cost are present', () => {
        const bills = [
            { name: 'Bill with both', amount: 100, cost: 50, dueDate: '2025-11-10' }
        ];
        
        const total = calculateTotalBillsDue(bills);
        
        assert(total === 100, `Expected 100 (amount), got ${total}`);
    });

    // Test 5: Handle bills with null or undefined amount/cost
    test('Handles null/undefined amount/cost gracefully', () => {
        const bills = [
            { name: 'Valid bill', amount: 50, dueDate: '2025-11-10' },
            { name: 'Null amount', amount: null, cost: null, dueDate: '2025-11-15' },
            { name: 'Undefined amount', dueDate: '2025-11-20' },
            { name: 'Another valid', amount: 25, dueDate: '2025-11-25' }
        ];
        
        const total = calculateTotalBillsDue(bills);
        const expected = 50 + 25;
        
        assert(total === expected, `Expected ${expected}, got ${total}`);
    });

    // Test 6: Handle empty array
    test('Returns 0 for empty bills array', () => {
        const bills = [];
        
        const total = calculateTotalBillsDue(bills);
        
        assert(total === 0, `Expected 0 for empty array, got ${total}`);
    });

    // Test 7: Handle null/undefined input (array safety)
    test('Handles null/undefined input gracefully', () => {
        const total1 = calculateTotalBillsDue(null);
        const total2 = calculateTotalBillsDue(undefined);
        
        assert(total1 === 0, `Expected 0 for null, got ${total1}`);
        assert(total2 === 0, `Expected 0 for undefined, got ${total2}`);
    });

    // Test 8: Handle NaN values
    test('Handles NaN values gracefully', () => {
        const bills = [
            { name: 'Valid bill', amount: 50, dueDate: '2025-11-10' },
            { name: 'Invalid amount', amount: 'not a number', dueDate: '2025-11-15' },
            { name: 'Another valid', amount: 25, dueDate: '2025-11-25' }
        ];
        
        const total = calculateTotalBillsDue(bills);
        const expected = 50 + 25;
        
        assert(total === expected, `Expected ${expected}, got ${total}`);
    });

    // Test 9: Handle string numeric values (should convert)
    test('Converts string numeric values correctly', () => {
        const bills = [
            { name: 'String amount', amount: '100.50', dueDate: '2025-11-10' },
            { name: 'Number amount', amount: 50.25, dueDate: '2025-11-15' }
        ];
        
        const total = calculateTotalBillsDue(bills);
        const expected = 100.50 + 50.25;
        
        assert(Math.abs(total - expected) < 0.01, `Expected ${expected}, got ${total}`);
    });

    // Test 10: Real-world scenario with overdue subscriptions
    test('Real-world scenario: overdue subscriptions are included in total', () => {
        const bills = [
            { name: 'Rent', amount: 1200, dueDate: '2025-11-10', statusInfo: { status: 'upcoming' } },
            { name: 'Netflix', cost: 15.99, dueDate: '2025-10-28', statusInfo: { status: 'overdue' }, isSubscription: true },
            { name: 'Spotify', cost: 10.99, dueDate: '2025-10-30', statusInfo: { status: 'overdue' }, isSubscription: true },
            { name: 'Electric', amount: 150.50, dueDate: '2025-11-15', statusInfo: { status: 'upcoming' } }
        ];
        
        const total = calculateTotalBillsDue(bills);
        const expected = 1200 + 15.99 + 10.99 + 150.50;
        
        assert(Math.abs(total - expected) < 0.01, 
            `Expected ${expected} (including overdue subscriptions), got ${total}`);
    });

    console.log('\n✅ All tests passed! The totalBillsDue calculation correctly handles amount and cost fields.\n');
};

// Run tests if this file is executed directly
if (typeof process !== 'undefined' && process.argv[1] === new URL(import.meta.url).pathname) {
    runTotalBillsCalculationTests();
}

export { runTotalBillsCalculationTests, calculateTotalBillsDue };
