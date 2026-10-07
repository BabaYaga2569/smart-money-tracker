import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMatchedBillPayment, applyManualBillPayment, unmarkManualBillPayment } from '../utils/BillMatchingService.js';

function pathJoin(...parts) {
  return parts.filter(Boolean).join('/');
}

function createRef(store, path) {
  return {
    path,
    id: path.split('/').at(-1),
    collection(name) {
      return createCollection(store, pathJoin(path, name));
    }
  };
}

function createCollection(store, path) {
  return {
    path,
    doc(id) {
      return createRef(store, pathJoin(path, id));
    }
  };
}

function snapshot(ref, value) {
  return {
    id: ref.id,
    exists: value !== undefined,
    data: () => value
  };
}

function createDb(initial = {}) {
  const store = new Map(Object.entries(initial));

  return {
    store,
    collection(name) {
      return createCollection(store, name);
    },
    async runTransaction(callback) {
      const writes = [];
      const tx = {
        async get(ref) {
          return snapshot(ref, store.get(ref.path));
        },
        update(ref, data) {
          writes.push({ type: 'update', ref, data });
        },
        set(ref, data, options) {
          writes.push({ type: 'set', ref, data, options });
        },
        delete(ref) {
          writes.push({ type: 'delete', ref });
        }
      };

      const result = await callback(tx);

      for (const write of writes) {
        const existing = store.get(write.ref.path);
        if (write.type === 'update') {
          if (existing === undefined) throw new Error(`Missing document: ${write.ref.path}`);
          store.set(write.ref.path, { ...existing, ...write.data });
        } else if (write.options?.merge && existing !== undefined) {
          store.set(write.ref.path, { ...existing, ...write.data });
        } else if (write.type === 'delete') {
          store.delete(write.ref.path);
        } else {
          store.set(write.ref.path, write.data);
        }
      }

      return result;
    }
  };
}

const userId = 'user-1';
const billPath = `users/${userId}/financialEvents/bill-1`;

function transaction(overrides = {}) {
  return {
    id: 'tx-1',
    transaction_id: 'tx-1',
    date: '2026-10-05',
    amount: -100,
    pending: false,
    ...overrides
  };
}

test('non-recurring payment commits bill state and deterministic history together', async () => {
  const db = createDb({
    [billPath]: {
      type: 'bill',
      name: 'Power',
      amount: 100,
      dueDate: '2026-10-05',
      isPaid: false,
      status: 'pending'
    }
  });

  const result = await applyMatchedBillPayment(
    db,
    userId,
    { id: 'bill-1' },
    transaction()
  );

  assert.equal(result.success, true);
  assert.equal(result.cleared, true);
  assert.equal(result.advanced, false);
  assert.equal(result.generated, false);

  const bill = db.store.get(billPath);
  assert.equal(bill.isPaid, true);
  assert.equal(bill.linkedTransactionId, 'tx-1');

  const payment = db.store.get(`users/${userId}/bill_payments/auto_bill-1_tx-1`);
  const archive = db.store.get(`users/${userId}/paidBills/auto_bill-1_tx-1`);
  assert.equal(payment.billId, 'bill-1');
  assert.equal(payment.linkedTransactionId, 'tx-1');
  assert.equal(archive.isPaid, true);
});

test('recurring payment advances pattern and creates next occurrence in same transaction', async () => {
  const patternPath = `users/${userId}/recurringPatterns/pattern-1`;
  const db = createDb({
    [billPath]: {
      type: 'bill',
      name: 'Rent',
      amount: 100,
      dueDate: '2026-10-05',
      isPaid: false,
      status: 'pending',
      recurrence: 'monthly',
      recurringPatternId: 'pattern-1'
    },
    [patternPath]: {
      name: 'Rent',
      frequency: 'monthly',
      nextOccurrence: '2026-10-05'
    }
  });

  const result = await applyMatchedBillPayment(
    db,
    userId,
    { id: 'bill-1' },
    transaction()
  );

  assert.equal(result.success, true);
  assert.equal(result.cleared, true);
  assert.equal(result.advanced, true);
  assert.equal(result.generated, true);
  assert.equal(result.nextOccurrence, '2026-11-05');

  assert.equal(db.store.get(patternPath).nextOccurrence, '2026-11-05');

  const nextBill = db.store.get(
    `users/${userId}/financialEvents/bill_pattern-1_2026-11-05`
  );
  assert.equal(nextBill.isPaid, false);
  assert.equal(nextBill.recurringPatternId, 'pattern-1');
  assert.equal(nextBill.dueDate, '2026-11-05');
});

