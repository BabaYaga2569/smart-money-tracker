// SpendabilityBillLoading.test.js - Test for multi-source bill loading logic
// This test verifies that bills are correctly merged from multiple sources

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

// Mock bill merging and deduplication logic (mirrors the actual logic in Spendability.jsx)
const mergeBills = (oneTimeBills, recurringBills, subscriptionBills) => {
    // Merge all bills
    const allBills = [
        ...oneTimeBills,
        ...recurringBills,
        ...subscriptionBills
    ];

    // Deduplicate (same name + same due date = duplicate)
    const uniqueBills = [];
    const seen = new Set();

    for (const bill of allBills) {
        const key = `${bill.name}-${bill.dueDate}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueBills.push(bill);
        }
    }

    return uniqueBills;
};

// Run tests
const runBillMergingTests = () => {
    console.log('🧪 Testing Bill Merging and Deduplication Logic...\n');

    // Test 1: Merge bills from different sources without duplicates
    test('Merges bills from three sources correctly', () => {
        const oneTimeBills = [
            { name: 'Geico Charger', amount: 307.71, dueDate: '2025-10-28' }
        ];
        
        const recurringBills = [
            { name: 'Food', amount: 800, dueDate: '2025-10-30' },
            { name: 'Rent', amount: 350, dueDate: '2025-10-30' }
        ];
        
        const subscriptionBills = [
            { name: 'Netflix', amount: 15.99, dueDate: '2025-11-01' }
        ];

        const merged = mergeBills(oneTimeBills, recurringBills, subscriptionBills);
        
        assert(merged.length === 4, `Expected 4 bills, got ${merged.length}`);
        assert(merged.some(b => b.name === 'Geico Charger'), 'Should include Geico Charger');
        assert(merged.some(b => b.name === 'Food'), 'Should include Food');
        assert(merged.some(b => b.name === 'Rent'), 'Should include Rent');
        assert(merged.some(b => b.name === 'Netflix'), 'Should include Netflix');
    });

    // Test 2: Deduplicate bills with same name and date
    test('Deduplicates bills with same name and due date', () => {
        const oneTimeBills = [
            { name: 'Electric Bill', amount: 100, dueDate: '2025-10-30' }
        ];
        
        const recurringBills = [
            { name: 'Electric Bill', amount: 100, dueDate: '2025-10-30' } // Duplicate
        ];
        
        const subscriptionBills = [];

        const merged = mergeBills(oneTimeBills, recurringBills, subscriptionBills);
        
        assert(merged.length === 1, `Expected 1 bill after deduplication, got ${merged.length}`);
        assert(merged[0].name === 'Electric Bill', 'Should keep Electric Bill');
    });

    // Test 3: Keep bills with same name but different dates
    test('Keeps bills with same name but different due dates', () => {
        const oneTimeBills = [
            { name: 'Credit Card', amount: 500, dueDate: '2025-10-15' }
        ];
        
        const recurringBills = [
            { name: 'Credit Card', amount: 600, dueDate: '2025-11-15' } // Different date
        ];
        
        const subscriptionBills = [];

        const merged = mergeBills(oneTimeBills, recurringBills, subscriptionBills);
        
        assert(merged.length === 2, `Expected 2 bills with different dates, got ${merged.length}`);
    });

    // Test 4: Handle empty sources
    test('Handles empty bill sources gracefully', () => {
        const oneTimeBills = [];
        const recurringBills = [];
        const subscriptionBills = [];

        const merged = mergeBills(oneTimeBills, recurringBills, subscriptionBills);
        
        assert(merged.length === 0, `Expected 0 bills, got ${merged.length}`);
    });

    // Test 5: Handle only one source having bills
    test('Works correctly when only one source has bills', () => {
        const oneTimeBills = [];
        const recurringBills = [];
        const subscriptionBills = [
            { name: 'Spotify', amount: 9.99, dueDate: '2025-11-05' },
            { name: 'Apple Music', amount: 10.99, dueDate: '2025-11-10' }
        ];

        const merged = mergeBills(oneTimeBills, recurringBills, subscriptionBills);
        
        assert(merged.length === 2, `Expected 2 subscription bills, got ${merged.length}`);
    });

    // Test 6: Real-world scenario from problem statement
    test('Real-world scenario: Load Geico, Food, and Rent correctly', () => {
        const oneTimeBills = [
            { name: 'Geico Charger', amount: 307.71, dueDate: '2025-10-28' }
        ];
        
        const recurringBills = [
            { name: 'Food', amount: 800, dueDate: '2025-10-30' },
            { name: 'Rent', amount: 350, dueDate: '2025-10-30' }
        ];
        
        const subscriptionBills = [];

        const merged = mergeBills(oneTimeBills, recurringBills, subscriptionBills);
        
        const totalAmount = merged.reduce((sum, bill) => sum + bill.amount, 0);
        
        assert(merged.length === 3, `Expected 3 bills, got ${merged.length}`);
        assert(Math.abs(totalAmount - 1457.71) < 0.01, `Expected total $1,457.71, got $${totalAmount.toFixed(2)}`);
    });

    console.log('\n✅ All bill merging tests passed!\n');
};

// Run the tests only when executed directly (not when imported)
// In ES modules, we check if import.meta.url matches the entry point
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
    runBillMergingTests();
}

// Export for use in other test files (if needed)
export { runBillMergingTests, mergeBills };
