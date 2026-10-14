import { describe, expect, it } from 'vitest';
import { matchTransactionsToBills } from './BillMatchingService.js';

describe('bill matching with Plaid merchant_name', () => {
  it('matches a legitimate bill when merchant_name is clean but raw name is noisy', () => {
    const matches = matchTransactionsToBills(
      [{
        id: 'tx-affirm',
        transaction_id: 'tx-affirm',
        name: 'AFRM PMT 4839201',
        merchant_name: 'Affirm',
        amount: -21.21,
        date: '2026-10-09',
        pending: false
      }],
      [{
        id: 'bill-affirm',
        name: 'Affirm Dog Water Bowl and Vacuum',
        amount: 21.21,
        dueDate: '2026-10-07',
        isPaid: false
      }]
    );

    expect(matches).toHaveLength(1);
    expect(matches[0].matches).toEqual({
      name: true,
      amount: true,
      date: true
    });
  });

  it('still rejects a same-amount Zelle transfer for Optimum', () => {
    const matches = matchTransactionsToBills(
      [{
        id: 'tx-zelle',
        transaction_id: 'tx-zelle',
        name: 'Zelle Transfer CONF# 123',
        merchant_name: 'Zelle',
        amount: -40,
        date: '2026-10-08',
        pending: false
      }],
      [{
        id: 'bill-optimum',
        name: 'Optimum Internet',
        amount: 40,
        dueDate: '2026-10-15',
        isPaid: false
      }]
    );

    expect(matches).toHaveLength(0);
  });
});
