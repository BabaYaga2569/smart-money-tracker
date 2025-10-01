// BillIdentification.test.js - Test for bill identification with multiple bills of same name/amount

// Simple test assertion helper
const assert = (condition, message) => {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
};

const test = (name, fn) => {
    try {
        fn();
        console.log(`✅ ${name}`);
        return true;
    } catch (error) {
        console.error(`❌ ${name}`);
        console.error(`   Error: ${error.message}`);
        return false;
    }
};

/**
 * Helper function to check if a bill matches the identification criteria
 * This mirrors the logic now used in Bills.jsx for identifying specific bills
 */
const billMatches = (bill, criteria) => {
    return bill.name === criteria.name && 
           bill.amount === criteria.amount &&
           bill.dueDate === criteria.dueDate &&
           bill.recurrence === criteria.recurrence;
};

/**
 * Helper function to check if two bills are exact duplicates
 */
const isExactDuplicate = (bill1, bill2) => {
    return bill1.name.toLowerCase() === bill2.name.toLowerCase() && 
           parseFloat(bill1.amount) === parseFloat(bill2.amount) &&
           bill1.dueDate === bill2.dueDate &&
           bill1.recurrence === bill2.recurrence;
};

/**
 * Helper function to filter out a specific bill
 */
const filterOutBill = (bills, billToRemove) => {
    return bills.filter(bill => 
        !(bill.name === billToRemove.name && 
          bill.amount === billToRemove.amount &&
          bill.dueDate === billToRemove.dueDate &&
          bill.recurrence === billToRemove.recurrence)
    );
};

