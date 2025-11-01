// OverdueBillsCalculation.test.js - Test for overdue bills being included in Total Bills Due
import { RecurringBillManager } from './RecurringBillManager.js';

// Simple test runner for overdue bills calculation fix
const runOverdueBillsTests = () => {
    console.log('🧪 Testing Overdue Bills Calculation Fix...\n');

    // Test 1: getOverdueBills returns only unpaid overdue bills
    test('getOverdueBills returns only unpaid overdue bills', () => {
        const today = new Date('2025-11-01'); // November 1, 2025
        
        const bills = [
            {
                name: 'Google One',
                amount: '9.18',
                dueDate: '2025-10-18',
                nextDueDate: '2025-10-18',
                recurrence: 'monthly',
                status: 'pending'
            },
            {
                name: 'Sirius XM',
                amount: '12.99',
                dueDate: '2025-10-19',
                nextDueDate: '2025-10-19',
                recurrence: 'monthly',
                status: 'pending'
            },
            {
                name: 'Future Bill',
                amount: '100.00',
                dueDate: '2025-11-15',
                nextDueDate: '2025-11-15',
                recurrence: 'monthly',
                status: 'pending'
            },
            {
                name: 'Paid Overdue Bill',
                amount: '50.00',
                dueDate: '2025-10-20',
                nextDueDate: '2025-10-20',
                recurrence: 'monthly',
                status: 'paid',
                isPaid: true,
                lastPaidDate: '2025-10-20',
                lastPayment: {
                    dueDate: '2025-10-20',
                    amount: 50.00
                }
            }
        ];
        
        const overdueBills = RecurringBillManager.getOverdueBills(bills, today);
        
        assert(overdueBills.length === 2, `Should return 2 overdue bills, got ${overdueBills.length}`);
        assert(overdueBills.some(b => b.name === 'Google One'), 'Should include Google One');
        assert(overdueBills.some(b => b.name === 'Sirius XM'), 'Should include Sirius XM');
        assert(!overdueBills.some(b => b.name === 'Future Bill'), 'Should not include future bill');
        assert(!overdueBills.some(b => b.name === 'Paid Overdue Bill'), 'Should not include paid bill');
        
        console.log('✅ getOverdueBills correctly filters unpaid overdue bills');
    });

    // Test 2: Combined bills include both overdue and bills due before payday
    test('Combined bills include both overdue and bills due before payday', () => {
        const today = new Date('2025-11-01');
        const payday = new Date('2025-11-14');
        
        const bills = [
            {
                id: 'bill1',
                name: 'Google One',
                amount: '9.18',
                dueDate: '2025-10-18',
                nextDueDate: '2025-10-18',
                recurrence: 'monthly'
            },
            {
                id: 'bill2',
                name: 'Electric Bill',
                amount: '125.50',
                dueDate: '2025-11-10',
                nextDueDate: '2025-11-10',
                recurrence: 'monthly'
            },
            {
                id: 'bill3',
                name: 'Future Bill',
                amount: '200.00',
                dueDate: '2025-11-20',
                nextDueDate: '2025-11-20',
                recurrence: 'monthly'
            }
        ];
        
        const billsDueBeforePayday = RecurringBillManager.getBillsDueBefore(bills, payday);
        const overdueBills = RecurringBillManager.getOverdueBills(bills, today);
        
        // Combine and deduplicate
        const combinedBills = [...billsDueBeforePayday, ...overdueBills];
        const uniqueBills = RecurringBillManager.deduplicateBills(combinedBills);
        
        assert(uniqueBills.length === 2, `Should have 2 unique bills, got ${uniqueBills.length}`);
        assert(uniqueBills.some(b => b.name === 'Google One'), 'Should include overdue Google One');
        assert(uniqueBills.some(b => b.name === 'Electric Bill'), 'Should include Electric Bill due before payday');
        assert(!uniqueBills.some(b => b.name === 'Future Bill'), 'Should not include future bill');
        
        const total = uniqueBills.reduce((sum, bill) => sum + parseFloat(bill.amount), 0);
        assert(Math.abs(total - 134.68) < 0.01, `Total should be $134.68, got $${total.toFixed(2)}`);
        
        console.log('✅ Combined bills correctly include overdue and bills due before payday');
    });

    // Test 3: No duplicate bills in combined list
    test('No duplicate bills when combining overdue and due before payday', () => {
        const today = new Date('2025-11-01');
        const payday = new Date('2025-11-14');
        
        const bills = [
            {
                id: 'bill1',
                name: 'Overdue Bill',
                amount: '50.00',
                dueDate: '2025-10-28',
                nextDueDate: '2025-10-28',
                recurrence: 'monthly'
            }
        ];
        
        // This bill is both overdue AND due before payday
        const billsDueBeforePayday = RecurringBillManager.getBillsDueBefore(bills, payday);
        const overdueBills = RecurringBillManager.getOverdueBills(bills, today);
        
        assert(billsDueBeforePayday.length === 1, 'Bill should be in billsDueBeforePayday');
        assert(overdueBills.length === 1, 'Bill should be in overdueBills');
        
        // Combine and deduplicate
        const combinedBills = [...billsDueBeforePayday, ...overdueBills];
        const uniqueBills = RecurringBillManager.deduplicateBills(combinedBills);
        
        assert(uniqueBills.length === 1, `Should have 1 unique bill after deduplication, got ${uniqueBills.length}`);
        assert(uniqueBills[0].name === 'Overdue Bill', 'Should preserve the bill');
        
        console.log('✅ Deduplication correctly removes duplicate bills');
    });

    // Test 4: Scenario from problem statement
    test('Problem statement scenario - 5 overdue subscription bills', () => {
        const today = new Date('2025-11-01');
        const payday = new Date('2025-11-14');
        
        const bills = [
            {
                id: 'sub1',
                name: 'Google One',
                amount: '9.18',
                dueDate: '2025-10-18',
                nextDueDate: '2025-10-18',
                recurrence: 'monthly',
                isSubscription: true
            },
            {
                id: 'sub2',
                name: 'Sirius XM',
                amount: '12.99',
                dueDate: '2025-10-19',
                nextDueDate: '2025-10-19',
                recurrence: 'monthly',
                isSubscription: true
            },
            {
                id: 'sub3',
                name: 'CVS ExtraCare',
                amount: '5.00',
                dueDate: '2025-10-26',
                nextDueDate: '2025-10-26',
                recurrence: 'monthly',
                isSubscription: true
            },
            {
                id: 'sub4',
                name: 'CloudCall',
                amount: '20.00',
                dueDate: '2025-10-26',
                nextDueDate: '2025-10-26',
                recurrence: 'monthly',
                isSubscription: true
            },
            {
                id: 'sub5',
                name: 'Southwest Gas',
                amount: '23.43',
                dueDate: '2025-10-26',
                nextDueDate: '2025-10-26',
                recurrence: 'monthly',
                isSubscription: true
            },
            {
                id: 'regular1',
                name: 'Regular Bill',
                amount: '1301.71',
                dueDate: '2025-11-10',
                nextDueDate: '2025-11-10',
                recurrence: 'monthly'
            }
        ];
        
        const billsDueBeforePayday = RecurringBillManager.getBillsDueBefore(bills, payday);
        const overdueBills = RecurringBillManager.getOverdueBills(bills, today);
        
        // Combine and deduplicate
        const combinedBills = [...billsDueBeforePayday, ...overdueBills];
        const uniqueBills = RecurringBillManager.deduplicateBills(combinedBills);
        
        const total = uniqueBills.reduce((sum, bill) => sum + parseFloat(bill.amount), 0);
        const expectedTotal = 9.18 + 12.99 + 5.00 + 20.00 + 23.43 + 1301.71; // 1372.31
        
        assert(uniqueBills.length === 6, `Should have 6 bills total, got ${uniqueBills.length}`);
        assert(Math.abs(total - expectedTotal) < 0.01, 
            `Total should be $${expectedTotal.toFixed(2)}, got $${total.toFixed(2)}`);
        
        // Verify all 5 overdue subscriptions are included
        assert(uniqueBills.some(b => b.name === 'Google One'), 'Should include Google One');
        assert(uniqueBills.some(b => b.name === 'Sirius XM'), 'Should include Sirius XM');
        assert(uniqueBills.some(b => b.name === 'CVS ExtraCare'), 'Should include CVS ExtraCare');
        assert(uniqueBills.some(b => b.name === 'CloudCall'), 'Should include CloudCall');
        assert(uniqueBills.some(b => b.name === 'Southwest Gas'), 'Should include Southwest Gas');
        assert(uniqueBills.some(b => b.name === 'Regular Bill'), 'Should include regular bill');
        
        console.log('✅ Problem statement scenario - all overdue subscriptions included in total');
    });

    // Test 5: Overdue bills get correct status
    test('Overdue bills get correct status info', () => {
        const today = new Date('2025-11-01');
        
        const bills = [
            {
                name: 'Overdue Bill',
                amount: '50.00',
                dueDate: '2025-10-20',
                nextDueDate: '2025-10-20',
                recurrence: 'monthly'
            }
        ];
        
        const overdueBills = RecurringBillManager.getOverdueBills(bills, today);
        assert(overdueBills.length === 1, 'Should have one overdue bill');
        
        const billWithStatus = {
            ...overdueBills[0],
            statusInfo: RecurringBillManager.determineBillStatus(overdueBills[0], today)
        };
        
        assert(billWithStatus.statusInfo.status === 'overdue', 
            `Status should be 'overdue', got '${billWithStatus.statusInfo.status}'`);
        assert(billWithStatus.statusInfo.daysOverdue === 12, 
            `Should be 12 days overdue, got ${billWithStatus.statusInfo.daysOverdue}`);
        assert(billWithStatus.statusInfo.priority === 999, 
            `Priority should be 999, got ${billWithStatus.statusInfo.priority}`);
        
        console.log('✅ Overdue bills get correct status info');
    });

    console.log('\n🎉 All overdue bills calculation tests passed! Fix is working correctly.\n');
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
export { runOverdueBillsTests };

// Run tests if this file is executed directly
if (typeof window !== 'undefined' && window.location) {
    // Browser environment - add to window for manual testing
    window.testOverdueBills = runOverdueBillsTests;
} else if (typeof globalThis !== 'undefined' && globalThis.process && globalThis.process.env && globalThis.process.env.NODE_ENV === 'test') {
    // Node.js test environment
    runOverdueBillsTests();
}
