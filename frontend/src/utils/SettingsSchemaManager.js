/**
 * SettingsSchemaManager.js
 * 
 * Professional settings protection system with schema versioning and validation.
 * Prevents data loss during code changes while being efficient and maintainable.
 * 
 * Industry-standard approach used by GitHub, Stripe, Shopify, AWS:
 * - Schema versioning for breaking changes
 * - Protected fields that cannot be cleared
 * - Automatic migrations with validation
 * - Type-safe with defaults
 */

// Current schema version - increment with each breaking change
const CURRENT_SCHEMA_VERSION = 3;

/**
 * Settings Schema v3
 * 
 * REQUIRED FIELDS:
 * - personalInfo.yourName (your name)
 * - paySchedules.yours.amount (your pay amount)
 * - paySchedules.yours.lastPaydate (your last pay date)
 * 
 * OPTIONAL FIELDS:
 * - personalInfo.spouseName (only required if spouse pay > 0)
 * - paySchedules.spouse.amount (can be 0 or null for single users)
 * - paySchedules.spouse.type
 * - paySchedules.spouse.dates
 * 
 * CONDITIONAL VALIDATION:
 * - If spouse.amount > 0, then spouseName is REQUIRED
 * - If spouse.amount = 0 or null, then spouseName is OPTIONAL
 */
// Schema definition v3 - current production schema
const SCHEMA_V3 = {
  version: 3,
  required: {
    'paySchedules.yours.lastPaydate': 'string',
    'paySchedules.yours.amount': 'number',
    'personalInfo.yourName': 'string'
    // Note: spouse fields are conditionally required - see validateSettings()
  },
  protected: [
    'paySchedules.yours.lastPaydate',
    'paySchedules.yours.amount',
    'paySchedules.spouse.amount',
    'spousePayAmount',
    'lastPayDate',
    'payAmount',
    'plaidAccounts',
    'personalInfo.yourName',
    'personalInfo.spouseName'
  ],
  defaults: {
    preferences: {
      safetyBuffer: 100,
      weeklyEssentials: 100,
      billSortOrder: 'dueDate',
      urgentDays: 7,
      warningDays: 14,
      dueDateAlerts: true
    },
    paySchedules: {
      spouse: {
        dates: [15, 30],
        type: 'bi-monthly'
      }
    }
  }
};

/**
 * Get a nested property value from an object using dot notation
 * @param {Object} obj - The object to query
 * @param {string} path - Dot-notation path (e.g., 'paySchedules.yours.amount')
 * @returns {*} The value at the path, or undefined if not found
 */
const getNestedValue = (obj, path) => {
  return path.split('.').reduce((current, key) => current?.[key], obj);
};

/**
 * Set a nested property value in an object using dot notation
 * @param {Object} obj - The object to modify
 * @param {string} path - Dot-notation path
 * @param {*} value - The value to set
 */
const setNestedValue = (obj, path, value) => {
  const keys = path.split('.');
  const lastKey = keys.pop();
  const target = keys.reduce((current, key) => {
    if (!current[key]) current[key] = {};
    return current[key];
  }, obj);
  target[lastKey] = value;
};

/**
 * Deep clone an object
 * @param {Object} obj - Object to clone
 * @returns {Object} Cloned object
 */
const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj);
  if (Array.isArray(obj)) return obj.map(deepClone);
  
  const cloned = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  return cloned;
};

/**
 * Migrations for upgrading old schema versions to current
 */
