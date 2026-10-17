import test from 'node:test';
import assert from 'node:assert/strict';
import {
  matchTransactionsToBills,
  matchPendingTransactionsToBills,
  matchChangedAmountTransactionsToBills
} from '../utils/BillMatchingService.js';

const bill = (overrides = {}) => ({
  id: 'bill-1',
  name: 'Optimum Internet',
  amount: 80,
  dueDate: '2026-10-15',
  isPaid: false,
  status: 'pending',
  merchantNames: ['Optimum'],
  ...overrides
});

const plaidTx = (overrides = {}) => ({
  id: 'tx-1',
  transaction_id: 'tx-1',
  source: 'plaid',
  name: 'OPTIMUM',
  merchant_name: 'Optimum',
  amount: -80,
  date: '2026-10-15',
  pending: false,
  ...overrides
});

test('posted incoming Plaid credit cannot auto-clear a bill', () => {
  const matches = matchTransactionsToBills(
    [plaidTx({ amount: 80 })],
    [bill()]
  );
  assert.equal(matches.length, 0);
});

test('pending incoming Plaid credit cannot protect a bill from reserve', () => {
  const matches = matchPendingTransactionsToBills(
    [plaidTx({ amount: 80, pending: true })],
    [bill()]
  );
  assert.equal(matches.length, 0);
});

test('incoming Plaid credit cannot create changed-amount review candidate', () => {
  const matches = matchChangedAmountTransactionsToBills(
    [plaidTx({ amount: 70 })],
    [bill()]
  );
  assert.equal(matches.length, 0);
});

test('outgoing Plaid debit still matches normally', () => {
  const matches = matchTransactionsToBills(
    [plaidTx()],
    [bill()]
  );
  assert.equal(matches.length, 1);
});

test('non-Plaid legacy/manual sign behavior is unchanged', () => {
  const matches = matchTransactionsToBills(
    [plaidTx({ source: 'manual', amount: 80 })],
    [bill()]
  );
  assert.equal(matches.length, 1);
});
