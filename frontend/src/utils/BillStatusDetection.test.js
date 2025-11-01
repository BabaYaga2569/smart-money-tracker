// BillStatusDetection.test.js - Test for determineBillStatus method
import { RecurringBillManager } from './RecurringBillManager.js';

// Simple test runner
const runBillStatusTests = () => {
    console.log('🧪 Testing Bill Status Detection...\n');

    // Test 1: Overdue bill detection
    test('Overdue bill detection', () => {
        const today = new Date(2025, 10, 1); // November 1, 2025
        const overdueBill = {
            name: 'Southwest Gas',
            amount: '85.00',
            dueDate: '2025-10-28', // 4 days overdue
            nextDueDate: '2025-10-28',
            recurrence: 'monthly',
            status: 'pending'
        };
        
        const statusInfo = RecurringBillManager.determineBillStatus(overdueBill, today);
        
        assert(statusInfo.status === 'overdue', 'Bill should be marked as overdue');
        assert(statusInfo.daysOverdue === 4, 'Should be 4 days overdue');
        assert(statusInfo.priority === 999, 'Priority should be 999 for overdue bills');
        assert(statusInfo.urgency === 'critical', 'Urgency should be critical');
        
        console.log('✅ Overdue bill detection working correctly');
        console.log('   Status:', statusInfo);
    });

    // Test 2: Due-soon bill detection (within 7 days)
    test('Due-soon bill detection', () => {
        const today = new Date(2025, 10, 1); // November 1, 2025
        const dueSoonBill = {
            name: 'Electric Bill',
            amount: '125.50',
            dueDate: '2025-11-05', // 4 days from today
            nextDueDate: '2025-11-05',
            recurrence: 'monthly',
            status: 'pending'
        };
        
        const statusInfo = RecurringBillManager.determineBillStatus(dueSoonBill, today);
        
        assert(statusInfo.status === 'due-soon', 'Bill should be marked as due-soon');
        assert(statusInfo.priority === 10, 'Priority should be 10 for due-soon bills');
        
        console.log('✅ Due-soon bill detection working correctly');
        console.log('   Status:', statusInfo);
    });

    // Test 3: Upcoming bill detection (more than 7 days)
    test('Upcoming bill detection', () => {
        const today = new Date(2025, 10, 1); // November 1, 2025
        const upcomingBill = {
            name: 'Rent',
            amount: '1500.00',
            dueDate: '2025-11-15', // 14 days from today
            nextDueDate: '2025-11-15',
            recurrence: 'monthly',
            status: 'pending'
        };
        
        const statusInfo = RecurringBillManager.determineBillStatus(upcomingBill, today);
        
        assert(statusInfo.status === 'upcoming', 'Bill should be marked as upcoming');
        assert(statusInfo.priority === 1, 'Priority should be 1 for upcoming bills');
        
        console.log('✅ Upcoming bill detection working correctly');
        console.log('   Status:', statusInfo);
    });

    // Test 4: Paid bill detection
    test('Paid bill detection', () => {
        const today = new Date(2025, 10, 1); // November 1, 2025
        const paidBill = {
            name: 'Water Bill',
            amount: '50.00',
            dueDate: '2025-10-28',
            nextDueDate: '2025-10-28',
            lastDueDate: '2025-10-28',
            lastPaidDate: new Date(2025, 9, 28),
            lastPayment: {
                amount: 50.00,
                paidDate: new Date(2025, 9, 28),
                dueDate: '2025-10-28'
            },
            recurrence: 'monthly',
            status: 'paid'
        };
        
        const statusInfo = RecurringBillManager.determineBillStatus(paidBill, today);
        
        assert(statusInfo.status === 'paid', 'Bill should be marked as paid');
        assert(statusInfo.priority === 0, 'Priority should be 0 for paid bills');
        
        console.log('✅ Paid bill detection working correctly');
        console.log('   Status:', statusInfo);
    });

    // Test 5: Bill sorting by priority
    test('Bill sorting by priority', () => {
        const today = new Date(2025, 10, 1); // November 1, 2025
        
        const bills = [
            {
                name: 'Upcoming Bill',
                amount: '100.00',
                dueDate: '2025-11-20',
                nextDueDate: '2025-11-20',
                recurrence: 'monthly'
            },
            {
                name: 'Overdue Bill',
                amount: '85.00',
                dueDate: '2025-10-28',
                nextDueDate: '2025-10-28',
                recurrence: 'monthly'
            },
            {
                name: 'Due Soon Bill',
                amount: '125.50',
                dueDate: '2025-11-05',
                nextDueDate: '2025-11-05',
                recurrence: 'monthly'
            }
        ];
        
        const billsWithStatus = bills.map(bill => ({
            ...bill,
            statusInfo: RecurringBillManager.determineBillStatus(bill, today)
        }));
        
        const sortedBills = billsWithStatus.sort((a, b) => {
            if (a.statusInfo.priority !== b.statusInfo.priority) {
                return b.statusInfo.priority - a.statusInfo.priority;
            }
            return new Date(a.nextDueDate) - new Date(b.nextDueDate);
        });
        
        assert(sortedBills[0].name === 'Overdue Bill', 'Overdue bill should be first');
        assert(sortedBills[1].name === 'Due Soon Bill', 'Due-soon bill should be second');
        assert(sortedBills[2].name === 'Upcoming Bill', 'Upcoming bill should be last');
        
        console.log('✅ Bill sorting by priority working correctly');
        console.log('   Sorted order:', sortedBills.map(b => b.name));
    });

    console.log('\n🎉 All bill status detection tests passed!');
};

// Simple assertion helper
function assert(condition, message) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}

// Simple test helper
function test(name, fn) {
    try {
        fn();
    } catch (error) {
        console.error(`❌ Test "${name}" failed:`, error.message);
        throw error;
    }
}

// Run tests if executed directly
if (typeof process !== 'undefined' && process.argv[1] === new URL(import.meta.url).pathname) {
    runBillStatusTests();
}

export { runBillStatusTests };
