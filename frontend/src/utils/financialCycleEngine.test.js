import { describe, expect, it } from 'vitest';
import { buildFinancialCycle } from './financialCycleEngine';

const settings = {
  schemaVersion: 3,
  personalInfo: { yourName: 'Steve', spouseName: 'Tanci' },
  paySchedules: {
    yours: {
      type: 'bi-weekly',
      amount: 1945.17,
      lastPaydate: '2026-10-02',
      bankSplit: {
        fixedAmount: { bank: 'SoFi', amount: '400' },
        remainder: { bank: 'Bank of America' }
      }
    },
    spouse: { type: 'bi-monthly', amount: 1892.26, dates: [15, 30] }
  },
  earlyDeposit: {
    enabled: true,
    bankName: 'SoFi',
    amount: 400,
    daysBefore: 1,
    remainderBank: 'Bank of America'
  }
};

describe('financialCycleEngine', () => {
  it('uses one household refill boundary and one Safe-to-Spend calculation', () => {
    const cycle = buildFinancialCycle({
      settings,
      todayOverride: '2026-10-08',
      currentAvailableBalance: 1199.55,
      bills: [
        { id: 'a', type: 'bill', isPaid: false, name: 'Before', dueDate: '2026-10-10', amount: 850.28 },
        { id: 'b', type: 'bill', isPaid: false, name: 'After', dueDate: '2026-10-20', amount: 100 },
        { id: 'c', type: 'bill', isPaid: false, name: 'Pending', dueDate: '2026-10-12', amount: 27.32, pendingPayment: true }
      ]
    });

    expect(cycle.nextRefillDate).toBe('2026-10-15');
    expect(cycle.cycleEndDate).toBe('2026-10-14');
    expect(cycle.totalReserved).toBeCloseTo(850.28, 2);
    expect(cycle.safeToSpend).toBeCloseTo(349.27, 2);
    expect(cycle.reservedBills.map(b => b.id)).toEqual(['a']);
    expect(cycle.pendingBills.map(b => b.id)).toEqual(['c']);
    expect(cycle.upcomingIncome.map(e => [e.date, e.amount])).toEqual([
      ['2026-10-15', 1892.26],
      ['2026-10-15', 400],
      ['2026-10-16', 1545.17]
    ]);
    expect(cycle.afterDeposits).toBeCloseTo(4186.70, 2);
  });

  it('repairs legacy flat pay fields in memory without persisting them', () => {
    const cycle = buildFinancialCycle({
      settings: {
        schemaVersion: 3,
        personalInfo: { yourName: 'Steve', spouseName: 'Tanci' },
        lastPayDate: '2026-10-02',
        payAmount: 1945.17,
        spousePayAmount: 1892.26,
        earlyDeposit: { enabled: true, bankName: 'SoFi', amount: 400, daysBefore: 1, remainderBank: 'Bank of America' }
      },
      todayOverride: '2026-10-08',
      currentAvailableBalance: 1000,
      bills: []
    });

    expect(cycle.nextRefillDate).toBe('2026-10-15');
    expect(cycle.settings.paySchedules.yours.lastPaydate).toBe('2026-10-02');
  });

  it('fails safe when no refill can be resolved', () => {
    const cycle = buildFinancialCycle({
      settings: { schemaVersion: 3, personalInfo: { yourName: 'Steve' } },
      todayOverride: '2026-10-08',
      currentAvailableBalance: 1000,
      bills: [{ id: 'x', dueDate: '2026-10-09', amount: 900 }]
    });

    expect(cycle.nextRefillDate).toBeNull();
    expect(cycle.safeToSpend).toBeNull();
    expect(cycle.reservedBills).toEqual([]);
  });
});