test('reprocessing the same matched transaction is idempotent', async () => {
  const db = createDb({
    [billPath]: {
      type: 'bill',
      name: 'Power',
      amount: 100,
      dueDate: '2026-10-05',
      isPaid: false,
      status: 'pending'
    }
  });

  const first = await applyMatchedBillPayment(db, userId, { id: 'bill-1' }, transaction());
  const sizeAfterFirst = db.store.size;
  const second = await applyMatchedBillPayment(db, userId, { id: 'bill-1' }, transaction());

  assert.equal(first.cleared, true);
  assert.equal(second.success, true);
  assert.equal(second.idempotent, true);
  assert.equal(second.cleared, false);
  assert.equal(db.store.size, sizeAfterFirst);
});

test('out-of-sync recurring pattern is refused without partial writes', async () => {
  const patternPath = `users/${userId}/recurringPatterns/pattern-1`;
  const db = createDb({
    [billPath]: {
      type: 'bill',
      name: 'Rent',
      amount: 100,
      dueDate: '2026-10-05',
      isPaid: false,
      status: 'pending',
      recurrence: 'monthly',
      recurringPatternId: 'pattern-1'
    },
    [patternPath]: {
      name: 'Rent',
      frequency: 'monthly',
      nextOccurrence: '2026-11-05'
    }
  });

  const before = new Map(db.store);
  const result = await applyMatchedBillPayment(
    db,
    userId,
    { id: 'bill-1' },
    transaction()
  );

  assert.equal(result.success, false);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'RECURRING_PATTERN_OUT_OF_SYNC');
  assert.deepEqual([...db.store.entries()], [...before.entries()]);
});


test('manual non-recurring payment uses canonical lifecycle without creating a fake transaction', async () => {
  const db = createDb({
    [billPath]: {
      type: 'bill',
      name: 'Internet',
      amount: 85,
      dueDate: '2026-10-06',
      isPaid: false,
      status: 'pending'
    }
  });

  const result = await applyManualBillPayment(
    db,
    userId,
    'bill-1',
    { paidDate: '2026-10-06' }
  );

  assert.equal(result.success, true);
  assert.equal(result.cleared, true);
  assert.equal(result.advanced, false);
  assert.equal(result.paymentRecordId, 'manual_bill-1_2026-10-06');

  const bill = db.store.get(billPath);
  assert.equal(bill.isPaid, true);
  assert.equal(bill.linkedTransactionId, null);
  assert.equal(bill.markedVia, 'manual-payment');

  const payment = db.store.get(
    `users/${userId}/bill_payments/manual_bill-1_2026-10-06`
  );
  assert.equal(payment.paymentMethod, 'Manual');
  assert.equal(payment.linkedTransactionId, null);
});

test('manual recurring payment can be safely unmarked before the next occurrence moves', async () => {
  const patternPath = `users/${userId}/recurringPatterns/pattern-1`;
  const db = createDb({
    [billPath]: {
      type: 'bill',
      name: 'Rent',
      amount: 500,
      dueDate: '2026-10-05',
      isPaid: false,
      status: 'pending',
      recurrence: 'monthly',
      recurringPatternId: 'pattern-1'
    },
    [patternPath]: {
      name: 'Rent',
      frequency: 'monthly',
      nextOccurrence: '2026-10-05'
    }
  });

  const paid = await applyManualBillPayment(
    db,
    userId,
    'bill-1',
    { paidDate: '2026-10-05' }
  );

  assert.equal(paid.success, true);
  assert.equal(db.store.get(patternPath).nextOccurrence, '2026-11-05');

  const unmarked = await unmarkManualBillPayment(db, userId, 'bill-1');

  assert.equal(unmarked.success, true);
  assert.equal(unmarked.unmarked, true);
  assert.equal(db.store.get(billPath).isPaid, false);
  assert.equal(db.store.get(billPath).status, 'pending');
  assert.equal(db.store.get(patternPath).nextOccurrence, '2026-10-05');
  assert.equal(
    db.store.has(`users/${userId}/financialEvents/bill_pattern-1_2026-11-05`),
    false
  );
  assert.equal(
    db.store.has(`users/${userId}/bill_payments/manual_bill-1_2026-10-05`),
    false
  );
});

