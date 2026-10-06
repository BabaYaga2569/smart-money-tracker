import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBillDuplicateCleanupPlan,
  fingerprintBills
} from '../utils/billDuplicateCleanup.js';

test('marks exact unpaid same-pattern duplicate pair safe to archive', () => {
  const bills = [
    {
      id: 'bill-a',
      type: 'bill',
      name: 'Affirm Dog Water Bowl and Vacuum',
      amount: 21.21,
      dueDate: '2026-10-07',
      isPaid: false,
      status: 'pending',
      recurringPatternId: 'pattern-dog',
      createdFrom: 'legacy-import',
      paymentHistory: []
    },
    {
      id: 'bill-b',
      type: 'bill',
      name: 'Affirm Dog Water Bowl and Vacuum',
      amount: 21.21,
      dueDate: '2026-10-07',
      isPaid: false,
      status: 'pending',
      recurringPatternId: 'pattern-dog',
      createdFrom: 'legacy-import',
      paymentHistory: []
    }
  ];

  const plan = buildBillDuplicateCleanupPlan(bills);

  assert.equal(plan.summary.duplicateGroups, 1);
  assert.equal(plan.summary.safeGroups, 1);
  assert.equal(plan.summary.reviewGroups, 0);
  assert.equal(plan.summary.duplicatesToArchive, 1);
  assert.equal(plan.canApply, true);
  assert.equal(plan.safeGroups[0].duplicateBillIds.length, 1);
});

test('refuses cleanup if a duplicate carries payment evidence', () => {
  const bills = [
    {
      id: 'bill-a',
      type: 'bill',
      name: 'Geico SXS',
      amount: 31.42,
      dueDate: '2026-10-08',
      isPaid: false,
      recurringPatternId: 'pattern-geico',
      linkedTransactionId: 'tx-123'
    },
    {
      id: 'bill-b',
      type: 'bill',
      name: 'Geico SXS',
      amount: 31.42,
      dueDate: '2026-10-08',
      isPaid: false,
      recurringPatternId: 'pattern-geico'
    }
  ];

  const plan = buildBillDuplicateCleanupPlan(bills);

  assert.equal(plan.summary.safeGroups, 0);
  assert.equal(plan.summary.reviewGroups, 1);
  assert.equal(plan.canApply, false);
});

test('refuses cleanup if matching bills belong to different recurring patterns', () => {
  const bills = [
    {
      id: 'bill-a',
      type: 'bill',
      name: 'Peacock',
      amount: 10.99,
      dueDate: '2026-10-17',
      isPaid: false,
      recurringPatternId: 'pattern-old'
    },
    {
      id: 'bill-b',
      type: 'bill',
      name: 'Peacock',
      amount: 10.99,
      dueDate: '2026-10-17',
      isPaid: false,
      recurringPatternId: 'pattern-new'
    }
  ];

  const plan = buildBillDuplicateCleanupPlan(bills);

  assert.equal(plan.summary.reviewGroups, 1);
  assert.equal(plan.canApply, false);
});

test('prefers deterministic canonical occurrence id as keeper', () => {
  const patternId = 'pattern-care';
  const dueDate = '2026-10-15';
  const canonicalId = `bill_${patternId}_${dueDate}`;

  const plan = buildBillDuplicateCleanupPlan([
    {
      id: 'legacy-random',
      type: 'bill',
      name: 'Care Credit',
      amount: 50,
      dueDate,
      isPaid: false,
      recurringPatternId: patternId
    },
    {
      id: canonicalId,
      type: 'bill',
      name: 'Care Credit',
      amount: 50,
      dueDate,
      isPaid: false,
      recurringPatternId: patternId,
      createdFrom: 'canonical-bill-engine'
    }
  ]);

  assert.equal(plan.safeGroups[0].keeperBillId, canonicalId);
  assert.deepEqual(plan.safeGroups[0].duplicateBillIds, ['legacy-random']);
});

test('fingerprint is order independent and changes when bill data changes', () => {
  const one = [
    { id: 'b', type: 'bill', amount: 2 },
    { id: 'a', type: 'bill', amount: 1 }
  ];
  const reordered = [
    { id: 'a', type: 'bill', amount: 1 },
    { id: 'b', type: 'bill', amount: 2 }
  ];
  const changed = [
    { id: 'a', type: 'bill', amount: 1 },
    { id: 'b', type: 'bill', amount: 3 }
  ];

  assert.equal(fingerprintBills(one), fingerprintBills(reordered));
  assert.notEqual(fingerprintBills(one), fingerprintBills(changed));
});
