import { describe, expect, it } from 'vitest';
import {
  buildHouseholdPayEvents,
  summarizeNextHouseholdRefill
} from './householdPayEvents';

const settings = {
  personalInfo: {
    yourName: 'Steve',
    spouseName: 'Tanci'
  },
  paySchedules: {
    yours: {
      amount: 1945.17,
      lastPaydate: '2026-10-02'
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
};

describe('canonical household pay events', () => {
  it('builds the Oct 15 spouse + SoFi deposits and Oct 16 remainder', () => {
    const events = buildHouseholdPayEvents(settings, {
      todayOverride: '2026-10-07',
      horizonDays: 15
    });

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        date: '2026-10-15',
        owner: 'spouse',
        amount: 1892.26
      }),
      expect.objectContaining({
        date: '2026-10-15',
        owner: 'yours',
        type: 'early',
        amount: 400
      }),
      expect.objectContaining({
        date: '2026-10-16',
        owner: 'yours',
        type: 'main',
        amount: 1545.17
      })
    ]));
  });

  it('summarizes the next household refill as all deposits on Oct 15', () => {
    const events = buildHouseholdPayEvents(settings, {
      todayOverride: '2026-10-07',
      horizonDays: 15
    });
    const refill = summarizeNextHouseholdRefill(events);

    expect(refill.date).toBe('2026-10-15');
    expect(refill.amount).toBeCloseTo(2292.26, 2);
    expect(refill.events).toHaveLength(2);
  });
});
