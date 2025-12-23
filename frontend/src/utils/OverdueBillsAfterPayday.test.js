// OverdueBillsAfterPayday.test.js - Test for bills disappearing after payday
// This test reproduces the exact scenario from the problem statement
import { RecurringBillManager } from './RecurringBillManager.js';

const runOverdueBillsAfterPaydayTests = () => {
  console.log('🧪 Testing Overdue Bills After Payday Scenario...\n');

  // Test from problem statement:
  // - User has bills due Dec 28, 2025 and Dec 31, 2025
  // - Next payday: Dec 26, 2025
  // - On Jan 1, 2026, bills should STAY VISIBLE (not disappear)
  test('Overdue bills should remain visible after payday passes', () => {
    const today = new Date('2026-01-01'); // Jan 1, 2026
    const nextPayday = new Date('2026-01-09'); // Next payday is in future (Jan 9, 2026)
    
    const bills = [
      {
        id: 'bill1',
        name: 'Food',
        amount: '800',
        dueDate: '2025-12-28',
        nextDueDate: '2025-12-28',
        recurrence: 'monthly',
        status: 'pending'
      },
      {
        id: 'bill2',
        name: 'Bankruptcy',
        amount: '1301.71',
        dueDate: '2025-12-31',
        nextDueDate: '2025-12-31',
        recurrence: 'monthly',
        status: 'pending'
      }
    ];
    
    // Get bills due before next payday
    const billsDueBeforePayday = RecurringBillManager.getBillsDueBefore(bills, nextPayday);
    
    // Get overdue bills
    const overdueBills = RecurringBillManager.getOverdueBills(bills, today);
    
    // Combine and deduplicate (current approach in Spendability.jsx)
    const combinedBills = [...billsDueBeforePayday, ...overdueBills];
    const uniqueBills = RecurringBillManager.deduplicateBills(combinedBills);
    
    console.log('📊 Results:');
    console.log(`  - Bills due before payday (${nextPayday.toISOString().split('T')[0]}): ${billsDueBeforePayday.length}`);
    console.log(`  - Overdue bills (as of ${today.toISOString().split('T')[0]}): ${overdueBills.length}`);
    console.log(`  - Combined unique bills: ${uniqueBills.length}`);
    
    billsDueBeforePayday.forEach(b => console.log(`    📅 Due before payday: ${b.name} ($${b.amount}) - due ${b.nextDueDate}`));
    overdueBills.forEach(b => console.log(`    ⚠️  Overdue: ${b.name} ($${b.amount}) - due ${b.nextDueDate}`));
    uniqueBills.forEach(b => console.log(`    ✅ Final list: ${b.name} ($${b.amount}) - due ${b.nextDueDate}`));
    
    // ASSERTION: Both bills should be in the final list
    assert(uniqueBills.length === 2, 
      `❌ BUG FOUND: Expected 2 bills in final list, got ${uniqueBills.length}. Overdue bills disappeared!`);
    assert(uniqueBills.some(b => b.name === 'Food'), 'Food bill (Dec 28) should be visible');
    assert(uniqueBills.some(b => b.name === 'Bankruptcy'), 'Bankruptcy bill (Dec 31) should be visible');
    
    const total = uniqueBills.reduce((sum, bill) => sum + parseFloat(bill.amount), 0);
    assert(Math.abs(total - 2101.71) < 0.01, `Total should be $2,101.71, got $${total.toFixed(2)}`);
    
    console.log('✅ Overdue bills correctly remain visible after payday passes');
  });
  
  // Test the scenario on Dec 27, 2025 (after payday but before bills are overdue)
  test('Bills still visible on Dec 27 (after Dec 26 payday)', () => {
    const today = new Date('2025-12-27'); // Dec 27, 2025
    const nextPayday = new Date('2026-01-09'); // Next payday after Dec 26
    
    const bills = [
      {
        id: 'bill1',
        name: 'Food',
        amount: '800',
        dueDate: '2025-12-28',
        nextDueDate: '2025-12-28',
        recurrence: 'monthly',
        status: 'pending'
      },
      {
        id: 'bill2',
        name: 'Bankruptcy',
        amount: '1301.71',
        dueDate: '2025-12-31',
        nextDueDate: '2025-12-31',
        recurrence: 'monthly',
        status: 'pending'
      }
    ];
    
    const billsDueBeforePayday = RecurringBillManager.getBillsDueBefore(bills, nextPayday);
    const overdueBills = RecurringBillManager.getOverdueBills(bills, today);
    const combinedBills = [...billsDueBeforePayday, ...overdueBills];
    const uniqueBills = RecurringBillManager.deduplicateBills(combinedBills);
    
    console.log(`📊 On Dec 27 (after payday): ${uniqueBills.length} bills visible`);
    uniqueBills.forEach(b => console.log(`    ✅ ${b.name} ($${b.amount}) - due ${b.nextDueDate}`));
    
    assert(uniqueBills.length === 2, `Expected 2 bills visible on Dec 27, got ${uniqueBills.length}`);
    console.log('✅ Bills correctly visible on Dec 27 (after payday)');
  });
  
  // Test that paid bills are correctly excluded
  test('Paid bills should be excluded from the list', () => {
    const today = new Date('2026-01-01');
    const nextPayday = new Date('2026-01-09');
    
    const bills = [
      {
        id: 'bill1',
        name: 'Food',
        amount: '800',
        dueDate: '2025-12-28',
        nextDueDate: '2025-12-28',
        recurrence: 'monthly',
        status: 'pending'
      },
      {
        id: 'bill2',
        name: 'Bankruptcy',
        amount: '1301.71',
        dueDate: '2025-12-31',
        nextDueDate: '2025-12-31',
        recurrence: 'monthly',
        status: 'paid', // THIS ONE IS PAID
        isPaid: true,
        lastPaidDate: new Date('2025-12-31'),
        lastPayment: {
          amount: 1301.71,
          dueDate: '2025-12-31',
          paidDate: new Date('2025-12-31')
        },
        lastDueDate: '2025-12-31'
      }
    ];
    
    const billsDueBeforePayday = RecurringBillManager.getBillsDueBefore(bills, nextPayday);
    const overdueBills = RecurringBillManager.getOverdueBills(bills, today);
    const combinedBills = [...billsDueBeforePayday, ...overdueBills];
    const uniqueBills = RecurringBillManager.deduplicateBills(combinedBills);
    
    console.log(`📊 With one paid bill: ${uniqueBills.length} bills visible`);
    uniqueBills.forEach(b => console.log(`    ✅ ${b.name} ($${b.amount})`));
    
    assert(uniqueBills.length === 1, `Expected 1 unpaid bill, got ${uniqueBills.length}`);
    assert(uniqueBills[0].name === 'Food', 'Only Food bill (unpaid) should be visible');
    assert(!uniqueBills.some(b => b.name === 'Bankruptcy'), 'Paid Bankruptcy bill should be excluded');
    
    console.log('✅ Paid bills correctly excluded');
  });

  console.log('\n🎉 All overdue bills after payday tests passed!\n');
};

// Simple assertion helper
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`❌ Assertion failed: ${message}`);
  }
};

// Simple test runner
const test = (description, fn) => {
  try {
    fn();
    console.log(`  ✅ ${description}`);
  } catch (error) {
    console.error(`  ❌ ${description}`);
    console.error(`     ${error.message}`);
    throw error;
  }
};

// Run tests
runOverdueBillsAfterPaydayTests();
