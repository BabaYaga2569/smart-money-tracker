import { describe, expect, it } from 'vitest';
import { summarizeCanonicalAccounts } from './financialAccounts';

describe('financialAccounts', () => {
  it('uses available balance for visible depository accounts only', () => {
    const result = summarizeCanonicalAccounts([
      { account_id: 'a', type: 'depository', subtype: 'checking', current_balance: 500, available_balance: 450 },
      { account_id: 'b', type: 'depository', subtype: 'savings', balances: { current: 600, available: 590 } },
      { account_id: 'c', type: 'credit', subtype: 'credit card', current_balance: 200 },
      { account_id: 'd', type: 'depository', subtype: 'checking', available_balance: 100 }
    ], {
      accountPreferences: { d: { visible: false } }
    });

    expect(result.depositoryAccounts.map(a => a.account_id)).toEqual(['a', 'b']);
    expect(result.totalAvailable).toBe(1040);
  });
});
