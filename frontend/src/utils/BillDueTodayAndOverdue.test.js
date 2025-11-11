// BillDueTodayAndOverdue.test.js - Tests for bills due today and overdue unpaid bills
import { RecurringBillManager } from './RecurringBillManager.js';

// Simple test runner for bill due today and overdue bill fixes
const runBillDueTodayAndOverdueTests = () => {
    console.log('🧪 Testing Bill Due Today and Overdue Bill Fixes...\n');

    // Test 1: Bills due TODAY should not be advanced to next month
    test('Bills due today should not be advanced', () => {
        const today = new Date('2025-10-30');
        
        const bill = {
            name: 'Food Bill',
            amount: '800',
            dueDate: '2025-10-30', // Due TODAY
            recurrence: 'monthly',
            status: 'pending'
        };
        
        const nextDueDate = RecurringBillManager.getNextDueDate(bill, today);
        const nextDueDateStr = nextDueDate.toISOString().split('T')[0];
        
        assert(nextDueDateStr === '2025-10-30', `Bill due today should stay at 2025-10-30, but got ${nextDueDateStr}`);
        console.log('✅ Bills due today are not advanced');
    });

    // Test 2: Bills due today should appear in "Bills Due Before Payday"
    test('Bills due today should appear in bills due before payday', () => {
        const payday = new Date('2025-10-30');
        
        const bills = [
            {
                name: 'Food',
                amount: '800',
                dueDate: '2025-10-30',
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
            }
        ];
        
        const billsDue = RecurringBillManager.getBillsDueBefore(bills, payday);
        
        assert(billsDue.length === 2, `Expected 2 bills due on payday, got ${billsDue.length}`);
        
        const total = billsDue.reduce((sum, bill) => sum + parseFloat(bill.amount), 0);
        assert(Math.abs(total - 1150) < 0.01, `Total should be $1,150.00, got $${total}`);
        
        console.log('✅ Bills due on payday are included in bills due before payday');
    });

    // Test 3: Unpaid bills past due date should remain visible
    test('Unpaid bills past due date should remain visible', () => {
        const today = new Date('2025-10-31'); // One day after bill due date
        
        const bill = {
            name: 'Food Bill',
            amount: '800',
            dueDate: '2025-10-30', // Due yesterday (overdue)
            recurrence: 'monthly',
            status: 'pending'
            // No lastPaidDate or lastPayment - bill is unpaid
        };
        
        const nextDueDate = RecurringBillManager.getNextDueDate(bill, today);
        const nextDueDateStr = nextDueDate.toISOString().split('T')[0];
        
        assert(nextDueDateStr === '2025-10-30', `Unpaid overdue bill should stay at 2025-10-30, but got ${nextDueDateStr}`);
        console.log('✅ Unpaid overdue bills remain at their original due date');
    });

    // Test 4: Unpaid overdue bills should appear in "Bills Due Before Payday"
    test('Unpaid overdue bills should appear in bills due before payday', () => {
        const today = new Date('2025-10-31'); // One day after bill due date
        const payday = new Date('2025-11-15'); // Future payday
        
        const bill = {
            name: 'Food Bill',
            amount: '800',
            dueDate: '2025-10-30', // Due yesterday (overdue)
            recurrence: 'monthly',
            status: 'pending'
            // No lastPaidDate or lastPayment - bill is unpaid
        };
        
        // Process the bill to calculate nextDueDate
        const processedBills = RecurringBillManager.processBills([bill], today);
        
        // Get bills due before payday
        const billsDue = RecurringBillManager.getBillsDueBefore(processedBills, payday);
        
        assert(billsDue.length === 1, `Expected 1 unpaid overdue bill, got ${billsDue.length}`);
        assert(billsDue[0].name === 'Food Bill', 'Food Bill should be in the list');
        
        console.log('✅ Unpaid overdue bills appear in bills due before payday');
    });

    // Test 5: Paid bills should be advanced to next billing cycle
    test('Paid bills should be advanced to next billing cycle', () => {
        const today = new Date('2025-10-31'); // One day after bill due date
        
        const bill = {
            name: 'Food Bill',
            amount: '800',
            dueDate: '2025-10-30',
            recurrence: 'monthly',
            status: 'pending'
        };
        
        // Mark bill as paid
        const paidBill = RecurringBillManager.markBillAsPaid(bill, new Date('2025-10-30'));
        
        // Now get next due date - should advance to next month
        const nextDueDate = RecurringBillManager.getNextDueDate(paidBill, today);
        const nextDueDateStr = nextDueDate.toISOString().split('T')[0];
        
        assert(nextDueDateStr === '2025-11-30', `Paid bill should advance to 2025-11-30, but got ${nextDueDateStr}`);
        console.log('✅ Paid bills are advanced to next billing cycle');
    });

    // Test 6: Paid bills should NOT appear in "Bills Due Before Payday"
    test('Paid bills should not appear in bills due before payday', () => {
        const today = new Date('2025-10-31');
        const payday = new Date('2025-11-15');
        
        const bill = {
            name: 'Food Bill',
            amount: '800',
            dueDate: '2025-10-30',
            recurrence: 'monthly',
            status: 'pending'
        };
        
        // Mark bill as paid
        const paidBill = RecurringBillManager.markBillAsPaid(bill, new Date('2025-10-30'));
        
        // Process the bill
        const processedBills = RecurringBillManager.processBills([paidBill], today);
        
        // Get bills due before payday
        const billsDue = RecurringBillManager.getBillsDueBefore(processedBills, payday);
        
        assert(billsDue.length === 0, `Expected 0 bills (paid bill should not appear), got ${billsDue.length}`);
        console.log('✅ Paid bills do not appear in bills due before payday');
    });

    // Test 7: Weekly bills due today should not be advanced
    test('Weekly bills due today should not be advanced', () => {
        const today = new Date('2025-10-30');
        
        const bill = {
            name: 'Weekly Grocery',
            amount: '100',
            dueDate: '2025-10-30', // Due TODAY
            recurrence: 'weekly',
            status: 'pending'
        };
        
        const nextDueDate = RecurringBillManager.getNextDueDate(bill, today);
        const nextDueDateStr = nextDueDate.toISOString().split('T')[0];
        
        assert(nextDueDateStr === '2025-10-30', `Weekly bill due today should stay at 2025-10-30, but got ${nextDueDateStr}`);
        console.log('✅ Weekly bills due today are not advanced');
    });

    // Test 8: Bi-weekly bills due today should not be advanced
    test('Bi-weekly bills due today should not be advanced', () => {
        const today = new Date('2025-10-30');
        
        const bill = {
            name: 'Bi-weekly Expense',
            amount: '200',
            dueDate: '2025-10-30', // Due TODAY
            recurrence: 'bi-weekly',
            status: 'pending'
        };
        
        const nextDueDate = RecurringBillManager.getNextDueDate(bill, today);
        const nextDueDateStr = nextDueDate.toISOString().split('T')[0];
        
        assert(nextDueDateStr === '2025-10-30', `Bi-weekly bill due today should stay at 2025-10-30, but got ${nextDueDateStr}`);
        console.log('✅ Bi-weekly bills due today are not advanced');
    });

    // Test 9: Quarterly bills due today should not be advanced
    test('Quarterly bills due today should not be advanced', () => {
        const today = new Date('2025-10-30');
        
        const bill = {
            name: 'Quarterly Tax',
            amount: '500',
            dueDate: '2025-10-30', // Due TODAY
            recurrence: 'quarterly',
            status: 'pending'
        };
        
        const nextDueDate = RecurringBillManager.getNextDueDate(bill, today);
        const nextDueDateStr = nextDueDate.toISOString().split('T')[0];
        
        assert(nextDueDateStr === '2025-10-30', `Quarterly bill due today should stay at 2025-10-30, but got ${nextDueDateStr}`);
        console.log('✅ Quarterly bills due today are not advanced');
    });

    // Test 10: Annual bills due today should not be advanced
    test('Annual bills due today should not be advanced', () => {
        const today = new Date('2025-10-30');
        
        const bill = {
            name: 'Annual Subscription',
            amount: '1200',
            dueDate: '2025-10-30', // Due TODAY
            recurrence: 'annually',
            status: 'pending'
        };
        
        const nextDueDate = RecurringBillManager.getNextDueDate(bill, today);
        const nextDueDateStr = nextDueDate.toISOString().split('T')[0];
        
        assert(nextDueDateStr === '2025-10-30', `Annual bill due today should stay at 2025-10-30, but got ${nextDueDateStr}`);
        console.log('✅ Annual bills due today are not advanced');
    });

    console.log('\n🎉 All bill due today and overdue bill tests passed! Fixes are working correctly.\n');
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
export { runBillDueTodayAndOverdueTests };

// Run tests if this file is executed directly
if (typeof window !== 'undefined' && window.location) {
    // Browser environment - add to window for manual testing
    window.testBillDueTodayAndOverdue = runBillDueTodayAndOverdueTests;
} else if (typeof globalThis !== 'undefined' && globalThis.process && globalThis.process.env && globalThis.process.env.NODE_ENV === 'test') {
    // Node.js test environment
    runBillDueTodayAndOverdueTests();
}
