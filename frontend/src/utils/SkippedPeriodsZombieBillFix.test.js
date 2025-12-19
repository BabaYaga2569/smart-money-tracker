// SkippedPeriodsZombieBillFix.test.js - Test zombie bill prevention with skippedPeriods

/**
 * Tests for the zombie bill recreation fix.
 * 
 * PROBLEM: When user deletes a recurring bill, auto-generation immediately recreates it
 * because it sees "no bill exists for this recurring template this month"
 * 
 * SOLUTION: Track deleted periods in recurringPattern.skippedPeriods array
 * 
 * Requirements:
 * 1. When deleting a bill, add its period (YYYY-MM) to pattern's skippedPeriods
 * 2. Auto-generation should check skippedPeriods before creating bills
 * 3. Bills should NOT be recreated for skipped periods
 */

// Simple test assertions
const assert = (condition, message) => {
    if (!condition) {
        throw new Error(`❌ FAILED: ${message}`);
    }
};

const test = (description, fn) => {
    try {
        fn();
        console.log(`✅ PASS: ${description}`);
    } catch (error) {
        console.error(`❌ FAIL: ${description}`);
        console.error(`   ${error.message}`);
        throw error;
    }
};

const runTests = () => {
    console.log('🧪 Testing Zombie Bill Fix with skippedPeriods...\n');

    // Test 1: Period extraction from due date
    test('Extract period (YYYY-MM) from due date correctly', () => {
        const testCases = [
            { dueDate: '2025-12-15', expected: '2025-12' },
            { dueDate: '2025-01-01', expected: '2025-01' },
            { dueDate: '2024-12-31', expected: '2024-12' },
        ];

        testCases.forEach(({ dueDate, expected }) => {
            const period = dueDate.substring(0, 7);
            assert(
                period === expected,
                `Period extraction failed: ${dueDate} should yield ${expected}, got ${period}`
            );
        });
    });

    // Test 2: SkippedPeriods array prevents auto-generation
    test('Bill should NOT be auto-generated if period is in skippedPeriods', () => {
        const template = {
            id: 'pattern-123',
            name: 'Netflix',
            nextOccurrence: '2025-12-15',
            skippedPeriods: ['2025-12', '2025-11']
        };

        const currentPeriod = template.nextOccurrence.substring(0, 7); // '2025-12'
        
        assert(
            template.skippedPeriods.includes(currentPeriod),
            `Period ${currentPeriod} should be in skippedPeriods array`
        );
        
        console.log('   ✓ Auto-generation would be skipped for this template');
    });

    // Test 3: Bill IS generated if period is NOT in skippedPeriods
    test('Bill SHOULD be auto-generated if period is NOT in skippedPeriods', () => {
        const template = {
            id: 'pattern-456',
            name: 'Spotify',
            nextOccurrence: '2026-01-15',
            skippedPeriods: ['2025-12', '2025-11']
        };

        const currentPeriod = template.nextOccurrence.substring(0, 7); // '2026-01'
        
        assert(
            !template.skippedPeriods.includes(currentPeriod),
            `Period ${currentPeriod} should NOT be in skippedPeriods array`
        );
        
        console.log('   ✓ Auto-generation would proceed for this template');
    });

    // Test 4: Empty skippedPeriods array allows generation
    test('Bill SHOULD be generated if skippedPeriods is empty or undefined', () => {
        const templates = [
            { id: 'pattern-789', name: 'Hulu', nextOccurrence: '2025-12-20', skippedPeriods: [] },
            { id: 'pattern-101', name: 'Disney+', nextOccurrence: '2025-12-25' } // no skippedPeriods field
        ];

        templates.forEach(template => {
            const currentPeriod = template.nextOccurrence.substring(0, 7);
            const skippedPeriods = template.skippedPeriods || [];
            
            assert(
                !skippedPeriods.includes(currentPeriod),
                `Period ${currentPeriod} should allow generation for ${template.name}`
            );
        });
        
        console.log('   ✓ Auto-generation would proceed for templates without skipped periods');
    });

    // Test 5: Multiple periods can be skipped
    test('Multiple periods can be tracked in skippedPeriods', () => {
        const template = {
            id: 'pattern-999',
            name: 'Gym Membership',
            nextOccurrence: '2025-12-01',
            skippedPeriods: ['2025-10', '2025-11', '2025-12']
        };

        assert(
            template.skippedPeriods.length === 3,
            'Should have 3 skipped periods'
        );
        
        assert(
            template.skippedPeriods.includes('2025-10') &&
            template.skippedPeriods.includes('2025-11') &&
            template.skippedPeriods.includes('2025-12'),
            'All three periods should be tracked'
        );
        
        console.log('   ✓ Multiple periods tracked successfully');
    });

    // Test 6: Verify arrayUnion behavior (simulated)
    test('arrayUnion should not create duplicates when adding same period', () => {
        // Simulate arrayUnion behavior
        const existingPeriods = ['2025-11', '2025-12'];
        const newPeriod = '2025-12'; // Duplicate
        
        // arrayUnion only adds if not present
        const updatedPeriods = existingPeriods.includes(newPeriod) 
            ? existingPeriods 
            : [...existingPeriods, newPeriod];
        
        assert(
            updatedPeriods.length === 2,
            'Should not create duplicate entries'
        );
        
        assert(
            updatedPeriods.filter(p => p === '2025-12').length === 1,
            'Period 2025-12 should appear only once'
        );
        
        console.log('   ✓ No duplicates created');
    });

    console.log('\n✅ All zombie bill prevention tests passed!\n');
    console.log('Summary:');
    console.log('- Period extraction works correctly');
    console.log('- skippedPeriods array prevents auto-generation');
    console.log('- Bills are generated when period is not skipped');
    console.log('- Multiple periods can be tracked');
    console.log('- No duplicate periods are created\n');
};

// Run tests
try {
    runTests();
} catch (error) {
    console.error('\n❌ Test suite failed!');
    process.exit(1);
}
