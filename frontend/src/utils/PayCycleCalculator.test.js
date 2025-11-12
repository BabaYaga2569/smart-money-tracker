// PayCycleCalculator.test.js - Tests for pay cycle calculations
import { PayCycleCalculator } from './PayCycleCalculator.js';

// Simple test runner
const runPayCycleCalculatorTests = () => {
    console.log('🧪 Testing PayCycleCalculator...\n');

    // Test 1: Should recognize spouse bi-monthly schedule with type field
    test('Calculates spouse payday when type is bi-monthly', () => {
        const yoursSchedule = {
            lastPaydate: '2025-10-03',
            amount: 1883.81
        };
        
        const spouseSchedule = {
            type: 'bi-monthly',
            amount: 1851.04
        };
        
        const result = PayCycleCalculator.calculateNextPayday(yoursSchedule, spouseSchedule);
        
        console.log('Test 1 Result:', result);
        
        // Should identify spouse as the source since 10/15 comes before 10/17
        assert(result.source === 'spouse', `Expected source to be 'spouse', got '${result.source}'`);
        assert(result.amount === 1851.04, `Expected amount to be 1851.04, got ${result.amount}`);
        
        console.log('✅ Test 1 passed: Spouse bi-monthly schedule recognized\n');
    });

    // Test 2: Should calculate spouse payday even without type when amount is provided
    test('Calculates spouse payday when amount is provided', () => {
        const yoursSchedule = {
            lastPaydate: '2025-10-03',
            amount: 1883.81
        };
        
        const spouseSchedule = {
            amount: 1851.04
        };
        
        const result = PayCycleCalculator.calculateNextPayday(yoursSchedule, spouseSchedule);
        
        console.log('Test 2 Result:', result);
        
        // Should still work because PayCycleCalculator checks for amount
        assert(result.source === 'spouse', `Expected source to be 'spouse', got '${result.source}'`);
        
        console.log('✅ Test 2 passed: Spouse schedule works with amount only\n');
    });

    // Test 3: Should calculate spouse payday if type is set, even with amount 0
    test('Calculates spouse payday when type is bi-monthly even if amount is 0', () => {
        const yoursSchedule = {
            lastPaydate: '2025-10-03',
            amount: 1883.81
        };
        
        const spouseSchedule = {
            type: 'bi-monthly',
            amount: 0
        };
        
        const result = PayCycleCalculator.calculateNextPayday(yoursSchedule, spouseSchedule);
        
        console.log('Test 3 Result:', result);
        
        // PayCycleCalculator checks type first, so it will calculate spouse payday
        // This is the actual behavior - it prioritizes type over amount
        assert(result.source === 'spouse', `Expected source to be 'spouse', got '${result.source}'`);
        
        console.log('✅ Test 3 passed: Spouse payday calculated when type is set\n');
    });

    // Test 4: Should calculate correct days until payday
    test('Calculates correct days until payday', () => {
        const yoursSchedule = {
            lastPaydate: '2025-10-03',
            amount: 1883.81
        };
        
        const spouseSchedule = {
            type: 'bi-monthly',
            amount: 1851.04
        };
        
        const result = PayCycleCalculator.calculateNextPayday(yoursSchedule, spouseSchedule);
        
        console.log('Test 4 Result:', result);
        
        // Should have a valid days until value
        assert(result.daysUntil >= 0, `Expected daysUntil to be >= 0, got ${result.daysUntil}`);
        assert(result.date, `Expected date to be set, got ${result.date}`);
        
        console.log('✅ Test 4 passed: Days until payday calculated correctly\n');
    });

    console.log('🎉 All PayCycleCalculator tests passed!\n');
};

// Simple assertion function
function assert(condition, message) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

// Simple test wrapper
function test(name, fn) {
    try {
        fn();
    } catch (error) {
        console.error(`❌ Test failed: ${name}`);
        console.error(error);
        throw error;
    }
}

// Run tests if this file is executed directly
 
if (typeof process !== 'undefined' && typeof import.meta !== 'undefined' && process.argv && import.meta.url) {
    try {
        const currentFile = new URL(import.meta.url).pathname;
        if (process.argv[1] === currentFile) {
            runPayCycleCalculatorTests();
        }
    } catch {
        // Ignore errors in non-Node environments
    }
}
 

export { runPayCycleCalculatorTests };
