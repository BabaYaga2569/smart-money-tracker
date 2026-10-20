import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMatchedBillPayment,
  applyLinkedBillPayment,
  applyReviewCandidateBillPayment,
  reverseIncorrectAutoBillMatch
} from '../utils/BillMatchingService.js';
import { runCanonicalBillEngine } from '../utils/billEngine.js';
import { syncPlaidItemTransactions } from '../utils/plaidSyncEngine.js';

// ---------------------------------------------------------------------------
// In-memory Firestore with optimistic transaction semantics.
//
// Every document carries a version. A transaction records the versions it
// read (documents and queried collections) and, at commit, retries when any
// of them changed. Reads yield to the event loop, so two transactions started
// together both read before either commits, which is how real concurrent
// engine runs race.
// ---------------------------------------------------------------------------

const yieldTurn = () => new Promise(resolve => setImmediate(resolve));
const isDelete = value => value?.constructor?.name === 'DeleteTransform';

function createDb(initial = {}) {
  const store = new Map();
  const collectionVersions = new Map();
  let transactionAttempts = 0;

  const parentOf = path => path.split('/').slice(0, -1).join('/');
  const bumpCollection = path => {
    const parent = parentOf(path);
    collectionVersions.set(parent, (collectionVersions.get(parent) || 0) + 1);
  };

  for (const [path, data] of Object.entries(initial)) {
    store.set(path, { data, version: 1 });
  }

  const read = path => store.get(path)?.data;

  function writeDoc(path, data, { merge = false } = {}) {
    const existing = read(path);
    const merged = merge && existing ? { ...existing, ...data } : { ...data };
    for (const [key, value] of Object.entries(merged)) {
      if (isDelete(value)) delete merged[key];
    }
    store.set(path, { data: merged, version: (store.get(path)?.version || 0) + 1 });
    bumpCollection(path);
  }

  function deleteDoc(path) {
    if (store.delete(path)) bumpCollection(path);
  }

  function snapshot(path) {
    const stored = read(path);
    const data = stored === undefined ? undefined : structuredClone(stored);
    return {
      id: path.split('/').at(-1),
      exists: data !== undefined,
      data: () => data,
      ref: docRef(path)
    };
  }

  function matches(data, [field, op, value]) {
    if (op === '==') return data?.[field] === value;
    if (op === '>=') return data?.[field] >= value;
    throw new Error(`Unsupported operator ${op}`);
  }

  function runQuery(path, filters) {
    const docs = [...store.keys()]
      .filter(key => parentOf(key) === path)
      .map(snapshot)
      .filter(snap => filters.every(filter => matches(snap.data(), filter)));
    return { docs, empty: docs.length === 0, size: docs.length };
  }

  function query(path, filters = []) {
    return {
      isQuery: true,
      path,
      filters,
      where: (field, op, value) => query(path, [...filters, [field, op, value]]),
      doc: id => docRef(`${path}/${id}`),
      get: async () => runQuery(path, filters)
    };
  }

  function docRef(path) {
    return {
      path,
      id: path.split('/').at(-1),
      collection: name => query(`${path}/${name}`),
      get: async () => snapshot(path),
      async create(data) {
        if (store.has(path)) {
          const error = new Error('Document already exists');
          error.code = 6;
          throw error;
        }
        writeDoc(path, data);
      }
    };
  }

  function applyWrites(writes) {
    for (const write of writes) {
      if (write.type === 'delete') {
        deleteDoc(write.path);
      } else if (write.type === 'update') {
        if (!store.has(write.path)) throw new Error(`Missing document: ${write.path}`);
        writeDoc(write.path, write.data, { merge: true });
      } else {
        writeDoc(write.path, write.data, { merge: Boolean(write.options?.merge) });
      }
    }
  }

  const db = {
    store,
    read,
    get transactionAttempts() {
      return transactionAttempts;
    },
    collection: name => query(name),
    batch() {
      const writes = [];
      return {
        set: (ref, data, options) => writes.push({ type: 'set', path: ref.path, data, options }),
        update: (ref, data) => writes.push({ type: 'update', path: ref.path, data }),
        delete: ref => writes.push({ type: 'delete', path: ref.path }),
        commit: async () => applyWrites(writes)
      };
    },
    async runTransaction(callback) {
      for (let attempt = 0; attempt < 10; attempt++) {
        transactionAttempts++;
        const docReads = new Map();
        const collectionReads = new Map();
        const writes = [];

        const tx = {
          async get(ref) {
            await yieldTurn();
            if (ref.isQuery) {
              collectionReads.set(ref.path, collectionVersions.get(ref.path) || 0);
              return runQuery(ref.path, ref.filters);
            }
            docReads.set(ref.path, store.get(ref.path)?.version || 0);
            const readResult = snapshot(ref.path);
            // Test hook: commit a concurrent write after this read and
            // before this transaction commits.
            if (db.afterTransactionRead) await db.afterTransactionRead(ref.path);
            return readResult;
          },
          update: (ref, data) => writes.push({ type: 'update', path: ref.path, data }),
          set: (ref, data, options) => writes.push({ type: 'set', path: ref.path, data, options }),
          delete: ref => writes.push({ type: 'delete', path: ref.path })
        };

        const result = await callback(tx);

        // Commit is synchronous, so validation and writes are atomic.
        const conflicted =
          [...docReads].some(([path, version]) => (store.get(path)?.version || 0) !== version) ||
          [...collectionReads].some(([path, version]) => (collectionVersions.get(path) || 0) !== version);

        if (conflicted) continue;

        applyWrites(writes);
        return result;
      }
      throw new Error('Transaction retry limit exceeded');
    }
  };
  return db;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const userId = 'user-1';
const U = `users/${userId}`;

function isoDaysFromToday(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function plaidTx(id, overrides = {}) {
  return {
    [`${U}/transactions/${id}`]: {
      transaction_id: id,
      source: 'plaid',
      name: 'Daycare',
      merchant_name: 'Daycare',
      amount: -200,
      date: '2026-10-10',
      pending: false,
      ...overrides
    }
  };
}

function bill(id, overrides = {}) {
  return {
    [`${U}/financialEvents/${id}`]: {
      type: 'bill',
      name: 'Daycare',
      amount: 200,
      dueDate: '2026-10-09',
      isPaid: false,
      status: 'pending',
      ...overrides
    }
  };
}

function weeklyPattern(id, nextOccurrence, overrides = {}) {
  return {
    [`${U}/recurringPatterns/${id}`]: {
      name: 'Daycare',
      amount: 200,
      frequency: 'weekly',
      nextOccurrence,
      status: 'active',
      type: 'expense',
      ...overrides
    }
  };
}

const txFrom = (db, id) => ({ id, ...db.read(`${U}/transactions/${id}`) });

const paymentsFor = (db, transactionId) =>
  [...db.store.entries()]
    .filter(([path, { data }]) =>
      path.startsWith(`${U}/bill_payments/`) && data.linkedTransactionId === transactionId
    )
    .map(([, { data }]) => data);

const paidBills = db =>
  [...db.store.entries()]
    .filter(([path, { data }]) => path.startsWith(`${U}/financialEvents/`) && data.isPaid === true)
    .map(([path]) => path.split('/').at(-1));

const quietLog = { info() {}, warn() {}, error() {} };

// Silence the matcher's progress logging for readable test output.
const originalConsoleLog = console.log;
test.before(() => { console.log = () => {}; });
test.after(() => { console.log = originalConsoleLog; });

// ---------------------------------------------------------------------------
// P1: automatic matches durably claim the transaction
// ---------------------------------------------------------------------------

test('P1: automatic match writes linkedEventId onto the transaction', async () => {
  const db = createDb({ ...bill('bill-a'), ...plaidTx('tx-1') });

  const result = await applyMatchedBillPayment(db, userId, { id: 'bill-a' }, txFrom(db, 'tx-1'));

  assert.equal(result.cleared, true);
  const tx = db.read(`${U}/transactions/tx-1`);
  assert.equal(tx.linkedEventId, 'bill-a');
  assert.equal(tx.linkedPaymentRecordId, 'auto_bill-a_tx-1');
});

test('P1: a transaction auto-matched to one bill cannot be manually linked to another', async () => {
  const db = createDb({ ...bill('bill-a'), ...bill('bill-b', { name: 'Tutor' }), ...plaidTx('tx-1') });

  const auto = await applyMatchedBillPayment(db, userId, { id: 'bill-a' }, txFrom(db, 'tx-1'));
  const link = await applyLinkedBillPayment(db, userId, 'bill-b', txFrom(db, 'tx-1'));

  assert.equal(auto.cleared, true);
  assert.equal(link.success, false);
  assert.equal(link.reason, 'TRANSACTION_ALREADY_LINKED');
  assert.equal(link.linkedEventId, 'bill-a');
  assert.equal(db.read(`${U}/financialEvents/bill-b`).isPaid, false);
  assert.equal(paymentsFor(db, 'tx-1').length, 1);
});

test('P1: a historical auto-match with only a bill_payments record still blocks manual linking', async () => {
  // Payments recorded before automatic matches wrote linkedEventId.
  const db = createDb({
    ...bill('bill-a', { isPaid: true, status: 'paid', linkedTransactionId: 'tx-1' }),
    ...bill('bill-b', { name: 'Tutor' }),
    ...plaidTx('tx-1'),
    [`${U}/bill_payments/auto_bill-a_tx-1`]: { billId: 'bill-a', linkedTransactionId: 'tx-1', paidDate: '2026-10-10' }
  });
  const before = structuredClone(db.read(`${U}/transactions/tx-1`));

  const link = await applyLinkedBillPayment(db, userId, 'bill-b', txFrom(db, 'tx-1'));

  assert.equal(link.success, false);
  assert.equal(link.reason, 'TRANSACTION_ALREADY_USED');
  assert.equal(link.linkedEventId, 'bill-a');
  assert.equal(db.read(`${U}/financialEvents/bill-b`).isPaid, false);
  // Historical data is not rewritten by a refused claim.
  assert.deepEqual(db.read(`${U}/transactions/tx-1`), before);
});

test('P1: a consumed transaction cannot be accepted for another bill through review approval', async () => {
  const db = createDb({
    ...bill('bill-a'),
    ...bill('bill-b', {
      name: 'Optimum',
      amount: 180,
      paymentReviewCandidate: true,
      paymentReviewTransactionId: 'tx-1',
      paymentReviewActualAmount: 200
    }),
    ...plaidTx('tx-1')
  });

  await applyMatchedBillPayment(db, userId, { id: 'bill-a' }, txFrom(db, 'tx-1'));
  const accept = await applyReviewCandidateBillPayment(db, userId, 'bill-b', txFrom(db, 'tx-1'));

  assert.equal(accept.success, false);
  assert.equal(accept.reason, 'TRANSACTION_ALREADY_LINKED');
  assert.equal(db.read(`${U}/financialEvents/bill-b`).isPaid, false);
  assert.equal(db.read(`${U}/financialEvents/bill-b`).paymentReviewCandidate, true);
});

test('P1: reprocessing the same match on the same bill stays idempotent', async () => {
  const db = createDb({ ...bill('bill-a'), ...plaidTx('tx-1') });

  const first = await applyMatchedBillPayment(db, userId, { id: 'bill-a' }, txFrom(db, 'tx-1'));
  const second = await applyMatchedBillPayment(db, userId, { id: 'bill-a' }, txFrom(db, 'tx-1'));

  assert.equal(first.cleared, true);
  assert.equal(second.success, true);
  assert.equal(second.idempotent, true);
  assert.equal(paymentsFor(db, 'tx-1').length, 1);
});

test('P1: reversing an incorrect auto match releases the claim for the correct bill', async () => {
  const db = createDb({ ...bill('bill-wrong'), ...bill('bill-right', { name: 'Daycare Center' }), ...plaidTx('tx-1') });

  await applyMatchedBillPayment(db, userId, { id: 'bill-wrong' }, txFrom(db, 'tx-1'));
  const reversed = await reverseIncorrectAutoBillMatch(db, userId, 'bill-wrong');
  assert.equal(reversed.unmarked, true);
  assert.equal(db.read(`${U}/transactions/tx-1`).linkedEventId, undefined);

  const link = await applyLinkedBillPayment(db, userId, 'bill-right', txFrom(db, 'tx-1'));
  assert.equal(link.success, true);
  assert.equal(db.read(`${U}/transactions/tx-1`).linkedEventId, 'bill-right');
  assert.deepEqual(paidBills(db), ['bill-right']);
});

// ---------------------------------------------------------------------------
// P2: concurrent claims of one transaction
// ---------------------------------------------------------------------------

test('P2: two concurrent automatic payments of one transaction pay exactly one bill', async () => {
  const db = createDb({
    ...weeklyPattern('p-a', '2026-10-07'),
    ...bill('week-1', { dueDate: '2026-10-07', recurringPatternId: 'p-a', recurrence: 'weekly' }),
    ...weeklyPattern('p-b', '2026-10-14'),
    ...bill('week-2', { dueDate: '2026-10-14', recurringPatternId: 'p-b', recurrence: 'weekly' }),
    ...plaidTx('tx-1', { date: '2026-10-10' })
  });

  const [first, second] = await Promise.all([
    applyMatchedBillPayment(db, userId, { id: 'week-1' }, txFrom(db, 'tx-1')),
    applyMatchedBillPayment(db, userId, { id: 'week-2' }, txFrom(db, 'tx-1'))
  ]);

  const outcomes = [first, second];
  assert.equal(outcomes.filter(outcome => outcome.cleared === true).length, 1);
  const loser = outcomes.find(outcome => outcome.cleared !== true);
  assert.equal(loser.success, false);
  assert.equal(loser.reason, 'TRANSACTION_ALREADY_LINKED');

  assert.equal(paidBills(db).length, 1);
  assert.equal(paymentsFor(db, 'tx-1').length, 1);
  // The losing run retried after the conflict instead of committing.
  assert.ok(db.transactionAttempts > 2);
});

test('P2: a concurrent automatic match and manual link cannot both consume one transaction', async () => {
  const db = createDb({ ...bill('bill-a'), ...bill('bill-b', { name: 'Tutor' }), ...plaidTx('tx-1') });

  const results = await Promise.all([
    applyMatchedBillPayment(db, userId, { id: 'bill-a' }, txFrom(db, 'tx-1')),
    applyLinkedBillPayment(db, userId, 'bill-b', txFrom(db, 'tx-1'))
  ]);

  assert.equal(results.filter(result => result.success && !result.idempotent).length, 1);
  assert.equal(paidBills(db).length, 1);
  assert.equal(paymentsFor(db, 'tx-1').length, 1);
});

test('P2: two concurrent bill-engine runs consume a transaction once', async () => {
  const dueDate = isoDaysFromToday(-2);
  const db = createDb({
    ...weeklyPattern('p-a', dueDate),
    ...bill('week-1', { dueDate, recurringPatternId: 'p-a', recurrence: 'weekly' }),
    ...plaidTx('tx-1', { date: isoDaysFromToday(-1) })
  });

  const runs = await Promise.all([
    runCanonicalBillEngine({ db, userId, log: quietLog }),
    runCanonicalBillEngine({ db, userId, log: quietLog })
  ]);

  assert.ok(runs.every(run => run.success));
  assert.equal(runs.reduce((sum, run) => sum + run.cleared, 0), 1);
  assert.deepEqual(paidBills(db), ['week-1']);
  assert.equal(paymentsFor(db, 'tx-1').length, 1);
});

test('P2: a later engine run does not reuse the transaction for the next weekly occurrence', async () => {
  const firstDue = isoDaysFromToday(-3);
  const db = createDb({
    ...weeklyPattern('p-a', firstDue),
    ...bill('week-1', { dueDate: firstDue, recurringPatternId: 'p-a', recurrence: 'weekly' }),
    // 3 days late for week 1, 4 days early for week 2: inside both ±7 windows.
    ...plaidTx('tx-1', { date: isoDaysFromToday(0) })
  });

  const run1 = await runCanonicalBillEngine({ db, userId, log: quietLog });
  const run2 = await runCanonicalBillEngine({ db, userId, log: quietLog });

  assert.equal(run1.cleared, 1);
  assert.equal(run2.cleared, 0);
  assert.equal(paidBills(db).length, 1);
  assert.equal(paymentsFor(db, 'tx-1').length, 1);
});

// ---------------------------------------------------------------------------
// P3: legacy linkedEventId without a bill_payments record
// ---------------------------------------------------------------------------

test('P3: legacy linked transactions are not offered to automatic matching', async () => {
  const db = createDb({
    ...bill('bill-open', { dueDate: isoDaysFromToday(0) }),
    ...plaidTx('tx-legacy', { date: isoDaysFromToday(0), linkedEventId: 'bill-old', linkedAt: 'legacy' }),
    ...plaidTx('tx-free', { date: isoDaysFromToday(0), name: 'Coffee', merchant_name: 'Coffee', amount: -4 })
  });

  let offered = [];
  await runCanonicalBillEngine({
    db,
    userId,
    log: quietLog,
    matcher: async (_db, _userId, transactions) => {
      offered = transactions.map(transaction => transaction.id);
      return { success: true, cleared: 0, advanced: 0, generated: 0 };
    }
  });

  assert.deepEqual(offered, ['tx-free']);
});

test('P3: a legacy linked transaction cannot pay, protect, or review-match another bill', async () => {
  const today = isoDaysFromToday(0);
  const db = createDb({
    ...bill('bill-open', { dueDate: today }),
    ...bill('bill-review', { name: 'Daycare', amount: 180, dueDate: today }),
    ...plaidTx('tx-legacy', { date: today, linkedEventId: 'bill-old' })
  });
  const legacyBefore = structuredClone(db.read(`${U}/transactions/tx-legacy`));

  const run = await runCanonicalBillEngine({ db, userId, log: quietLog });
  const direct = await applyMatchedBillPayment(db, userId, { id: 'bill-open' }, txFrom(db, 'tx-legacy'));

  assert.equal(run.cleared, 0);
  assert.equal(direct.success, false);
  assert.equal(direct.reason, 'TRANSACTION_ALREADY_LINKED');
  assert.deepEqual(paidBills(db), []);
  assert.equal(db.read(`${U}/financialEvents/bill-review`).paymentReviewCandidate, undefined);
  assert.equal(db.read(`${U}/financialEvents/bill-open`).pendingPayment, undefined);
  // The legacy link itself is left exactly as it was.
  assert.deepEqual(db.read(`${U}/transactions/tx-legacy`), legacyBefore);
});

// ---------------------------------------------------------------------------
// P4: pending transactions and pending-to-posted transitions
// ---------------------------------------------------------------------------

test('P4: manual linking refuses a pending transaction without writing', async () => {
  const db = createDb({ ...bill('bill-a'), ...plaidTx('tx-pending', { pending: true }) });
  const before = new Map([...db.store].map(([path, { data }]) => [path, structuredClone(data)]));

  const link = await applyLinkedBillPayment(db, userId, 'bill-a', txFrom(db, 'tx-pending'));

  assert.equal(link.success, false);
  assert.equal(link.reason, 'TRANSACTION_PENDING');
  assert.deepEqual(new Map([...db.store].map(([path, { data }]) => [path, data])), before);
});

test('P4: review approval refuses a pending transaction and keeps the review open', async () => {
  const db = createDb({
    ...bill('bill-review', {
      name: 'Optimum',
      amount: 80,
      paymentReviewCandidate: true,
      paymentReviewTransactionId: 'tx-pending',
      paymentReviewActualAmount: 95,
      paymentReviewPending: true
    }),
    ...plaidTx('tx-pending', { name: 'Optimum', merchant_name: 'Optimum', amount: -95, pending: true })
  });

  const accept = await applyReviewCandidateBillPayment(db, userId, 'bill-review', txFrom(db, 'tx-pending'));

  assert.equal(accept.success, false);
  assert.equal(accept.reason, 'TRANSACTION_PENDING');
  const reviewBill = db.read(`${U}/financialEvents/bill-review`);
  assert.equal(reviewBill.isPaid, false);
  assert.equal(reviewBill.paymentReviewCandidate, true);
  assert.equal(reviewBill.paymentReviewTransactionId, 'tx-pending');
});

test('P4: the payment lifecycle re-checks pending state on the live transaction', async () => {
  // The caller saw a posted snapshot, but the stored transaction is pending.
  const db = createDb({ ...bill('bill-a'), ...plaidTx('tx-1', { pending: true }) });

  const result = await applyMatchedBillPayment(db, userId, { id: 'bill-a' }, { ...txFrom(db, 'tx-1'), pending: false });

  assert.equal(result.success, false);
  assert.equal(result.reason, 'TRANSACTION_PENDING');
  assert.deepEqual(paidBills(db), []);
});

test('P4: a posted transaction cannot pay another bill when its pending predecessor was already used', async () => {
  // Historical payment that consumed the pending ID before pending was refused.
  const db = createDb({
    ...bill('bill-a', { isPaid: true, status: 'paid', linkedTransactionId: 'tx-pending' }),
    ...bill('bill-b', { name: 'Daycare' }),
    [`${U}/bill_payments/review_bill-a_tx-pending`]: { billId: 'bill-a', linkedTransactionId: 'tx-pending', paidDate: isoDaysFromToday(-1) },
    ...plaidTx('tx-posted', { pending_transaction_id: 'tx-pending', date: isoDaysFromToday(0) })
  });

  const direct = await applyMatchedBillPayment(db, userId, { id: 'bill-b' }, txFrom(db, 'tx-posted'));
  assert.equal(direct.success, false);
  assert.equal(direct.reason, 'TRANSACTION_ALREADY_USED');
  assert.equal(direct.viaPendingTransactionId, 'tx-pending');

  let offered = [];
  await runCanonicalBillEngine({
    db,
    userId,
    log: quietLog,
    matcher: async (_db, _userId, transactions) => {
      offered = transactions.map(transaction => transaction.id);
      return { success: true, cleared: 0, advanced: 0, generated: 0 };
    }
  });
  assert.deepEqual(offered, []);
  assert.equal(db.read(`${U}/financialEvents/bill-b`).isPaid, false);
});

test('P4: a posted transaction with an unused pending predecessor still pays normally', async () => {
  const db = createDb({
    ...bill('bill-a'),
    ...plaidTx('tx-posted', { pending_transaction_id: 'tx-pending-unused' })
  });

  const result = await applyMatchedBillPayment(db, userId, { id: 'bill-a' }, txFrom(db, 'tx-posted'));

  assert.equal(result.cleared, true);
  assert.equal(db.read(`${U}/transactions/tx-posted`).linkedEventId, 'bill-a');
});

test('P4: Plaid sync carries a pending claim onto the posted replacement', async () => {
  const db = createDb({
    ...plaidTx('tx-pending', {
      account_id: 'acct-1',
      pending: true,
      linkedEventId: 'bill-a',
      linkedPaymentRecordId: 'link_bill-a_tx-pending',
      linkedAt: 'earlier'
    }),
    [`${U}/plaid_items/item-1`]: { itemId: 'item-1', accessToken: 'token', cursor: 'c0' }
  });

  const plaidClient = {
    async transactionsSync() {
      return {
        data: {
          added: [{
            transaction_id: 'tx-posted',
            pending_transaction_id: 'tx-pending',
            account_id: 'acct-1',
            amount: 200,
            date: '2026-10-10',
            name: 'Daycare',
            merchant_name: 'Daycare',
            pending: false
          }],
          modified: [],
          removed: [],
          accounts: [],
          next_cursor: 'c1',
          has_more: false
        }
      };
    }
  };
  const admin = { firestore: { FieldValue: { serverTimestamp: () => 'now' } } };
  db.getAll = async (...refs) => Promise.all(refs.map(ref => ref.get()));

  const result = await syncPlaidItemTransactions({
    db,
    admin,
    plaidClient,
    userId,
    item: { itemId: 'item-1', documentId: 'item-1', accessToken: 'token', cursor: 'c0' }
  });

  assert.equal(result.pendingReplaced, 1);
  assert.equal(db.read(`${U}/transactions/tx-pending`), undefined);
  const posted = db.read(`${U}/transactions/tx-posted`);
  assert.equal(posted.linkedEventId, 'bill-a');
  assert.equal(posted.linkedPaymentRecordId, 'link_bill-a_tx-pending');
  assert.equal(posted.linkedFromPendingTransactionId, 'tx-pending');
});

// ---------------------------------------------------------------------------
// PR #475 behavior preserved under the new claim checks
// ---------------------------------------------------------------------------

test('review approval on a posted transaction records the bank amount and keeps the template amount', async () => {
  const db = createDb({
    ...weeklyPattern('p-review', '2026-10-10', { name: 'GEICO', amount: 31.42, frequency: 'monthly' }),
    ...bill('bill-review', {
      name: 'GEICO',
      amount: 31.42,
      dueDate: '2026-10-10',
      recurringPatternId: 'p-review',
      recurrence: 'monthly',
      paymentReviewCandidate: true,
      paymentReviewTransactionId: 'tx-review',
      paymentReviewActualAmount: 28.23
    }),
    ...plaidTx('tx-review', { name: 'GEICO', merchant_name: 'GEICO', amount: -28.23, date: '2026-10-10' })
  });

  const accept = await applyReviewCandidateBillPayment(db, userId, 'bill-review', txFrom(db, 'tx-review'));

  assert.equal(accept.cleared, true);
  assert.equal(db.read(`${U}/financialEvents/bill-review`).paidAmount, 28.23);
  assert.equal(db.read(`${U}/financialEvents/bill-review`).paymentReviewCandidate, undefined);
  assert.equal(db.read(`${U}/recurringPatterns/p-review`).amount, 31.42);
  assert.equal(db.read(`${U}/financialEvents/bill_p-review_2026-11-10`).amount, 31.42);
  assert.equal(db.read(`${U}/transactions/tx-review`).linkedEventId, 'bill-review');
});

// ---------------------------------------------------------------------------
// Review follow-up: Plaid sync must never clobber payment claims, and
// payments must never be recorded from stale transaction snapshots.
// ---------------------------------------------------------------------------

const syncAdmin = { firestore: { FieldValue: { serverTimestamp: () => 'now' } } };

function plaidChange(overrides = {}) {
  return {
    transaction_id: 'tx-1',
    account_id: 'acct-1',
    amount: 200, // Plaid sign: positive is money out
    date: '2026-10-10',
    name: 'Daycare',
    merchant_name: 'Daycare',
    pending: false,
    ...overrides
  };
}

function fakePlaidClient({ added = [], modified = [] }) {
  return {
    async transactionsSync() {
      return {
        data: { added, modified, removed: [], accounts: [], next_cursor: 'c1', has_more: false }
      };
    }
  };
}

function runSync(db, plaidClient) {
  return syncPlaidItemTransactions({
    db,
    admin: syncAdmin,
    plaidClient,
    userId,
    item: { itemId: 'item-1', documentId: 'item-1', accessToken: 'token', cursor: 'c0' }
  });
}

// Plaid sync reads its snapshot of existing transactions with getAll. Run
// `between` after that snapshot is taken and before sync writes.
function withSnapshotHook(db, between) {
  let fired = false;
  db.getAll = async (...refs) => {
    const snapshots = await Promise.all(refs.map(ref => ref.get()));
    if (!fired) {
      fired = true;
      await between();
    }
    return snapshots;
  };
}

const claimedTx = overrides => plaidTx('tx-1', {
  account_id: 'acct-1',
  linkedEventId: 'bill-a',
  linkedPaymentRecordId: 'auto_bill-a_tx-1',
  linkedAt: 'claimed-at',
  ...overrides
});

const itemDoc = { [`${U}/plaid_items/item-1`]: { itemId: 'item-1', accessToken: 'token', cursor: 'c0' } };

test('Sync: a Plaid modification of a claimed posted transaction preserves the claim', async () => {
  const db = createDb({ ...claimedTx(), ...itemDoc });
  db.getAll = async (...refs) => Promise.all(refs.map(ref => ref.get()));

  const result = await runSync(db, fakePlaidClient({
    modified: [plaidChange({ name: 'DAYCARE CENTER LLC', merchant_name: 'Daycare Center' })]
  }));

  assert.equal(result.updated, 1);
  const tx = db.read(`${U}/transactions/tx-1`);
  assert.equal(tx.merchant_name, 'Daycare Center');
  assert.equal(tx.linkedEventId, 'bill-a');
  assert.equal(tx.linkedPaymentRecordId, 'auto_bill-a_tx-1');
  assert.equal(tx.linkedAt, 'claimed-at');
});

test('Sync: a claim committed after the sync snapshot survives an ordinary update', async () => {
  const db = createDb({ ...bill('bill-a'), ...plaidTx('tx-1', { account_id: 'acct-1' }), ...itemDoc });

  // The engine claims tx-1 for bill-a after sync has read its stale snapshot.
  withSnapshotHook(db, async () => {
    const paid = await applyMatchedBillPayment(db, userId, { id: 'bill-a' }, txFrom(db, 'tx-1'));
    assert.equal(paid.cleared, true);
  });

  await runSync(db, fakePlaidClient({ modified: [plaidChange({ name: 'DAYCARE LLC' })] }));

  const tx = db.read(`${U}/transactions/tx-1`);
  assert.equal(tx.name, 'DAYCARE LLC');
  assert.equal(tx.linkedEventId, 'bill-a');
  assert.equal(tx.linkedPaymentRecordId, 'auto_bill-a_tx-1');
});

test('Sync: pending carry-forward never overwrites a claim committed after the sync snapshot', async () => {
  // Some banks omit pending_transaction_id, so the pending charge is matched to
  // the posted one by date/amount/account/name. The posted row already exists
  // unclaimed in the sync snapshot; a payment claims it before sync writes.
  const db = createDb({
    ...bill('bill-b'),
    ...plaidTx('tx-pending', { account_id: 'acct-1', pending: true, linkedEventId: 'bill-old' }),
    ...plaidTx('tx-1', { account_id: 'acct-1' }),
    ...itemDoc
  });

  withSnapshotHook(db, async () => {
    const paid = await applyMatchedBillPayment(db, userId, { id: 'bill-b' }, txFrom(db, 'tx-1'));
    assert.equal(paid.cleared, true);
  });

  const result = await runSync(db, fakePlaidClient({ modified: [plaidChange()] }));

  const tx = db.read(`${U}/transactions/tx-1`);
  assert.equal(tx.linkedEventId, 'bill-b', 'committed payment claim must survive');
  assert.equal(tx.linkedPaymentRecordId, 'auto_bill-b_tx-1');
  assert.deepEqual(tx.pendingClaimConflict, { linkedEventId: 'bill-old', pendingTransactionId: 'tx-pending' });
  assert.equal(result.claimConflicts, 1);
  assert.equal(db.read(`${U}/transactions/tx-pending`), undefined);
});

test('Sync: pending carry-forward still claims an unclaimed posted replacement', async () => {
  const db = createDb({
    ...plaidTx('tx-pending', { account_id: 'acct-1', pending: true, linkedEventId: 'bill-old' }),
    ...plaidTx('tx-1', { account_id: 'acct-1' }),
    ...itemDoc
  });
  db.getAll = async (...refs) => Promise.all(refs.map(ref => ref.get()));

  const result = await runSync(db, fakePlaidClient({ modified: [plaidChange()] }));

  const tx = db.read(`${U}/transactions/tx-1`);
  assert.equal(tx.linkedEventId, 'bill-old');
  assert.equal(tx.linkedFromPendingTransactionId, 'tx-pending');
  assert.equal(tx.pendingClaimConflict, undefined);
  assert.equal(result.claimConflicts, 0);
});

test('Sync: carry-forward skips a stale pending claim released by a concurrent reversal', async () => {
  // bill-a was paid using tx-pending (legacy pre-P4 data). The user is
  // reversing that incorrect auto-match at the same time Plaid reports
  // tx-pending has posted as tx-posted.
  //
  // Race: the sync snapshot captures tx-pending with linkedEventId:'bill-a',
  // but reverseIncorrectAutoBillMatch fires between the carry-forward
  // transaction's read of tx-posted and its new live read of tx-pending.
  // Without the fix, the stale claim would be copied to tx-posted.
  const db = createDb({
    ...bill('bill-a', {
      isPaid: true,
      status: 'paid',
      linkedTransactionId: 'tx-pending',
      paymentRecordId: 'auto_bill-a_tx-pending',
      markedVia: 'auto-plaid-match'
    }),
    ...plaidTx('tx-pending', {
      account_id: 'acct-1',
      pending: true,
      linkedEventId: 'bill-a',
      linkedPaymentRecordId: 'auto_bill-a_tx-pending',
      linkedAt: 'earlier'
    }),
    [`${U}/bill_payments/auto_bill-a_tx-pending`]: {
      billId: 'bill-a', linkedTransactionId: 'tx-pending', paidDate: '2026-10-09'
    },
    ...itemDoc
  });
  db.getAll = async (...refs) => Promise.all(refs.map(ref => ref.get()));

  // Fire the reversal after the carry-forward transaction has read tx-posted
  // (finding no live claim) but before it reads the predecessor. This is the
  // exact window where the stale snapshot claim would have been carried.
  let reversed = false;
  db.afterTransactionRead = async path => {
    if (reversed || !path.endsWith('/tx-posted')) return;
    reversed = true;
    const result = await reverseIncorrectAutoBillMatch(db, userId, 'bill-a');
    assert.equal(result.unmarked, true, 'reversal must succeed in the race window');
  };

  const syncResult = await runSync(db, fakePlaidClient({
    added: [{
      transaction_id: 'tx-posted',
      pending_transaction_id: 'tx-pending',
      account_id: 'acct-1',
      amount: 200,
      date: '2026-10-10',
      name: 'Daycare',
      merchant_name: 'Daycare',
      pending: false
    }]
  }));

  assert.equal(syncResult.pendingReplaced, 1, 'pending predecessor must be replaced');
  assert.equal(db.read(`${U}/transactions/tx-pending`), undefined, 'pending tx must be deleted');
  const posted = db.read(`${U}/transactions/tx-posted`);
  assert.ok(posted, 'posted transaction must be written');
  assert.equal(
    posted.linkedEventId, undefined,
    'stale pending claim must not be carried to posted tx after reversal'
  );
  assert.equal(posted.linkedFromPendingTransactionId, undefined);
  // The reversal's intent is preserved: bill-a is unpaid.
  assert.equal(db.read(`${U}/financialEvents/bill-a`).isPaid, false);
});

test('Stale snapshot: an automatic payment is refused when Plaid changed the amount', async () => {
  const db = createDb({ ...bill('bill-a'), ...plaidTx('tx-1', { amount: -180 }) });

  // The engine matched against an older snapshot showing -200.
  const result = await applyMatchedBillPayment(db, userId, { id: 'bill-a' }, { ...txFrom(db, 'tx-1'), amount: -200 });

  assert.equal(result.success, false);
  assert.equal(result.reason, 'TRANSACTION_CHANGED');
  assert.equal(result.liveAmount, -180);
  assert.deepEqual(paidBills(db), []);
  assert.equal(db.read(`${U}/transactions/tx-1`).linkedEventId, undefined);
});

test('Stale snapshot: an automatic payment is refused when Plaid changed the date', async () => {
  const db = createDb({ ...bill('bill-a'), ...plaidTx('tx-1', { date: '2026-10-20' }) });

  const result = await applyMatchedBillPayment(db, userId, { id: 'bill-a' }, { ...txFrom(db, 'tx-1'), date: '2026-10-10' });

  assert.equal(result.success, false);
  assert.equal(result.reason, 'TRANSACTION_CHANGED');
  assert.deepEqual(paidBills(db), []);
});

test('Stale snapshot: a sync committed during the payment transaction forces a fresh read and refusal', async () => {
  const db = createDb({ ...bill('bill-a'), ...plaidTx('tx-1') });
  let synced = false;
  db.afterTransactionRead = async path => {
    if (synced || path !== `${U}/transactions/tx-1`) return;
    synced = true;
    // Plaid sync lands between the payment's read and its commit.
    const batch = db.batch();
    batch.set(db.collection('users').doc(userId).collection('transactions').doc('tx-1'), { amount: -175 }, { merge: true });
    await batch.commit();
  };

  const result = await applyMatchedBillPayment(db, userId, { id: 'bill-a' }, txFrom(db, 'tx-1'));

  assert.equal(result.success, false);
  assert.equal(result.reason, 'TRANSACTION_CHANGED');
  assert.equal(result.liveAmount, -175);
  assert.deepEqual(paidBills(db), []);
  assert.equal(paymentsFor(db, 'tx-1').length, 0);
});

test('Payment records use the stored transaction amount and date', async () => {
  const db = createDb({ ...bill('bill-a', { amount: 200 }), ...plaidTx('tx-1', { amount: -200.0, date: '2026-10-11' }) });

  const result = await applyLinkedBillPayment(db, userId, 'bill-a', txFrom(db, 'tx-1'));

  assert.equal(result.cleared, true);
  const paid = db.read(`${U}/financialEvents/bill-a`);
  assert.equal(paid.paidAmount, 200);
  assert.equal(paid.paidDate, '2026-10-11');
  const [payment] = paymentsFor(db, 'tx-1');
  assert.equal(payment.amount, 200);
  assert.equal(payment.paidDate, '2026-10-11');
});

test('Review approval is refused when the bank debit changed after it was reviewed', async () => {
  const db = createDb({
    ...bill('bill-review', {
      name: 'Optimum',
      amount: 80,
      paymentReviewCandidate: true,
      paymentReviewTransactionId: 'tx-review',
      paymentReviewActualAmount: 95,
      paymentReviewDate: '2026-10-10'
    }),
    // Plaid later adjusted the debit to $97.50.
    ...plaidTx('tx-review', { name: 'Optimum', merchant_name: 'Optimum', amount: -97.5, date: '2026-10-10' })
  });

  const accept = await applyReviewCandidateBillPayment(db, userId, 'bill-review', txFrom(db, 'tx-review'));

  assert.equal(accept.success, false);
  assert.equal(accept.reason, 'REVIEW_AMOUNT_CHANGED');
  assert.equal(accept.reviewedAmount, 95);
  const reviewBill = db.read(`${U}/financialEvents/bill-review`);
  assert.equal(reviewBill.isPaid, false);
  assert.equal(reviewBill.paymentReviewCandidate, true);
  assert.equal(db.read(`${U}/transactions/tx-review`).linkedEventId, undefined);
});

test('Sync: changed merchant and amount still replace explicitly linked pending charge', async () => {
  const db=createDb({
    ...plaidTx('pending-original',{account_id:'acct-1',pending:true,amount:-19.75,date:'2026-10-18',name:'TEMP AUTH',merchant_name:'TEMP AUTH'}),
    ...itemDoc
  });
  db.getAll=async (...refs)=>Promise.all(refs.map(ref=>ref.get()));
  const incoming=plaidChange({
    transaction_id:'posted-final',pending_transaction_id:'pending-original',
    account_id:'acct-1',amount:22.10,date:'2026-10-20',
    name:'STORE FINAL',merchant_name:'STORE FINAL',pending:false
  });
  const result=await runSync(db,fakePlaidClient({added:[incoming]}));
  assert.equal(result.pendingReplaced,1);
  assert.equal(db.read(`${U}/transactions/pending-original`),undefined);
  const posted=db.read(`${U}/transactions/posted-final`);
  assert.equal(posted.pending,false);
  assert.equal(posted.amount,-22.10);
  assert.equal(posted.pending_transaction_id,'pending-original');
});

test('Sync: repeated identical Plaid addition is idempotent and does not recreate predecessor', async () => {
  const db=createDb({...plaidTx('pending-old',{account_id:'acct-1',pending:true}),...itemDoc});
  db.getAll=async (...refs)=>Promise.all(refs.map(ref=>ref.get()));
  const incoming=plaidChange({transaction_id:'posted-new',pending_transaction_id:'pending-old'});
  await runSync(db,fakePlaidClient({added:[incoming]}));
  const second=await runSync(db,fakePlaidClient({added:[incoming]}));
  assert.equal(db.read(`${U}/transactions/pending-old`),undefined);
  assert.ok(db.read(`${U}/transactions/posted-new`));
  const matching=[...db.store.keys()].filter(path=>path.startsWith(`${U}/transactions/`)&&path.endsWith('posted-new'));
  assert.equal(matching.length,1);
  assert.equal(second.pendingReplaced,0);
});

test('Recovery: failed transaction batch does not advance cursor and retry succeeds once', async () => {
  const db=createDb({...plaidTx('pending-old',{account_id:'acct-1',pending:true}),...itemDoc});
  db.getAll=async (...refs)=>Promise.all(refs.map(ref=>ref.get()));
  const originalBatch=db.batch.bind(db);
  let failOnce=true;
  db.batch=()=>{
    const batch=originalBatch();
    const commit=batch.commit.bind(batch);
    batch.commit=async()=>{
      if(failOnce){failOnce=false;throw new Error('SIMULATED_WRITE_INTERRUPTION');}
      return commit();
    };
    return batch;
  };
  const incoming=plaidChange({transaction_id:'posted-new',pending_transaction_id:'pending-old'});
  await assert.rejects(runSync(db,fakePlaidClient({added:[incoming]})),/SIMULATED_WRITE_INTERRUPTION/);
  assert.equal(db.read(`${U}/plaid_items/item-1`).cursor,'c0');
  assert.ok(db.read(`${U}/transactions/pending-old`));
  assert.equal(db.read(`${U}/transactions/posted-new`),undefined);
  const result=await runSync(db,fakePlaidClient({added:[incoming]}));
  assert.equal(result.pendingReplaced,1);
  assert.equal(db.read(`${U}/transactions/pending-old`),undefined);
  assert.equal(db.read(`${U}/transactions/posted-new`).pending,false);
  assert.equal(db.read(`${U}/plaid_items/item-1`).cursor,'c1');
});

test('Recovery: cursor update failure after writes can replay without duplicates', async () => {
  const db=createDb({...plaidTx('pending-old',{account_id:'acct-1',pending:true}),...itemDoc});
  db.getAll=async (...refs)=>Promise.all(refs.map(ref=>ref.get()));
  const originalTransaction=db.runTransaction.bind(db);
  let failOnce=true;
  db.runTransaction=async callback=>{
    if(failOnce){failOnce=false;throw new Error('SIMULATED_CURSOR_INTERRUPTION');}
    return originalTransaction(callback);
  };
  const incoming=plaidChange({transaction_id:'posted-new',pending_transaction_id:'pending-old'});
  await assert.rejects(runSync(db,fakePlaidClient({added:[incoming]})),/SIMULATED_CURSOR_INTERRUPTION/);
  assert.equal(db.read(`${U}/plaid_items/item-1`).cursor,'c0');
  assert.equal(db.read(`${U}/transactions/pending-old`),undefined);
  assert.ok(db.read(`${U}/transactions/posted-new`));
  const result=await runSync(db,fakePlaidClient({added:[incoming]}));
  assert.equal(result.pendingReplaced,0);
  assert.equal(db.read(`${U}/plaid_items/item-1`).cursor,'c1');
  const ids=[...db.store.keys()].filter(key=>key.startsWith(`${U}/transactions/`));
  assert.deepEqual(ids,[`${U}/transactions/posted-new`]);
});

test('Recovery: a later batch failure leaves cursor behind and a replay converges', async () => {
  const db=createDb({...itemDoc});
  db.getAll=async (...refs)=>Promise.all(refs.map(ref=>ref.get()));
  const originalBatch=db.batch.bind(db);
  let commits=0;
  let failSecond=true;
  db.batch=()=>{
    const batch=originalBatch();
    const commit=batch.commit.bind(batch);
    batch.commit=async()=>{
      commits++;
      if(failSecond&&commits===2){failSecond=false;throw new Error('SIMULATED_SECOND_BATCH_FAILURE');}
      return commit();
    };
    return batch;
  };
  const added=Array.from({length:460},(_,i)=>plaidChange({
    transaction_id:'batch-tx-'+i,
    account_id:'acct-1',
    amount:10+i/100,
    pending:false
  }));
  await assert.rejects(runSync(db,fakePlaidClient({added})),/SIMULATED_SECOND_BATCH_FAILURE/);
  assert.equal(db.read(`${U}/plaid_items/item-1`).cursor,'c0');
  const partial=[...db.store.keys()].filter(p=>p.startsWith(`${U}/transactions/`));
  assert.ok(partial.length>0&&partial.length<460);
  await runSync(db,fakePlaidClient({added}));
  const full=[...db.store.keys()].filter(p=>p.startsWith(`${U}/transactions/`));
  assert.equal(full.length,460);
  assert.equal(new Set(full).size,460);
  assert.equal(db.read(`${U}/plaid_items/item-1`).cursor,'c1');
});