export const runBillIdentificationTests = () => {
    console.log('🧪 Testing Bill Identification with Multiple Bills of Same Name/Amount\n');

    let passedTests = 0;
    let totalTests = 0;

    // Test 1: Can have two bills with same name and amount but different dates
    totalTests++;
    if (test('Allow multiple bills with same name/amount but different dates', () => {
        const bill1 = {
            name: 'Rent',
            amount: '350',
            dueDate: '2025-01-15',
            recurrence: 'monthly'
        };
        
        const bill2 = {
            name: 'Rent',
            amount: '350',
            dueDate: '2025-01-30',
            recurrence: 'monthly'
        };

        // These should NOT be considered exact duplicates
        const isDuplicate = isExactDuplicate(bill1, bill2);
        assert(!isDuplicate, 'Bills with different dates should not be duplicates');
    })) {
        passedTests++;
    }

    // Test 2: Can identify specific bill from list
    totalTests++;
    if (test('Can identify specific bill from list with same name/amount', () => {
        const bills = [
            { name: 'Rent', amount: '350', dueDate: '2025-01-15', recurrence: 'monthly' },
            { name: 'Rent', amount: '350', dueDate: '2025-01-30', recurrence: 'monthly' }
        ];
        
        const targetBill = { name: 'Rent', amount: '350', dueDate: '2025-01-15', recurrence: 'monthly' };
        
        const matchingBill = bills.find(b => billMatches(b, targetBill));
        assert(matchingBill !== undefined, 'Should find the specific bill');
        assert(matchingBill.dueDate === '2025-01-15', 'Should find the correct bill with matching date');
    })) {
        passedTests++;
    }

    // Test 3: Can delete specific bill without affecting other
    totalTests++;
    if (test('Can delete specific bill without affecting other similar bills', () => {
        const bills = [
            { name: 'Rent', amount: '350', dueDate: '2025-01-15', recurrence: 'monthly' },
            { name: 'Rent', amount: '350', dueDate: '2025-01-30', recurrence: 'monthly' },
            { name: 'Electric', amount: '100', dueDate: '2025-01-20', recurrence: 'monthly' }
        ];
        
        const billToDelete = { name: 'Rent', amount: '350', dueDate: '2025-01-15', recurrence: 'monthly' };
        
        const remainingBills = filterOutBill(bills, billToDelete);
        
        assert(remainingBills.length === 2, 'Should have 2 bills remaining');
        assert(remainingBills.some(b => b.dueDate === '2025-01-30'), 'Should keep the other rent bill');
        assert(remainingBills.some(b => b.name === 'Electric'), 'Should keep unrelated bills');
        assert(!remainingBills.some(b => b.dueDate === '2025-01-15' && b.name === 'Rent'), 'Should remove the targeted bill');
    })) {
        passedTests++;
    }

    // Test 4: Exact duplicates are still prevented
    totalTests++;
    if (test('Exact duplicates (same name, amount, date, frequency) are prevented', () => {
        const bill1 = {
            name: 'Rent',
            amount: '350',
            dueDate: '2025-01-15',
            recurrence: 'monthly'
        };
        
        const bill2 = {
            name: 'Rent',
            amount: '350',
            dueDate: '2025-01-15',
            recurrence: 'monthly'
        };

        const isDuplicate = isExactDuplicate(bill1, bill2);
        assert(isDuplicate, 'Bills with same name, amount, date, and frequency should be duplicates');
    })) {
        passedTests++;
    }

    // Test 5: Can have bills with same name/amount/date but different frequency
    totalTests++;
    if (test('Allow bills with same name/amount/date but different frequency', () => {
        const bill1 = {
            name: 'Storage Fee',
            amount: '50',
            dueDate: '2025-01-01',
            recurrence: 'monthly'
        };
        
        const bill2 = {
            name: 'Storage Fee',
            amount: '50',
            dueDate: '2025-01-01',
            recurrence: 'one-time'
        };

        const isDuplicate = isExactDuplicate(bill1, bill2);
        assert(!isDuplicate, 'Bills with different frequency should not be duplicates');
    })) {
        passedTests++;
    }

    // Test 6: Can update specific bill in list
    totalTests++;
    if (test('Can update specific bill without affecting similar bills', () => {
        const bills = [
            { name: 'Rent', amount: '350', dueDate: '2025-01-15', recurrence: 'monthly', notes: 'First half' },
            { name: 'Rent', amount: '350', dueDate: '2025-01-30', recurrence: 'monthly', notes: 'Second half' }
        ];
        
        const billToUpdate = { name: 'Rent', amount: '350', dueDate: '2025-01-15', recurrence: 'monthly' };
        const updatedData = { name: 'Rent', amount: '375', dueDate: '2025-01-15', recurrence: 'monthly', notes: 'First half - increased' };
        
        const updatedBills = bills.map(bill => {
            if (billMatches(bill, billToUpdate)) {
                return updatedData;
            }
            return bill;
        });
        
        assert(updatedBills.length === 2, 'Should still have 2 bills');
        assert(updatedBills[0].amount === '375', 'First bill should be updated');
        assert(updatedBills[1].amount === '350', 'Second bill should remain unchanged');
        assert(updatedBills[1].dueDate === '2025-01-30', 'Second bill should be the correct one');
    })) {
        passedTests++;
    }

    // Test 7: Case-insensitive name matching in duplicate detection
    totalTests++;
    if (test('Duplicate detection is case-insensitive for names', () => {
        const bill1 = {
            name: 'RENT',
            amount: '350',
            dueDate: '2025-01-15',
            recurrence: 'monthly'
        };
        
        const bill2 = {
            name: 'rent',
            amount: '350',
            dueDate: '2025-01-15',
            recurrence: 'monthly'
        };

        const isDuplicate = isExactDuplicate(bill1, bill2);
        assert(isDuplicate, 'Name comparison should be case-insensitive');
    })) {
        passedTests++;
    }

    console.log(`\n📊 Test Results: ${passedTests}/${totalTests} tests passed`);
    
    if (passedTests === totalTests) {
        console.log('🎉 All bill identification tests passed!');
    } else {
        console.log(`⚠️  ${totalTests - passedTests} test(s) failed`);
    }

    return {
        passed: passedTests,
        total: totalTests,
        success: passedTests === totalTests
    };
};

// Auto-run if called directly
if (typeof window !== 'undefined' && window.location) {
    window.runBillIdentificationTests = runBillIdentificationTests;
}
