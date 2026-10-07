// SpendabilityBillLoading.test.js
// Regression coverage for canonical bill visibility used by Spendability.

import { visibleBillOccurrences } from '../utils/billVisibility.js';

const assert = (condition, message) => {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
};

const test = (name, fn) => {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(error.message);
    process.exit(1);
  }
};

const loadVisibleSpendabilityBills = (snapshotBills = []) =>
  visibleBillOccurrences(snapshotBills)
    .filter(bill => bill.status !== 'skipped')
    .map(bill => ({
      ...bill,
      nextDueDate: String(bill.dueDate || bill.nextDueDate || '').slice(0, 10),
      recurrence: bill.recurrence || 'monthly'
    }));

const runBillLoadingTests = () => {
  console.log('🧪 Testing canonical Spendability bill loading...\n');

  test('Only canonical visible unpaid occurrence contributes to Safe-to-Spend', () => {
    const snapshotBills = [
      {
        id: 'canonical',
        type: 'bill',
        name: 'Current Bill',
        amount: 125,
        dueDate: '2026-10-10',
        isPaid: false,
        status: 'pending'
      },
      {
        id: 'hidden',
        type: 'bill',
        name: 'Hidden Legacy Bill',
        amount: 500,
        dueDate: '2026-07-10',
        isPaid: false,
        status: 'pending',
        hiddenFromBills: true
      },
      {
        id: 'duplicate',
        type: 'bill',
        name: 'Archived Duplicate',
        amount: 125,
        dueDate: '2026-10-10',
        isPaid: false,
        status: 'pending',
        archivedDuplicate: true
      },
      {
        id: 'skipped',
        type: 'bill',
        name: 'Skipped Bill',
        amount: 75,
        dueDate: '2026-10-11',
        isPaid: false,
        status: 'skipped'
      },
      {
        id: 'paid',
        type: 'bill',
        name: 'Paid Bill',
        amount: 200,
        dueDate: '2026-10-12',
        isPaid: true,
        status: 'paid'
      },
      {
        id: 'not-a-bill',
        type: 'income',
        name: 'Paycheck',
        amount: 1945.17,
        dueDate: '2026-10-16',
        isPaid: false
      }
    ];

    const loaded = loadVisibleSpendabilityBills(snapshotBills);
    const total = loaded.reduce((sum, bill) => sum + Number(bill.amount || 0), 0);

    assert(loaded.length === 1, `Expected 1 visible bill, got ${loaded.length}`);
    assert(loaded[0].id === 'canonical', `Expected canonical bill, got ${loaded[0]?.id}`);
    assert(total === 125, `Expected Safe-to-Spend bill total $125, got $${total}`);
  });

  test('Keeps authoritative due date and supplies default recurrence', () => {
    const loaded = loadVisibleSpendabilityBills([
      {
        id: 'bill-1',
        type: 'bill',
        name: 'Internet',
        amount: 55,
        dueDate: '2026-10-15',
        isPaid: false,
        status: 'pending'
      }
    ]);

    assert(loaded[0].nextDueDate === '2026-10-15', 'Should preserve canonical due date');
    assert(loaded[0].recurrence === 'monthly', 'Should default missing recurrence to monthly');
  });

  test('Keeps multiple legitimate visible occurrences', () => {
    const loaded = loadVisibleSpendabilityBills([
      {
        id: 'bill-a',
        type: 'bill',
        name: 'Rent',
        amount: 350,
        dueDate: '2026-10-15',
        isPaid: false,
        status: 'pending'
      },
      {
        id: 'bill-b',
        type: 'bill',
        name: 'Car Payment',
        amount: 618,
        dueDate: '2026-10-15',
        isPaid: false,
        status: 'pending'
      }
    ]);

    assert(loaded.length === 2, `Expected 2 visible bills, got ${loaded.length}`);
  });

  console.log('\n✅ Canonical Spendability bill-loading tests passed!\n');
};

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) runBillLoadingTests();

export { runBillLoadingTests, loadVisibleSpendabilityBills };
