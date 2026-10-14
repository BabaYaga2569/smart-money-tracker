import { describe, expect, it } from 'vitest';
import { matchChangedAmountTransactionsToBills } from './BillMatchingService.js';

describe('changed-amount bill review matching', () => {
  it('flags same-merchant same-window GEICO amount drift for review', () => {
    const matches = matchChangedAmountTransactionsToBills(
      [{
        id: 'tx-geico',
        name: 'GEICO *AUTO',
        merchant_name: 'GEICO',
        amount: -468.98,
        date: '2026-10-10',
        pending: true
      }],
      [{
        id: 'bill-geico',
        name: 'Geico For all cars kids included',
        amount: 496.94,
        dueDate: '2026-10-10',
        isPaid: false
      }]
    );

    expect(matches).toHaveLength(1);
    expect(matches[0].amountDelta).toBeCloseTo(27.96, 2);
  });

  it('never creates changed-amount review candidates for Walmart', () => {
    const matches = matchChangedAmountTransactionsToBills(
      [{ id: 'tx-walmart', name: 'Walmart', merchant_name: 'Walmart', amount: -94.03, date: '2026-10-08' }],
      [{ id: 'bill-walmart', name: 'Walmart Card', amount: 200, dueDate: '2026-10-10', isPaid: false }]
    );

    expect(matches).toHaveLength(0);
  });

  it('does not review-match when the amount already matches exactly', () => {
    const matches = matchChangedAmountTransactionsToBills(
      [{ id: 'tx-barclay', name: 'BARCLAYCARD US CREDITCARD', merchant_name: 'Barclaycard', amount: -30, date: '2026-10-14', pending: true }],
      [{ id: 'bill-barclay', name: 'Barclay Card', amount: 30, dueDate: '2026-10-09', isPaid: false }]
    );

    expect(matches).toHaveLength(0);
  });
});
