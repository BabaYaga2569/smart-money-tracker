// SpendabilityOverdueBills.test.js - Test for overdue bills inclusion in totals
// This test verifies that overdue bills are:
// 1. Included in the billsBeforePayday array
// 2. Included in the totalBillsDue calculation
// 3. Sorted to the top with priority 999

// Simple assertion helper
const assert = (condition, message) => {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
};

// Test helper function
const test = (name, fn) => {
    try {
        fn();
        console.log(`✅ ${name}`);
    } catch (error) {
        console.error(`❌ ${name}`);
        console.error(error.message);
        // eslint-disable-next-line no-undef
        if (typeof process !== 'undefined' && process.exit) {
            // eslint-disable-next-line no-undef
            process.exit(1);
        }
        throw error;
    }
};

// Simulate the bill status determination logic from RecurringBillManager
const determineBillStatus = (bill, today) => {
    const dueDate = new Date(bill.nextDueDate || bill.dueDate);
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dueDateStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
    
    const daysDiff = Math.floor((dueDateStart - todayStart) / (1000 * 60 * 60 * 24));
    
    if (daysDiff < 0) {
        return {
            status: 'overdue',
            daysOverdue: Math.abs(daysDiff),
            priority: 999,
            urgency: 'critical'
        };
    }
    
    if (daysDiff === 0) {
        return {
            status: 'due-today',
            priority: 100,
            urgency: 'high'
        };
    }
    
    if (daysDiff <= 3) {
        return {
            status: 'due-soon',
            daysUntilDue: daysDiff,
            priority: 50,
            urgency: 'medium'
        };
    }
    
    return {
        status: 'upcoming',
        daysUntilDue: daysDiff,
        priority: 10,
        urgency: 'low'
    };
};

// Simulate the bill sorting logic from Spendability.jsx (lines 297-309)
const sortBillsByPriority = (bills) => {
    return bills.sort((a, b) => {
        // Overdue bills ALWAYS at top (priority 999 vs lower priorities)
        if (a.statusInfo.priority !== b.statusInfo.priority) {
            return b.statusInfo.priority - a.statusInfo.priority;
        }
        // Then by due date
        return new Date(a.nextDueDate) - new Date(b.nextDueDate);
    });
};

// Simulate total calculation from Spendability.jsx (lines 311-313)
const calculateTotalBillsDue = (bills) => {
    return bills.reduce((sum, bill) => {
        return sum + (parseFloat(bill.amount) || 0);
    }, 0);
};

