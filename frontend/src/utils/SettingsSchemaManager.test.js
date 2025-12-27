/**
 * SettingsSchemaManager.test.js
 * Tests for settings protection system with schema versioning
 */

import { SettingsSchemaManager } from './SettingsSchemaManager.js';

// Simple assertion helper
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
};

// Test helper function
const test = (name, fn) => {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(error.message);
    process.exit(1);
  }
};

// Run tests
console.log('🧪 Running SettingsSchemaManager tests...\n');

// Test 1: getDefaults should return valid schema v3 structure
test('getDefaults returns valid schema v3 structure', () => {
  const defaults = SettingsSchemaManager.getDefaults();
  
  assert(defaults.schemaVersion === 3, 'Schema version should be 3');
  assert(defaults.personalInfo, 'Should have personalInfo');
  assert(defaults.paySchedules, 'Should have paySchedules');
  assert(defaults.paySchedules.yours, 'Should have yours schedule');
  assert(defaults.paySchedules.spouse, 'Should have spouse schedule');
  assert(Array.isArray(defaults.paySchedules.spouse.dates), 'Spouse dates should be array');
  assert(defaults.paySchedules.spouse.dates.length === 2, 'Spouse should have 2 dates');
  assert(defaults.preferences, 'Should have preferences');
  assert(defaults.preferences.safetyBuffer === 100, 'Safety buffer should be 100');
});

// Test 2: validateSettings should catch missing required fields
test('validateSettings catches missing required fields', () => {
  const invalidSettings = {
    schemaVersion: 3,
    personalInfo: { yourName: '', spouseName: '' },
    // Missing paySchedules entirely
  };
  
  const result = SettingsSchemaManager.validateSettings(invalidSettings);
  
  assert(result.valid === false, 'Should be invalid');
  assert(result.errors.length > 0, 'Should have errors');
  assert(
    result.errors.some(e => e.includes('paySchedules.yours.lastPaydate')),
    'Should report missing lastPaydate'
  );
});

// Test 3: validateSettings should validate types
test('validateSettings validates field types', () => {
  const invalidSettings = {
    schemaVersion: 3,
    personalInfo: { yourName: 'Test', spouseName: 'Spouse' },
    paySchedules: {
      yours: {
        lastPaydate: '2025-11-28',
        amount: 'not-a-number' // Wrong type
      },
      spouse: {
        amount: 1000
      }
    }
  };
  
  const result = SettingsSchemaManager.validateSettings(invalidSettings);
  
  assert(result.valid === false, 'Should be invalid');
  assert(
    result.errors.some(e => e.includes('paySchedules.yours.amount') && e.includes('number')),
    'Should report wrong type for amount'
  );
});

// Test 4: validateSettings should pass for valid settings
test('validateSettings passes for valid settings', () => {
  const validSettings = {
    schemaVersion: 3,
    personalInfo: { yourName: 'John', spouseName: 'Jane' },
    paySchedules: {
      yours: {
        lastPaydate: '2025-11-28',
        amount: 1883.81,
        type: 'bi-weekly'
      },
      spouse: {
        amount: 1851.04,
        type: 'bi-monthly',
        dates: [15, 30]
      }
    },
    preferences: {
      safetyBuffer: 200,
      weeklyEssentials: 150
    }
  };
  
  const result = SettingsSchemaManager.validateSettings(validSettings);
  
  assert(result.valid === true, 'Should be valid');
  assert(result.errors.length === 0, 'Should have no errors');
});

// Test 5: migrateSettings v1 to v3
test('migrateSettings upgrades v1 to v3', () => {
  const v1Settings = {
    yourPayAmount: 1883.81,
    spousePayAmount: 1851.04,
    lastPayDate: '2025-11-28',
    preferences: {
      safetyBuffer: 200
    }
  };
  
  const migrated = SettingsSchemaManager.migrateSettings(v1Settings);
  
  assert(migrated.schemaVersion === 3, 'Should be migrated to v3');
  assert(migrated.paySchedules, 'Should have paySchedules');
  assert(migrated.paySchedules.yours.amount === 1883.81, 'Should migrate your pay amount');
  assert(migrated.paySchedules.spouse.amount === 1851.04, 'Should migrate spouse pay amount');
  assert(migrated.paySchedules.yours.lastPaydate === '2025-11-28', 'Should migrate last pay date');
  assert(Array.isArray(migrated.paySchedules.spouse.dates), 'Should add spouse dates array');
  assert(migrated.paySchedules.spouse.dates.length === 2, 'Should have 2 dates');
  assert(migrated.personalInfo, 'Should have personalInfo added');
  
  // Backward compatibility fields should be preserved
  assert(migrated.lastPayDate === '2025-11-28', 'Should preserve backward compat lastPayDate');
  assert(migrated.payAmount === 1883.81, 'Should preserve backward compat payAmount');
  assert(migrated.spousePayAmount === 1851.04, 'Should preserve backward compat spousePayAmount');
});

// Test 6: migrateSettings v2 to v3
test('migrateSettings upgrades v2 to v3', () => {
  const v2Settings = {
    schemaVersion: 2,
    paySchedules: {
      yours: {
        amount: 1883.81,
        lastPaydate: '2025-11-28',
        type: 'bi-weekly'
      },
      spouse: {
        amount: 1851.04,
        type: 'bi-monthly'
        // Missing dates array
      }
    }
  };
  
  const migrated = SettingsSchemaManager.migrateSettings(v2Settings);
  
  assert(migrated.schemaVersion === 3, 'Should be migrated to v3');
  assert(migrated.personalInfo, 'Should add personalInfo');
  assert(Array.isArray(migrated.paySchedules.spouse.dates), 'Should add spouse dates');
  assert(migrated.paySchedules.spouse.dates.length === 2, 'Should have 2 dates');
  assert(migrated.preferences, 'Should have preferences with defaults');
  assert(migrated.preferences.safetyBuffer === 100, 'Should have default safety buffer');
});

