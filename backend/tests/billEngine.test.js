import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureCurrentBillOccurrences, runCanonicalBillEngine } from '../utils/billEngine.js';

function doc(id, data) {
  return { id, data: () => data };
}

function createCollection(snapshotDocs, name = '') {
  const filters = [];
  const writes = [];
  return {
    name,
    filters,
    writes,
    where(field, op, value) {
      filters.push([field, op, value]);
      return this;
    },
    async get() {
      return { docs: snapshotDocs };
    },
    doc(id) {
      return { id, path: `${name}/${id}` };
    }
  };
}

function createDb({ bills = [], transactions = [], patterns = [] } = {}) {
  const financialEvents = createCollection(bills, 'financialEvents');
  const txCollection = createCollection(transactions, 'transactions');
  const recurringPatterns = createCollection(patterns, 'recurringPatterns');

  const userDoc = {
    collection(name) {
      if (name === 'financialEvents') return financialEvents;
      if (name === 'transactions') return txCollection;
      if (name === 'recurringPatterns') return recurringPatterns;
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
    batch() {
      const writes = [];
      return {
        set(ref, data, options) {
          writes.push({ ref, data, options });
        },
        async commit() {
          for (const write of writes) {
            financialEvents.writes.push(write);
          }
        }
      };
    },
    financialEvents,
    txCollection,
    recurringPatterns
  };
}

test('canonical bill engine loads unpaid bills and recent transactions then calls matcher once', async () => {
  const db = createDb({
    bills: [doc('bill-1', { type: 'bill', isPaid: false, name: 'Power', amount: 100 })],
    transactions: [doc('tx-1', { date: '2026-10-01', name: 'Power Co', amount: -100 })],
    patterns: []
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
    transactions: [doc('tx-1', { date: '2026-10-01', amount: -50 })],
    patterns: []
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
    transactions: [doc('tx-1', { date: '2026-10-01' })],
    patterns: []
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


test('canonical bill engine seeds a missing current occurrence before matching', async () => {
  const db = createDb({
    bills: [],
    transactions: [doc('tx-1', {
      date: '2026-10-07',
      name: 'Amazon',
      amount: -21.21,
      pending: false
    })],
    patterns: [doc('pattern-dog-bowl', {
      name: 'Affirm Dog Water Bowl and Vacuum',
      amount: 21.21,
      type: 'expense',
      status: 'active',
      frequency: 'monthly',
      nextOccurrence: '2026-10-07',
      merchantNames: ['Amazon'],
      installmentPlan: true,
      remainingPayments: 2,
      remainingBalance: 42.39,
      endDate: '2026-11-07',
      finalPaymentAmount: 21.18
    })]
  });

  let matchedBills = [];
  const matcher = async (_db, _userId, _transactions, bills) => {
    matchedBills = bills;
    return { success: true, cleared: 1, advanced: 1, generated: 1 };
  };

  const result = await runCanonicalBillEngine({
    db,
    userId: 'user-1',
    matcher
  });

  assert.equal(result.seeded, 1);
  assert.equal(matchedBills.length, 1);
  assert.equal(matchedBills[0].recurringPatternId, 'pattern-dog-bowl');
  assert.equal(matchedBills[0].dueDate, '2026-10-07');
  assert.equal(matchedBills[0].amount, 21.21);
  assert.deepEqual(matchedBills[0].merchantNames, ['Amazon']);
});

test('occurrence seeding is idempotent when current bill already exists', async () => {
  const existing = {
    id: 'bill-pattern-1',
    name: 'Pierce Prime Platinum Movies',
    amount: 37.45,
    dueDate: '2026-10-06',
    isPaid: false,
    recurringPatternId: 'pattern-1'
  };

  const db = createDb();

  const result = await ensureCurrentBillOccurrences({
    db,
    userId: 'user-1',
    patterns: [{
      id: 'pattern-1',
      name: 'Pierce Prime Platinum Movies',
      amount: 37.45,
      type: 'expense',
      status: 'active',
      frequency: 'monthly',
      nextOccurrence: '2026-10-06'
    }],
    unpaidBills: [existing]
  });

  assert.equal(result.seeded, 0);
  assert.equal(result.linked, 0);
  assert.equal(result.bills.length, 1);
  assert.equal(db.financialEvents.writes.length, 0);
});

test('variable amount pattern with no current amount is not seeded', async () => {
  const db = createDb();

  const result = await ensureCurrentBillOccurrences({
    db,
    userId: 'user-1',
    patterns: [{
      id: 'walmart-card',
      name: 'Walmart Card',
      type: 'expense',
      status: 'active',
      frequency: 'monthly',
      nextOccurrence: '2026-10-10',
      variableAmount: true
    }],
    unpaidBills: []
  });

  assert.equal(result.seeded, 0);
  assert.equal(result.skippedNoAmount, 1);
  assert.equal(db.financialEvents.writes.length, 0);
});
