/**
 * BillDeduplicationManager.fuzzy.test.js
 * 
 * Tests for the fuzzy matching functionality in BillDeduplicationManager
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
        console.log(`✅ ${name}`);
        return true;
    } catch (error) {
        console.error(`❌ ${name}`);
        console.error(`   Error: ${error.message}`);
        return false;
    }
};

// Run tests
const runTests = () => {
    console.log('\n=== BillDeduplicationManager Fuzzy Matching Tests ===\n');
    
    let passed = 0;
    let failed = 0;

    // Test 1: Levenshtein distance calculation
    if (test('levenshteinDistance: identical strings', () => {
        const distance = BillDeduplicationManager.levenshteinDistance('hello', 'hello');
        assert(distance === 0, `Distance should be 0, got ${distance}`);
    })) passed++; else failed++;

    // Test 2: Levenshtein distance - one character difference
    if (test('levenshteinDistance: one character difference', () => {
        const distance = BillDeduplicationManager.levenshteinDistance('hello', 'hallo');
        assert(distance === 1, `Distance should be 1, got ${distance}`);
    })) passed++; else failed++;

    // Test 3: String similarity calculation
    if (test('calculateSimilarity: identical strings', () => {
        const similarity = BillDeduplicationManager.calculateSimilarity('hello', 'hello');
        assert(similarity === 1.0, `Similarity should be 1.0, got ${similarity}`);
    })) passed++; else failed++;

    // Test 4: String similarity - high similarity
    if (test('calculateSimilarity: high similarity', () => {
        const similarity = BillDeduplicationManager.calculateSimilarity('electricity', 'electric');
        assert(similarity > 0.7, `Similarity should be > 0.7, got ${similarity}`);
    })) passed++; else failed++;

    // Test 5: Fuzzy matching - similar names using "contains"
    if (test('areBillsDuplicates: similar names using contains (Electric Bill vs Electric)', () => {
        const bill1 = { name: 'Electric Bill', amount: 100, dueDate: '2024-01-15', recurrence: 'monthly' };
        const bill2 = { name: 'Electric', amount: 100, dueDate: '2024-01-15', recurrence: 'monthly' };
        
        const isDuplicate = BillDeduplicationManager.areBillsDuplicates(bill1, bill2);
        assert(isDuplicate === true, 'Should detect as duplicate due to name contains');
    })) passed++; else failed++;

    // Test 6: Fuzzy matching - amount within $1
    if (test('areBillsDuplicates: amount differs by $0.50', () => {
        const bill1 = { name: 'Netflix', amount: 15.99, dueDate: '2024-01-10', recurrence: 'monthly' };
        const bill2 = { name: 'Netflix', amount: 15.49, dueDate: '2024-01-10', recurrence: 'monthly' };
        
        const isDuplicate = BillDeduplicationManager.areBillsDuplicates(bill1, bill2);
        assert(isDuplicate === true, 'Should detect as duplicate - amount within $1');
    })) passed++; else failed++;

    // Test 7: Fuzzy matching - amount differs by more than $1
    if (test('areBillsDuplicates: amount differs by $2', () => {
        const bill1 = { name: 'Netflix', amount: 15.99, dueDate: '2024-01-10', recurrence: 'monthly' };
        const bill2 = { name: 'Netflix', amount: 17.99, dueDate: '2024-01-10', recurrence: 'monthly' };
        
        const isDuplicate = BillDeduplicationManager.areBillsDuplicates(bill1, bill2);
        assert(isDuplicate === false, 'Should NOT be duplicate - amount differs by more than $1');
    })) passed++; else failed++;

    // Test 8: Fuzzy matching - date within 3 days
    if (test('areBillsDuplicates: due date differs by 2 days', () => {
        const bill1 = { name: 'Rent', amount: 1500, dueDate: '2024-01-15', recurrence: 'monthly' };
        const bill2 = { name: 'Rent', amount: 1500, dueDate: '2024-01-17', recurrence: 'monthly' };
        
        const isDuplicate = BillDeduplicationManager.areBillsDuplicates(bill1, bill2);
        assert(isDuplicate === true, 'Should detect as duplicate - date within 3 days');
    })) passed++; else failed++;

    // Test 9: Fuzzy matching - date differs by more than 3 days
    if (test('areBillsDuplicates: due date differs by 5 days', () => {
        const bill1 = { name: 'Rent', amount: 1500, dueDate: '2024-01-15', recurrence: 'monthly' };
        const bill2 = { name: 'Rent', amount: 1500, dueDate: '2024-01-20', recurrence: 'monthly' };
        
        const isDuplicate = BillDeduplicationManager.areBillsDuplicates(bill1, bill2);
        assert(isDuplicate === false, 'Should NOT be duplicate - date differs by more than 3 days');
    })) passed++; else failed++;

    // Test 10: Fuzzy matching - different frequency
    if (test('areBillsDuplicates: different frequency', () => {
        const bill1 = { name: 'Rent', amount: 1500, dueDate: '2024-01-15', recurrence: 'monthly' };
        const bill2 = { name: 'Rent', amount: 1500, dueDate: '2024-01-15', recurrence: 'weekly' };
        
        const isDuplicate = BillDeduplicationManager.areBillsDuplicates(bill1, bill2);
        assert(isDuplicate === false, 'Should NOT be duplicate - different frequency');
    })) passed++; else failed++;

    // Test 11: Generate group key
    if (test('generateGroupKey: consistent keys for similar bills', () => {
        const bill1 = { name: 'Electric Bill', amount: 100.50, recurrence: 'monthly' };
        const bill2 = { name: 'Electric-Bill', amount: 100.50, recurrence: 'monthly' };
        
        const key1 = BillDeduplicationManager.generateGroupKey(bill1);
        const key2 = BillDeduplicationManager.generateGroupKey(bill2);
        
        assert(key1 === key2, 'Keys should be equal for similar bills');
    })) passed++; else failed++;

    // Test 12: Generate detailed duplicate report
    if (test('generateDetailedDuplicateReport: find duplicates', () => {
        const bills = [
            { id: '1', name: 'Netflix', amount: 15.99, dueDate: '2024-01-10', recurrence: 'monthly' },
            { id: '2', name: 'Netflix', amount: 15.99, dueDate: '2024-01-11', recurrence: 'monthly' },
            { id: '3', name: 'Netflix', amount: 15.99, dueDate: '2024-01-12', recurrence: 'monthly' },
            { id: '4', name: 'Spotify', amount: 9.99, dueDate: '2024-01-15', recurrence: 'monthly' }
        ];
        
        const report = BillDeduplicationManager.generateDetailedDuplicateReport(bills);
        
        assert(report.duplicateCount === 2, `Should have 2 duplicates, got ${report.duplicateCount}`);
        assert(report.totalGroups === 1, `Should have 1 group, got ${report.totalGroups}`);
        assert(report.groups[0].keepBill.id === '1', 'Should keep first bill');
        assert(report.groups[0].removeBills.length === 2, 'Should remove 2 bills');
    })) passed++; else failed++;

    // Test 13: Generate detailed report with no duplicates
    if (test('generateDetailedDuplicateReport: no duplicates', () => {
        const bills = [
            { id: '1', name: 'Netflix', amount: 15.99, dueDate: '2024-01-10', recurrence: 'monthly' },
            { id: '2', name: 'Spotify', amount: 9.99, dueDate: '2024-01-15', recurrence: 'monthly' },
            { id: '3', name: 'Rent', amount: 1500, dueDate: '2024-01-01', recurrence: 'monthly' }
        ];
        
        const report = BillDeduplicationManager.generateDetailedDuplicateReport(bills);
        
        assert(report.duplicateCount === 0, 'Should have no duplicates');
        assert(report.totalGroups === 0, 'Should have no groups');
    })) passed++; else failed++;

    // Test 14: Fuzzy matching with nextDueDate
    if (test('areBillsDuplicates: use nextDueDate when dueDate missing', () => {
        const bill1 = { name: 'Internet', amount: 80, nextDueDate: '2024-01-20', recurrence: 'monthly' };
        const bill2 = { name: 'Internet', amount: 80, nextDueDate: '2024-01-22', recurrence: 'monthly' };
        
        const isDuplicate = BillDeduplicationManager.areBillsDuplicates(bill1, bill2);
        assert(isDuplicate === true, 'Should detect as duplicate using nextDueDate');
    })) passed++; else failed++;

    // Test 15: Case insensitive name matching
    if (test('areBillsDuplicates: case insensitive names', () => {
        const bill1 = { name: 'NETFLIX', amount: 15.99, dueDate: '2024-01-10', recurrence: 'monthly' };
        const bill2 = { name: 'netflix', amount: 15.99, dueDate: '2024-01-10', recurrence: 'monthly' };
        
        const isDuplicate = BillDeduplicationManager.areBillsDuplicates(bill1, bill2);
        assert(isDuplicate === true, 'Should detect as duplicate - case insensitive');
    })) passed++; else failed++;

    console.log(`\n=== Test Results ===`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`Total: ${passed + failed}`);
    
    return failed === 0;
};

// Run tests if this file is executed directly
if (typeof require !== 'undefined' && require.main === module) {
    runTests();
}

export { runTests };
