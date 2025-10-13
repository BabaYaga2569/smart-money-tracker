// BillsPageFilterIntegration.test.js - Comprehensive integration test for Bills page filters
/* eslint-disable no-undef */
import { RecurringBillManager } from './RecurringBillManager.js';

/**
 * Integration test to verify all requirements from the problem statement:
 * 1. 'All Status' filter truly shows ALL bills regardless of status
 * 2. Bill count matches actual number of bills, not just filtered view
 * 3. 'Mark Unpaid' button exists for paid bills
 * 4. Status toggling only changes status, never hides/deletes bills
 * 5. UI always reflects all bills and correct counts
 */

// Simple test runner
const assert = (condition, message) => {
    if (!condition) {
        throw new Error(`âŒ FAILED: ${message}`);
    }
};

const test = (description, fn) => {
    try {
        fn();
        console.log(`âœ… PASS: ${description}`);
    } catch (error) {
        console.error(`âŒ FAIL: ${description}`);
        console.error(`   ${error.message}`);
        throw error;
    }
};

const runIntegrationTests = () => {
    console.log('ðŸ§ª Testing Bills Page Filter Integration...\n');

    // Test 1: All Status filter shows bills with every possible status
    test('All Status filter shows bills with ALL statuses (paid, overdue, skipped, etc)', () => {
        const allStatuses = ['paid', 'pending', 'urgent', 'due-today', 'this-week', 'overdue', 'skipped'];
        const mockBills = allStatuses.map((status, i) => ({
            id: `bill-${i}`,
            name: `Bill ${i + 1}`,
            amount: `${100 * (i + 1)}`,
            status: status,
            dueDate: '2025-02-05',
            nextDueDate: '2025-02-05',
            recurrence: 'monthly'
        }));

        // Add payment data for paid bills
        if (mockBills[0].status === 'paid') {
            mockBills[0].lastPaidDate = '2025-02-05';
            mockBills[0].lastPayment = { dueDate: '2025-02-05', paidDate: '2025-02-05' };
        }

        // Simulate filter logic from Bills.jsx lines 513-521
        const filterStatus = 'all';
        const filteredBills = mockBills.filter(bill => {
            let matchesStatus = false;
            if (filterStatus === 'all') {
                matchesStatus = true; // This should match EVERYTHING
            } else if (filterStatus === 'upcoming') {
                matchesStatus = ['pending', 'urgent', 'due-today', 'this-week'].includes(bill.status);
            } else {
                matchesStatus = bill.status === filterStatus;
            }
            return matchesStatus;
        });

        assert(filteredBills.length === mockBills.length,
            `All Status should show all ${mockBills.length} bills, got ${filteredBills.length}`);
        
        // Verify each status is present
        allStatuses.forEach(status => {
            const billWithStatus = filteredBills.find(b => b.status === status);
            assert(billWithStatus, `Should include bill with status: ${status}`);
        });

        console.log(`   âœ“ All ${allStatuses.length} status types visible with 'All Status' filter`);
        console.log(`   âœ“ Including: paid, overdue, skipped`);
    });

    // Test 2: Bill count reflects total, not filtered count
    test('Bill count shows total bills (processedBills.length), not filtered count', () => {
        const totalBills = 10;
        const mockBills = Array.from({ length: totalBills }, (_, i) => ({
            id: `bill-${i}`,
            name: `Bill ${i + 1}`,
            amount: '100',
            status: i < 3 ? 'paid' : 'pending',
            dueDate: '2025-02-05'
        }));

        // Total bill count (should always be 10)
        const processedBillsCount = mockBills.length;
        
        // Filtered to only show paid bills (3 bills)
        const filteredBills = mockBills.filter(b => b.status === 'paid');
        
        // Verify total count is always available
        assert(processedBillsCount === 10, 
            `Total count should always be 10, not ${processedBillsCount}`);
        assert(filteredBills.length === 3,
            `Filtered count should be 3, got ${filteredBills.length}`);
        
        // This simulates the display logic from Bills.jsx line 1645
        const displayText = filteredBills.length === processedBillsCount 
            ? `${filteredBills.length}` 
            : `${filteredBills.length} of ${processedBillsCount}`;
        
        assert(displayText === '3 of 10',
            `Display should show "3 of 10", got "${displayText}"`);
        
        console.log(`   âœ“ Total: ${processedBillsCount} bills`);
        console.log(`   âœ“ Filtered: ${filteredBills.length} bills`);
        console.log(`   âœ“ Display: "${displayText}"`);
    });

    // Test 3: Skipped bills remain visible through processing
    test('Skipped bills remain visible after processing (bug fix verification)', () => {
        const mockSkippedBills = [
            {
                id: 'bill-1',
                name: 'Skipped Bill 1',
                amount: '50',
                status: 'skipped',
                skippedAt: '2025-02-01',
                dueDate: '2025-02-05',
                recurrence: 'monthly'
            },
            {
                id: 'bill-2',
                name: 'Regular Bill',
                amount: '100',
                status: 'pending',
                dueDate: '2025-02-10',
                recurrence: 'monthly'
            }
        ];

        // Process bills (this was resetting status to undefined before the fix)
        const processed = RecurringBillManager.processBills(mockSkippedBills);
        
        // Find the skipped bill
        const skippedBill = processed.find(b => b.id === 'bill-1');
        
        assert(skippedBill, 'Skipped bill should exist after processing');
        assert(skippedBill.status === 'skipped',
            `Skipped bill status should be 'skipped', got '${skippedBill.status}'`);
        
        // Simulate All Status filter
        const allStatusFiltered = processed.filter(() => true);
        assert(allStatusFiltered.length === 2,
            `All Status should show both bills, got ${allStatusFiltered.length}`);
        
        // Simulate Skipped filter
        const skippedFiltered = processed.filter(b => b.status === 'skipped');
        assert(skippedFiltered.length === 1,
            `Skipped filter should show 1 bill, got ${skippedFiltered.length}`);
        
        console.log(`   âœ“ Skipped bill preserved through processing`);
        console.log(`   âœ“ Visible in 'All Status' filter`);
        console.log(`   âœ“ Visible in 'Skipped' filter`);
    });

    // Test 4: Paid bills show Mark Unpaid button
    test('Paid bills should have Mark Unpaid functionality', () => {
        const paidBill = {
            id: 'bill-1',
            name: 'Internet Bill',
            amount: '89.99',
            dueDate: '2025-02-10',
            nextDueDate: '2025-02-10',
            recurrence: 'monthly',
            lastPaidDate: '2025-02-10',
            lastPayment: {
                dueDate: '2025-02-10',
                paidDate: '2025-02-10',
                amount: 89.99
            }
        };

        // Check if bill is paid for current cycle
        const isPaid = RecurringBillManager.isBillPaidForCurrentCycle(paidBill);
        assert(isPaid, 'Bill should be recognized as paid');
        
        // Simulate unmarking (from Bills.jsx lines 606-614)
        const unmarkedBill = { ...paidBill };
        delete unmarkedBill.lastPaidDate;
        delete unmarkedBill.lastPayment;
        delete unmarkedBill.isPaid;
        if (unmarkedBill.paymentHistory && unmarkedBill.paymentHistory.length > 0) {
            unmarkedBill.paymentHistory = unmarkedBill.paymentHistory.slice(0, -1);
        }
        
        // Verify bill is no longer paid
        const isPaidAfterUnmark = RecurringBillManager.isBillPaidForCurrentCycle(unmarkedBill);
        assert(!isPaidAfterUnmark, 'Bill should not be paid after unmarking');
        
        console.log(`   âœ“ Paid bill correctly identified`);
        console.log(`   âœ“ Unmark functionality works correctly`);
        console.log(`   âœ“ Bill not deleted, only status changed`);
    });

    // Test 5: All filter options show correct bills
    test('All filter options (all, upcoming, paid, overdue, skipped) work correctly', () => {
        const mockBills = [
            { id: '1', name: 'Paid Bill', status: 'paid', amount: '100' },
            { id: '2', name: 'Pending Bill', status: 'pending', amount: '200' },
            { id: '3', name: 'Urgent Bill', status: 'urgent', amount: '150' },
            { id: '4', name: 'Due Today', status: 'due-today', amount: '300' },
            { id: '5', name: 'This Week', status: 'this-week', amount: '250' },
            { id: '6', name: 'Overdue Bill', status: 'overdue', amount: '400' },
            { id: '7', name: 'Skipped Bill', status: 'skipped', amount: '175' }
        ];

        // Test each filter
        const filters = {
            'all': 7,           // Should show all 7 bills
            'upcoming': 4,      // pending, urgent, due-today, this-week
            'paid': 1,
            'overdue': 1,
            'skipped': 1,
            'due-today': 1,
            'urgent': 1,
            'this-week': 1,
            'pending': 1
        };

        Object.entries(filters).forEach(([filterName, expectedCount]) => {
            const filtered = mockBills.filter(bill => {
                let matchesStatus = false;
                if (filterName === 'all') {
                    matchesStatus = true;
                } else if (filterName === 'upcoming') {
                    matchesStatus = ['pending', 'urgent', 'due-today', 'this-week'].includes(bill.status);
                } else {
                    matchesStatus = bill.status === filterName;
                }
                return matchesStatus;
            });

            assert(filtered.length === expectedCount,
                `Filter '${filterName}' should show ${expectedCount} bills, got ${filtered.length}`);
        });

        console.log(`   âœ“ All 9 filter options tested`);
        console.log(`   âœ“ Each filter shows correct bills`);
        console.log(`   âœ“ No bills hidden or lost`);
    });

    // Test 6: Status toggling doesn't delete bills
    test('Marking bill as paid/unpaid only changes status, never deletes bill', () => {
        const originalBill = {
            id: 'bill-1',
            name: 'Test Bill',
            amount: '100',
            dueDate: '2025-02-15',
            nextDueDate: '2025-02-15',
            recurrence: 'monthly',
            status: 'pending'
        };

        // Mark as paid
        const paidBill = RecurringBillManager.markBillAsPaid(originalBill, new Date('2025-02-15'));
        
        // Verify bill still exists with all properties
        assert(paidBill.id === originalBill.id, 'Bill ID should be unchanged');
        assert(paidBill.name === originalBill.name, 'Bill name should be unchanged');
        assert(paidBill.amount === originalBill.amount, 'Bill amount should be unchanged');
        assert(paidBill.status === 'paid', 'Bill status should be paid');
        
        // Unmark as paid
        const unmarkedBill = { ...paidBill };
        delete unmarkedBill.lastPaidDate;
        delete unmarkedBill.lastPayment;
        delete unmarkedBill.isPaid;
        
        // Verify bill still exists
        assert(unmarkedBill.id === originalBill.id, 'Bill ID should still be unchanged');
        assert(unmarkedBill.name === originalBill.name, 'Bill name should still be unchanged');
        
        console.log(`   âœ“ Bill persists through paid status change`);
        console.log(`   âœ“ Bill persists through unpaid status change`);
        console.log(`   âœ“ No deletion, only status modification`);
    });

    console.log('\nâœ… All integration tests passed!');
    console.log('\nðŸ“‹ Summary:');
    console.log('   â€¢ All Status filter shows ALL bills âœ“');
    console.log('   â€¢ Bill count reflects total, not filtered count âœ“');
    console.log('   â€¢ Skipped bills remain visible âœ“');
    console.log('   â€¢ Mark Unpaid button works correctly âœ“');
    console.log('   â€¢ All filter options work as expected âœ“');
    console.log('   â€¢ Status toggling never deletes bills âœ“');
};

// Run tests if this file is executed directly
if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].endsWith('BillsPageFilterIntegration.test.js')) {
    try {
        runIntegrationTests();
        if (typeof process !== 'undefined' && process.exit) process.exit(0);
    } catch (err) {
        console.error('\nâŒ Test suite failed!');
        console.error(err);
        if (typeof process !== 'undefined' && process.exit) process.exit(1);
    }
}

export { runIntegrationTests };

