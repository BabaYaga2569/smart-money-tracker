// BillPaymentWorkflow.test.js - Test comprehensive bill payment fixes
import { RecurringBillManager } from './RecurringBillManager.js';
import { BillSortingManager } from './BillSortingManager.js';
import { NotificationManager } from './NotificationManager.js';
import { PlaidIntegrationManager } from './PlaidIntegrationManager.js';

// Simple test runner for the comprehensive bill fixes
const runBillWorkflowTests = () => {
    console.log('🧪 Testing Comprehensive Bill Payment Workflow Fixes...\n');

    // Test 1: Bill Marking as Paid and Next Due Date Calculation
    test('Bill marking as paid with next due date calculation', () => {
        const mockBill = {
            name: 'Electric Bill',
            amount: '125.50',
            dueDate: '2025-01-15',
            recurrence: 'monthly',
            status: 'pending'
        };

        const paidBill = RecurringBillManager.markBillAsPaid(mockBill, new Date('2025-01-15'));
        
        assert(paidBill.status === 'paid', 'Bill should be marked as paid');
        assert(paidBill.isPaid === true, 'Bill isPaid flag should be true');
        assert(paidBill.lastPaidDate, 'Bill should have lastPaidDate');
        assert(paidBill.nextDueDate, 'Bill should have nextDueDate calculated');
        
        // Next due date should be February 15th for monthly bill
        const nextDue = new Date(paidBill.nextDueDate);
        assert(nextDue.getMonth() === 1, 'Next due date should be February (month 1)'); // February = 1
        assert(nextDue.getDate() === 15, 'Next due date should be 15th');
        
        console.log('✅ Bill payment and next due date calculation working correctly');
    });

    // Test 2: Paid bills should never show as overdue
    test('Paid bills never show as overdue', () => {
        const overdueDate = '2025-01-01'; // Past date
        const paidBill = {
            name: 'Overdue Electric Bill',
            amount: '125.50',
            dueDate: overdueDate,
            nextDueDate: overdueDate,
            recurrence: 'monthly',
            status: 'paid',
            isPaid: true,
            lastPaidDate: '2025-01-01',
            lastPayment: {
                dueDate: overdueDate,
                amount: 125.50
            }
        };

        const unpaidOverdueBill = {
            name: 'Actually Overdue Bill',
            amount: '75.00',
            dueDate: overdueDate,
            nextDueDate: overdueDate,
            recurrence: 'monthly',
            status: 'pending'
        };

        const paydayDate = new Date('2025-01-30');
        const billsDue = RecurringBillManager.getBillsDueBefore([paidBill, unpaidOverdueBill], paydayDate);
        
        assert(billsDue.length === 1, 'Only unpaid overdue bill should be returned');
        assert(billsDue[0].name === 'Actually Overdue Bill', 'Should be the unpaid bill');
        assert(!RecurringBillManager.isBillPaidForCurrentCycle(unpaidOverdueBill), 'Unpaid bill should not be considered paid');
        assert(RecurringBillManager.isBillPaidForCurrentCycle(paidBill), 'Paid bill should be considered paid');
        
        console.log('✅ Paid bills correctly excluded from overdue lists');
    });

    // Test 3: Transaction creation and balance updates (mock test)
    test('Bill payment workflow includes transaction creation', () => {
        const mockBill = {
            name: 'Internet Bill',
            amount: '89.99',
            dueDate: '2025-01-10',
            recurrence: 'monthly',
            status: 'pending'
        };

        // Mark bill as paid - this should trigger transaction creation in real implementation
        const paidBill = RecurringBillManager.markBillAsPaid(mockBill, new Date('2025-01-10'));
        
        // Verify payment record was created (this simulates transaction creation)
        assert(paidBill.lastPayment, 'Payment record should be created');
        assert(paidBill.lastPayment.amount === 89.99, 'Payment amount should match bill amount');
        assert(paidBill.paymentHistory && paidBill.paymentHistory.length === 1, 'Payment history should be updated');
        
        // In real implementation, this would also:
        // - Create transaction in Firebase
        // - Update account balance
        // - Show success notification
        
        console.log('✅ Bill payment creates proper payment records');
    });

    // Test 4: Bill filtering respects paid status everywhere
    test('Bill filtering consistently respects paid status', () => {
        const bills = [
            {
                name: 'Paid Electric Bill',
                amount: '125.50',
                dueDate: '2025-01-15',
                nextDueDate: '2025-01-15',
                status: 'paid',
                isPaid: true
            },
            {
                name: 'Pending Water Bill',
                amount: '45.00',
                dueDate: '2025-01-18',
                nextDueDate: '2025-01-18',
                status: 'pending'
            },
            {
                name: 'Paid Internet Bill',
                amount: '89.99',
                dueDate: '2025-01-20',
                nextDueDate: '2025-01-20',
                status: 'paid',
                isPaid: true,
                lastPaidDate: '2025-01-20',
                lastPayment: {
                    dueDate: '2025-01-20',
                    amount: 89.99
                }
            }
        ];

        // Test getBillsDueBefore
        const billsDueBefore = RecurringBillManager.getBillsDueBefore(bills, new Date('2025-01-25'));
        assert(billsDueBefore.length === 1, 'Only unpaid bill should be due before date');
        assert(billsDueBefore[0].name === 'Pending Water Bill', 'Should be the unpaid water bill');

        // Test getBillsInRange
        const billsInRange = RecurringBillManager.getBillsInRange(bills, new Date('2025-01-10'), new Date('2025-01-25'));
        assert(billsInRange.length === 1, 'Only unpaid bill should be in range');
        assert(billsInRange[0].name === 'Pending Water Bill', 'Should be the unpaid water bill');

        // Test getTotalAmountInRange
        const totalAmount = RecurringBillManager.getTotalAmountInRange(bills, new Date('2025-01-10'), new Date('2025-01-25'));
        assert(totalAmount === 45.00, 'Total should only include unpaid bill amount');
        
        console.log('✅ All filtering methods consistently exclude paid bills');
    });

    // Test 5: Edge case - Bill paid multiple times doesn't break logic
    test('Bills paid multiple times handled correctly', () => {
        let bill = {
            name: 'Monthly Rent',
            amount: '1850.00',
            dueDate: '2025-01-01',
            recurrence: 'monthly',
            status: 'pending'
        };

        // Pay for January
        bill = RecurringBillManager.markBillAsPaid(bill, new Date('2025-01-01'));
        assert(bill.paymentHistory.length === 1, 'Should have one payment in history');
        
        // Try to pay again - in real implementation this would be prevented
        // But if it happens, it should handle gracefully
        const secondPayment = RecurringBillManager.markBillAsPaid(bill, new Date('2025-01-01'));
        assert(secondPayment.paymentHistory.length === 2, 'Should handle duplicate payments');
        
        // Should still be considered paid for current cycle
        assert(RecurringBillManager.isBillPaidForCurrentCycle(secondPayment), 'Should still be considered paid');
        
        console.log('✅ Multiple payments handled correctly');
    });

    // Test 6: Bill status determination consistency
    test('Bill status determination is consistent', () => {
        const paidBill = {
            name: 'Electric Bill',
            amount: '125.50',
            dueDate: '2025-02-15', // Next cycle
            nextDueDate: '2025-02-15',
            recurrence: 'monthly',
            status: 'paid',
            isPaid: true,
            lastPaidDate: '2025-01-15',
            lastPayment: {
                dueDate: '2025-01-15', // Paid for January cycle
                amount: 125.50
            }
        };

        const unpaidBill = {
            name: 'Water Bill',
            amount: '45.00',
            dueDate: '2025-01-20',
            nextDueDate: '2025-01-20',
            recurrence: 'monthly',
            status: 'pending'
        };

        // Both helper methods should give consistent results
        assert(RecurringBillManager.isBillPaidForCurrentCycle(paidBill), 'Helper should identify paid bill');
        assert(!RecurringBillManager.isBillPaidForCurrentCycle(unpaidBill), 'Helper should identify unpaid bill');
        
        console.log('✅ Bill status determination is consistent');
    });

    console.log('\n🎉 All comprehensive bill workflow tests passed! Fixes are working correctly.\n');
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
export { runBillWorkflowTests };

// Run tests if this file is executed directly
if (typeof window !== 'undefined' && window.location) {
    // Browser environment - add to window for manual testing
    window.testBillWorkflow = runBillWorkflowTests;
} else if (typeof globalThis !== 'undefined' && globalThis.process && globalThis.process.env && globalThis.process.env.NODE_ENV === 'test') {
    // Node.js test environment
    runBillWorkflowTests();
}