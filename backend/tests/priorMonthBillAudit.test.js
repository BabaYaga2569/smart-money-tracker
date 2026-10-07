import test from 'node:test';
import assert from 'node:assert/strict';
import { auditPriorMonthUnpaidBills } from '../utils/priorMonthBillAudit.js';

test('finds a posted matching transaction for an old unpaid bill', () => {
  const report = auditPriorMonthUnpaidBills({
    referenceDate: '2026-10-07',
    bills: [{
      id: 'bill-1',
      type: 'bill',
      name: 'Disney Plus',
      amount: 18.99,
      dueDate: '2026-07-19',
      isPaid: false,
      recurringPatternId: 'pattern-disney',
      merchantNames: ['Disney Plus']
    }],
    transactions: [{
      id: 'tx-1',
      name: 'Disney Plus',
      amount: -18.99,
      date: '2026-07-19',
      pending: false
    }],
    recurringPatterns: [{
      id: 'pattern-disney',
      name: 'Disney Plus / Apple Pay',
      status: 'active',
      nextOccurrence: '2026-10-19'
    }]
  });

  assert.equal(report.summary.total, 1);
  assert.equal(report.summary.postedMatches, 1);
  assert.equal(report.items[0].classification, 'POSTED_MATCH_FOUND');
  assert.equal(report.items[0].recommendation, 'MATCH_REVIEW');
  assert.equal(report.items[0].bestMatch.transactionId, 'tx-1');
});

test('classifies no-match old bill as likely stale when recurring pattern advanced', () => {
  const report = auditPriorMonthUnpaidBills({
    referenceDate: '2026-10-07',
    bills: [{
      id: 'bill-1',
      type: 'bill',
      name: 'Care Credit',
      amount: 50,
      dueDate: '2026-07-16',
      isPaid: false,
      recurringPatternId: 'pattern-care'
    }],
    transactions: [],
    recurringPatterns: [{
      id: 'pattern-care',
      name: 'Care Credit',
      status: 'active',
      nextOccurrence: '2026-10-15'
    }]
  });

  assert.equal(report.items[0].classification, 'LIKELY_STALE_ORPHAN');
  assert.equal(report.items[0].recommendation, 'ARCHIVE_REVIEW');
  assert.equal(report.items[0].patternAdvanced, true);
});

test('keeps old bill open when pattern has not advanced and no payment evidence exists', () => {
  const report = auditPriorMonthUnpaidBills({
    referenceDate: '2026-10-07',
    bills: [{
      id: 'bill-1',
      type: 'bill',
      name: 'Old Manual Bill',
      amount: 75,
      dueDate: '2026-09-25',
      isPaid: false,
      recurringPatternId: 'pattern-old'
    }],
    transactions: [],
    recurringPatterns: [{
      id: 'pattern-old',
      name: 'Old Manual Bill',
      status: 'active',
      nextOccurrence: '2026-09-25'
    }]
  });

  assert.equal(report.items[0].classification, 'REVIEW_UNPAID');
  assert.equal(report.items[0].recommendation, 'KEEP_OPEN');
});

test('flags payment evidence on a bill that is still marked unpaid', () => {
  const report = auditPriorMonthUnpaidBills({
    referenceDate: '2026-10-07',
    bills: [{
      id: 'bill-1',
      type: 'bill',
      name: 'Optimum Cell Phone',
      amount: 15.64,
      dueDate: '2026-07-25',
      isPaid: false,
      recurringPatternId: 'pattern-optimum',
      linkedTransactionId: 'tx-old'
    }],
    transactions: [],
    recurringPatterns: [{
      id: 'pattern-optimum',
      name: 'Optimum Cell Phone',
      status: 'active',
      nextOccurrence: '2026-10-25'
    }]
  });

  assert.equal(report.items[0].classification, 'PAYMENT_EVIDENCE_ON_BILL');
  assert.equal(report.items[0].recommendation, 'REVIEW_PAYMENT_STATE');
});

test('flags unlinked old bill for manual review', () => {
  const report = auditPriorMonthUnpaidBills({
    referenceDate: '2026-10-07',
    bills: [{
      id: 'bill-1',
      type: 'bill',
      name: 'Legacy Internet',
      amount: 40,
      dueDate: '2026-08-15',
      isPaid: false
    }],
    transactions: [],
    recurringPatterns: []
  });

  assert.equal(report.items[0].classification, 'UNLINKED_OLD_BILL');
  assert.equal(report.items[0].recommendation, 'MANUAL_REVIEW');
});
