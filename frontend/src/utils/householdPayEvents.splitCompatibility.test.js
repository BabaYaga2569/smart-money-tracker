import { describe, expect, it } from 'vitest';
import { buildHouseholdPayEvents, nextMainPaydayDate } from './householdPayEvents';

describe('household pay event compatibility', () => {
  it('builds Tanci plus Steve split deposits from bankSplit settings', () => {
    const settings = {
      personalInfo: { yourName: 'Steve', spouseName: 'Tanci' },
      paySchedules: {
        yours: {
          type: 'bi-weekly',
          amount: 1945.17,
          lastPayDate: '2026-10-02',
          bankSplit: {
            fixedAmount: { bank: 'SoFi', amount: 400 },
            remainder: { bank: 'Bank of America' }
          }
        },
        spouse: {
          type: 'bi-monthly',
          amount: 1892.26,
          dates: [15, 30]
        }
      }
    };

    const events = buildHouseholdPayEvents(settings, {
      todayOverride: '2026-10-14',
      horizonDays: 10
    });

    const throughSteveMain = events.filter(e => e.date <= nextMainPaydayDate(events, 'yours'));

    expect(throughSteveMain.map(e => ({
      date: e.date,
      amount: e.amount,
      owner: e.owner,
      type: e.type,
      bank: e.bank
    }))).toEqual([
      { date: '2026-10-15', amount: 1892.26, owner: 'spouse', type: 'spouse', bank: 'Spouse Deposit' },
      { date: '2026-10-15', amount: 400, owner: 'yours', type: 'early', bank: 'SoFi' },
      { date: '2026-10-16', amount: 1545.17, owner: 'yours', type: 'main', bank: 'Bank of America' }
    ]);
  });
});