const MIGRATIONS = {
  /**
   * Migrate from v1 (flat structure) to v2 (nested paySchedules)
   */
  1: (data) => {
    console.log('🔄 Migrating settings from v1 to v2...');
    
    const migrated = { ...data };
    
    // Migrate flat pay data to nested structure
    if (!migrated.paySchedules) {
      migrated.paySchedules = {
        yours: {
          type: 'bi-weekly',
          amount: migrated.yourPayAmount || migrated.payAmount || 0,
          lastPaydate: migrated.lastPayDate || '',
          bankSplit: migrated.bankSplit || {
            fixedAmount: { bank: 'SoFi', amount: '400' },
            remainder: { bank: 'Bank of America' }
          }
        },
        spouse: {
          type: 'bi-monthly',
          amount: migrated.spousePayAmount || 0,
          dates: [15, 30]
        }
      };
    }
    
    // Keep backward compatibility fields
    migrated.lastPayDate = migrated.lastPayDate || migrated.paySchedules.yours.lastPaydate;
    migrated.payAmount = migrated.payAmount || migrated.paySchedules.yours.amount;
    migrated.spousePayAmount = migrated.spousePayAmount || migrated.paySchedules.spouse.amount;
    
    migrated.schemaVersion = 2;
    console.log('✅ Migrated to v2');
    return migrated;
  },
  
  /**
   * Migrate from v2 to v3 (add personalInfo, enhance preferences)
   */
  2: (data) => {
    console.log('🔄 Migrating settings from v2 to v3...');
    
    const migrated = { ...data };
    
    // Add personalInfo structure if missing
    if (!migrated.personalInfo) {
      migrated.personalInfo = {
        yourName: '',
        spouseName: ''
      };
    }
    
    // Ensure preferences has all default values
    if (!migrated.preferences) {
      migrated.preferences = { ...SCHEMA_V3.defaults.preferences };
    } else {
      // Fill in missing preference values with defaults
      migrated.preferences = {
        ...SCHEMA_V3.defaults.preferences,
        ...migrated.preferences
      };
    }
    
    // Ensure spouse schedule has dates array
    if (migrated.paySchedules?.spouse && !migrated.paySchedules.spouse.dates) {
      migrated.paySchedules.spouse.dates = [15, 30];
      migrated.paySchedules.spouse.type = migrated.paySchedules.spouse.type || 'bi-monthly';
    }
    
    migrated.schemaVersion = 3;
    console.log('✅ Migrated to v3');
    return migrated;
  }
};

/**
 * Validate settings against the current schema
 * @param {Object} settings - Settings object to validate
 * @returns {Object} { valid: boolean, errors: string[], warnings: string[] }
 */
