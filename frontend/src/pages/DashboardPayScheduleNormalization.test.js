import { describe, expect, it } from 'vitest';
import { SettingsSchemaManager } from '../utils/SettingsSchemaManager';
import { buildHouseholdPayEvents, summarizeNextHouseholdRefill } from '../utils/householdPayEvents';

describe('Dashboard pay schedule normalization', () => {
  it('resolves legacy/root pay fields to the next household refill', () => {
    let data = {
      schemaVersion: 1,
      personalInfo: { yourName: 'Steve', spouseName: 'Tanci' },
      lastPayDate: '2026-10-02',
      payAmount: 1945.17,
      spousePayAmount: 1892.26,
      earlyDeposit: {
        enabled: true,
        bankName: 'SoFi',
        amount: 400,
        daysBefore: 1,
        remainderBank: 'Bank of America'
      }
    };

    data = SettingsSchemaManager.migrateSettings(data);
    const validation = SettingsSchemaManager.validateSettings(data);
    if (!validation.valid) data = SettingsSchemaManager.ensureRequiredFields(data);

    const events = buildHouseholdPayEvents(data, {
      todayOverride: '2026-10-14',
      horizonDays: 45
    });
    const nextRefill = summarizeNextHouseholdRefill(events.filter(e => e.date > '2026-10-14'));

    expect(nextRefill.date).toBe('2026-10-15');
    expect(nextRefill.amount).toBeCloseTo(2292.26, 2);
  });
});
