// Simple test runner for Bill Identification tests

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
 * Bills are now identified by their unique ID
 */
const billMatches = (bill, criteria) => {
    return bill.id === criteria.id;
};

/**
 * Helper function to check if two bills are exact duplicates
 * Note: This is for validation/duplicate detection, not for operations
 */
const isExactDuplicate = (bill1, bill2) => {
    return bill1.name.toLowerCase() === bill2.name.toLowerCase() && 
           parseFloat(bill1.amount) === parseFloat(bill2.amount) &&
           bill1.dueDate === bill2.dueDate &&
           bill1.recurrence === bill2.recurrence;
};

/**
 * Helper function to filter out a specific bill
 * Uses ID for identification
 */
const filterOutBill = (bills, billToRemove) => {
    return bills.filter(bill => bill.id !== billToRemove.id);
};

const runBillIdentificationTests = () => {
    console.log('🧪 Testing Bill Identification with Unique IDs\n');

    let passedTests = 0;
    let totalTests = 0;

    // Test 1: Can have two bills with same name and amount but different dates
    totalTests++;
    if (test('Allow multiple bills with same name/amount but different dates', () => {
        const bill1 = {
            id: 'bill_1',
            name: 'Rent',
            amount: '350',
            dueDate: '2025-01-15',
            recurrence: 'monthly'
        };
        
        const bill2 = {
            id: 'bill_2',
            name: 'Rent',
            amount: '350',
            dueDate: '2025-01-30',
            recurrence: 'monthly'
        };

        // These should NOT be considered exact duplicates (for validation)
        const isDuplicate = isExactDuplicate(bill1, bill2);
        assert(!isDuplicate, 'Bills with different dates should not be duplicates');
        // But they have different IDs, so they're distinct bills
        assert(bill1.id !== bill2.id, 'Bills should have different IDs');
    })) {
        passedTests++;
    }

    // Test 2: Can identify specific bill from list by ID
    totalTests++;
    if (test('Can identify specific bill from list by ID', () => {
        const bills = [
            { id: 'bill_1', name: 'Rent', amount: '350', dueDate: '2025-01-15', recurrence: 'monthly' },
            { id: 'bill_2', name: 'Rent', amount: '350', dueDate: '2025-01-30', recurrence: 'monthly' }
        ];
        
        const targetBill = { id: 'bill_1', name: 'Rent', amount: '350', dueDate: '2025-01-15', recurrence: 'monthly' };
        
        const matchingBill = bills.find(b => billMatches(b, targetBill));
        assert(matchingBill !== undefined, 'Should find the specific bill by ID');
        assert(matchingBill.dueDate === '2025-01-15', 'Should find the correct bill with matching date');
        assert(matchingBill.id === 'bill_1', 'Should find the bill with correct ID');
    })) {
        passedTests++;
    }

    // Test 3: Can delete specific bill by ID without affecting other
    totalTests++;
    if (test('Can delete specific bill by ID without affecting other similar bills', () => {
        const bills = [
            { id: 'bill_1', name: 'Rent', amount: '350', dueDate: '2025-01-15', recurrence: 'monthly' },
            { id: 'bill_2', name: 'Rent', amount: '350', dueDate: '2025-01-30', recurrence: 'monthly' },
            { id: 'bill_3', name: 'Electric', amount: '100', dueDate: '2025-01-20', recurrence: 'monthly' }
        ];
        
        const billToDelete = { id: 'bill_1', name: 'Rent', amount: '350', dueDate: '2025-01-15', recurrence: 'monthly' };
        
        const remainingBills = filterOutBill(bills, billToDelete);
        
        assert(remainingBills.length === 2, 'Should have 2 bills remaining');
        assert(remainingBills.some(b => b.id === 'bill_2'), 'Should keep the other rent bill');
        assert(remainingBills.some(b => b.id === 'bill_3'), 'Should keep unrelated bills');
        assert(!remainingBills.some(b => b.id === 'bill_1'), 'Should remove the targeted bill by ID');
    })) {
        passedTests++;
    }

    // Test 4: Exact duplicates are still prevented (validation layer)
    totalTests++;
    if (test('Exact duplicates (same name, amount, date, frequency) are prevented by validation', () => {
        const bill1 = {
            id: 'bill_1',
            name: 'Rent',
            amount: '350',
            dueDate: '2025-01-15',
            recurrence: 'monthly'
        };
        
        const bill2 = {
            id: 'bill_2',  // Different ID
            name: 'Rent',
            amount: '350',
            dueDate: '2025-01-15',
            recurrence: 'monthly'
        };

        // Validation should detect these as duplicates
        const isDuplicate = isExactDuplicate(bill1, bill2);
        assert(isDuplicate, 'Bills with same name, amount, date, and frequency should be detected as duplicates during validation');
    })) {
        passedTests++;
    }

    // Test 5: Can have bills with same name/amount/date but different frequency
    totalTests++;
    if (test('Allow bills with same name/amount/date but different frequency', () => {
        const bill1 = {
            id: 'bill_1',
            name: 'Storage Fee',
            amount: '50',
            dueDate: '2025-01-01',
            recurrence: 'monthly'
        };
        
        const bill2 = {
            id: 'bill_2',
            name: 'Storage Fee',
            amount: '50',
            dueDate: '2025-01-01',
            recurrence: 'one-time'
        };

        const isDuplicate = isExactDuplicate(bill1, bill2);
        assert(!isDuplicate, 'Bills with different frequency should not be duplicates');
        assert(bill1.id !== bill2.id, 'Bills should have different IDs');
    })) {
        passedTests++;
    }

    // Test 6: Can update specific bill by ID without affecting similar bills
    totalTests++;
    if (test('Can update specific bill by ID without affecting similar bills', () => {
        const bills = [
            { id: 'bill_1', name: 'Rent', amount: '350', dueDate: '2025-01-15', recurrence: 'monthly', notes: 'First half' },
            { id: 'bill_2', name: 'Rent', amount: '350', dueDate: '2025-01-30', recurrence: 'monthly', notes: 'Second half' }
        ];
        
        const billToUpdate = { id: 'bill_1', name: 'Rent', amount: '350', dueDate: '2025-01-15', recurrence: 'monthly' };
        const updatedData = { id: 'bill_1', name: 'Rent', amount: '375', dueDate: '2025-01-15', recurrence: 'monthly', notes: 'First half - increased' };
        
        const updatedBills = bills.map(bill => {
            if (billMatches(bill, billToUpdate)) {
                return updatedData;
            }
            return bill;
        });
        
        assert(updatedBills.length === 2, 'Should still have 2 bills');
        assert(updatedBills[0].amount === '375', 'First bill should be updated');
        assert(updatedBills[1].amount === '350', 'Second bill should remain unchanged');
        assert(updatedBills[1].id === 'bill_2', 'Second bill should have correct ID');
    })) {
        passedTests++;
    }

    // Test 7: Case-insensitive name matching in duplicate validation
    totalTests++;
    if (test('Duplicate validation is case-insensitive for names', () => {
        const bill1 = {
            id: 'bill_1',
            name: 'RENT',
            amount: '350',
            dueDate: '2025-01-15',
            recurrence: 'monthly'
        };
        
        const bill2 = {
            id: 'bill_2',
            name: 'rent',
            amount: '350',
            dueDate: '2025-01-15',
            recurrence: 'monthly'
        };

        const isDuplicate = isExactDuplicate(bill1, bill2);
        assert(isDuplicate, 'Name comparison should be case-insensitive in validation');
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

// Run tests
runBillIdentificationTests();
