// SpendabilityFilterLogic.test.js - Test the NEW filtering logic
// This tests the exact logic implemented in the Spendability.jsx fix
import { getPacificTime } from './DateUtils.js';
import { RecurringBillManager } from './RecurringBillManager.js';

const runSpendabilityFilterTests = () => {
  console.log('🧪 Testing New Spendability Filter Logic...\n');

  // Test 1: Verify the new filter logic matches expected behavior
  test('New filter logic: includes overdue and upcoming bills, excludes future bills', () => {
    const today = getPacificTime();
    today.setHours(0, 0, 0, 0);
    const paydayDate = new Date(today);
    paydayDate.setDate(paydayDate.getDate() + 14); // 14 days from now
    
    const bills = [
      {
        id: '1',
        name: 'Overdue Bill',
        amount: '100',
        dueDate: '2024-01-01',
        nextDueDate: '2024-01-01',
        recurrence: 'monthly'
      },
      {
        id: '2',
        name: 'Due Tomorrow',
        amount: '200',
        dueDate: (() => {
          const d = new Date(today);
          d.setDate(d.getDate() + 1);
          return d.toISOString().split('T')[0];
        })(),
        nextDueDate: (() => {
          const d = new Date(today);
          d.setDate(d.getDate() + 1);
          return d.toISOString().split('T')[0];
        })(),
        recurrence: 'monthly'
      },
      {
        id: '3',
        name: 'Due Before Payday',
        amount: '300',
        dueDate: (() => {
          const d = new Date(today);
          d.setDate(d.getDate() + 7);
          return d.toISOString().split('T')[0];
        })(),
        nextDueDate: (() => {
          const d = new Date(today);
          d.setDate(d.getDate() + 7);
          return d.toISOString().split('T')[0];
        })(),
        recurrence: 'monthly'
      },
      {
        id: '4',
        name: 'Due After Payday',
        amount: '400',
        dueDate: (() => {
          const d = new Date(today);
          d.setDate(d.getDate() + 30);
          return d.toISOString().split('T')[0];
        })(),
        nextDueDate: (() => {
          const d = new Date(today);
          d.setDate(d.getDate() + 30);
          return d.toISOString().split('T')[0];
        })(),
        recurrence: 'monthly'
      }
    ];
    
    const processedBills = RecurringBillManager.processBills(bills);
    
    // Apply the NEW filter logic from Spendability.jsx
    const relevantBills = processedBills.filter(bill => {
      const billDueDate = new Date(bill.nextDueDate || bill.dueDate);
      
      // Always include if bill is overdue and unpaid
      if (billDueDate < today) {
        return true;
      }
      
      // Include if bill is due before next payday
      if (billDueDate < paydayDate) {
        return true;
      }
      
      // Exclude bills due after payday
      return false;
    });
    
    console.log(`📊 Filter results:`);
    console.log(`  - Total bills: ${bills.length}`);
    console.log(`  - Relevant bills: ${relevantBills.length}`);
    relevantBills.forEach(b => console.log(`    ✅ ${b.name} ($${b.amount}) - due ${b.nextDueDate}`));
    
    // Should include: Overdue, Due Tomorrow, Due Before Payday (3 bills)
    // Should exclude: Due After Payday (1 bill)
    assert(relevantBills.length === 3, `Expected 3 relevant bills, got ${relevantBills.length}`);
    assert(relevantBills.some(b => b.name === 'Overdue Bill'), 'Should include overdue bill');
    assert(relevantBills.some(b => b.name === 'Due Tomorrow'), 'Should include due tomorrow');
    assert(relevantBills.some(b => b.name === 'Due Before Payday'), 'Should include due before payday');
    assert(!relevantBills.some(b => b.name === 'Due After Payday'), 'Should NOT include due after payday');
    
    const total = relevantBills.reduce((sum, b) => sum + parseFloat(b.amount), 0);
    assert(total === 600, `Total should be $600, got $${total}`);
    
    console.log('✅ New filter logic correctly includes/excludes bills');
  });

  // Test 2: Verify overdue bills from LAST payday cycle stay visible
  test('Overdue bills from previous payday cycle remain visible', () => {
    const today = getPacificTime();
    today.setHours(0, 0, 0, 0);
    
    // Simulate scenario: payday was 5 days ago, next payday is in 9 days
    const nextPayday = new Date(today);
    nextPayday.setDate(nextPayday.getDate() + 9);
    
    const bills = [
      {
        id: '1',
        name: 'Bill from Last Cycle',
        amount: '500',
        dueDate: (() => {
          const d = new Date(today);
          d.setDate(d.getDate() - 10); // 10 days ago
          return d.toISOString().split('T')[0];
        })(),
        nextDueDate: (() => {
          const d = new Date(today);
          d.setDate(d.getDate() - 10);
          return d.toISOString().split('T')[0];
        })(),
        recurrence: 'monthly',
        status: 'pending'
      },
      {
        id: '2',
        name: 'Upcoming Bill',
        amount: '200',
        dueDate: (() => {
          const d = new Date(today);
          d.setDate(d.getDate() + 5);
          return d.toISOString().split('T')[0];
        })(),
        nextDueDate: (() => {
          const d = new Date(today);
          d.setDate(d.getDate() + 5);
          return d.toISOString().split('T')[0];
        })(),
        recurrence: 'monthly'
      }
    ];
    
    const processedBills = RecurringBillManager.processBills(bills);
    
    // Apply NEW filter logic
    const relevantBills = processedBills.filter(bill => {
      const billDueDate = new Date(bill.nextDueDate || bill.dueDate);
      
      if (billDueDate < today) {
        return true; // Include overdue
      }
      
      if (billDueDate < nextPayday) {
        return true; // Include before payday
      }
      
      return false;
    });
    
    console.log(`📊 Previous cycle test:`);
    console.log(`  - Relevant bills: ${relevantBills.length}`);
    relevantBills.forEach(b => console.log(`    ✅ ${b.name} ($${b.amount})`));
    
    assert(relevantBills.length === 2, `Expected 2 bills, got ${relevantBills.length}`);
    assert(relevantBills.some(b => b.name === 'Bill from Last Cycle'), 
      'Overdue bill from last cycle should still be visible');
    assert(relevantBills.some(b => b.name === 'Upcoming Bill'), 
      'Upcoming bill should be visible');
    
    console.log('✅ Overdue bills from previous cycle correctly remain visible');
  });

  console.log('\n🎉 All Spendability filter logic tests passed!\n');
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
runSpendabilityFilterTests();