// Test 7: mergeSafely protects critical fields
test('mergeSafely preserves protected fields', () => {
  const existing = {
    schemaVersion: 3,
    lastPayDate: '2025-11-28',
    payAmount: 1883.81,
    spousePayAmount: 1851.04,
    plaidAccounts: [{ id: 'account1', name: 'Chase' }],
    paySchedules: {
      yours: {
        lastPaydate: '2025-11-28',
        amount: 1883.81
      },
      spouse: {
        amount: 1851.04
      }
    }
  };
  
  const newData = {
    schemaVersion: 3,
    lastPayDate: '', // Trying to clear it
    payAmount: '', // Trying to clear it
    spousePayAmount: null, // Trying to clear it
    // plaidAccounts not included - trying to lose it
    paySchedules: {
      yours: {
        lastPaydate: '', // Trying to clear it
        amount: null // Trying to clear it
      },
      spouse: {
        amount: undefined // Trying to clear it
      }
    },
    preferences: {
      safetyBuffer: 300 // This should be updated
    }
  };
  
  const merged = SettingsSchemaManager.mergeSafely(existing, newData);
  
  // Protected fields should be preserved
  assert(merged.lastPayDate === '2025-11-28', 'Should preserve lastPayDate');
  assert(merged.payAmount === 1883.81, 'Should preserve payAmount');
  assert(merged.spousePayAmount === 1851.04, 'Should preserve spousePayAmount');
  assert(merged.plaidAccounts.length === 1, 'Should preserve plaidAccounts');
  assert(merged.paySchedules.yours.lastPaydate === '2025-11-28', 'Should preserve yours.lastPaydate');
  assert(merged.paySchedules.yours.amount === 1883.81, 'Should preserve yours.amount');
  assert(merged.paySchedules.spouse.amount === 1851.04, 'Should preserve spouse.amount');
  
  // Non-protected fields should be updated
  assert(merged.preferences.safetyBuffer === 300, 'Should update non-protected fields');
});

// Test 8: mergeSafely allows legitimate updates to protected fields
test('mergeSafely allows legitimate updates to protected fields', () => {
  const existing = {
    paySchedules: {
      yours: {
        amount: 1883.81
      }
    }
  };
  
  const newData = {
    paySchedules: {
      yours: {
        amount: 2000.00 // Legitimate update with new value
      }
    }
  };
  
  const merged = SettingsSchemaManager.mergeSafely(existing, newData);
  
  assert(merged.paySchedules.yours.amount === 2000.00, 'Should allow legitimate updates');
});

// Test 9: ensureRequiredFields fills missing fields
test('ensureRequiredFields fills missing required fields', () => {
  const incompleteSettings = {
    schemaVersion: 3,
    personalInfo: {
      yourName: 'John'
      // spouseName missing
    },
    paySchedules: {
      yours: {
        // amount and lastPaydate missing
      }
      // spouse entirely missing
    }
  };
  
  const ensured = SettingsSchemaManager.ensureRequiredFields(incompleteSettings);
  
  assert(ensured.personalInfo.spouseName !== undefined, 'Should fill spouseName');
  assert(ensured.paySchedules.yours.amount !== undefined, 'Should fill yours.amount');
  assert(ensured.paySchedules.yours.lastPaydate !== undefined, 'Should fill yours.lastPaydate');
  assert(ensured.paySchedules.spouse, 'Should add spouse schedule');
  assert(ensured.paySchedules.spouse.amount !== undefined, 'Should fill spouse.amount');
});

// Test 10: ensureRequiredFields handles null input
test('ensureRequiredFields handles null/undefined settings', () => {
  const ensured = SettingsSchemaManager.ensureRequiredFields(null);
  
  assert(ensured !== null, 'Should not return null');
  assert(ensured.schemaVersion === 3, 'Should have schema version');
  assert(ensured.paySchedules, 'Should have complete structure');
});

// Test 11: Migration preserves existing valid data
test('Migration preserves existing valid data during upgrade', () => {
  const v1Settings = {
    yourPayAmount: 1883.81,
    spousePayAmount: 1851.04,
    lastPayDate: '2025-11-28',
    plaidAccounts: [{ id: 'acc1' }],
    preferences: {
      safetyBuffer: 250,
      customField: 'custom-value'
    }
  };
  
  const migrated = SettingsSchemaManager.migrateSettings(v1Settings);
  
  // Should preserve all original data
  assert(migrated.plaidAccounts.length === 1, 'Should preserve plaidAccounts');
  assert(migrated.preferences.safetyBuffer === 250, 'Should preserve existing preferences');
  assert(migrated.preferences.customField === 'custom-value', 'Should preserve custom fields');
});

// Test 12: Validate warns about outdated schema version
test('validateSettings warns about outdated schema', () => {
  const outdatedSettings = {
    schemaVersion: 2,
    paySchedules: {
      yours: { lastPaydate: '2025-11-28', amount: 1000 },
      spouse: { amount: 1000 }
    },
    personalInfo: { yourName: 'Test', spouseName: 'Spouse' }
  };
  
  const result = SettingsSchemaManager.validateSettings(outdatedSettings);
  
  assert(result.warnings.length > 0, 'Should have warnings');
  assert(
    result.warnings.some(w => w.includes('outdated')),
    'Should warn about outdated schema'
  );
});

console.log('\n✅ All SettingsSchemaManager tests passed!');
