/**
 * BillDeduplicationManager.test.js
 * 
 * Tests for the BillDeduplicationManager utility
 */

import { BillDeduplicationManager } from './BillDeduplicationManager.js';

// Simple test assertion helper
const assert = (condition, message) => {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
};

const test = (name, fn) => {
    try {
        fn();
        console.log(`âœ… ${name}`);
        return true;
    } catch (error) {
        console.error(`âŒ ${name}`);
        console.error(`   Error: ${error.message}`);
        return false;
    }
};

// Run tests
const runTests = () => {
    console.log('\n=== BillDeduplicationManager Tests ===\n');
    
    let passed = 0;
    let failed = 0;

    // Test 1: Generate consistent keys for identical bills
    if (test('generateBillKey: consistent keys for identical bills', () => {
        const bill1 = { name: 'Rent', amount: 1500, dueDate: '2024-01-15', recurrence: 'monthly' };
        const bill2 = { name: 'Rent', amount: 1500, dueDate: '2024-01-15', recurrence: 'monthly' };
        
        const key1 = BillDeduplicationManager.generateBillKey(bill1);
        const key2 = BillDeduplicationManager.generateBillKey(bill2);
        
        assert(key1 === key2, `Keys should be equal. Got: ${key1} !== ${key2}`);
    })) passed++; else failed++;

    // Test 2: Different keys for different names
    if (test('generateBillKey: different keys for different names', () => {
        const bill1 = { name: 'Rent', amount: 1500, dueDate: '2024-01-15', recurrence: 'monthly' };
        const bill2 = { name: 'Utilities', amount: 1500, dueDate: '2024-01-15', recurrence: 'monthly' };
        
        const key1 = BillDeduplicationManager.generateBillKey(bill1);
        const key2 = BillDeduplicationManager.generateBillKey(bill2);
        
        assert(key1 !== key2, `Keys should be different. Got: ${key1} === ${key2}`);
    })) passed++; else failed++;

    // Test 3: Case-insensitive names
    if (test('generateBillKey: case-insensitive for names', () => {
        const bill1 = { name: 'Rent', amount: 1500, dueDate: '2024-01-15', recurrence: 'monthly' };
        const bill2 = { name: 'RENT', amount: 1500, dueDate: '2024-01-15', recurrence: 'monthly' };
        const bill3 = { name: 'rent', amount: 1500, dueDate: '2024-01-15', recurrence: 'monthly' };
        
        const key1 = BillDeduplicationManager.generateBillKey(bill1);
        const key2 = BillDeduplicationManager.generateBillKey(bill2);
        const key3 = BillDeduplicationManager.generateBillKey(bill3);
        
        assert(key1 === key2 && key2 === key3, 'Keys should be equal regardless of case');
    })) passed++; else failed++;

    // Test 4: Include recurringTemplateId in key
    if (test('generateBillKey: include recurringTemplateId', () => {
        const bill1 = { name: 'Rent', amount: 1500, dueDate: '2024-01-15', recurrence: 'monthly', recurringTemplateId: 'template-123' };
        const bill2 = { name: 'Rent', amount: 1500, dueDate: '2024-01-15', recurrence: 'monthly', recurringTemplateId: 'template-456' };
        
        const key1 = BillDeduplicationManager.generateBillKey(bill1);
        const key2 = BillDeduplicationManager.generateBillKey(bill2);
        
        assert(key1 !== key2, 'Keys should be different for different template IDs');
    })) passed++; else failed++;

    // Test 5: Find no duplicates in empty array
    if (test('findDuplicates: empty array', () => {
        const result = BillDeduplicationManager.findDuplicates([]);
        
        assert(result.duplicates.length === 0, 'Should have no duplicates');
        assert(result.uniqueBills.length === 0, 'Should have no unique bills');
        assert(result.stats.total === 0, 'Total should be 0');
    })) passed++; else failed++;

    // Test 6: Find no duplicates when all bills are unique
    if (test('findDuplicates: all bills unique', () => {
        const bills = [
            { name: 'Rent', amount: 1500, dueDate: '2024-01-15', recurrence: 'monthly' },
            { name: 'Utilities', amount: 200, dueDate: '2024-01-10', recurrence: 'monthly' },
            { name: 'Internet', amount: 80, dueDate: '2024-01-05', recurrence: 'monthly' }
        ];
        
        const result = BillDeduplicationManager.findDuplicates(bills);
        
        assert(result.duplicates.length === 0, 'Should have no duplicates');
        assert(result.uniqueBills.length === 3, 'Should have 3 unique bills');
    })) passed++; else failed++;

    // Test 7: Find exact duplicates
    if (test('findDuplicates: exact duplicates', () => {
        const bills = [
            { id: '1', name: 'Rent', amount: 1500, dueDate: '2024-01-15', recurrence: 'monthly' },
            { id: '2', name: 'Rent', amount: 1500, dueDate: '2024-01-15', recurrence: 'monthly' },
            { id: '3', name: 'Rent', amount: 1500, dueDate: '2024-01-15', recurrence: 'monthly' }
        ];
        
        const result = BillDeduplicationManager.findDuplicates(bills);
        
        assert(result.duplicates.length === 2, `Should have 2 duplicates, got ${result.duplicates.length}`);
        assert(result.uniqueBills.length === 1, `Should have 1 unique bill, got ${result.uniqueBills.length}`);
        assert(result.uniqueBills[0].id === '1', 'First occurrence should be kept');
    })) passed++; else failed++;

    // Test 8: Handle triplicates (problem statement scenario)
    if (test('findDuplicates: triplicates as in problem statement', () => {
        const bills = [
            { id: '1', name: 'Netflix', amount: 15.99, dueDate: '2024-01-10', recurrence: 'monthly' },
            { id: '2', name: 'Netflix', amount: 15.99, dueDate: '2024-01-10', recurrence: 'monthly' },
            { id: '3', name: 'Netflix', amount: 15.99, dueDate: '2024-01-10', recurrence: 'monthly' },
            { id: '4', name: 'Spotify', amount: 9.99, dueDate: '2024-01-15', recurrence: 'monthly' }
        ];
        
        const result = BillDeduplicationManager.findDuplicates(bills);
        
        assert(result.duplicates.length === 2, 'Should have 2 Netflix duplicates');
        assert(result.uniqueBills.length === 2, 'Should have 2 unique bills (1 Netflix + 1 Spotify)');
        assert(result.stats.total === 4, 'Total should be 4');
    })) passed++; else failed++;

    // Test 9: Different dates are not duplicates
    if (test('findDuplicates: different dates not duplicates', () => {
        const bills = [
            { name: 'Rent', amount: 1500, dueDate: '2024-01-15', recurrence: 'monthly' },
            { name: 'Rent', amount: 1500, dueDate: '2024-01-30', recurrence: 'monthly' }
        ];
        
        const result = BillDeduplicationManager.findDuplicates(bills);
        
        assert(result.duplicates.length === 0, 'Should have no duplicates');
        assert(result.uniqueBills.length === 2, 'Should have 2 unique bills');
    })) passed++; else failed++;

    // Test 10: Different amounts are not duplicates
    if (test('findDuplicates: different amounts not duplicates', () => {
        const bills = [
            { name: 'Rent', amount: 1500, dueDate: '2024-01-15', recurrence: 'monthly' },
            { name: 'Rent', amount: 1600, dueDate: '2024-01-15', recurrence: 'monthly' }
        ];
        
        const result = BillDeduplicationManager.findDuplicates(bills);
        
        assert(result.duplicates.length === 0, 'Should have no duplicates');
        assert(result.uniqueBills.length === 2, 'Should have 2 unique bills');
    })) passed++; else failed++;

    // Test 11: Different recurrence are not duplicates
    if (test('findDuplicates: different recurrence not duplicates', () => {
        const bills = [
            { name: 'Rent', amount: 1500, dueDate: '2024-01-15', recurrence: 'monthly' },
            { name: 'Rent', amount: 1500, dueDate: '2024-01-15', recurrence: 'weekly' }
        ];
        
        const result = BillDeduplicationManager.findDuplicates(bills);
        
        assert(result.duplicates.length === 0, 'Should have no duplicates');
        assert(result.uniqueBills.length === 2, 'Should have 2 unique bills');
    })) passed++; else failed++;

    // Test 12: Remove duplicates
    if (test('removeDuplicates: remove duplicate bills', () => {
        const bills = [
            { id: '1', name: 'Rent', amount: 1500, dueDate: '2024-01-15', recurrence: 'monthly' },
            { id: '2', name: 'Rent', amount: 1500, dueDate: '2024-01-15', recurrence: 'monthly' },
            { id: '3', name: 'Utilities', amount: 200, dueDate: '2024-01-10', recurrence: 'monthly' },
            { id: '4', name: 'Utilities', amount: 200, dueDate: '2024-01-10', recurrence: 'monthly' },
            { id: '5', name: 'Internet', amount: 80, dueDate: '2024-01-05', recurrence: 'monthly' }
        ];
        
        const result = BillDeduplicationManager.removeDuplicates(bills);
        
        assert(result.cleanedBills.length === 3, 'Should have 3 cleaned bills');
        assert(result.removedBills.length === 2, 'Should have removed 2 bills');
        
        const keptIds = result.cleanedBills.map(b => b.id);
        assert(keptIds.includes('1') && keptIds.includes('3') && keptIds.includes('5'), 'First occurrences should be kept');
    })) passed++; else failed++;

    // Test 13: Check for duplicate
    if (test('checkForDuplicate: detect duplicate', () => {
        const existingBills = [
            { id: '1', name: 'Rent', amount: 1500, dueDate: '2024-01-15', recurrence: 'monthly' },
            { id: '2', name: 'Utilities', amount: 200, dueDate: '2024-01-10', recurrence: 'monthly' }
        ];
        
        const newBill = { name: 'Rent', amount: 1500, dueDate: '2024-01-15', recurrence: 'monthly' };
        
        const result = BillDeduplicationManager.checkForDuplicate(newBill, existingBills);
        
        assert(result.isDuplicate === true, 'Should detect duplicate');
        assert(result.duplicateOf.id === '1', 'Should reference the existing bill');
    })) passed++; else failed++;

    // Test 14: Summary message with no duplicates
    if (test('getSummaryMessage: no duplicates', () => {
        const stats = { total: 5, unique: 5, duplicates: 0 };
        const message = BillDeduplicationManager.getSummaryMessage(stats);
        
        assert(message.includes('No duplicates'), 'Message should mention no duplicates');
        assert(message.includes('5'), 'Message should include count');
    })) passed++; else failed++;

    // Test 15: Summary message with duplicates
    if (test('getSummaryMessage: with duplicates', () => {
        const stats = { total: 5, unique: 3, duplicates: 2 };
        const message = BillDeduplicationManager.getSummaryMessage(stats);
        
        assert(message.includes('2'), 'Message should include duplicate count');
        assert(message.includes('3'), 'Message should include unique count');
        assert(message.includes('5'), 'Message should include total count');
    })) passed++; else failed++;

    console.log(`\n=== Test Results ===`);
    console.log(`âœ… Passed: ${passed}`);
    console.log(`âŒ Failed: ${failed}`);
    console.log(`Total: ${passed + failed}`);
    
    return failed === 0;
};

// Run tests if this file is executed directly
if (typeof require !== 'undefined' && require.main === module) {
    runTests();
}

export { runTests };

