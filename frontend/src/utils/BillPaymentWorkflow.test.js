// BillPaymentWorkflow.test.js - Test dynamic bill payment workflow
import { RecurringBillManager } from './RecurringBillManager.js';
import { BillSortingManager } from './BillSortingManager.js';
import { NotificationManager } from './NotificationManager.js';
import { PlaidIntegrationManager } from './PlaidIntegrationManager.js';

// Simple test runner
const runTests = () => {
    console.log('🧪 Testing Dynamic Bill Payment Workflow...\n');

    // Test 1: Bill Marking as Paid and Next Due Date Calculation
    test('Bill marking as paid with next due date calculation', () => {
        const mockBill = {
            name: 'Electric Bill',
            amount: '125.50',
            dueDate: '2024-01-15',
            recurrence: 'monthly',
            status: 'pending'
        };

        const paidBill = RecurringBillManager.markBillAsPaid(mockBill, new Date('2024-01-15'));
        
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

    // Test 2: Bill Sorting with Paid Bills at Bottom
    test('Bill sorting with paid bills at bottom', () => {
        const mockBills = [
            { name: 'Rent', amount: '1850', status: 'paid', dueDate: '2024-01-01' },
            { name: 'Electric', amount: '125', status: 'overdue', dueDate: '2024-01-10' },
            { name: 'Phone', amount: '65', status: 'pending', dueDate: '2024-01-20' },
            { name: 'Internet', amount: '89', status: 'paid', dueDate: '2024-01-15' }
        ];

        const sortedBills = BillSortingManager.sortBillsByUrgency(mockBills, 'dueDate');
        
        // First bill should be unpaid (Electric - overdue)
        assert(sortedBills[0].status !== 'paid', 'First bill should not be paid');
        assert(sortedBills[0].name === 'Electric', 'Electric bill should be first (overdue)');
        
        // Last bills should be paid
        const paidBills = sortedBills.filter(bill => bill.status === 'paid');
        const lastBills = sortedBills.slice(-paidBills.length);
        assert(lastBills.every(bill => bill.status === 'paid'), 'Paid bills should be at the bottom');
        
        console.log('✅ Bill sorting with paid bills at bottom working correctly');
    });

    // Test 3: Notification System
    test('Notification system functionality', () => {
        // Clear any existing notifications
        NotificationManager.clearAll();
        
        // Show a success notification
        const notificationId = NotificationManager.showNotification({
            type: 'success',
            title: 'Payment Processed',
            message: 'Electric Bill payment successful',
            duration: 1000
        });
        
        const notifications = NotificationManager.getNotifications();
        assert(notifications.length === 1, 'Should have one notification');
        assert(notifications[0].type === 'success', 'Notification should be success type');
        assert(notifications[0].title === 'Payment Processed', 'Notification should have correct title');
        
        // Clean up
        NotificationManager.removeNotification(notificationId);
        assert(NotificationManager.getNotifications().length === 0, 'Notification should be removed');
        
        console.log('✅ Notification system working correctly');
    });

    // Test 4: Plaid Integration Mock
    test('Plaid integration placeholder functionality', () => {
        // Test fuzzy matching
        const match1 = PlaidIntegrationManager.fuzzyMatch('Electric Bill', 'ELECTRIC BILL CO', 0.7);
        assert(match1 === true, 'Should match electric bill variations');
        
        const match2 = PlaidIntegrationManager.fuzzyMatch('Rent Payment', 'Grocery Store', 0.7);
        assert(match2 === false, 'Should not match unrelated strings');
        
        // Test Levenshtein distance
        const distance = PlaidIntegrationManager.levenshteinDistance('hello', 'helo');
        assert(distance === 1, 'Levenshtein distance should be 1 for hello vs helo');
        
        console.log('✅ Plaid integration placeholder working correctly');
    });

    // Test 5: Bill Processing Workflow
    test('Complete bill processing workflow', () => {
        const bills = [
            { name: 'Electric', amount: '125.50', status: 'pending', dueDate: '2024-01-15', recurrence: 'monthly' },
            { name: 'Rent', amount: '1850.00', status: 'pending', dueDate: '2024-01-01', recurrence: 'monthly' }
        ];

        // Process bills with RecurringBillManager
        const processedBills = RecurringBillManager.processBills(bills);
        assert(processedBills.length === 2, 'Should process all bills');
        assert(processedBills[0].nextDueDate, 'Should calculate next due dates');

        // Add urgency information with BillSortingManager
        const billsWithUrgency = BillSortingManager.processBillsWithUrgency(processedBills);
        assert(billsWithUrgency[0].urgencyInfo, 'Should add urgency information');
        assert(billsWithUrgency[0].daysUntilDue !== undefined, 'Should calculate days until due');

        console.log('✅ Complete bill processing workflow working correctly');
    });

    console.log('\n🎉 All tests passed! Dynamic Bill Payment Workflow is working correctly.\n');
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
export { runTests };

// Run tests if this file is executed directly
if (typeof window !== 'undefined' && window.location) {
    // Browser environment - add to window for manual testing
    window.testBillPaymentWorkflow = runTests;
} else if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
    // Node.js test environment
    runTests();
}