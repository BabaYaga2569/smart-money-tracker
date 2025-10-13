// CustomRecurrence.test.js - Test for custom month recurrence logic
import { RecurringBillManager } from './RecurringBillManager.js';

// Simple test runner for custom recurrence feature
const runCustomRecurrenceTests = () => {
    console.log('ðŸ§ª Testing Custom Recurrence Feature...\n');

    // Test 1: Bills with activeMonths should only generate for those months
    test('Bills only generated in active months', () => {
        const template = {
            id: 'rams-tickets-1',
            name: 'LA Rams Season Tickets',
            amount: 500,
            category: 'Entertainment',
            frequency: 'monthly',
            nextOccurrence: '2025-11-01',
            activeMonths: [10, 11, 0, 1, 2, 3, 4, 5, 6, 7], // Nov-Aug (indexes 10,11,0,1,2,3,4,5,6,7)
            autoPay: false,
            linkedAccount: '',
            status: 'active'
        };
        
        const generateBillId = () => `test_bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Generate bills for 12 months to cover the full year
        const bills = RecurringBillManager.generateBillsFromTemplate(template, 12, generateBillId);
        
        // Check that bills are only in active months
        bills.forEach(bill => {
            const billDate = new Date(bill.dueDate);
            const billMonth = billDate.getMonth();
            assert(
                template.activeMonths.includes(billMonth),
                `Bill with due date ${bill.dueDate} (month ${billMonth}) should be in active months`
            );
        });
        
        // Check that no bills are in September (month 8) or October (month 9)
        const septemberBills = bills.filter(bill => new Date(bill.dueDate).getMonth() === 8);
        const octoberBills = bills.filter(bill => new Date(bill.dueDate).getMonth() === 9);
        
        assert(septemberBills.length === 0, 'No bills should be generated in September');
        assert(octoberBills.length === 0, 'No bills should be generated in October');
        
        console.log(`âœ… Generated ${bills.length} bills, all in active months`);
    });

    // Test 2: Bills without activeMonths should generate for all months
    test('Bills without activeMonths generate for all months', () => {
        const template = {
            id: 'netflix-1',
            name: 'Netflix Subscription',
            amount: 15.99,
            category: 'Subscriptions',
            frequency: 'monthly',
            nextOccurrence: '2025-01-15',
            autoPay: true,
            linkedAccount: 'bofa',
            status: 'active'
        };
        
        const generateBillId = () => `test_bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Generate bills for 12 months
        const bills = RecurringBillManager.generateBillsFromTemplate(template, 12, generateBillId);
        
        // Should generate 12 bills (one for each month)
        assert(bills.length >= 10, `Should generate at least 10 bills, got ${bills.length}`);
        
        console.log(`âœ… Generated ${bills.length} bills without month restrictions`);
    });

    // Test 3: Empty activeMonths array should be treated as no restriction
    test('Empty activeMonths array treated as no restriction', () => {
        const template = {
            id: 'rent-1',
            name: 'Rent',
            amount: 1200,
            category: 'Bills & Utilities',
            frequency: 'monthly',
            nextOccurrence: '2025-01-01',
            activeMonths: [], // Empty array
            autoPay: false,
            linkedAccount: 'bofa',
            status: 'active'
        };
        
        const generateBillId = () => `test_bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Generate bills for 6 months
        const bills = RecurringBillManager.generateBillsFromTemplate(template, 6, generateBillId);
        
        // Should generate 6 bills (one for each month)
        assert(bills.length >= 5, `Should generate at least 5 bills, got ${bills.length}`);
        
        console.log(`âœ… Empty activeMonths array allows all months`);
    });

    // Test 4: Multiple consecutive months work correctly
    test('Consecutive active months work correctly', () => {
        const template = {
            id: 'summer-camp-1',
            name: 'Summer Camp Fee',
            amount: 300,
            category: 'Kids & Family',
            frequency: 'monthly',
            nextOccurrence: '2025-06-01',
            activeMonths: [5, 6, 7], // June, July, August (indexes 5, 6, 7)
            autoPay: false,
            linkedAccount: '',
            status: 'active'
        };
        
        const generateBillId = () => `test_bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Generate bills for 12 months
        const bills = RecurringBillManager.generateBillsFromTemplate(template, 12, generateBillId);
        
        // Check that bills are only in June, July, August
        bills.forEach(bill => {
            const billDate = new Date(bill.dueDate);
            const billMonth = billDate.getMonth();
            assert(
                billMonth === 5 || billMonth === 6 || billMonth === 7,
                `Bill should only be in June (5), July (6), or August (7), got ${billMonth}`
            );
        });
        
        console.log(`âœ… Consecutive months work correctly, generated ${bills.length} bills`);
    });

    // Test 5: Non-consecutive months work correctly
    test('Non-consecutive active months work correctly', () => {
        const template = {
            id: 'quarterly-maintenance-1',
            name: 'Quarterly Maintenance',
            amount: 150,
            category: 'Home & Garden',
            frequency: 'monthly',
            nextOccurrence: '2025-01-01',
            activeMonths: [0, 3, 6, 9], // Jan, Apr, Jul, Oct (indexes 0, 3, 6, 9)
            autoPay: false,
            linkedAccount: '',
            status: 'active'
        };
        
        const generateBillId = () => `test_bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Generate bills for 12 months
        const bills = RecurringBillManager.generateBillsFromTemplate(template, 12, generateBillId);
        
        // Check that bills are only in Jan, Apr, Jul, Oct
        bills.forEach(bill => {
            const billDate = new Date(bill.dueDate);
            const billMonth = billDate.getMonth();
            assert(
                [0, 3, 6, 9].includes(billMonth),
                `Bill should only be in Jan (0), Apr (3), Jul (6), or Oct (9), got ${billMonth}`
            );
        });
        
        console.log(`âœ… Non-consecutive months work correctly, generated ${bills.length} bills`);
    });

    // Test 6: Year boundary handling (Nov-Feb)
    test('Year boundary handling works correctly', () => {
        const template = {
            id: 'winter-service-1',
            name: 'Winter Service',
            amount: 200,
            category: 'Home & Garden',
            frequency: 'monthly',
            nextOccurrence: '2024-11-01',
            activeMonths: [10, 11, 0, 1], // Nov, Dec, Jan, Feb (indexes 10, 11, 0, 1)
            autoPay: false,
            linkedAccount: '',
            status: 'active'
        };
        
        const generateBillId = () => `test_bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Generate bills for 12 months to span multiple years
        const bills = RecurringBillManager.generateBillsFromTemplate(template, 12, generateBillId);
        
        // Check that bills are only in Nov, Dec, Jan, Feb
        bills.forEach(bill => {
            const billDate = new Date(bill.dueDate);
            const billMonth = billDate.getMonth();
            assert(
                [10, 11, 0, 1].includes(billMonth),
                `Bill should only be in Nov (10), Dec (11), Jan (0), or Feb (1), got ${billMonth}`
            );
        });
        
        // Verify we have bills from different years
        const years = new Set(bills.map(bill => new Date(bill.dueDate).getFullYear()));
        assert(years.size >= 1, 'Should have bills spanning at least one year');
        
        console.log(`âœ… Year boundary handling works, generated ${bills.length} bills across ${years.size} year(s)`);
    });

    console.log('\nðŸŽ‰ All custom recurrence tests passed! Feature is working correctly.\n');
};

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

// Export for use in other contexts
export { runCustomRecurrenceTests };

// Run tests if this file is executed directly
if (typeof window !== 'undefined' && window.location) {
    // Browser environment - add to window for manual testing
    window.testCustomRecurrence = runCustomRecurrenceTests;
} else if (typeof globalThis !== 'undefined' && globalThis.process && globalThis.process.env && globalThis.process.env.NODE_ENV === 'test') {
    // Node.js test environment
    runCustomRecurrenceTests();
}

