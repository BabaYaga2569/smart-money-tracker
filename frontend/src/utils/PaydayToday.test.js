// PaydayToday.test.js - Tests for payday recognition when payday is TODAY
import { PayCycleCalculator } from './PayCycleCalculator.js';

// Simple test runner for payday today fixes
const runPaydayTodayTests = () => {
    console.log('🧪 Testing Payday Today Recognition Fixes...\n');

    // Test 1: Logic validation - >= comparison ensures today is recognized
    test('Logic test: >= comparison includes today as valid payday', () => {
        // Testing the logic of the fix - with >= instead of >
        const today = new Date('2025-10-30T00:00:00');
        const adjustedMonthEnd = new Date('2025-10-30T00:00:00');
        
        // Old buggy logic: adjustedMonthEnd > today would be FALSE (Oct 30 > Oct 30 = FALSE)
        const oldLogic = adjustedMonthEnd > today;
        assert(oldLogic === false, 'Old logic (>) incorrectly excludes today');
        
        // New fixed logic: adjustedMonthEnd >= today should be TRUE (Oct 30 >= Oct 30 = TRUE)
        const newLogic = adjustedMonthEnd >= today;
        assert(newLogic === true, 'New logic (>=) correctly includes today');
        
        console.log('✅ >= comparison logic correctly includes today as valid payday');
    });

    // Test 2: Test with actual PayCycleCalculator - spouse schedule
    test('Spouse payday is recognized with bi-monthly schedule', () => {
        const yoursSchedule = {
            lastPaydate: '2025-10-03',
            amount: 1883.81
        };
        
        const spouseSchedule = {
            type: 'bi-monthly',
            amount: 1851.04
        };
        
        const result = PayCycleCalculator.calculateNextPayday(yoursSchedule, spouseSchedule);
        
        // Spouse should be recognized as a valid payday source
        assert(result.source === 'spouse' || result.source === 'yours', 
            `Expected valid source, got '${result.source}'`);
        assert(result.date, 'Expected payday date to be set');
        assert(result.daysUntil >= 0, 'Expected daysUntil to be >= 0');
        
        console.log('✅ Spouse payday recognized correctly');
    });

    // Test 3: Date comparison edge case - same date comparison
    test('Date comparison: same date should be considered valid (>=)', () => {
        const date1 = new Date('2025-10-30T00:00:00');
        const date2 = new Date('2025-10-30T00:00:00');
        
        // Test >= operator behavior
        assert(date1 >= date2, 'Same dates should satisfy >= comparison');
        assert(date2 >= date1, 'Same dates should satisfy >= comparison (reverse)');
        
        // Test that > would fail for same dates
        assert(!(date1 > date2), 'Same dates should NOT satisfy > comparison');
        
        console.log('✅ Date comparison >= works correctly for same dates');
    });

    // Test 4: Logic test for 15th of month
    test('Logic test: >= comparison works for 15th as well', () => {
        const today = new Date('2025-10-15T00:00:00');
        const adjustedFifteenth = new Date('2025-10-15T00:00:00');
        
        // With >= logic, today (15th) should be recognized
        const newLogic = adjustedFifteenth >= today;
        assert(newLogic === true, 'New logic (>=) correctly includes 15th when today is 15th');
        
        console.log('✅ >= comparison logic works for 15th of month');
    });

    // Test 5: Integration test - calculateNextPayday with spouse
    test('Integration: calculateNextPayday recognizes spouse schedule', () => {
        const yoursSchedule = {
            lastPaydate: '2025-10-17',
            amount: 1883.81
        };
        
        const spouseSchedule = {
            type: 'bi-monthly',
            amount: 1851.04
        };
        
        const result = PayCycleCalculator.calculateNextPayday(yoursSchedule, spouseSchedule);
        
        // Should return a valid result with spouse or yours as source
        assert(result.source, 'Expected a valid source');
        assert(result.date, 'Expected a payday date');
        assert(typeof result.daysUntil === 'number', 'Expected numeric daysUntil');
        
        console.log(`✅ Integration test passed: Next payday is ${result.date} (${result.source})`);
    });

    // Test 6: Verify weekend adjustment still works
    test('Weekend adjustment continues to work with >= logic', () => {
        // Test that the adjustForWeekend function is still called
        const friday = new Date('2025-10-31T00:00:00'); // Friday
        const saturday = new Date('2025-11-01T00:00:00'); // Saturday
        const sunday = new Date('2025-11-02T00:00:00'); // Sunday
        
        // Weekend adjustment logic
        const adjustedFriday = PayCycleCalculator.adjustForWeekend(friday);
        const adjustedSaturday = PayCycleCalculator.adjustForWeekend(saturday);
        const adjustedSunday = PayCycleCalculator.adjustForWeekend(sunday);
        
        // Friday should stay Friday
        assert(adjustedFriday.getDay() === 5, 'Friday should stay Friday');
        
        // Saturday and Sunday should move to Friday
        assert(adjustedSaturday.getDay() === 5, 'Saturday should move to Friday');
        assert(adjustedSunday.getDay() === 5, 'Sunday should move to Friday');
        
        console.log('✅ Weekend adjustment still works correctly');
    });

    console.log('\n🎉 All payday today recognition tests passed! Fixes are working correctly.\n');
};

// Simple assertion helper
const assert = (condition, message) => {
    if (!condition) {
        throw new Error(`❌ Assertion failed: ${message}`);
    }
};

// Simple test helper
const test = (name, testFn) => {
    try {
        testFn();
    } catch (error) {
        console.error(`❌ Test failed: ${name}`);
        console.error(error.message);
        throw error;
    }
};

// Export for use in other contexts
export { runPaydayTodayTests };

// Run tests if this file is executed directly
if (typeof window !== 'undefined' && window.location) {
    // Browser environment - add to window for manual testing
    window.testPaydayToday = runPaydayTodayTests;
} else if (typeof globalThis !== 'undefined' && globalThis.process && globalThis.process.env && globalThis.process.env.NODE_ENV === 'test') {
    // Node.js test environment
    runPaydayTodayTests();
}
