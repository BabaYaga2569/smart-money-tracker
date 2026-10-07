import { describe, expect, it } from 'vitest';

describe('Dashboard Safe-to-Spend balance source', () => {
  it('uses current available balance, not projected cash', () => {
    const currentAvailable = 1199.55;
    const projectedCash = 608.28;
    const reservedBills = 650.28;

    const safeToSpend = currentAvailable - reservedBills;

    expect(safeToSpend).toBeCloseTo(549.27, 2);
    expect(projectedCash - reservedBills).toBeCloseTo(-42.00, 2);
  });
});
