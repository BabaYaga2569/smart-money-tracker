import { describe, expect, it } from 'vitest';
import { matchTransactionsToBills, matchPendingTransactionsToBills } from './BillMatchingService.js';

describe('strict automatic bill matching', () => {
  it('rejects same-amount same-date transactions when the merchant/name does not match', () => {
    const bills = [{
      id: 'optimum-oct',
      name: 'Optimum Internet',
      amount: 40,
      dueDate: '2026-10-15',
      merchantNames: []
    }];

    const pending = [{
      id: 'zelle-40',
      transaction_id: 'zelle-40',
      name: 'Zelle to Catherine Buchmiller',
      amount: 40,
      date: '2026-10-08',
      pending: true
    }];

    expect(matchPendingTransactionsToBills(pending, bills)).toEqual([]);
  });

  it('rejects same-name same-date transactions when the amount is wrong', () => {
    const bills = [{
      id: 'walmart-oct',
      name: 'Walmart Card',
      amount: 200,
      dueDate: '2026-10-10',
      merchantNames: ['Walmart']
    }];

    const transactions = [{
      id: 'walmart-28',
      transaction_id: 'walmart-28',
      name: 'Walmart',
      amount: 28.15,
      date: '2026-10-05',
      pending: false
    }];

    expect(matchTransactionsToBills(transactions, bills)).toEqual([]);
  });

  it('accepts a transaction only when name amount and date all match', () => {
    const bills = [{
      id: 'cvs-oct',
      name: 'CVS Membership',
      amount: 5,
      dueDate: '2026-10-12',
      merchantNames: ['CVS']
    }];

    const transactions = [{
      id: 'cvs-5',
      transaction_id: 'cvs-5',
      name: 'CVS',
      amount: 5,
      date: '2026-10-12',
      pending: false
    }];

    expect(matchTransactionsToBills(transactions, bills)).toHaveLength(1);
  });
});
