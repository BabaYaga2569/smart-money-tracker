import { describe, expect, it } from 'vitest';
import { SettingsSchemaManager } from '../utils/SettingsSchemaManager';
import { buildHouseholdPayEvents, summarizeNextHouseholdRefill } from '../utils/householdPayEvents';

describe('Dashboard settings normalization', () => {
  it('resolves the household refill from legacy flat pay settings', () => {
    const legacy = {
      schemaVersion: 1,
      payAmount: 1945.17,
      lastPayDate: '2026-10-02',
      spousePayAmount: 1892.26,
      personalInfo: { yourName: 'Steve', spouseName: 'Tanci' },
      earlyDeposit: {
        enabled: true,
        bankName: 'SoFi',
        amount: 400,
        daysBefore: 1,
        remainderBank: 'Bank of America'
      }
    };

    const normalized = SettingsSchemaManager.migrateSettings(legacy);
    const events = buildHouseholdPayEvents(normalized, {
      todayOverride: '2026-10-08',
      horizonDays: 45
    });
    const refill = summarizeNextHouseholdRefill(events);

    expect(refill.date).toBe('2026-10-15');
    expect(refill.amount).toBe(2292.26);
  });
});
