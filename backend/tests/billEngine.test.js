import test from 'node:test';
import assert from 'node:assert/strict';
import { runCanonicalBillEngine } from '../utils/billEngine.js';

function doc(id, data) {
  return { id, data: () => data };
}

function createCollection(snapshotDocs) {
  const filters = [];
  return {
    filters,
    where(field, op, value) {
      filters.push([field, op, value]);
      return this;
    },
    async get() {
      return { docs: snapshotDocs };
    }
  };
}

function createDb({ bills = [], transactions = [] } = {}) {
  const financialEvents = createCollection(bills);
  const txCollection = createCollection(transactions);

  const userDoc = {
    collection(name) {
      if (name === 'financialEvents') return financialEvents;
      if (name === 'transactions') return txCollection;
      throw new Error(`Unexpected collection: ${name}`);
    }
  };

  const usersCollection = {
    doc() {
      return userDoc;
    }
  };

  return {
    collection(name) {
      if (name !== 'users') throw new Error(`Unexpected root collection: ${name}`);
      return usersCollection;
    },
    financialEvents,
    txCollection
  };
}

test('canonical bill engine loads unpaid bills and recent transactions then calls matcher once', async () => {
  const db = createDb({
    bills: [doc('bill-1', { type: 'bill', isPaid: false, name: 'Power', amount: 100 })],
    transactions: [doc('tx-1', { date: '2026-10-01', name: 'Power Co', amount: -100 })]
  });

  let calls = 0;
  const matcher = async (_db, userId, transactions, bills) => {
    calls++;
    assert.equal(userId, 'user-1');
    assert.equal(transactions.length, 1);
    assert.equal(bills.length, 1);
    return { success: true, cleared: 1, advanced: 1, generated: 1 };
  };

  const result = await runCanonicalBillEngine({
    db,
    userId: 'user-1',
    matcher
  });

  assert.equal(calls, 1);
  assert.equal(result.success, true);
  assert.equal(result.cleared, 1);
  assert.equal(result.billsScanned, 1);
  assert.equal(result.transactionsScanned, 1);
  assert.deepEqual(db.financialEvents.filters, [
    ['type', '==', 'bill'],
    ['isPaid', '==', false]
  ]);
  assert.equal(db.txCollection.filters[0][0], 'date');
  assert.equal(db.txCollection.filters[0][1], '>=');
});

test('canonical bill engine skips matcher when there are no unpaid bills', async () => {
  const db = createDb({
    bills: [],
    transactions: [doc('tx-1', { date: '2026-10-01', amount: -50 })]
  });

  const matcher = async () => {
    throw new Error('matcher should not run');
  };

  const result = await runCanonicalBillEngine({
    db,
    userId: 'user-1',
    matcher
  });

  assert.equal(result.success, true);
  assert.equal(result.cleared, 0);
  assert.equal(result.billsScanned, 0);
  assert.equal(result.transactionsScanned, 1);
});

test('canonical bill engine reports matcher failures without throwing', async () => {
  const db = createDb({
    bills: [doc('bill-1', { type: 'bill', isPaid: false })],
    transactions: [doc('tx-1', { date: '2026-10-01' })]
  });

  const result = await runCanonicalBillEngine({
    db,
    userId: 'user-1',
    matcher: async () => ({ success: false, error: 'boom' }),
    log: { error() {} }
  });

  assert.equal(result.success, false);
  assert.equal(result.error, 'boom');
  assert.equal(result.billsScanned, 1);
  assert.equal(result.transactionsScanned, 1);
});