test('manual unmark refuses to reverse after the recurring chain has moved forward', async () => {
  const patternPath = `users/${userId}/recurringPatterns/pattern-1`;
  const db = createDb({
    [billPath]: {
      type: 'bill',
      name: 'Rent',
      amount: 500,
      dueDate: '2026-10-05',
      isPaid: false,
      status: 'pending',
      recurrence: 'monthly',
      recurringPatternId: 'pattern-1'
    },
    [patternPath]: {
      name: 'Rent',
      frequency: 'monthly',
      nextOccurrence: '2026-10-05'
    }
  });

  const paid = await applyManualBillPayment(
    db,
    userId,
    'bill-1',
    { paidDate: '2026-10-05' }
  );
  assert.equal(paid.success, true);

  db.store.set(patternPath, {
    ...db.store.get(patternPath),
    nextOccurrence: '2026-12-05'
  });

  const before = new Map(db.store);
  const result = await unmarkManualBillPayment(db, userId, 'bill-1');

  assert.equal(result.success, false);
  assert.equal(result.reason, 'RECURRING_PATTERN_HAS_MOVED_FORWARD');
  assert.deepEqual([...db.store.entries()], [...before.entries()]);
});

test('auto/Plaid payments cannot be unmarked through the manual reversal endpoint', async () => {
  const db = createDb({
    [billPath]: {
      type: 'bill',
      name: 'Power',
      amount: 100,
      dueDate: '2026-10-05',
      isPaid: false,
      status: 'pending'
    }
  });

  const paid = await applyMatchedBillPayment(
    db,
    userId,
    { id: 'bill-1' },
    transaction()
  );
  assert.equal(paid.success, true);

  const result = await unmarkManualBillPayment(db, userId, 'bill-1');
  assert.equal(result.success, false);
  assert.equal(result.reason, 'ONLY_CANONICAL_MANUAL_PAYMENTS_CAN_BE_UNMARKED');
});


test('seasonal recurring pattern skips inactive months', async () => {
  const patternPath = `users/${userId}/recurringPatterns/rams-pattern`;
  const seasonalBillPath = `users/${userId}/financialEvents/rams-bill`;
  const db = createDb({
    [seasonalBillPath]: {
      type: 'bill',
      name: 'Season Tickets Rams',
      amount: 601,
      dueDate: '2026-08-15',
      isPaid: false,
      status: 'pending',
      recurrence: 'monthly',
      recurringPatternId: 'rams-pattern'
    },
    [patternPath]: {
      name: 'Season Tickets Rams',
      amount: 601,
      frequency: 'monthly',
      nextOccurrence: '2026-08-15',
      activeMonths: [1,2,3,4,5,6,7,8,11,12],
      scheduleRule: { kind: 'dayOfMonth', day: 15 }
    }
  });

  const result = await applyManualBillPayment(
    db,
    userId,
    'rams-bill',
    { paidDate: '2026-08-15' }
  );

  assert.equal(result.success, true);
  assert.equal(result.nextOccurrence, '2026-11-15');
  assert.equal(db.store.get(patternPath).nextOccurrence, '2026-11-15');
  assert.equal(
    db.store.has(`users/${userId}/financialEvents/bill_rams-pattern_2026-09-15`),
    false
  );
  assert.equal(
    db.store.has(`users/${userId}/financialEvents/bill_rams-pattern_2026-11-15`),
    true
  );
});

