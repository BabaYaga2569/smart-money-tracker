/**
 * BillDeduplicationIntegration.test.js
 * 
 * Integration tests for the complete bill deduplication flow
 * Tests the problem statement scenarios
 */

import { BillDeduplicationManager } from './BillDeduplicationManager.js';

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

const runTests = () => {
    console.log('\n=== Bill Deduplication Integration Tests ===\n');
    console.log('Testing scenarios from the problem statement\n');
    
    let passed = 0;
    let failed = 0;

    // Test scenario 1: Same bill but due date off by 1 day
    if (test('Problem Scenario 1: Due date off by 1 day', () => {
        const bills = [
            { id: '1', name: 'Electric Bill', amount: 100.00, dueDate: '2024-01-15', recurrence: 'monthly' },
            { id: '2', name: 'Electric Bill', amount: 100.00, dueDate: '2024-01-16', recurrence: 'monthly' }
        ];
        
        const report = BillDeduplicationManager.generateDetailedDuplicateReport(bills);
        
        assert(report.duplicateCount === 1, `Should find 1 duplicate, found ${report.duplicateCount}`);
        assert(report.groups.length === 1, 'Should have 1 group');
        assert(report.groups[0].keepBill.id === '1', 'Should keep first bill');
    })) passed++; else failed++;

    // Test scenario 2: Same bill but amount differs by pennies
    if (test('Problem Scenario 2: Amount differs by pennies ($100.00 vs $99.99)', () => {
        const bills = [
            { id: '1', name: 'Netflix', amount: 100.00, dueDate: '2024-01-10', recurrence: 'monthly' },
            { id: '2', name: 'Netflix', amount: 99.99, dueDate: '2024-01-10', recurrence: 'monthly' }
        ];
        
        const report = BillDeduplicationManager.generateDetailedDuplicateReport(bills);
        
        assert(report.duplicateCount === 1, `Should find 1 duplicate, found ${report.duplicateCount}`);
    })) passed++; else failed++;

    // Test scenario 3: Same bill with slightly different names
    if (test('Problem Scenario 3: Slightly different names ("Electric Bill" vs "ElectricBill")', () => {
        const bills = [
            { id: '1', name: 'Electric Bill', amount: 100.00, dueDate: '2024-01-15', recurrence: 'monthly' },
            { id: '2', name: 'ElectricBill', amount: 100.00, dueDate: '2024-01-15', recurrence: 'monthly' }
        ];
        
        const report = BillDeduplicationManager.generateDetailedDuplicateReport(bills);
        
        assert(report.duplicateCount === 1, `Should find 1 duplicate, found ${report.duplicateCount}`);
    })) passed++; else failed++;

    // Test scenario 4: Multiple duplicates (triplicates)
    if (test('Problem Scenario 4: Triplicates (3 identical bills)', () => {
        const bills = [
            { id: '1', name: 'Rent', amount: 1500, dueDate: '2024-01-01', recurrence: 'monthly' },
            { id: '2', name: 'Rent', amount: 1500, dueDate: '2024-01-01', recurrence: 'monthly' },
            { id: '3', name: 'Rent', amount: 1500, dueDate: '2024-01-01', recurrence: 'monthly' }
        ];
        
        const report = BillDeduplicationManager.generateDetailedDuplicateReport(bills);
        
        assert(report.duplicateCount === 2, `Should find 2 duplicates, found ${report.duplicateCount}`);
        assert(report.groups[0].keepBill.id === '1', 'Should keep first occurrence');
        assert(report.groups[0].removeBills.length === 2, 'Should remove 2 duplicates');
    })) passed++; else failed++;

    // Test scenario 5: Multiple groups of duplicates
    if (test('Problem Scenario 5: Multiple groups of duplicates', () => {
        const bills = [
            { id: '1', name: 'Netflix', amount: 15.99, dueDate: '2024-01-10', recurrence: 'monthly' },
            { id: '2', name: 'Netflix', amount: 15.99, dueDate: '2024-01-11', recurrence: 'monthly' },
            { id: '3', name: 'Spotify', amount: 9.99, dueDate: '2024-01-15', recurrence: 'monthly' },
            { id: '4', name: 'Spotify', amount: 9.99, dueDate: '2024-01-16', recurrence: 'monthly' },
            { id: '5', name: 'Rent', amount: 1500, dueDate: '2024-01-01', recurrence: 'monthly' }
        ];
        
        const report = BillDeduplicationManager.generateDetailedDuplicateReport(bills);
        
        assert(report.duplicateCount === 2, `Should find 2 duplicates total, found ${report.duplicateCount}`);
        assert(report.totalGroups === 2, `Should have 2 groups, found ${report.totalGroups}`);
    })) passed++; else failed++;

    // Test scenario 6: No duplicates when differences are too large
    if (test('Problem Scenario 6: Not duplicates when amount differs by $2', () => {
        const bills = [
            { id: '1', name: 'Electric Bill', amount: 100.00, dueDate: '2024-01-15', recurrence: 'monthly' },
            { id: '2', name: 'Electric Bill', amount: 102.00, dueDate: '2024-01-15', recurrence: 'monthly' }
        ];
        
        const report = BillDeduplicationManager.generateDetailedDuplicateReport(bills);
        
        assert(report.duplicateCount === 0, `Should find 0 duplicates, found ${report.duplicateCount}`);
    })) passed++; else failed++;

    // Test scenario 7: Not duplicates when dates differ by 5 days
    if (test('Problem Scenario 7: Not duplicates when dates differ by 5 days', () => {
        const bills = [
            { id: '1', name: 'Rent', amount: 1500, dueDate: '2024-01-01', recurrence: 'monthly' },
            { id: '2', name: 'Rent', amount: 1500, dueDate: '2024-01-06', recurrence: 'monthly' }
        ];
        
        const report = BillDeduplicationManager.generateDetailedDuplicateReport(bills);
        
        assert(report.duplicateCount === 0, 'Should find 0 duplicates');
    })) passed++; else failed++;

    // Test scenario 8: Case insensitive matching
    if (test('Problem Scenario 8: Case insensitive matching', () => {
        const bills = [
            { id: '1', name: 'NETFLIX', amount: 15.99, dueDate: '2024-01-10', recurrence: 'monthly' },
            { id: '2', name: 'netflix', amount: 15.99, dueDate: '2024-01-10', recurrence: 'monthly' },
            { id: '3', name: 'Netflix', amount: 15.99, dueDate: '2024-01-10', recurrence: 'monthly' }
        ];
        
        const report = BillDeduplicationManager.generateDetailedDuplicateReport(bills);
        
        assert(report.duplicateCount === 2, `Should find 2 duplicates, found ${report.duplicateCount}`);
    })) passed++; else failed++;

    // Test scenario 9: Report structure validation
    if (test('Problem Scenario 9: Report has correct structure', () => {
        const bills = [
            { id: '1', name: 'Netflix', amount: 15.99, dueDate: '2024-01-10', recurrence: 'monthly' },
            { id: '2', name: 'Netflix', amount: 15.99, dueDate: '2024-01-11', recurrence: 'monthly' }
        ];
        
        const report = BillDeduplicationManager.generateDetailedDuplicateReport(bills);
        
        assert(typeof report.duplicateCount === 'number', 'duplicateCount should be a number');
        assert(typeof report.totalGroups === 'number', 'totalGroups should be a number');
        assert(Array.isArray(report.groups), 'groups should be an array');
        assert(report.groups[0].keepBill, 'group should have keepBill');
        assert(Array.isArray(report.groups[0].removeBills), 'group should have removeBills array');
        assert(typeof report.groups[0].count === 'number', 'group should have count');
    })) passed++; else failed++;

    // Test scenario 10: Large dataset (116 bills scenario from problem statement)
    if (test('Problem Scenario 10: Large dataset with many duplicates', () => {
        const bills = [];
        
        // Create 116 bills with many duplicates as in problem statement
        for (let i = 0; i < 30; i++) {
            bills.push({ id: `netflix-${i}`, name: 'Netflix', amount: 15.99, dueDate: '2024-01-10', recurrence: 'monthly' });
        }
        for (let i = 0; i < 30; i++) {
            bills.push({ id: `spotify-${i}`, name: 'Spotify', amount: 9.99, dueDate: '2024-01-15', recurrence: 'monthly' });
        }
        for (let i = 0; i < 30; i++) {
            bills.push({ id: `rent-${i}`, name: 'Rent', amount: 1500, dueDate: '2024-01-01', recurrence: 'monthly' });
        }
        for (let i = 0; i < 26; i++) {
            bills.push({ id: `electric-${i}`, name: 'Electric', amount: 100, dueDate: '2024-01-20', recurrence: 'monthly' });
        }
        
        const report = BillDeduplicationManager.generateDetailedDuplicateReport(bills);
        
        assert(bills.length === 116, 'Should have 116 bills');
        assert(report.duplicateCount === 112, `Should find 112 duplicates (116 - 4 unique), found ${report.duplicateCount}`);
        assert(report.totalGroups === 4, `Should have 4 groups, found ${report.totalGroups}`);
    })) passed++; else failed++;

    console.log(`\n=== Test Results ===`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`Total: ${passed + failed}`);
    
    if (failed === 0) {
        console.log('\n🎉 All integration tests passed! The deduplication feature is working correctly.\n');
    }
    
    return failed === 0;
};

if (typeof require !== 'undefined' && require.main === module) {
    runTests();
}

export { runTests };
