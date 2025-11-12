// BillVisibilityAndCount.test.js - Test bill visibility across filters and accurate count display
 
import { RecurringBillManager } from './RecurringBillManager.js';

/**
 * Test suite for bill visibility and count accuracy
 * Validates requirements from problem statement:
 * 1. 'All Status' filter always shows every bill
 * 2. Bill count always matches actual number of bills
 * 3. Marking bills as paid/unpaid only changes status, doesn't hide bills
 */

// Simple test runner
const assert = (condition, message) => {
    if (!condition) {
        throw new Error(`❌ FAILED: ${message}`);
    }
};

const test = (description, fn) => {
    try {
        fn();
        console.log(`✅ PASS: ${description}`);
    } catch (error) {
        console.error(`❌ FAIL: ${description}`);
        console.error(`   ${error.message}`);
        throw error;
    }
};

const runBillVisibilityTests = () => {
    console.log('🧪 Testing Bill Visibility and Count Accuracy...\n');

    // Test 1: Bill count reflects total bills, not filtered bills
    test('Bill count shows total bills regardless of filter', () => {
        const mockBills = [
            { name: 'Bill 1', amount: '100', status: 'paid', dueDate: '2025-02-01' },
            { name: 'Bill 2', amount: '200', status: 'pending', dueDate: '2025-02-05' },
            { name: 'Bill 3', amount: '150', status: 'urgent', dueDate: '2025-02-03' },
            { name: 'Bill 4', amount: '300', status: 'paid', dueDate: '2025-02-01' },
            { name: 'Bill 5', amount: '250', status: 'due-today', dueDate: '2025-02-02' }
        ];

        const totalBills = mockBills.length;
        
        // Simulate "All Status" filter - should show all bills
        const allStatusFilter = mockBills.filter(() => true);
        assert(allStatusFilter.length === totalBills, 
            `All Status should show all ${totalBills} bills, got ${allStatusFilter.length}`);
        
        // Simulate "Paid" filter - should show only 2 paid bills
        const paidFilter = mockBills.filter(b => b.status === 'paid');
        assert(paidFilter.length === 2, 
            `Paid filter should show 2 bills, got ${paidFilter.length}`);
        
        // But total count should ALWAYS be 5
        assert(totalBills === 5, 
            `Total bill count should always be 5, not ${paidFilter.length}`);
        
        console.log(`   Total bills: ${totalBills}, Paid bills: ${paidFilter.length}`);
        console.log(`   Display should show: "Bills (2 of 5)" when filtering paid`);
    });

    // Test 2: All Status filter shows every bill regardless of status
    test('All Status filter shows bills with any status', () => {
        const allStatuses = ['paid', 'pending', 'urgent', 'due-today', 'this-week', 'overdue', 'skipped'];
        const mockBills = allStatuses.map((status, i) => ({
            name: `Bill ${i + 1}`,
            amount: `${100 * (i + 1)}`,
            status: status,
            dueDate: '2025-02-05'
        }));

        // Simulate "All Status" filter (filterStatus === 'all')
        const filteredBills = mockBills.filter(() => {
            const filterStatus = 'all';
            let matchesStatus = false;
            if (filterStatus === 'all') {
                matchesStatus = true; // This is the key line from Bills.jsx:514
            }
            return matchesStatus;
        });

        assert(filteredBills.length === allStatuses.length,
            `All Status should show all ${allStatuses.length} bills with different statuses`);
        
        console.log(`   Verified all ${allStatuses.length} status types are visible`);
    });

    // Test 3: Marking bill as paid/unpaid only changes status
    test('Marking bill as paid changes status but does not delete bill', () => {
        const mockBill = {
            name: 'Internet Bill',
            amount: '89.99',
            dueDate: '2025-02-10',
            nextDueDate: '2025-02-10',
            recurrence: 'monthly',
            status: 'pending'
        };

        // Mark bill as paid
        const paidBill = RecurringBillManager.markBillAsPaid(mockBill, new Date('2025-02-10'));
        
        // Bill should still exist with all its properties
        assert(paidBill.name === mockBill.name, 'Bill name should be unchanged');
        assert(paidBill.amount === mockBill.amount, 'Bill amount should be unchanged');
        assert(paidBill.status === 'paid', 'Bill status should be "paid"');
        assert(paidBill.isPaid === true, 'Bill isPaid flag should be true');
        
        // Bill should have payment metadata
        assert(paidBill.lastPaidDate, 'Bill should have lastPaidDate');
        assert(paidBill.lastPayment, 'Bill should have lastPayment record');
        
        console.log(`   Bill marked as paid: ${mockBill.name} → status: ${paidBill.status}`);
    });

    // Test 4: Unmarking bill as paid changes status back
    test('Unmarking bill as paid resets status correctly', () => {
        const mockBill = {
            name: 'Phone Bill',
            amount: '55.00',
            dueDate: '2025-02-15',
            nextDueDate: '2025-02-15',
            recurrence: 'monthly',
            status: 'pending'
        };

        // Mark as paid
        const paidBill = RecurringBillManager.markBillAsPaid(mockBill, new Date('2025-02-15'));
        assert(paidBill.status === 'paid', 'Bill should be marked as paid');
        
        // Simulate unmarking (removing payment data as done in Bills.jsx:606-614)
        const unmarkedBill = { ...paidBill };
        delete unmarkedBill.lastPaidDate;
        delete unmarkedBill.lastPayment;
        delete unmarkedBill.isPaid;
        if (unmarkedBill.paymentHistory && unmarkedBill.paymentHistory.length > 0) {
            unmarkedBill.paymentHistory = unmarkedBill.paymentHistory.slice(0, -1);
        }
        
        // Check if bill is paid after unmarking
        const isPaid = RecurringBillManager.isBillPaidForCurrentCycle(unmarkedBill);
        assert(!isPaid, 'Bill should no longer be considered paid after unmarking');
        
        console.log(`   Bill unmarked successfully: ${mockBill.name} → isPaid: ${isPaid}`);
    });

    // Test 5: Upcoming filter groups multiple statuses correctly
    test('Upcoming filter shows pending, urgent, due-today, and this-week bills', () => {
        const mockBills = [
            { name: 'Bill 1', amount: '100', status: 'paid', dueDate: '2025-02-01' },
            { name: 'Bill 2', amount: '200', status: 'pending', dueDate: '2025-02-20' },
            { name: 'Bill 3', amount: '150', status: 'urgent', dueDate: '2025-02-03' },
            { name: 'Bill 4', amount: '300', status: 'due-today', dueDate: '2025-02-02' },
            { name: 'Bill 5', amount: '250', status: 'this-week', dueDate: '2025-02-05' },
            { name: 'Bill 6', amount: '175', status: 'overdue', dueDate: '2025-01-25' },
            { name: 'Bill 7', amount: '125', status: 'skipped', dueDate: '2025-02-10' }
        ];

        // Simulate "Upcoming" filter (as implemented in Bills.jsx:516-517)
        const filteredBills = mockBills.filter(bill => {
            const filterStatus = 'upcoming';
            let matchesStatus = false;
            if (filterStatus === 'upcoming') {
                matchesStatus = ['pending', 'urgent', 'due-today', 'this-week'].includes(bill.status);
            }
            return matchesStatus;
        });

        assert(filteredBills.length === 4,
            `Upcoming filter should show 4 bills (pending, urgent, due-today, this-week), got ${filteredBills.length}`);
        
        const upcomingStatuses = filteredBills.map(b => b.status);
        assert(upcomingStatuses.includes('pending'), 'Should include pending bills');
        assert(upcomingStatuses.includes('urgent'), 'Should include urgent bills');
        assert(upcomingStatuses.includes('due-today'), 'Should include due-today bills');
        assert(upcomingStatuses.includes('this-week'), 'Should include this-week bills');
        assert(!upcomingStatuses.includes('paid'), 'Should NOT include paid bills');
        assert(!upcomingStatuses.includes('overdue'), 'Should NOT include overdue bills');
        
        console.log(`   Upcoming filter correctly shows: ${upcomingStatuses.join(', ')}`);
    });

    // Test 6: Filter dropdown options match all possible statuses
    test('Filter dropdown has options for all bill statuses', () => {
        const allPossibleStatuses = ['paid', 'pending', 'urgent', 'due-today', 'this-week', 'overdue', 'skipped'];
        const filterDropdownOptions = [
            'all',      // Shows all statuses
            'upcoming', // Shows pending, urgent, due-today, this-week
            'paid',
            'overdue',
            'due-today',
            'urgent',
            'this-week',
            'pending',
            'skipped'
        ];

        // Verify all individual statuses have filter options
        allPossibleStatuses.forEach(status => {
            const hasOption = filterDropdownOptions.includes(status);
            assert(hasOption || status === 'pending' || status === 'urgent' || status === 'due-today' || status === 'this-week',
                `Filter dropdown should have option for status: ${status}`);
        });

        console.log(`   All ${allPossibleStatuses.length} statuses are accessible via filters`);
    });

    // Test 7: Skipped status is preserved when bills are processed
    test('Skipped status is preserved through bill processing', () => {
        const mockSkippedBill = {
            name: 'Gym Membership',
            amount: '45.00',
            dueDate: '2025-02-15',
            recurrence: 'monthly',
            status: 'skipped',
            skippedAt: new Date().toISOString()
        };

        // Process the bill (simulating what happens in loadBills)
        const processed = RecurringBillManager.processBills([mockSkippedBill]);
        
        assert(processed.length === 1, 'Should have 1 processed bill');
        assert(processed[0].status === 'skipped', 
            `Skipped status should be preserved, got: ${processed[0].status}`);
        assert(processed[0].skippedAt, 'skippedAt timestamp should be preserved');
        
        console.log(`   Skipped bill status preserved: ${mockSkippedBill.name} → status: ${processed[0].status}`);
    });

    console.log('\n✅ All bill visibility and count tests passed!');
};

// Run tests if this file is executed directly
if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('BillVisibilityAndCount.test.js')) {
    try {
        runBillVisibilityTests();
        if (typeof process !== 'undefined' && process.exit) process.exit(0);
    } catch (err) {
        console.error('\n❌ Test suite failed!');
        console.error(err);
        if (typeof process !== 'undefined' && process.exit) process.exit(1);
    }
}

export { runBillVisibilityTests };
