import test from 'node:test';
import assert from 'node:assert/strict';
import { matchPendingTransactionsToBills } from '../utils/BillMatchingService.js';

const bill = (overrides = {}) => ({
  id: 'bill-1',
  name: 'Pierce Prime Platinum Movies',
  amount: 37.45,
  dueDate: '2026-10-06',
  isPaid: false,
  status: 'pending',
  merchantNames: ['Pierce Prime Platinum Movies'],
  ...overrides
});

const tx = (overrides = {}) => ({
  id: 'tx-1',
  transaction_id: 'tx-1',
  name: 'Pierce Prime Platinum Movies',
  amount: -37.45,
  date: '2026-10-06',
  pending: true,
  ...overrides
});

test('pending transaction can create a Pending Payment candidate', () => {
  const matches = matchPendingTransactionsToBills([tx()], [bill()]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].bill.id, 'bill-1');
  assert.equal(matches[0].transaction.id, 'tx-1');
  assert.equal(matches[0].confidence, 1);
});

test('posted transaction is not considered a pending-payment candidate', () => {
  const matches = matchPendingTransactionsToBills(
    [tx({ pending: false })],
    [bill()]
  );
  assert.equal(matches.length, 0);
});

test('weak or wrong-amount pending transaction is rejected', () => {
  const matches = matchPendingTransactionsToBills(
    [tx({ name: 'Unrelated Store', amount: -12.34 })],
    [bill()]
  );
  assert.equal(matches.length, 0);
});

test('one pending transaction can only protect one bill occurrence', () => {
  const matches = matchPendingTransactionsToBills(
    [tx()],
    [
      bill(),
      bill({ id: 'bill-2' })
    ]
  );
  assert.equal(matches.length, 1);
});
