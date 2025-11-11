// BillsDueTodayTimezone.test.js - Test for timezone-safe date comparison in getBillsDueBefore
import { RecurringBillManager } from './RecurringBillManager.js';

// Simple test runner for timezone-aware date comparison
const runTimezoneTests = () => {
    console.log('🧪 Testing Timezone-Safe Date Comparison...\n');

    // Test 1: Bills due on exact payday date with different timezone representations
    test('Bills due on payday with timezone differences are included', () => {
        // Simulate payday at UTC midnight
        const paydayUTCMidnight = new Date('2025-10-30T00:00:00.000Z');
        
        // Bill dates that would be problematic with timezone-aware comparison
        // These represent the same calendar date but at different times
        const bills = [
            {
                name: 'Food',
                amount: '800',
                dueDate: '2025-10-30', // Will be parsed as local midnight
                nextDueDate: '2025-10-30',
                recurrence: 'monthly',
                status: 'pending'
            },
            {
                name: 'Rent',
                amount: '350',
                dueDate: '2025-10-30',
                nextDueDate: '2025-10-30',
                recurrence: 'monthly',
                status: 'pending'
            },
            {
                name: 'Southwest Gas',
                amount: '23.43',
                dueDate: '2025-10-29',
                nextDueDate: '2025-10-29',
                recurrence: 'monthly',
                status: 'pending'
            }
        ];
        
        const billsDue = RecurringBillManager.getBillsDueBefore(bills, paydayUTCMidnight);
        
        assert(billsDue.length === 3, `Expected 3 bills, got ${billsDue.length}`);
        assert(billsDue.some(b => b.name === 'Food'), 'Food bill should be included');
        assert(billsDue.some(b => b.name === 'Rent'), 'Rent bill should be included');
        assert(billsDue.some(b => b.name === 'Southwest Gas'), 'Southwest Gas bill should be included');
        
        console.log('✅ Bills due on payday included despite timezone differences');
    });

    // Test 2: Bills due after payday are excluded
    test('Bills due after payday are excluded', () => {
        const payday = new Date('2025-10-30T00:00:00.000Z');
        
        const bills = [
            {
                name: 'Future Bill',
                amount: '100',
                dueDate: '2025-10-31',
                nextDueDate: '2025-10-31',
                recurrence: 'monthly',
                status: 'pending'
            },
            {
                name: 'Way Future Bill',
                amount: '200',
                dueDate: '2025-11-15',
                nextDueDate: '2025-11-15',
                recurrence: 'monthly',
                status: 'pending'
            }
        ];
        
        const billsDue = RecurringBillManager.getBillsDueBefore(bills, payday);
        
        assert(billsDue.length === 0, `Expected 0 bills, got ${billsDue.length}`);
        
        console.log('✅ Bills due after payday correctly excluded');
    });

    // Test 3: Mix of bills before, on, and after payday
    test('Mixed bills: before, on, and after payday', () => {
        const payday = new Date('2025-10-30T12:00:00.000Z'); // Payday at noon UTC
        
        const bills = [
            {
                name: 'Before Bill',
                amount: '50',
                dueDate: '2025-10-28',
                nextDueDate: '2025-10-28',
                recurrence: 'monthly',
                status: 'pending'
            },
            {
                name: 'On Payday Bill',
                amount: '100',
                dueDate: '2025-10-30',
                nextDueDate: '2025-10-30',
                recurrence: 'monthly',
                status: 'pending'
            },
            {
                name: 'After Bill',
                amount: '150',
                dueDate: '2025-10-31',
                nextDueDate: '2025-10-31',
                recurrence: 'monthly',
                status: 'pending'
            }
        ];
        
        const billsDue = RecurringBillManager.getBillsDueBefore(bills, payday);
        
        assert(billsDue.length === 2, `Expected 2 bills, got ${billsDue.length}`);
        assert(billsDue.some(b => b.name === 'Before Bill'), 'Before Bill should be included');
        assert(billsDue.some(b => b.name === 'On Payday Bill'), 'On Payday Bill should be included');
        assert(!billsDue.some(b => b.name === 'After Bill'), 'After Bill should NOT be included');
        
        const total = billsDue.reduce((sum, bill) => sum + parseFloat(bill.amount), 0);
        assert(Math.abs(total - 150) < 0.01, `Total should be $150.00, got $${total}`);
        
        console.log('✅ Mixed bills correctly filtered by date');
    });

    // Test 4: getBillsInRange with timezone-safe comparison
    test('getBillsInRange handles timezone differences', () => {
        const startDate = new Date('2025-10-28T00:00:00.000Z');
        const endDate = new Date('2025-10-30T00:00:00.000Z');
        
        const bills = [
            {
                name: 'Before Range',
                amount: '25',
                dueDate: '2025-10-27',
                nextDueDate: '2025-10-27',
                recurrence: 'monthly',
                status: 'pending'
            },
            {
                name: 'Start of Range',
                amount: '50',
                dueDate: '2025-10-28',
                nextDueDate: '2025-10-28',
                recurrence: 'monthly',
                status: 'pending'
            },
            {
                name: 'In Range',
                amount: '75',
                dueDate: '2025-10-29',
                nextDueDate: '2025-10-29',
                recurrence: 'monthly',
                status: 'pending'
            },
            {
                name: 'End of Range',
                amount: '100',
                dueDate: '2025-10-30',
                nextDueDate: '2025-10-30',
                recurrence: 'monthly',
                status: 'pending'
            },
            {
                name: 'After Range',
                amount: '125',
                dueDate: '2025-10-31',
                nextDueDate: '2025-10-31',
                recurrence: 'monthly',
                status: 'pending'
            }
        ];
        
        const billsInRange = RecurringBillManager.getBillsInRange(bills, startDate, endDate);
        
        assert(billsInRange.length === 3, `Expected 3 bills in range, got ${billsInRange.length}`);
        assert(billsInRange.some(b => b.name === 'Start of Range'), 'Start of Range should be included');
        assert(billsInRange.some(b => b.name === 'In Range'), 'In Range should be included');
        assert(billsInRange.some(b => b.name === 'End of Range'), 'End of Range should be included');
        assert(!billsInRange.some(b => b.name === 'Before Range'), 'Before Range should NOT be included');
        assert(!billsInRange.some(b => b.name === 'After Range'), 'After Range should NOT be included');
        
        console.log('✅ getBillsInRange handles timezone-safe date ranges');
    });

    // Test 5: Payday created at different times of day (all same date)
    test('Payday at different times of day on same date', () => {
        const bills = [
            {
                name: 'Test Bill',
                amount: '100',
                dueDate: '2025-10-30',
                nextDueDate: '2025-10-30',
                recurrence: 'monthly',
                status: 'pending'
            }
        ];
        
        // Test with payday at different times on 2025-10-30
        const paydayMidnight = new Date('2025-10-30T00:00:00.000Z');
        const paydayNoon = new Date('2025-10-30T12:00:00.000Z');
        const paydayEndOfDay = new Date('2025-10-30T23:59:59.999Z');
        
        const resultMidnight = RecurringBillManager.getBillsDueBefore(bills, paydayMidnight);
        const resultNoon = RecurringBillManager.getBillsDueBefore(bills, paydayNoon);
        const resultEndOfDay = RecurringBillManager.getBillsDueBefore(bills, paydayEndOfDay);
        
        assert(resultMidnight.length === 1, 'Bill should be included at midnight');
        assert(resultNoon.length === 1, 'Bill should be included at noon');
        assert(resultEndOfDay.length === 1, 'Bill should be included at end of day');
        
        console.log('✅ Consistent results regardless of time component on same date');
    });

    console.log('\n🎉 All timezone-safe date comparison tests passed!\n');
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
export { runTimezoneTests };

// Run tests if this file is executed directly
if (typeof window !== 'undefined' && window.location) {
    // Browser environment - add to window for manual testing
    window.testTimezoneComparison = runTimezoneTests;
} else if (typeof globalThis !== 'undefined' && globalThis.process && globalThis.process.env && globalThis.process.env.NODE_ENV === 'test') {
    // Node.js test environment
    runTimezoneTests();
}
