/**
 * Tests for billCleanupMigration.js
 */

import { groupBillsByIdentity, selectBillToKeep, analyzeForCleanup } from './billCleanupMigration.js';

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
  console.log('\n=== billCleanupMigration Tests ===\n');
  
  let passed = 0;
  let failed = 0;
  
  // Test 1: Group bills by name, amount, and frequency
  if (test('groupBillsByIdentity: groups bills by name, amount, and frequency', () => {
    const bills = [
      { id: '1', name: 'Netflix', amount: 15.99, recurrence: 'monthly', dueDate: '2025-11-15' },
      { id: '2', name: 'Netflix', amount: 15.99, recurrence: 'monthly', dueDate: '2025-12-15' },
      { id: '3', name: 'Spotify', amount: 9.99, recurrence: 'monthly', dueDate: '2025-11-10' },
      { id: '4', name: 'Netflix', amount: 15.99, recurrence: 'monthly', dueDate: '2026-01-15' }
    ];
    
    const groups = groupBillsByIdentity(bills);
    
    assert(groups.size === 2, `Expected 2 groups, got ${groups.size}`);
    assert(groups.get('netflix|15.99|monthly').length === 3, 'Netflix should have 3 bills');
    assert(groups.get('spotify|9.99|monthly').length === 1, 'Spotify should have 1 bill');
  })) passed++; else failed++;
  
  // Test 2: Handle different frequencies separately
  if (test('groupBillsByIdentity: handles different frequencies separately', () => {
    const bills = [
      { id: '1', name: 'Internet', amount: 59.99, recurrence: 'monthly', dueDate: '2025-11-15' },
      { id: '2', name: 'Internet', amount: 59.99, recurrence: 'quarterly', dueDate: '2025-11-15' }
    ];
    
    const groups = groupBillsByIdentity(bills);
    
    assert(groups.size === 2, `Expected 2 groups, got ${groups.size}`);
    assert(groups.get('internet|59.99|monthly').length === 1, 'Monthly Internet should have 1 bill');
    assert(groups.get('internet|59.99|quarterly').length === 1, 'Quarterly Internet should have 1 bill');
  })) passed++; else failed++;
  
  // Test 3: Keep the next upcoming unpaid bill
  if (test('selectBillToKeep: keeps the next upcoming unpaid bill', () => {
    const bills = [
      { id: '1', name: 'Netflix', amount: 15.99, dueDate: '2025-10-15', isPaid: false },
      { id: '2', name: 'Netflix', amount: 15.99, dueDate: '2025-11-15', isPaid: false },
      { id: '3', name: 'Netflix', amount: 15.99, dueDate: '2025-12-15', isPaid: false }
    ];
    
    const { keepBill, removeBills } = selectBillToKeep(bills);
    
    assert(keepBill.id === '2', `Expected to keep bill 2, got ${keepBill.id}`);
    assert(removeBills.length === 2, `Expected 2 bills to remove, got ${removeBills.length}`);
  })) passed++; else failed++;
  
  // Test 4: Keep the most recent unpaid bill if no future bills
  if (test('selectBillToKeep: keeps most recent unpaid bill if no future bills', () => {
    const bills = [
      { id: '1', name: 'Netflix', amount: 15.99, dueDate: '2025-09-15', isPaid: false },
      { id: '2', name: 'Netflix', amount: 15.99, dueDate: '2025-10-15', isPaid: false },
      { id: '3', name: 'Netflix', amount: 15.99, dueDate: '2025-08-15', isPaid: false }
    ];
    
    const { keepBill, removeBills } = selectBillToKeep(bills);
    
    assert(keepBill.id === '2', `Expected to keep bill 2, got ${keepBill.id}`);
    assert(removeBills.length === 2, `Expected 2 bills to remove, got ${removeBills.length}`);
  })) passed++; else failed++;
  
  // Test 5: Keep the latest paid bill if all are paid
  if (test('selectBillToKeep: keeps latest paid bill if all are paid', () => {
    const bills = [
      { id: '1', name: 'Netflix', amount: 15.99, dueDate: '2025-09-15', isPaid: true, status: 'paid' },
      { id: '2', name: 'Netflix', amount: 15.99, dueDate: '2025-10-15', isPaid: true, status: 'paid' },
      { id: '3', name: 'Netflix', amount: 15.99, dueDate: '2025-08-15', isPaid: true, status: 'paid' }
    ];
    
    const { keepBill, removeBills } = selectBillToKeep(bills);
    
    assert(keepBill.id === '2', `Expected to keep bill 2, got ${keepBill.id}`);
    assert(removeBills.length === 2, `Expected 2 bills to remove, got ${removeBills.length}`);
  })) passed++; else failed++;
  
  // Test 6: Return single bill if only one in group
  if (test('selectBillToKeep: returns single bill if only one in group', () => {
    const bills = [
      { id: '1', name: 'Netflix', amount: 15.99, dueDate: '2025-11-15', isPaid: false }
    ];
    
    const { keepBill, removeBills } = selectBillToKeep(bills);
    
    assert(keepBill.id === '1', `Expected to keep bill 1, got ${keepBill.id}`);
    assert(removeBills.length === 0, `Expected 0 bills to remove, got ${removeBills.length}`);
  })) passed++; else failed++;
  
  // Test 7: Generate correct cleanup report
  if (test('analyzeForCleanup: generates correct cleanup report', () => {
    const bills = [
      { id: '1', name: 'Netflix', amount: 15.99, recurrence: 'monthly', dueDate: '2025-10-15', isPaid: true },
      { id: '2', name: 'Netflix', amount: 15.99, recurrence: 'monthly', dueDate: '2025-11-15', isPaid: false },
      { id: '3', name: 'Netflix', amount: 15.99, recurrence: 'monthly', dueDate: '2025-12-15', isPaid: false },
      { id: '4', name: 'Spotify', amount: 9.99, recurrence: 'monthly', dueDate: '2025-11-10', isPaid: false }
    ];
    
    const report = analyzeForCleanup(bills);
    
    assert(report.totalBills === 4, `Expected 4 total bills, got ${report.totalBills}`);
    assert(report.uniqueGroups === 2, `Expected 2 unique groups, got ${report.uniqueGroups}`);
    assert(report.duplicatesFound === 2, `Expected 2 duplicates found, got ${report.duplicatesFound}`);
    assert(report.billsToKeep.length === 2, `Expected 2 bills to keep, got ${report.billsToKeep.length}`);
    assert(report.billsToRemove.length === 2, `Expected 2 bills to remove, got ${report.billsToRemove.length}`);
    assert(report.groupDetails.length === 1, `Expected 1 group detail, got ${report.groupDetails.length}`);
    
    const netflixGroup = report.groupDetails[0];
    assert(netflixGroup.name === 'netflix', `Expected netflix, got ${netflixGroup.name}`);
    assert(netflixGroup.totalCount === 3, `Expected 3 total, got ${netflixGroup.totalCount}`);
    assert(netflixGroup.duplicateCount === 2, `Expected 2 duplicates, got ${netflixGroup.duplicateCount}`);
  })) passed++; else failed++;
  
  // Test 8: Handle no duplicates
  if (test('analyzeForCleanup: handles no duplicates', () => {
    const bills = [
      { id: '1', name: 'Netflix', amount: 15.99, recurrence: 'monthly', dueDate: '2025-11-15', isPaid: false },
      { id: '2', name: 'Spotify', amount: 9.99, recurrence: 'monthly', dueDate: '2025-11-10', isPaid: false }
    ];
    
    const report = analyzeForCleanup(bills);
    
    assert(report.totalBills === 2, `Expected 2 total bills, got ${report.totalBills}`);
    assert(report.uniqueGroups === 2, `Expected 2 unique groups, got ${report.uniqueGroups}`);
    assert(report.duplicatesFound === 0, `Expected 0 duplicates, got ${report.duplicatesFound}`);
    assert(report.billsToKeep.length === 2, `Expected 2 bills to keep, got ${report.billsToKeep.length}`);
    assert(report.billsToRemove.length === 0, `Expected 0 bills to remove, got ${report.billsToRemove.length}`);
    assert(report.groupDetails.length === 0, `Expected 0 group details, got ${report.groupDetails.length}`);
  })) passed++; else failed++;
  
  // Summary
  console.log(`\n=== Test Summary ===`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Total: ${passed + failed}\n`);
  
  return failed === 0;
};

// Export for use in other modules
export { runTests };

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const success = runTests();
  process.exit(success ? 0 : 1);
}