test('quarter-end recurring pattern preserves quarter-end last day', async () => {
  const patternPath = `users/${userId}/recurringPatterns/republic-pattern`;
  const republicBillPath = `users/${userId}/financialEvents/republic-bill`;
  const db = createDb({
    [republicBillPath]: {
      type: 'bill',
      name: 'Republic Services',
      amount: 59.19,
      dueDate: '2026-09-30',
      isPaid: false,
      status: 'pending',
      recurrence: 'quarterly',
      recurringPatternId: 'republic-pattern'
    },
    [patternPath]: {
      name: 'Republic Services',
      amount: 59.19,
      frequency: 'quarterly',
      nextOccurrence: '2026-09-30',
      scheduleRule: {
        kind: 'quarterEndLastDay',
        months: [3, 6, 9, 12]
      }
    }
  });

  const result = await applyManualBillPayment(
    db,
    userId,
    'republic-bill',
    { paidDate: '2026-09-30' }
  );

  assert.equal(result.success, true);
  assert.equal(result.nextOccurrence, '2026-12-31');
  assert.equal(db.store.get(patternPath).nextOccurrence, '2026-12-31');
  assert.equal(
    db.store.has(`users/${userId}/financialEvents/bill_republic-pattern_2026-12-31`),
    true
  );
});

test('installment plan generates final occurrence with exact final amount', async () => {
  const patternPath = `users/${userId}/recurringPatterns/amazon-pattern`;
  const installmentBillPath = `users/${userId}/financialEvents/amazon-oct`;
  const db = createDb({
    [installmentBillPath]: {
      type: 'bill',
      name: 'Affirm Dog Water Bowl and Vacuum',
      amount: 21.21,
      dueDate: '2026-10-07',
      isPaid: false,
      status: 'pending',
      recurrence: 'monthly',
      recurringPatternId: 'amazon-pattern'
    },
    [patternPath]: {
      name: 'Affirm Dog Water Bowl and Vacuum',
      amount: 21.21,
      frequency: 'monthly',
      nextOccurrence: '2026-10-07',
      scheduleRule: { kind: 'dayOfMonth', day: 7 },
      installmentPlan: true,
      remainingPayments: 2,
      remainingBalance: 42.39,
      endDate: '2026-11-07',
      finalPaymentAmount: 21.18
    }
  });

  const result = await applyManualBillPayment(
    db,
    userId,
    'amazon-oct',
    { paidDate: '2026-10-07', amount: 21.21 }
  );

  assert.equal(result.success, true);
  assert.equal(result.completed, false);
  assert.equal(result.nextOccurrence, '2026-11-07');

  const pattern = db.store.get(patternPath);
  assert.equal(pattern.remainingPayments, 1);
  assert.equal(pattern.remainingBalance, 21.18);
  assert.equal(pattern.nextOccurrence, '2026-11-07');

  const finalBill = db.store.get(
    `users/${userId}/financialEvents/bill_amazon-pattern_2026-11-07`
  );
  assert.equal(finalBill.amount, 21.18);
  assert.equal(finalBill.dueDate, '2026-11-07');
});

