// BillCycleReset.test.js - Integration test for bill cycle reset behavior
import { RecurringBillManager } from './RecurringBillManager.js';

// Simple assertion helper
const assert = (condition, message) => {
    if (!condition) {
        throw new Error(`âŒ Assertion failed: ${message}`);
    }
};

// Simple test helper
const test = (name, testFn) => {
    try {
        testFn();
    } catch (error) {
        console.error(`âŒ Test failed: ${name}`);
        console.error(error.message);
        throw error;
    }
};

const runBillCycleResetTests = () => {
    console.log('ðŸ§ª Testing Bill Cycle Reset Behavior...\n');

    // Test 1: When a bill is paid and then processBills is called, 
    // the next cycle should show the bill as unpaid
    test('Bill marked as paid resets to unpaid status in next cycle', () => {
        // Create a bill due on Jan 15, 2025
        const today = new Date('2025-01-10');
        const billDueDate = new Date('2025-01-15');
        
        const bill = {
            name: 'Netflix Subscription',
            amount: '15.99',
            dueDate: billDueDate.toISOString().split('T')[0],
            recurrence: 'monthly',
            status: 'pending',
            isPaid: false
        };

        // Process the bill initially
        const processedBills1 = RecurringBillManager.processBills([bill], today);
        const processedBill1 = processedBills1[0];
        
        // Verify bill is for current cycle (Jan 15)
        const nextDueDateStr = processedBill1.nextDueDate instanceof Date 
            ? processedBill1.nextDueDate.toISOString().split('T')[0] 
            : processedBill1.nextDueDate;
        assert(nextDueDateStr === '2025-01-15', 
            'Initial due date should be Jan 15');
        assert(!RecurringBillManager.isBillPaidForCurrentCycle(processedBill1), 
            'Bill should initially be unpaid');

        // Mark the bill as paid on Jan 15
        const paidBill = RecurringBillManager.markBillAsPaid(processedBill1, billDueDate);
        
        // Verify the paid bill is marked correctly
        assert(paidBill.isPaid === true, 'Bill should be marked as paid');
        assert(paidBill.status === 'paid', 'Bill status should be paid');
        
        // KEY INSIGHT: After marking as paid, the bill's nextDueDate has already advanced to February
        // So isBillPaidForCurrentCycle will return FALSE because it checks if the bill is paid for 
        // the cycle corresponding to nextDueDate (February), not the cycle that was just paid (January)
        // This is the correct behavior! The bill was paid for January, nextDueDate is now February.
        assert(!RecurringBillManager.isBillPaidForCurrentCycle(paidBill), 
            'Bill should NOT be considered paid for the NEW cycle (February) immediately after payment - it was paid for January');
        
        // Verify next due date advanced to February
        const nextDue = new Date(paidBill.nextDueDate);
        assert(nextDue.getMonth() === 1, 'Next due date should be in February (month 1)');
        assert(nextDue.getDate() === 15, 'Next due date should be on the 15th');

        // Simulate time passing to February (next billing cycle)
        const februaryDate = new Date('2025-02-01');
        
        // Process bills again - this simulates the app loading bills in the new cycle
        const processedBills2 = RecurringBillManager.processBills([paidBill], februaryDate);
        const processedBill2 = processedBills2[0];
        
        // KEY TEST: The bill should no longer be considered paid for the current (February) cycle
        assert(!RecurringBillManager.isBillPaidForCurrentCycle(processedBill2), 
            'Bill should NOT be considered paid in the new cycle (February)');
        
        // Verify the isPaid flag was reset by processBills
        assert(processedBill2.isPaid === false, 
            'isPaid flag should be reset to false by processBills');
        
        // Verify status was reset
        assert(processedBill2.status === undefined, 
            'status should be reset to undefined by processBills (will be recalculated)');
        
        // Verify the payment history is preserved
        assert(processedBill2.lastPayment !== undefined, 
            'Payment history should be preserved');
        
        const lastPaymentDueDateStr = processedBill2.lastPayment.dueDate instanceof Date
            ? processedBill2.lastPayment.dueDate.toISOString().split('T')[0]
            : processedBill2.lastPayment.dueDate;
        assert(lastPaymentDueDateStr === '2025-01-15', 
            'Payment history should show payment for January cycle');
        
        console.log('âœ… Bill cycle reset working correctly');
    });

    // Test 2: Multiple bills with different payment states
    test('Multiple bills handle cycle resets independently', () => {
        const today = new Date('2025-01-20');
        
        const bills = [
            {
                name: 'Bill A',
                amount: '50.00',
                dueDate: '2025-01-15',
                recurrence: 'monthly',
                status: 'paid',
                isPaid: true,
                lastPaidDate: '2025-01-15',
                lastPayment: {
                    dueDate: '2025-01-15',
                    amount: 50.00
                }
            },
            {
                name: 'Bill B',
                amount: '75.00',
                dueDate: '2025-01-20',
                recurrence: 'monthly',
                status: 'pending',
                isPaid: false
            }
        ];

        // Process bills - Bill A's due date (Jan 15) has already passed (today is Jan 20)
        // So processBills will advance it to Feb 15
        const processedBills = RecurringBillManager.processBills(bills, today);
        
        const billA = processedBills.find(b => b.name === 'Bill A');
        const billB = processedBills.find(b => b.name === 'Bill B');
        
        // Bill A was paid for Jan 15, but now nextDueDate has advanced to Feb 15
        // So it should NOT be considered paid for the current cycle (Feb 15)
        assert(!RecurringBillManager.isBillPaidForCurrentCycle(billA), 
            'Bill A should NOT be paid for Feb cycle (was paid for Jan)');
        
        // Verify the payment history is preserved
        assert(billA.lastPayment !== undefined, 'Payment history should be preserved');
        
        // Bill B should not be paid
        assert(!RecurringBillManager.isBillPaidForCurrentCycle(billB), 
            'Bill B should not be paid');
        
        // Advance time to February
        const februaryDate = new Date('2025-02-05');
        
        // Process bills again in February
        const processedBillsFeb = RecurringBillManager.processBills(processedBills, februaryDate);
        
        const billAFeb = processedBillsFeb.find(b => b.name === 'Bill A');
        const billBFeb = processedBillsFeb.find(b => b.name === 'Bill B');
        
        // Bill A should now show as unpaid for February cycle
        assert(!RecurringBillManager.isBillPaidForCurrentCycle(billAFeb), 
            'Bill A should NOT be paid in February cycle');
        assert(billAFeb.isPaid === false, 
            'Bill A isPaid flag should be reset');
        
        // Bill B should also show as unpaid
        assert(!RecurringBillManager.isBillPaidForCurrentCycle(billBFeb), 
            'Bill B should still not be paid');
        
        console.log('âœ… Multiple bills handle cycle resets correctly');
    });

    // Test 3: Bill paid multiple times should maintain correct payment history
    test('Bill payment history is maintained across cycles', () => {
        const bill = {
            name: 'Internet Bill',
            amount: '60.00',
            dueDate: '2025-01-10',
            recurrence: 'monthly',
            status: 'pending'
        };

        // Pay bill in January
        const janPaidBill = RecurringBillManager.markBillAsPaid(bill, new Date('2025-01-10'));
        
        assert(janPaidBill.paymentHistory.length === 1, 
            'Should have 1 payment in history');
        
        // After marking as paid, nextDueDate has advanced to Feb, so bill is NOT paid for current cycle (Feb)
        assert(!RecurringBillManager.isBillPaidForCurrentCycle(janPaidBill), 
            'Should NOT be paid for Feb cycle (was just paid for Jan)');
        
        // Process bills to advance to February
        const febProcessed = RecurringBillManager.processBills([janPaidBill], new Date('2025-02-01'));
        const febBill = febProcessed[0];
        
        // Bill should not be paid for February yet
        assert(!RecurringBillManager.isBillPaidForCurrentCycle(febBill), 
            'Should NOT be paid for Feb cycle');
        
        // Payment history should be preserved
        assert(febBill.paymentHistory.length === 1, 
            'Payment history should still have 1 payment');
        
        // Pay bill in February
        const febPaidBill = RecurringBillManager.markBillAsPaid(febBill, new Date('2025-02-10'));
        
        assert(febPaidBill.paymentHistory.length === 2, 
            'Should now have 2 payments in history');
        
        // After marking as paid, nextDueDate has advanced to March, so bill is NOT paid for current cycle (March)
        assert(!RecurringBillManager.isBillPaidForCurrentCycle(febPaidBill), 
            'Should NOT be paid for March cycle (was just paid for Feb)');
        
        // Verify both payments are tracked
        const firstPaymentDate = typeof febPaidBill.paymentHistory[0].dueDate === 'string' 
            ? febPaidBill.paymentHistory[0].dueDate 
            : febPaidBill.paymentHistory[0].dueDate.toISOString().split('T')[0];
        const secondPaymentDate = typeof febPaidBill.paymentHistory[1].dueDate === 'string'
            ? febPaidBill.paymentHistory[1].dueDate
            : febPaidBill.paymentHistory[1].dueDate.toISOString().split('T')[0];
        
        assert(firstPaymentDate === '2025-01-10', 
            'First payment should be for January');
        assert(secondPaymentDate.includes('2025-02-10'), 
            'Second payment should be for February');
        
        console.log('âœ… Payment history maintained correctly across cycles');
    });

    console.log('\nðŸŽ‰ All bill cycle reset tests passed!');
};

// Export for use in other contexts
export { runBillCycleResetTests };

// Run tests if executed directly
if (typeof globalThis !== 'undefined' && globalThis.process && globalThis.process.env && globalThis.process.env.NODE_ENV === 'test') {
    runBillCycleResetTests();
}

