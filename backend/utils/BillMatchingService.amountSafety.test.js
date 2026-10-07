import { describe, expect, it } from 'vitest';
import { matchTransactionsToBills } from './BillMatchingService.js';

describe('automatic bill matching amount safety', () => {
  it('does not match a same-merchant transaction with the wrong amount', () => {
    const bills = [{
      id: 'walmart-oct',
      name: 'Walmart Card',
      amount: 200,
      dueDate: '2026-10-10',
      merchantNames: ['Walmart']
    }];

    const transactions = [{
      id: 'walmart-grocery',
      transaction_id: 'walmart-grocery',
      name: 'Walmart',
      amount: 28.15,
      date: '2026-10-05',
      pending: false
    }];

    expect(matchTransactionsToBills(transactions, bills)).toEqual([]);
  });

  it('still matches when date and amount agree', () => {
    const bills = [{
      id: 'walmart-oct',
      name: 'Walmart Card',
      amount: 200,
      dueDate: '2026-10-10',
      merchantNames: ['Walmart']
    }];

    const transactions = [{
      id: 'walmart-payment',
      transaction_id: 'walmart-payment',
      name: 'Walmart',
      amount: 200,
      date: '2026-10-09',
      pending: false
    }];

    const matches = matchTransactionsToBills(transactions, bills);
    expect(matches).toHaveLength(1);
    expect(matches[0].matches.amount).toBe(true);
  });
});
