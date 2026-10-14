import { describe, expect, it } from 'vitest';
import { SettingsSchemaManager } from './SettingsSchemaManager';
import { buildHouseholdPayEvents, nextMainPaydayDate } from './householdPayEvents';

describe('pay settings zero-placeholder recovery', () => {
  it('recovers Steve pay from root fields when nested defaults are zero', () => {
    const settings = SettingsSchemaManager.ensureRequiredFields({
      schemaVersion: 3,
      personalInfo: { yourName: 'Steve', spouseName: 'Tanci' },
      payAmount: 1945.17,
      lastPayDate: '2026-10-02',
      spousePayAmount: 1892.26,
      paySchedules: {
        yours: {
          type: 'bi-weekly',
          amount: 0,
          lastPaydate: '',
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
      },
      earlyDeposit: {
        enabled: true,
        bankName: 'SoFi',
        amount: 400,
        daysBefore: 1,
        remainderBank: 'Bank of America'
      }
    });

    expect(settings.paySchedules.yours.amount).toBe(1945.17);
    expect(settings.paySchedules.yours.lastPaydate).toBe('2026-10-02');

    const events = buildHouseholdPayEvents(settings, {
      todayOverride: '2026-10-14',
      horizonDays: 10
    });
    const throughSteveMain = events.filter(e => e.date <= nextMainPaydayDate(events, 'yours'));

    expect(throughSteveMain.map(e => [e.date, e.amount, e.owner, e.type])).toEqual([
      ['2026-10-15', 1892.26, 'spouse', 'spouse'],
      ['2026-10-15', 400, 'yours', 'early'],
      ['2026-10-16', 1545.17, 'yours', 'main']
    ]);
  });
});
