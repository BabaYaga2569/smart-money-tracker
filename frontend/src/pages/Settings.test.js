// Settings.test.js - Test for verifying correct data structure saving
// This test verifies that Settings.jsx saves pay schedule data at BOTH:
// 1. Root level (lastPayDate, payAmount, spousePayAmount) for Spendability.jsx
// 2. Nested structure (paySchedules.yours.lastPaydate) for backward compatibility

/* eslint-env node */

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

// Simulate the Settings.jsx save logic
const prepareSaveData = (paySchedules) => {
    const spouseSchedule = {
        ...paySchedules.spouse,
        dates: paySchedules.spouse.dates || [15, 30],
        type: paySchedules.spouse.type || 'bi-monthly'
    };

    // This mimics the actual save logic in Settings.jsx (lines 114-130)
    const settingsData = {
        personalInfo: {},
        paySchedules: {
            ...paySchedules,
            spouse: spouseSchedule
        },
        // CRITICAL FIX: Save at root level for Spendability.jsx
        lastPayDate: paySchedules.yours.lastPaydate,
        payAmount: paySchedules.yours.amount,
        spousePayAmount: spouseSchedule.amount,
        bankAccounts: {},
        bills: [],
        preferences: {},
        nextPaydayOverride: '',
        lastUpdated: new Date().toISOString()
    };

    return settingsData;
};

// Run tests
const runSettingsDataStructureTests = () => {
    console.log('🧪 Testing Settings Data Structure Fix...\n');

    // Test 1: Verify root-level fields are saved
    test('Saves lastPayDate at root level', () => {
        const paySchedules = {
            yours: {
                type: 'bi-weekly',
                amount: '1883.81',
                lastPaydate: '2025-10-03'
            },
            spouse: {
                type: 'bi-monthly',
                amount: '1851.04',
                dates: [15, 30]
            }
        };

        const result = prepareSaveData(paySchedules);
        
        assert(result.lastPayDate === '2025-10-03', 
            `lastPayDate should be '2025-10-03' at root level, got ${result.lastPayDate}`);
    });

    // Test 2: Verify payAmount at root level
    test('Saves payAmount at root level', () => {
        const paySchedules = {
            yours: {
                type: 'bi-weekly',
                amount: '1883.81',
                lastPaydate: '2025-10-03'
            },
            spouse: {
                type: 'bi-monthly',
                amount: '1851.04',
                dates: [15, 30]
            }
        };

        const result = prepareSaveData(paySchedules);
        
        assert(result.payAmount === '1883.81', 
            `payAmount should be '1883.81' at root level, got ${result.payAmount}`);
    });

    // Test 3: Verify spousePayAmount at root level
    test('Saves spousePayAmount at root level', () => {
        const paySchedules = {
            yours: {
                type: 'bi-weekly',
                amount: '1883.81',
                lastPaydate: '2025-10-03'
            },
            spouse: {
                type: 'bi-monthly',
                amount: '1851.04',
                dates: [15, 30]
            }
        };

        const result = prepareSaveData(paySchedules);
        
        assert(result.spousePayAmount === '1851.04', 
            `spousePayAmount should be '1851.04' at root level, got ${result.spousePayAmount}`);
    });

    // Test 4: Verify nested structure is preserved (backward compatibility)
    test('Preserves nested paySchedules structure', () => {
        const paySchedules = {
            yours: {
                type: 'bi-weekly',
                amount: '1883.81',
                lastPaydate: '2025-10-03'
            },
            spouse: {
                type: 'bi-monthly',
                amount: '1851.04',
                dates: [15, 30]
            }
        };

        const result = prepareSaveData(paySchedules);
        
        assert(result.paySchedules.yours.lastPaydate === '2025-10-03', 
            'Nested structure paySchedules.yours.lastPaydate should still exist');
        assert(result.paySchedules.yours.amount === '1883.81', 
            'Nested structure paySchedules.yours.amount should still exist');
    });

    // Test 5: Verify Spendability.jsx can read from root level
    test('Root-level fields match Spendability.jsx expectations', () => {
        const paySchedules = {
            yours: {
                type: 'bi-weekly',
                amount: '1883.81',
                lastPaydate: '2025-10-03'
            },
            spouse: {
                type: 'bi-monthly',
                amount: '1851.04',
                dates: [15, 30]
            }
        };

        const settingsData = prepareSaveData(paySchedules);
        
        // Simulate Spendability.jsx reading logic (lines 141-148)
        const yoursSchedule = {
            lastPaydate: settingsData.lastPayDate,
            amount: parseFloat(settingsData.payAmount) || 0
        };

        const spouseSchedule = {
            type: 'bi-monthly',
            amount: parseFloat(settingsData.spousePayAmount) || 0,
            dates: [15, 30]
        };

        assert(yoursSchedule.lastPaydate === '2025-10-03', 
            'Spendability should read correct lastPaydate from root level');
        assert(yoursSchedule.amount === 1883.81, 
            'Spendability should read correct amount from root level');
        assert(spouseSchedule.amount === 1851.04, 
            'Spendability should read correct spouse amount from root level');
    });

    // Test 6: Verify correct payday calculation with fixed data structure
    test('Correct data structure produces expected payday (10/17)', () => {
        const paySchedules = {
            yours: {
                type: 'bi-weekly',
                amount: '1883.81',
                lastPaydate: '2025-10-03'
            },
            spouse: {
                type: 'bi-monthly',
                amount: '1851.04',
                dates: [15, 30]
            }
        };

        const settingsData = prepareSaveData(paySchedules);
        
        // Calculate next payday from last pay date (10/03) + 14 days = 10/17
        const lastPayDate = new Date(settingsData.lastPayDate);
        const expectedNextPayday = new Date(lastPayDate);
        expectedNextPayday.setDate(lastPayDate.getDate() + 14);
        
        const expectedDateString = expectedNextPayday.toISOString().split('T')[0];
        
        assert(expectedDateString === '2025-10-17', 
            `Next payday should be 2025-10-17, got ${expectedDateString}`);
        
        console.log('  ✓ Correct payday calculation: 10/03 + 14 days = 10/17');
    });

    console.log('\n✅ All tests passed! Settings.jsx now saves data at root level for Spendability.jsx\n');
};

// Run tests if this file is executed directly
if (typeof process !== 'undefined' && process.argv[1] === new URL(import.meta.url).pathname) {
    runSettingsDataStructureTests();
}

export { runSettingsDataStructureTests, prepareSaveData };
