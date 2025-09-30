// RecurringBillManager.test.js - Test for bill payment and status logic
import { RecurringBillManager } from './RecurringBillManager.js';

// Simple test runner for our comprehensive bill fixes
const runBillPaymentTests = () => {
    console.log('🧪 Testing Comprehensive Bill Payment Fix...\n');

    // Test 1: Bill should be excluded from "bills due before payday" after being paid
    test('Bill excluded from bills due before payday after payment', () => {
        const today = new Date();
        const billDueDate = new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 days from today
        const paydayDate = new Date(today.getTime() + 15 * 24 * 60 * 60 * 1000); // 15 days from today
        
        const mockBill = {
            name: 'Electric Bill',
            amount: '125.50',
            dueDate: billDueDate.toISOString().split('T')[0],
            nextDueDate: billDueDate.toISOString().split('T')[0],
            recurrence: 'monthly',
            status: 'pending'
        };
        
        // Before payment: bill should be included
        let billsDueBeforePayday = RecurringBillManager.getBillsDueBefore([mockBill], paydayDate);
        assert(billsDueBeforePayday.length === 1, 'Bill should be included before payment');
        assert(billsDueBeforePayday[0].name === 'Electric Bill', 'Correct bill should be included');

        // Mark bill as paid
        const paidBill = RecurringBillManager.markBillAsPaid(mockBill, billDueDate);
        
        // After payment: bill should be excluded
        billsDueBeforePayday = RecurringBillManager.getBillsDueBefore([paidBill], paydayDate);
        assert(billsDueBeforePayday.length === 0, 'Bill should be excluded after payment');
        
        console.log('✅ Bill filtering after payment working correctly');
    });

    // Test 2: Multiple bills - only unpaid ones should be included
    test('Multiple bills filtering - only unpaid included', () => {
        const today = new Date();
        const bill1DueDate = new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 days from today
        const bill2DueDate = new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000); // 10 days from today
        const paydayDate = new Date(today.getTime() + 20 * 24 * 60 * 60 * 1000); // 20 days from today
        
        const mockBills = [
            {
                name: 'Electric Bill',
                amount: '125.50',
                dueDate: bill1DueDate.toISOString().split('T')[0],
                nextDueDate: bill1DueDate.toISOString().split('T')[0],
                recurrence: 'monthly',
                status: 'pending'
            },
            {
                name: 'Water Bill',
                amount: '45.00',
                dueDate: bill2DueDate.toISOString().split('T')[0],
                nextDueDate: bill2DueDate.toISOString().split('T')[0],
                recurrence: 'monthly',
                status: 'pending'
            }
        ];
        
        // Mark only electric bill as paid
        const paidElectricBill = RecurringBillManager.markBillAsPaid(mockBills[0], bill1DueDate);
        const billsAfterPayment = [paidElectricBill, mockBills[1]];
        
        const billsDueBeforePayday = RecurringBillManager.getBillsDueBefore(billsAfterPayment, paydayDate);
        
        assert(billsDueBeforePayday.length === 1, 'Only unpaid bill should be included');
        assert(billsDueBeforePayday[0].name === 'Water Bill', 'Water bill should still be included');
        
        console.log('✅ Multiple bills filtering working correctly');
    });

    // Test 3: Bill payment creates correct payment record and status
    test('Bill payment creates correct payment record and status', () => {
        const today = new Date();
        const billDueDate = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000); // 2 days from today
        
        const mockBill = {
            name: 'Internet Bill',
            amount: '89.99',
            dueDate: billDueDate.toISOString().split('T')[0],
            nextDueDate: billDueDate.toISOString().split('T')[0],
            recurrence: 'monthly',
            status: 'pending'
        };

        const paidBill = RecurringBillManager.markBillAsPaid(mockBill, billDueDate);
        
        assert(paidBill.lastPaidDate, 'Should have lastPaidDate');
        assert(paidBill.lastPayment, 'Should have lastPayment record');
        assert(paidBill.lastPayment.dueDate === billDueDate.toISOString().split('T')[0], 'Payment record should have correct due date');
        assert(paidBill.lastPayment.amount === 89.99, 'Payment record should have correct amount');
        assert(paidBill.paymentHistory.length === 1, 'Should have payment history');
        assert(paidBill.isPaid === true, 'Should be marked as paid');
        assert(paidBill.status === 'paid', 'Status should be paid');
        
        console.log('✅ Payment record creation and status working correctly');
    });

    // Test 4: Bill payment correctly advances due date to next cycle
    test('Bill payment advances due date to next cycle', () => {
        const today = new Date();
        const billDueDate = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days from today
        const paydayDate = new Date(today.getTime() + 18 * 24 * 60 * 60 * 1000); // 18 days from today
        
        const bill = {
            name: 'Electric Bill',
            amount: '125.50',
            dueDate: billDueDate.toISOString().split('T')[0],
            nextDueDate: billDueDate.toISOString().split('T')[0],
            recurrence: 'monthly',
            status: 'pending'
        };

        // Pay the bill
        const paidBill = RecurringBillManager.markBillAsPaid(bill, billDueDate);
        
        const billsDue = RecurringBillManager.getBillsDueBefore([paidBill], paydayDate);
        
        assert(billsDue.length === 0, `Paid bill should not be due before payday, but found ${billsDue.length} bills`);
        
        // The next due date should be in the next month
        const nextDueDate = new Date(paidBill.nextDueDate);
        const originalDueDate = new Date(billDueDate);
        assert(nextDueDate.getMonth() === (originalDueDate.getMonth() + 1) % 12 || 
               (originalDueDate.getMonth() === 11 && nextDueDate.getMonth() === 0), 
               'Next due date should be in the next month');
        assert(nextDueDate.getDate() === originalDueDate.getDate(), 'Next due date should be same day of month');
        
        console.log('✅ Bill payment advances due date correctly');
    });

    // Test 5: isBillPaidForCurrentCycle helper function
    test('isBillPaidForCurrentCycle helper function', () => {
        const unpaidBill = {
            name: 'Gas Bill',
            amount: '75.00',
            dueDate: '2025-01-20',
            nextDueDate: '2025-01-20',
            recurrence: 'monthly',
            status: 'pending'
        };

        const paidBill = {
            name: 'Electric Bill',
            amount: '125.50',
            dueDate: '2025-02-15', // Advanced to next cycle
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

        assert(!RecurringBillManager.isBillPaidForCurrentCycle(unpaidBill), 'Unpaid bill should not be considered paid');
        assert(RecurringBillManager.isBillPaidForCurrentCycle(paidBill), 'Paid bill should be considered paid for current cycle');
        
        console.log('✅ isBillPaidForCurrentCycle helper working correctly');
    });

    // Test 6: Bills marked as paid don't appear in range filters
    test('Paid bills excluded from range filters', () => {
        const bills = [
            {
                name: 'Electric Bill',
                amount: '125.50',
                dueDate: '2025-01-15',
                nextDueDate: '2025-01-15',
                recurrence: 'monthly',
                status: 'pending'
            },
            {
                name: 'Water Bill',
                amount: '45.00',
                dueDate: '2025-01-18',
                nextDueDate: '2025-01-18',
                recurrence: 'monthly',
                status: 'paid',
                isPaid: true
            }
        ];

        const startDate = new Date('2025-01-10');
        const endDate = new Date('2025-01-20');
        
        const billsInRange = RecurringBillManager.getBillsInRange(bills, startDate, endDate);
        
        assert(billsInRange.length === 1, 'Only unpaid bill should be in range');
        assert(billsInRange[0].name === 'Electric Bill', 'Electric bill should be in range');
        
        const totalInRange = RecurringBillManager.getTotalAmountInRange(bills, startDate, endDate);
        assert(totalInRange === 125.50, 'Total should only include unpaid bill amount');
        
        console.log('✅ Range filtering excludes paid bills correctly');
    });

    console.log('\n🎉 All comprehensive bill payment tests passed! Fix is working correctly.\n');
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
export { runBillPaymentTests };

// Run tests if this file is executed directly
if (typeof window !== 'undefined' && window.location) {
    // Browser environment - add to window for manual testing
    window.testBillPayment = runBillPaymentTests;
} else if (typeof globalThis !== 'undefined' && globalThis.process && globalThis.process.env && globalThis.process.env.NODE_ENV === 'test') {
    // Node.js test environment
    runBillPaymentTests();
}