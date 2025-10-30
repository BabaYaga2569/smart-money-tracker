// RecurringBillAutoAdvance.test.js - Test for recurring bill auto-advancement fix
import { RecurringManager } from './RecurringManager.js';
import { parseLocalDate } from './DateUtils.js';

// Simple test runner
const runTests = () => {
    console.log('🧪 Testing Recurring Bill Auto-Advancement Fix...\n');

    let passedTests = 0;
    let failedTests = 0;

    const assert = (condition, message) => {
        if (!condition) {
            console.error(`❌ FAILED: ${message}`);
            failedTests++;
            throw new Error(message);
        }
        passedTests++;
    };

    const test = (name, fn) => {
        try {
            console.log(`\n🧪 ${name}`);
            fn();
            console.log(`✅ PASSED: ${name}`);
        } catch (error) {
            console.error(`❌ FAILED: ${name}`);
            console.error(error.message);
        }
    };

    // Test 1: processRecurringItems should NOT auto-advance dates
    test('processRecurringItems does NOT auto-advance past/current dates', () => {
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        
        const recurringItem = {
            id: 'test-1',
            name: 'Food Bill',
            amount: 100,
            frequency: 'monthly',
            nextOccurrence: yesterday.toISOString().split('T')[0],
            status: 'active'
        };

        const processed = RecurringManager.processRecurringItems([recurringItem]);
        
        assert(processed.length === 1, 'Should have one processed item');
        
        const processedItem = processed[0];
        const processedDate = parseLocalDate(processedItem.nextOccurrence);
        const originalDate = parseLocalDate(recurringItem.nextOccurrence);
        
        // Critical: nextOccurrence should remain at yesterday, NOT auto-advanced
        assert(
            processedDate.toDateString() === originalDate.toDateString(),
            `nextOccurrence should stay at ${originalDate.toDateString()}, but got ${processedDate.toDateString()}`
        );
        
        console.log(`   ✓ nextOccurrence preserved: ${recurringItem.nextOccurrence}`);
    });

    // Test 2: calculateNextOccurrenceAfterPayment SHOULD advance date
    test('calculateNextOccurrenceAfterPayment advances date by one period', () => {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        
        const nextOccurrence = RecurringManager.calculateNextOccurrenceAfterPayment(todayStr, 'monthly');
        
        // Should be ~30 days in future
        const daysDiff = Math.floor((nextOccurrence - today) / (1000 * 60 * 60 * 24));
        
        assert(daysDiff >= 28 && daysDiff <= 31, `Should advance by ~30 days, got ${daysDiff} days`);
        
        console.log(`   ✓ Date advanced from ${todayStr} to ${nextOccurrence.toISOString().split('T')[0]} (${daysDiff} days)`);
    });

    // Test 3: Bills due today should remain visible (not auto-advanced)
    test('Bills due today remain visible in recurring list', () => {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        
        const recurringItem = {
            id: 'test-2',
            name: 'Electric Bill',
            amount: 125.50,
            frequency: 'monthly',
            nextOccurrence: todayStr,
            status: 'active'
        };

        const processed = RecurringManager.processRecurringItems([recurringItem]);
        const processedItem = processed[0];
        
        assert(
            processedItem.nextOccurrence === todayStr,
            'Bill due today should keep its date, not advance'
        );
        
        console.log(`   ✓ Bill due today stays visible at ${todayStr}`);
    });

    // Test 4: Overdue bills should remain visible until paid
    test('Overdue unpaid bills remain visible', () => {
        const today = new Date();
        const threeDaysAgo = new Date(today);
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
        const overdueStr = threeDaysAgo.toISOString().split('T')[0];
        
        const recurringItem = {
            id: 'test-3',
            name: 'Internet Bill',
            amount: 89.99,
            frequency: 'monthly',
            nextOccurrence: overdueStr,
            status: 'active'
        };

        const processed = RecurringManager.processRecurringItems([recurringItem]);
        const processedItem = processed[0];
        
        assert(
            processedItem.nextOccurrence === overdueStr,
            'Overdue bill should remain at original date'
        );
        
        console.log(`   ✓ Overdue bill stays visible at ${overdueStr}`);
    });

    // Test 5: Weekly frequency advance after payment
    test('calculateNextOccurrenceAfterPayment handles weekly frequency', () => {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        
        const nextOccurrence = RecurringManager.calculateNextOccurrenceAfterPayment(todayStr, 'weekly');
        
        const daysDiff = Math.floor((nextOccurrence - today) / (1000 * 60 * 60 * 24));
        
        // Allow for +/- 1 day due to timezone differences
        assert(daysDiff >= 6 && daysDiff <= 8, `Weekly should advance by ~7 days, got ${daysDiff} days`);
        
        console.log(`   ✓ Weekly frequency advances by ~7 days`);
    });

    // Test 6: Bi-weekly frequency advance after payment
    test('calculateNextOccurrenceAfterPayment handles bi-weekly frequency', () => {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        
        const nextOccurrence = RecurringManager.calculateNextOccurrenceAfterPayment(todayStr, 'bi-weekly');
        
        const daysDiff = Math.floor((nextOccurrence - today) / (1000 * 60 * 60 * 24));
        
        // Allow for +/- 1 day due to timezone differences
        assert(daysDiff >= 13 && daysDiff <= 15, `Bi-weekly should advance by ~14 days, got ${daysDiff} days`);
        
        console.log(`   ✓ Bi-weekly frequency advances by ~14 days`);
    });

    // Test 7: Quarterly frequency advance after payment
    test('calculateNextOccurrenceAfterPayment handles quarterly frequency', () => {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        
        const nextOccurrence = RecurringManager.calculateNextOccurrenceAfterPayment(todayStr, 'quarterly');
        
        const daysDiff = Math.floor((nextOccurrence - today) / (1000 * 60 * 60 * 24));
        
        assert(daysDiff >= 89 && daysDiff <= 92, `Quarterly should advance by ~90 days, got ${daysDiff} days`);
        
        console.log(`   ✓ Quarterly frequency advances by ~90 days`);
    });

    // Test 8: Annual frequency advance after payment
    test('calculateNextOccurrenceAfterPayment handles annual frequency', () => {
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        
        const nextOccurrence = RecurringManager.calculateNextOccurrenceAfterPayment(todayStr, 'annually');
        
        const daysDiff = Math.floor((nextOccurrence - today) / (1000 * 60 * 60 * 24));
        
        // Allow for +/- 1 day due to timezone differences
        assert(daysDiff >= 364 && daysDiff <= 366, `Annual should advance by ~365 days, got ${daysDiff} days`);
        
        console.log(`   ✓ Annual frequency advances by ~365 days`);
    });

    // Test 9: Month-end date handling
    test('calculateNextOccurrenceAfterPayment handles month-end dates properly', () => {
        // Test Jan 31 -> Feb 28/29
        const jan31 = '2025-01-31';
        const nextOccurrence = RecurringManager.calculateNextOccurrenceAfterPayment(jan31, 'monthly');
        const nextDateStr = nextOccurrence.toISOString().split('T')[0];
        
        // Parse both dates for comparison
        const nextDateObj = parseLocalDate(nextDateStr);
        
        // Should be Feb (month 1) and last day of Feb
        assert(
            nextDateObj.getMonth() === 1 && nextDateObj.getDate() >= 28,
            `Jan 31 should advance to last day of Feb, got ${nextDateStr}`
        );
        
        console.log(`   ✓ Month-end date handled: ${jan31} -> ${nextDateStr}`);
    });

    console.log('\n' + '='.repeat(60));
    console.log(`📊 Test Results: ${passedTests} passed, ${failedTests} failed`);
    console.log('='.repeat(60));

    return { passedTests, failedTests };
};

// Run tests if this file is executed directly
if (typeof window === 'undefined') {
    runTests();
}

export { runTests };