test('final installment completes pattern and creates no future bill', async () => {
  const patternPath = `users/${userId}/recurringPatterns/vevor-pattern`;
  const finalBillPath = `users/${userId}/financialEvents/vevor-final`;
  const db = createDb({
    [finalBillPath]: {
      type: 'bill',
      name: 'Affirm Vevor Meat Slicer',
      amount: 35.83,
      dueDate: '2026-10-10',
      isPaid: false,
      status: 'pending',
      recurrence: 'monthly',
      recurringPatternId: 'vevor-pattern'
    },
    [patternPath]: {
      name: 'Affirm Vevor Meat Slicer',
      amount: 35.83,
      frequency: 'monthly',
      nextOccurrence: '2026-10-10',
      scheduleRule: { kind: 'dayOfMonth', day: 10 },
      installmentPlan: true,
      remainingPayments: 1,
      remainingBalance: 35.83,
      endDate: '2026-10-10',
      finalPaymentAmount: 35.83,
      status: 'active'
    }
  });

  const result = await applyManualBillPayment(
    db,
    userId,
    'vevor-final',
    { paidDate: '2026-10-10', amount: 35.83 }
  );

  assert.equal(result.success, true);
  assert.equal(result.completed, true);
  assert.equal(result.generated, false);
  assert.equal(result.nextOccurrence, null);

  const pattern = db.store.get(patternPath);
  assert.equal(pattern.status, 'ended');
  assert.equal(pattern.nextOccurrence, null);
  assert.equal(pattern.remainingPayments, 0);
  assert.equal(pattern.remainingBalance, 0);
  assert.equal(
    db.store.has(`users/${userId}/financialEvents/bill_vevor-pattern_2026-11-10`),
    false
  );
});

test('manual final installment can be unmarked and restores installment state', async () => {
  const patternPath = `users/${userId}/recurringPatterns/vevor-pattern`;
  const finalBillPath = `users/${userId}/financialEvents/vevor-final`;
  const db = createDb({
    [finalBillPath]: {
      type: 'bill',
      name: 'Affirm Vevor Meat Slicer',
      amount: 35.83,
      dueDate: '2026-10-10',
      isPaid: false,
      status: 'pending',
      recurrence: 'monthly',
      recurringPatternId: 'vevor-pattern'
    },
    [patternPath]: {
      name: 'Affirm Vevor Meat Slicer',
      amount: 35.83,
      frequency: 'monthly',
      nextOccurrence: '2026-10-10',
      scheduleRule: { kind: 'dayOfMonth', day: 10 },
      installmentPlan: true,
      remainingPayments: 1,
      remainingBalance: 35.83,
      endDate: '2026-10-10',
      finalPaymentAmount: 35.83,
      status: 'active'
    }
  });

  const paid = await applyManualBillPayment(
    db,
    userId,
    'vevor-final',
    { paidDate: '2026-10-10', amount: 35.83 }
  );
  assert.equal(paid.completed, true);

  const unmarked = await unmarkManualBillPayment(db, userId, 'vevor-final');
  assert.equal(unmarked.success, true);
  assert.equal(unmarked.unmarked, true);

  const pattern = db.store.get(patternPath);
  assert.equal(pattern.status, 'active');
  assert.equal(pattern.nextOccurrence, '2026-10-10');
  assert.equal(pattern.remainingPayments, 1);
  assert.equal(pattern.remainingBalance, 35.83);
  assert.equal(db.store.get(finalBillPath).isPaid, false);
});


test('recurring payment omits undefined installment fields from Firestore update', async () => {
  const patternPath = `users/${userId}/recurringPatterns/pattern-plain`;
  const recurringBillPath = `users/${userId}/financialEvents/bill-plain`;
  const db = createDb({
    [recurringBillPath]: {
      type: 'bill',
      name: 'Las Vegas Valley Water Bill',
      amount: 26.30,
      dueDate: '2026-10-08',
      isPaid: false,
      status: 'pending',
      recurrence: 'monthly',
      recurringPatternId: 'pattern-plain'
    },
    [patternPath]: {
      name: 'Las Vegas Valley Water Bill',
      amount: 26.30,
      frequency: 'monthly',
      nextOccurrence: '2026-10-08',
      status: 'active'
    }
  });

  const result = await applyMatchedBillPayment(
    db,
    userId,
    { id: 'bill-plain' },
    transaction({
      id: 'tx-water',
      transaction_id: 'tx-water',
      date: '2026-10-07',
      amount: -26.30
    })
  );

  assert.equal(result.success, true);
  assert.equal(result.cleared, true);

  const pattern = db.store.get(patternPath);
  assert.equal(pattern.nextOccurrence, '2026-11-08');
  assert.equal(
    Object.prototype.hasOwnProperty.call(pattern, 'remainingPayments'),
    false
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(pattern, 'remainingBalance'),
    false
  );
});