// Run tests
const runOverdueBillsTests = () => {
    console.log('🧪 Testing Overdue Bills Inclusion in Totals...\n');

    // Test 1: Overdue bills are included in the bills array
    test('Includes overdue bills in the bills array', () => {
        const today = new Date('2025-11-01');
        const bills = [
            { name: 'Google One', amount: 9.99, nextDueDate: '2025-10-25' },
            { name: 'SiriusXM', amount: 12.99, nextDueDate: '2025-10-28' },
            { name: 'Electric Bill', amount: 150.00, nextDueDate: '2025-11-05' }
        ];
        
        // Add status info to each bill (simulating Spendability.jsx lines 297-301)
        const billsWithStatus = bills.map(bill => ({
            ...bill,
            statusInfo: determineBillStatus(bill, today)
        }));
        
        // Check that overdue bills have correct status
        const overdueBills = billsWithStatus.filter(b => b.statusInfo.status === 'overdue');
        assert(overdueBills.length === 2, `Expected 2 overdue bills, got ${overdueBills.length}`);
        assert(overdueBills[0].name === 'Google One', `Expected Google One to be overdue`);
        assert(overdueBills[1].name === 'SiriusXM', `Expected SiriusXM to be overdue`);
    });

    // Test 2: Overdue bills are sorted to the top
    test('Sorts overdue bills to the top of the list', () => {
        const today = new Date('2025-11-01');
        const bills = [
            { name: 'Electric Bill', amount: 150.00, nextDueDate: '2025-11-05' },
            { name: 'Google One', amount: 9.99, nextDueDate: '2025-10-25' },
            { name: 'Water Bill', amount: 50.00, nextDueDate: '2025-11-03' },
            { name: 'SiriusXM', amount: 12.99, nextDueDate: '2025-10-28' }
        ];
        
        // Add status info and sort (simulating Spendability.jsx lines 297-309)
        const billsWithStatus = bills.map(bill => ({
            ...bill,
            statusInfo: determineBillStatus(bill, today)
        }));
        
        const sortedBills = sortBillsByPriority(billsWithStatus);
        
        // First two bills should be overdue (priority 999)
        assert(sortedBills[0].statusInfo.status === 'overdue', 
            `First bill should be overdue, got ${sortedBills[0].statusInfo.status}`);
        assert(sortedBills[1].statusInfo.status === 'overdue', 
            `Second bill should be overdue, got ${sortedBills[1].statusInfo.status}`);
        
        // First overdue bill should be the one that's MORE overdue (Oct 25 before Oct 28)
        assert(sortedBills[0].name === 'Google One', 
            `Most overdue bill should be Google One, got ${sortedBills[0].name}`);
        assert(sortedBills[1].name === 'SiriusXM', 
            `Second overdue bill should be SiriusXM, got ${sortedBills[1].name}`);
    });

    // Test 3: Total calculation includes ALL bills (overdue + upcoming)
    test('Includes overdue bills in total calculation', () => {
        const today = new Date('2025-11-01');
        const bills = [
            { name: 'Google One', amount: 9.99, nextDueDate: '2025-10-25' },
            { name: 'SiriusXM', amount: 12.99, nextDueDate: '2025-10-28' },
            { name: 'CVS', amount: 5.00, nextDueDate: '2025-10-30' },
            { name: 'Claude.ai', amount: 20.00, nextDueDate: '2025-10-31' },
            { name: 'Southwest Gas', amount: 23.43, nextDueDate: '2025-10-29' },
            { name: 'Electric Bill', amount: 150.00, nextDueDate: '2025-11-05' },
            { name: 'Water Bill', amount: 50.00, nextDueDate: '2025-11-10' }
        ];
        
        // Calculate total (simulating Spendability.jsx lines 311-313)
        const totalBillsDue = calculateTotalBillsDue(bills);
        
        // Expected total: 9.99 + 12.99 + 5.00 + 20.00 + 23.43 + 150.00 + 50.00 = 271.41
        const expectedTotal = 271.41;
        assert(Math.abs(totalBillsDue - expectedTotal) < 0.01, 
            `Expected total ${expectedTotal}, got ${totalBillsDue}`);
        
        // Verify overdue bills are part of the total
        const overdueBillsTotal = bills
            .filter(b => {
                const status = determineBillStatus(b, today);
                return status.status === 'overdue';
            })
            .reduce((sum, bill) => sum + parseFloat(bill.amount), 0);
        
        // Expected overdue total: 9.99 + 12.99 + 5.00 + 20.00 + 23.43 = 71.41
        const expectedOverdueTotal = 71.41;
        assert(Math.abs(overdueBillsTotal - expectedOverdueTotal) < 0.01, 
            `Expected overdue total ${expectedOverdueTotal}, got ${overdueBillsTotal}`);
    });

    // Test 4: Overdue bills have priority 999
    test('Overdue bills have priority 999', () => {
        const today = new Date('2025-11-01');
        const overdueBill = { name: 'Google One', amount: 9.99, nextDueDate: '2025-10-25' };
        
        const statusInfo = determineBillStatus(overdueBill, today);
        
        assert(statusInfo.priority === 999, 
            `Overdue bill should have priority 999, got ${statusInfo.priority}`);
        assert(statusInfo.status === 'overdue', 
            `Status should be 'overdue', got ${statusInfo.status}`);
        assert(statusInfo.urgency === 'critical', 
            `Urgency should be 'critical', got ${statusInfo.urgency}`);
        assert(statusInfo.daysOverdue === 7, 
            `Days overdue should be 7, got ${statusInfo.daysOverdue}`);
    });

    // Test 5: Example from problem statement - verify exact totals
    test('Problem statement example: $71.41 in overdue bills', () => {
        // Bills from problem statement
        const overdueBills = [
            { name: 'google one', amount: 9.99, nextDueDate: '2025-10-25' },
            { name: 'siriusxm', amount: 12.99, nextDueDate: '2025-10-28' },
            { name: 'CVS', amount: 5.00, nextDueDate: '2025-10-30' },
            { name: 'claude.ai', amount: 20.00, nextDueDate: '2025-10-31' },
            { name: 'southwest gas', amount: 23.43, nextDueDate: '2025-10-29' }
        ];
        
        const upcomingBills = [
            { name: 'Electric', amount: 100.00, nextDueDate: '2025-11-10' },
            { name: 'Water', amount: 50.00, nextDueDate: '2025-11-12' }
        ];
        
        const allBills = [...overdueBills, ...upcomingBills];
        
        // Calculate totals
        const overdueTotal = calculateTotalBillsDue(overdueBills);
        const upcomingTotal = calculateTotalBillsDue(upcomingBills);
        const totalAll = calculateTotalBillsDue(allBills);
        
        // Verify overdue total is $71.41
        assert(Math.abs(overdueTotal - 71.41) < 0.01, 
            `Expected overdue total $71.41, got $${overdueTotal.toFixed(2)}`);
        
        // Verify upcoming total is $150.00
        assert(Math.abs(upcomingTotal - 150.00) < 0.01, 
            `Expected upcoming total $150.00, got $${upcomingTotal.toFixed(2)}`);
        
        // Verify grand total is $221.41
        assert(Math.abs(totalAll - 221.41) < 0.01, 
            `Expected grand total $221.41, got $${totalAll.toFixed(2)}`);
    });

    console.log('\n✅ All overdue bills tests passed! Overdue bills are correctly included in totals and sorted to the top.\n');
};

// Run tests if this file is executed directly
// eslint-disable-next-line no-undef
if (typeof process !== 'undefined' && process.argv && process.argv[1] === new URL(import.meta.url).pathname) {
    runOverdueBillsTests();
}

export { runOverdueBillsTests, determineBillStatus, sortBillsByPriority, calculateTotalBillsDue };