const validateSettings = (settings) => {
  const errors = [];
  const warnings = [];
  
  if (!settings) {
    errors.push('Settings object is null or undefined');
    return { valid: false, errors, warnings };
  }
  
  // Check schema version
  if (!settings.schemaVersion) {
    warnings.push('No schema version found - settings may need migration');
  } else if (settings.schemaVersion < CURRENT_SCHEMA_VERSION) {
    warnings.push(`Settings are outdated (v${settings.schemaVersion}). Current version is v${CURRENT_SCHEMA_VERSION}`);
  }
  
  // Validate required fields exist and have correct types
  for (const [path, expectedType] of Object.entries(SCHEMA_V3.required)) {
    const value = getNestedValue(settings, path);
    
    if (value === undefined || value === null || value === '') {
      errors.push(`Required field missing or empty: ${path}`);
      continue;
    }
    
    // Type validation
    const actualType = typeof value;
    if (expectedType === 'number') {
      const numValue = Number(value);
      if (isNaN(numValue)) {
        errors.push(`Field ${path} must be a valid number, got: ${value}`);
      }
    } else if (actualType !== expectedType) {
      errors.push(`Field ${path} has wrong type. Expected ${expectedType}, got ${actualType}`);
    }
  }
  
  // ✅ CONDITIONAL VALIDATION: Only require spouse name if spouse pay is entered
  const spousePayAmount = Number(settings.paySchedules?.spouse?.amount || 0);
  
  // Check if spouse pay is a valid positive number
  if (!isNaN(spousePayAmount) && spousePayAmount > 0) {
    // User has spouse income - require spouse name
    if (!settings.personalInfo?.spouseName || settings.personalInfo.spouseName.trim() === '') {
      errors.push('Spouse name is required when spouse pay amount is entered');
    }
  }
  // If spousePayAmount === 0, null, undefined, or NaN, spouse fields are optional - no validation needed
  
  // Additional structural validations
  if (settings.paySchedules?.spouse?.dates) {
    if (!Array.isArray(settings.paySchedules.spouse.dates)) {
      errors.push('paySchedules.spouse.dates must be an array');
    } else if (settings.paySchedules.spouse.dates.length === 0) {
      errors.push('paySchedules.spouse.dates cannot be empty');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
};

/**
 * Migrate settings from old version to current version
 * @param {Object} settings - Settings object to migrate
 * @returns {Object} Migrated settings with current schema version
 */
const migrateSettings = (settings) => {
  if (!settings) {
    console.error('Cannot migrate null/undefined settings');
    return getDefaults();
  }
  
  let migrated = deepClone(settings);
  const startVersion = migrated.schemaVersion || 1;
  
  console.log(`🔄 Starting migration from v${startVersion} to v${CURRENT_SCHEMA_VERSION}`);
  
  // Apply migrations sequentially
  for (let version = startVersion; version < CURRENT_SCHEMA_VERSION; version++) {
    if (MIGRATIONS[version]) {
      migrated = MIGRATIONS[version](migrated);
    } else {
      console.warn(`⚠️ No migration path found for v${version} → v${version + 1}`);
    }
  }
  
  // Ensure final schema version is set
  migrated.schemaVersion = CURRENT_SCHEMA_VERSION;
  
  // Validate migrated data
  const validation = validateSettings(migrated);
  if (validation.warnings.length > 0) {
    console.warn('⚠️ Migration warnings:', validation.warnings);
  }
  
  console.log(`✅ Migration complete: v${startVersion} → v${CURRENT_SCHEMA_VERSION}`);
  
  return migrated;
};

/**
 * Safely merge new settings with existing settings, protecting critical fields
 * @param {Object} existing - Current settings from database
 * @param {Object} newData - New settings to merge in
 * @returns {Object} Safely merged settings
 */
const mergeSafely = (existing, newData) => {
  if (!existing) return newData;
  if (!newData) return existing;
  
  const merged = deepClone(newData);
  
  // Protect critical fields from being cleared
  for (const protectedPath of SCHEMA_V3.protected) {
    const existingValue = getNestedValue(existing, protectedPath);
    const newValue = getNestedValue(newData, protectedPath);
    
    // If protected field exists in old data but is missing/empty in new data, preserve it
    if (existingValue !== undefined && existingValue !== null && existingValue !== '') {
      if (newValue === undefined || newValue === null || newValue === '') {
        console.log(`🔒 Protected field preserved: ${protectedPath}`);
        setNestedValue(merged, protectedPath, existingValue);
      }
    }
  }
  
  // Always preserve plaidAccounts - never lose bank connections
  if (existing.plaidAccounts && (!merged.plaidAccounts || merged.plaidAccounts.length === 0)) {
    console.log('🔒 Preserving plaidAccounts from being cleared');
    merged.plaidAccounts = existing.plaidAccounts;
  }
  
  return merged;
};

/**
 * Get default settings with current schema version
 * @returns {Object} Default settings object
 */
const getDefaults = () => {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    personalInfo: {
      yourName: '',
      spouseName: ''
    },
    paySchedules: {
      yours: {
        type: 'bi-weekly',
        amount: 0,
        lastPaydate: '',
        bankSplit: {
          fixedAmount: { bank: 'SoFi', amount: '400' },
          remainder: { bank: 'Bank of America' }
        }
      },
      spouse: {
        type: 'bi-monthly',
        amount: 0,
        dates: [15, 30]
      }
    },
    bankAccounts: {
      bofa: { name: 'Bank of America', type: 'Checking', balance: '' },
      sofi: { name: 'SoFi', type: 'Savings', balance: '' },
      usaa: { name: 'USAA', type: 'Checking', balance: '' },
      cap1: { name: 'Capital One', type: 'Credit', balance: '' }
    },
    bills: [],
    preferences: { ...SCHEMA_V3.defaults.preferences },
    // Backward compatibility fields
    lastPayDate: '',
    payAmount: 0,
    spousePayAmount: 0
  };
};

/**
 * Ensure all required fields exist in settings, filling with defaults if missing
 * @param {Object} settings - Settings object to check
 * @returns {Object} Settings with all required fields guaranteed to exist
 */
const ensureRequiredFields = (settings) => {
  if (!settings) {
    console.warn('⚠️ Settings is null, returning defaults');
    return getDefaults();
  }
  
  const defaults = getDefaults();
  const ensured = deepClone(settings);
  
  // Check each required field and fill with default if missing
  for (const path of Object.keys(SCHEMA_V3.required)) {
    const value = getNestedValue(ensured, path);
    if (value === undefined || value === null || value === '') {
      const defaultValue = getNestedValue(defaults, path);
      console.log(`⚠️ Required field missing: ${path}, using default: ${defaultValue}`);
      setNestedValue(ensured, path, defaultValue);
    }
  }
  
  // Ensure critical structures exist
  if (!ensured.preferences) {
    ensured.preferences = { ...SCHEMA_V3.defaults.preferences };
  }
  
  if (!ensured.paySchedules?.spouse?.dates) {
    if (!ensured.paySchedules) ensured.paySchedules = {};
    if (!ensured.paySchedules.spouse) ensured.paySchedules.spouse = {};
    ensured.paySchedules.spouse.dates = [15, 30];
    ensured.paySchedules.spouse.type = ensured.paySchedules.spouse.type || 'bi-monthly';
  }
  
  // Ensure schema version is set
  if (!ensured.schemaVersion) {
    ensured.schemaVersion = CURRENT_SCHEMA_VERSION;
  }
  
  return ensured;
};

// Export all functions
export const SettingsSchemaManager = {
  CURRENT_SCHEMA_VERSION,
  validateSettings,
  migrateSettings,
  mergeSafely,
  getDefaults,
  ensureRequiredFields
};

export default SettingsSchemaManager;
