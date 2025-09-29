// RecurringBillManager.test.js - Test for bill filtering after payment
import { RecurringBillManager } from './RecurringBillManager.js';

// Simple test runner for our specific fix
const runBillFilteringTests = () => {
    console.log('🧪 Testing Bill Filtering After Payment Fix...\n');

    // Test 1: Bill should be excluded from "bills due before payday" after being paid
    test('Bill excluded from bills due before payday after payment', () => {
        const mockBill = {
            name: 'Electric Bill',
            amount: '125.50',
            dueDate: '2025-01-15',
            nextDueDate: '2025-01-15',
            recurrence: 'monthly',
            status: 'pending'
        };

        const paydayDate = new Date('2025-01-30'); // Payday is after bill due date
        
        // Before payment: bill should be included
        let billsDueBeforePayday = RecurringBillManager.getBillsDueBefore([mockBill], paydayDate);
        assert(billsDueBeforePayday.length === 1, 'Bill should be included before payment');
        assert(billsDueBeforePayday[0].name === 'Electric Bill', 'Correct bill should be included');

        // Mark bill as paid
        const paidBill = RecurringBillManager.markBillAsPaid(mockBill, new Date('2025-01-15'));
        
        // After payment: bill should be excluded
        billsDueBeforePayday = RecurringBillManager.getBillsDueBefore([paidBill], paydayDate);
        assert(billsDueBeforePayday.length === 0, 'Bill should be excluded after payment');
        
        console.log('✅ Bill filtering after payment working correctly');
    });

    // Test 2: Multiple bills - only unpaid ones should be included
    test('Multiple bills filtering - only unpaid included', () => {
        const mockBills = [
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
                dueDate: '2025-01-20',
                nextDueDate: '2025-01-20',
                recurrence: 'monthly',
                status: 'pending'
            }
        ];

        const paydayDate = new Date('2025-01-30');
        
        // Mark only electric bill as paid
        const paidElectricBill = RecurringBillManager.markBillAsPaid(mockBills[0], new Date('2025-01-15'));
        const billsAfterPayment = [paidElectricBill, mockBills[1]];
        
        const billsDueBeforePayday = RecurringBillManager.getBillsDueBefore(billsAfterPayment, paydayDate);
        
        assert(billsDueBeforePayday.length === 1, 'Only unpaid bill should be included');
        assert(billsDueBeforePayday[0].name === 'Water Bill', 'Water bill should still be included');
        
        console.log('✅ Multiple bills filtering working correctly');
    });

    // Test 3: Bill payment creates correct payment record
    test('Bill payment creates correct payment record', () => {
        const mockBill = {
            name: 'Internet Bill',
            amount: '89.99',
            dueDate: '2025-01-10',
            nextDueDate: '2025-01-10',
            recurrence: 'monthly',
            status: 'pending'
        };

        const paymentDate = new Date('2025-01-10');
        const paidBill = RecurringBillManager.markBillAsPaid(mockBill, paymentDate);
        
        assert(paidBill.lastPaidDate, 'Should have lastPaidDate');
        assert(paidBill.lastPayment, 'Should have lastPayment record');
        assert(paidBill.lastPayment.dueDate === '2025-01-10', 'Payment record should have correct due date');
        assert(paidBill.lastPayment.amount === 89.99, 'Payment record should have correct amount');
        assert(paidBill.paymentHistory.length === 1, 'Should have payment history');
        
        console.log('✅ Payment record creation working correctly');
    });

    // Test 4: Bill payment correctly advances due date to next cycle
    test('Bill payment advances due date to next cycle', () => {
        const bill = {
            name: 'Electric Bill',
            amount: '125.50',
            dueDate: '2025-01-15',
            nextDueDate: '2025-01-15',
            recurrence: 'monthly',
            status: 'pending'
        };

        // Pay January bill
        const paidBill = RecurringBillManager.markBillAsPaid(bill, new Date('2025-01-15'));
        const paydayDate = new Date('2025-01-30'); // Payday is after original due date but before next cycle
        
        const billsDue = RecurringBillManager.getBillsDueBefore([paidBill], paydayDate);
        
        console.log('Debug - Paid bill next due date:', paidBill.nextDueDate);
        console.log('Debug - Payday date:', paydayDate);
        console.log('Debug - Bills due before payday:', billsDue.length);
        
        assert(billsDue.length === 0, `Paid bill should not be due before payday, but found ${billsDue.length} bills`);
        
        // The next due date should be in February (next month)
        const nextDueDate = new Date(paidBill.nextDueDate);
        assert(nextDueDate.getMonth() === 1, 'Next due date should be in February'); // February = 1
        assert(nextDueDate.getDate() === 15, 'Next due date should be 15th');
        
        console.log('✅ Bill payment advances due date correctly');
    });

    console.log('\n🎉 Bill filtering tests passed! Fix is working correctly.\n');
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
export { runBillFilteringTests };

// Run tests if this file is executed directly
if (typeof window !== 'undefined' && window.location) {
    // Browser environment - add to window for manual testing
    window.testBillFiltering = runBillFilteringTests;
} else if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
    // Node.js test environment
    runBillFilteringTests();
}