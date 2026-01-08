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

// Test 9: ensureRequiredFields fills missing REQUIRED fields only
test('ensureRequiredFields fills missing required fields', () => {
  const incompleteSettings = {
    schemaVersion: 3,
    personalInfo: {
      yourName: 'John'
      // spouseName missing - but it's optional now
    },
    paySchedules: {
      yours: {
        // amount and lastPaydate missing
      }
      // spouse entirely missing
    }
  };
  
  const ensured = SettingsSchemaManager.ensureRequiredFields(incompleteSettings);
  
  // Required fields should be filled
  assert(ensured.paySchedules.yours.amount !== undefined, 'Should fill yours.amount');
  assert(ensured.paySchedules.yours.lastPaydate !== undefined, 'Should fill yours.lastPaydate');
  
  // Optional spouse fields may exist but don't need to be validated
  assert(ensured.paySchedules.spouse, 'Should add spouse schedule structure');
  
  // Spouse name is optional - can be undefined or empty for single users
  // No assertion needed for spouseName since it's optional
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

// Test 13: Single user WITHOUT spouse - validation should PASS
test('Single user without spouse can save settings (Test Case 1)', () => {
  const singleUserSettings = {
    schemaVersion: 3,
    personalInfo: {
      yourName: 'Courtney',
      spouseName: ''  // Empty - no spouse
    },
    paySchedules: {
      yours: {
        lastPaydate: '2025-12-04',
        amount: 1000,
        type: 'bi-weekly'
      },
      spouse: {
        amount: 0,  // No spouse income
        type: 'bi-monthly',
        dates: [15, 30]
      }
    }
  };
  
  const result = SettingsSchemaManager.validateSettings(singleUserSettings);
  
  assert(result.valid === true, 'Single user without spouse should pass validation');
  assert(result.errors.length === 0, 'Should have no errors for single user');
});

// Test 14: Married user WITH spouse - validation should PASS
test('Married user with spouse can save settings (Test Case 2)', () => {
  const marriedUserSettings = {
    schemaVersion: 3,
    personalInfo: {
      yourName: 'Steve',
      spouseName: 'Tanci'  // Has spouse name
    },
    paySchedules: {
      yours: {
        lastPaydate: '2025-12-26',
        amount: 1583.55,
        type: 'bi-weekly'
      },
      spouse: {
        amount: 1851.04,  // Has spouse income
        type: 'bi-monthly',
        dates: [15, 30]
      }
    }
  };
  
  const result = SettingsSchemaManager.validateSettings(marriedUserSettings);
  
  assert(result.valid === true, 'Married user with spouse should pass validation');
  assert(result.errors.length === 0, 'Should have no errors for married user');
});

// Test 15: User enters spouse pay but forgets name - validation should FAIL
test('User enters spouse pay without name should fail validation (Test Case 3)', () => {
  const invalidSettings = {
    schemaVersion: 3,
    personalInfo: {
      yourName: 'Courtney',
      spouseName: ''  // Empty but spouse pay is entered!
    },
    paySchedules: {
      yours: {
        lastPaydate: '2025-12-04',
        amount: 1000,
        type: 'bi-weekly'
      },
      spouse: {
        amount: 500,  // Spouse pay entered without name!
        type: 'bi-monthly',
        dates: [15, 30]
      }
    }
  };
  
  const result = SettingsSchemaManager.validateSettings(invalidSettings);
  
  assert(result.valid === false, 'Should fail validation when spouse pay entered without name');
  assert(result.errors.length > 0, 'Should have errors');
  assert(
    result.errors.some(e => e.includes('Spouse name is required')),
    'Should specifically mention spouse name is required'
  );
});

// Test 16: User removes spouse after having one - validation should PASS
test('User removes spouse data should pass validation (Test Case 4)', () => {
  const removedSpouseSettings = {
    schemaVersion: 3,
    personalInfo: {
      yourName: 'Steve',
      spouseName: ''  // Removed spouse
    },
    paySchedules: {
      yours: {
        lastPaydate: '2025-12-26',
        amount: 1583.55,
        type: 'bi-weekly'
      },
      spouse: {
        amount: 0,  // Removed spouse pay
        type: 'bi-monthly',
        dates: [15, 30]
      }
    }
  };
  
  const result = SettingsSchemaManager.validateSettings(removedSpouseSettings);
  
  assert(result.valid === true, 'Should pass validation after removing spouse');
  assert(result.errors.length === 0, 'Should have no errors after removing spouse');
});

// Test 17: Spouse amount is null (not zero) - validation should PASS
test('Spouse amount null should be treated as optional', () => {
  const nullSpouseSettings = {
    schemaVersion: 3,
    personalInfo: {
      yourName: 'John',
      spouseName: ''  // No spouse name
    },
    paySchedules: {
      yours: {
        lastPaydate: '2025-12-04',
        amount: 1000,
        type: 'bi-weekly'
      },
      spouse: {
        amount: null,  // null instead of 0
        type: 'bi-monthly',
        dates: [15, 30]
      }
    }
  };
  
  const result = SettingsSchemaManager.validateSettings(nullSpouseSettings);
  
  assert(result.valid === true, 'Should pass validation when spouse amount is null');
  assert(result.errors.length === 0, 'Should have no errors with null spouse amount');
});

// Test 18: Spouse name with whitespace only - should fail if spouse pay > 0
test('Spouse name with whitespace only should fail when spouse pay entered', () => {
  const whitespaceSettings = {
    schemaVersion: 3,
    personalInfo: {
      yourName: 'John',
      spouseName: '   '  // Only whitespace
    },
    paySchedules: {
      yours: {
        lastPaydate: '2025-12-04',
        amount: 1000,
        type: 'bi-weekly'
      },
      spouse: {
        amount: 500,  // Has spouse pay
        type: 'bi-monthly',
        dates: [15, 30]
      }
    }
  };
  
  const result = SettingsSchemaManager.validateSettings(whitespaceSettings);
  
  assert(result.valid === false, 'Should fail validation with whitespace-only spouse name');
  assert(
    result.errors.some(e => e.includes('Spouse name is required')),
    'Should require non-empty spouse name'
  );
});

console.log('\n✅ All SettingsSchemaManager tests passed!');
