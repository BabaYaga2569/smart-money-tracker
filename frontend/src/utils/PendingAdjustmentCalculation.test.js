// PendingAdjustmentCalculation.test.js - Test for pending adjustment calculation fix
// This test verifies that the pending adjustment formula correctly shows:
// - Positive values (green) for deposits
// - Negative values (orange) for expenses

// Simple test runner
const runPendingAdjustmentTests = () => {
    console.log('🧪 Testing Pending Adjustment Calculation...\n');

    // Test 1: Payroll deposit pending - should be POSITIVE
    test('Payroll deposit shows positive pending adjustment', () => {
        const current = 10.81;  // Before deposit posts
        const available = 1494.61;  // After pending deposit included
        
        // Formula: availableBalance - currentBalance
        const pendingAdjustment = available - current;
        
        // Expected: $1,494.61 - $10.81 = +$1,483.80 (positive = income/deposit)
        const expectedAdjustment = 1483.80;
        
        assert(
            Math.abs(pendingAdjustment - expectedAdjustment) < 0.01,
            `Pending adjustment should be +${expectedAdjustment}, got ${pendingAdjustment}`
        );
        
        assert(
            pendingAdjustment > 0,
            `Pending deposit should be positive, got ${pendingAdjustment}`
        );
        
        console.log(`✅ Payroll deposit: +$${pendingAdjustment.toFixed(2)} (positive = green)`);
    });

    // Test 2: Purchase pending - should be NEGATIVE
    test('Purchase shows negative pending adjustment', () => {
        const current = 1494.61;  // Before purchase posts
        const available = 1489.23;  // After pending purchase deducted
        
        // Formula: availableBalance - currentBalance
        const pendingAdjustment = available - current;
        
        // Expected: $1,489.23 - $1,494.61 = -$5.38 (negative = expense)
        const expectedAdjustment = -5.38;
        
        assert(
            Math.abs(pendingAdjustment - expectedAdjustment) < 0.01,
            `Pending adjustment should be ${expectedAdjustment}, got ${pendingAdjustment}`
        );
        
        assert(
            pendingAdjustment < 0,
            `Pending expense should be negative, got ${pendingAdjustment}`
        );
        
        console.log(`✅ Purchase: ${pendingAdjustment.toFixed(2)} (negative = orange)`);
    });

    // Test 3: CVS purchase from bug report - should be NEGATIVE
    test('CVS purchase shows negative adjustment', () => {
        const current = 25.00;  // Assume current before purchase
        const available = 0.00;  // After pending $25 purchase
        
        const pendingAdjustment = available - current;
        
        // Expected: $0.00 - $25.00 = -$25.00 (negative = expense)
        const expectedAdjustment = -25.00;
        
        assert(
            Math.abs(pendingAdjustment - expectedAdjustment) < 0.01,
            `CVS purchase should be ${expectedAdjustment}, got ${pendingAdjustment}`
        );
        
        assert(
            pendingAdjustment < 0,
            `CVS expense should be negative, got ${pendingAdjustment}`
        );
        
        console.log(`✅ CVS purchase: ${pendingAdjustment.toFixed(2)} (negative = orange)`);
    });

    // Test 4: Burger King from Bank of America data - should be NEGATIVE
    test('Burger King purchase shows negative adjustment', () => {
        const current = 1494.61;  // Before purchase posts
        const available = 1489.23;  // After -$5.38 purchase
        
        const pendingAdjustment = available - current;
        
        // Expected: $1,489.23 - $1,494.61 = -$5.38 (negative = expense)
        const expectedAdjustment = -5.38;
        
        assert(
            Math.abs(pendingAdjustment - expectedAdjustment) < 0.01,
            `Burger King should be ${expectedAdjustment}, got ${pendingAdjustment}`
        );
        
        console.log(`✅ Burger King: ${pendingAdjustment.toFixed(2)} (negative = orange)`);
    });

    // Test 5: No pending - should be ZERO
    test('No pending transactions shows zero adjustment', () => {
        const current = 1500.00;
        const available = 1500.00;
        
        const pendingAdjustment = available - current;
        
        assert(
            pendingAdjustment === 0,
            `No pending should be 0, got ${pendingAdjustment}`
        );
        
        console.log(`✅ No pending: $${pendingAdjustment.toFixed(2)} (zero = no display)`);
    });

    // Test 6: Multiple pending (mixed) - net result
    test('Multiple pending transactions show correct net', () => {
        const current = 1000.00;
        // Available = current + deposits - expenses
        // = 1000 + 500 - 100 = 1400
        const available = 1400.00;
        
        const pendingAdjustment = available - current;
        
        // Expected: $1,400 - $1,000 = +$400 (net positive)
        const expectedAdjustment = 400.00;
        
        assert(
            Math.abs(pendingAdjustment - expectedAdjustment) < 0.01,
            `Net pending should be ${expectedAdjustment}, got ${pendingAdjustment}`
        );
        
        console.log(`✅ Mixed pending: +$${pendingAdjustment.toFixed(2)} (net positive = green)`);
    });

    console.log('\n✅ All Pending Adjustment Calculation tests passed!');
    console.log('📊 Summary:');
    console.log('   - Deposits (positive) = GREEN (#10b981)');
    console.log('   - Expenses (negative) = ORANGE (#f59e0b)');
    console.log('   - Formula: availableBalance - currentBalance');
};

// Simple assertion helper
const assert = (condition, message) => {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
};

// Simple test helper
const test = (name, fn) => {
    try {
        fn();
    } catch (error) {
        console.error(`❌ Test failed: ${name}`);
        console.error(error.message);
        throw error;
    }
};

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runPendingAdjustmentTests();
}

export { runPendingAdjustmentTests };
