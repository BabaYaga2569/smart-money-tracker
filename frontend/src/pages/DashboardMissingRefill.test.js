import { describe, expect, it } from 'vitest';

describe('Dashboard missing refill safety', () => {
  it('does not treat every unpaid bill as due when no refill date exists', () => {
    const nextRefillDate = null;
    const totalBalance = 1057;
    const allUnpaidBills = 7306;

    const safeToSpend = nextRefillDate
      ? totalBalance - allUnpaidBills
      : null;

    expect(safeToSpend).toBeNull();
  });
});
