import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMatchedBillPayment } from '../utils/BillMatchingService.js';

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
