import { describe, expect, it } from 'vitest';
import { buildSpendabilityReconciliation } from './spendabilityReconciliation';

describe('Spendability reconciliation audit', () => {
  it('flags expected recurring patterns with no current-cycle occurrence', () => {
    const report = buildSpendabilityReconciliation({
      recurringPatterns: [
        { id: 'walmart', name: 'Walmart Card', amount: 200, nextOccurrence: '2026-10-10', status: 'active', type: 'expense' },
        { id: 'geico', name: 'Geico', amount: 496.94, nextOccurrence: '2026-10-10', status: 'active', type: 'expense' }
      ],
      currentCycleBills: [
        { id: 'bill-geico', recurringPatternId: 'geico', name: 'Geico', amount: 496.94, dueDate: '2026-10-10' }
      ],
      reservedBills: [
        { id: 'bill-geico', recurringPatternId: 'geico', name: 'Geico', amount: 496.94, dueDate: '2026-10-10' }
      ],
      pendingPaymentBills: [],
      todayStr: '2026-10-07',
      cycleEndStr: '2026-10-14',
      totalAvailable: 1199.55,
      safeToSpend: 702.61
    });

    expect(report.missingOccurrences).toEqual([
      expect.objectContaining({
        id: 'walmart',
        name: 'Walmart Card',
        amount: 200,
        dueDate: '2026-10-10'
      })
    ]);
  });

  it('separates pending-payment exclusions from reserved bills', () => {
    const report = buildSpendabilityReconciliation({
      recurringPatterns: [],
      currentCycleBills: [
        { id: 'pending-cvs', name: 'CVS Membership', amount: 5, dueDate: '2026-10-12', pendingPayment: true }
      ],
      reservedBills: [
        { id: 'barclay', name: 'Barclay', amount: 30, dueDate: '2026-10-09' }
      ],
      pendingPaymentBills: [
        { id: 'pending-cvs', name: 'CVS Membership', amount: 5, dueDate: '2026-10-12', pendingPayment: true }
      ],
      todayStr: '2026-10-07',
      cycleEndStr: '2026-10-14',
      totalAvailable: 100,
      safeToSpend: 70
    });

    expect(report.reservedTotal).toBe(30);
    expect(report.pendingExcludedTotal).toBe(5);
    expect(report.safeToSpend).toBe(70);
  });
});
