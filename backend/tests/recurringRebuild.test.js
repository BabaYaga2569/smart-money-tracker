import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRecurringRebuildPlan,
  buildRecurringPatternWrite,
  fingerprintRecurringPatterns,
  RECURRING_REBUILD_PROPOSAL
} from '../utils/recurringRebuild.js';

test('recurring rebuild proposal contains the approved 42 active patterns', () => {
  assert.equal(RECURRING_REBUILD_PROPOSAL.length, 42);
});

test('server rebuild plan preserves known identities and archives confirmed stale patterns', () => {
  const current = [
    {
      id: 'charger-id',
      name: 'Charger Payment',
      amount: 571.32,
      frequency: 'monthly',
      nextOccurrence: '2026-08-01',
      type: 'expense'
    },
    {
      id: 'geico-id',
      name: 'Geico Charger Durango Challenger',
      amount: 307.89,
      frequency: 'monthly',
      nextOccurrence: '2026-10-18',
      type: 'expense'
    },
    {
      id: 'afterpay-id',
      name: 'AfterPay',
      amount: 11,
      frequency: 'biweekly',
      nextOccurrence: '2026-10-08',
      type: 'expense'
    }
  ];

  const plan = buildRecurringRebuildPlan(current, '2026-10-06');

  assert.equal(plan.canApply, true);
  assert.equal(plan.summary.current, 3);
  assert.equal(plan.summary.matched, 2);
  assert.equal(plan.summary.retire, 1);
  assert.equal(plan.summary.add, 40);
  assert.equal(plan.summary.resultingActive, 42);
  assert.equal(plan.unmatched.length, 0);

  const geico = plan.matched.find(item => item.id === 'geico-id');
  assert.equal(geico.target.name, 'Geico For all cars kids included');
  assert.equal(geico.target.amount, 496.94);
  assert.equal(geico.target.nextOccurrence, '2026-10-10');

  assert.equal(plan.retirements[0].item.id, 'afterpay-id');
});

test('unapproved existing pattern blocks rebuild apply', () => {
  const current = [
    {
      id: 'mystery-id',
      name: 'Mystery Expense',
      amount: 99,
      frequency: 'monthly',
      nextOccurrence: '2026-10-22',
      type: 'expense'
    }
  ];

  const plan = buildRecurringRebuildPlan(current, '2026-10-06');
  assert.equal(plan.canApply, false);
  assert.equal(plan.unmatched.length, 1);
  assert.equal(plan.unmatched[0].id, 'mystery-id');
});

test('rebuild computes Rams and Republic future occurrences correctly', () => {
  const plan = buildRecurringRebuildPlan([], '2026-10-06');

  const rams = plan.additions.find(item => item.target.name === 'Season Tickets Rams');
  const republic = plan.additions.find(item => item.target.name === 'Republic Services');
  const starlink = plan.additions.find(item => item.target.name === 'Starlink Internet');

  assert.equal(rams.target.nextOccurrence, '2026-11-15');
  assert.equal(republic.target.nextOccurrence, '2026-12-31');
  assert.equal(starlink.target.nextOccurrence, '2026-11-04');
});

test('installment plans preserve exact approved payment metadata', () => {
  const plan = buildRecurringRebuildPlan([], '2026-10-06');

  const walmart = plan.additions.find(item => item.target.name === 'Affirm Tancis Shopping');
  const vevor = plan.additions.find(item => item.target.name === 'Affirm Vevor Meat Slicer');
  const tractor = plan.additions.find(item => item.target.name === 'Affirm Smoker');

  assert.equal(walmart.target.nextOccurrence, '2026-10-14');
  assert.equal(walmart.target.endDate, '2027-01-14');
  assert.equal(walmart.target.finalPaymentAmount, 26.09);
  assert.equal(walmart.target.remainingPayments, 4);

  assert.equal(vevor.target.nextOccurrence, '2026-10-10');
  assert.equal(vevor.target.remainingPayments, 1);

  assert.equal(tractor.target.nextOccurrence, '2026-11-03');
  assert.equal(tractor.target.endDate, '2027-06-03');
  assert.equal(tractor.target.finalPaymentAmount, 31.26);
});

test('fingerprint is stable for ordering but changes when live data changes', () => {
  const one = [
    { id: 'b', name: 'B', amount: 2 },
    { id: 'a', name: 'A', amount: 1 }
  ];
  const reordered = [
    { id: 'a', name: 'A', amount: 1 },
    { id: 'b', name: 'B', amount: 2 }
  ];
  const changed = [
    { id: 'a', name: 'A', amount: 1 },
    { id: 'b', name: 'B', amount: 3 }
  ];

  assert.equal(
    fingerprintRecurringPatterns(one),
    fingerprintRecurringPatterns(reordered)
  );
  assert.notEqual(
    fingerprintRecurringPatterns(one),
    fingerprintRecurringPatterns(changed)
  );
});

test('write payload preserves existing user metadata while applying canonical schedule', () => {
  const current = {
    id: 'starlink-id',
    name: 'Starlink',
    category: 'Utilities',
    linkedAccount: 'sofi-account',
    autoPay: true,
    description: 'Satellite internet'
  };

  const target = {
    name: 'Starlink Internet',
    amount: 55,
    type: 'expense',
    frequency: 'monthly',
    status: 'active',
    institutionName: 'SoFi',
    scheduleRule: { kind: 'dayOfMonth', day: 4 },
    nextOccurrence: '2026-11-04',
    aliases: ['Starlink']
  };

  const write = buildRecurringPatternWrite(current, target, 'NOW');

  assert.equal(write.name, 'Starlink Internet');
  assert.equal(write.amount, 55);
  assert.equal(write.nextOccurrence, '2026-11-04');
  assert.equal(write.category, 'Utilities');
  assert.equal(write.linkedAccount, 'sofi-account');
  assert.equal(write.autoPay, true);
  assert.deepEqual(write.merchantNames, ['Starlink']);
  assert.equal(write.archived, false);
});


test('preserveCurrent cadence rolls stale monthly date forward', () => {
  const current = [
    {
      id: 'plaid-id',
      name: 'Plaid Technologies Inc',
      amount: 6.26,
      frequency: 'monthly',
      nextOccurrence: '2026-08-13',
      type: 'expense'
    }
  ];

  const plan = buildRecurringRebuildPlan(current, '2026-10-06');
  const plaid = plan.matched.find(item => item.id === 'plaid-id');

  assert.equal(plaid.target.nextOccurrence, '2026-10-13');
});
