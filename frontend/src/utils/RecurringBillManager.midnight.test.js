// RecurringBillManager.midnight.test.js - Test for midnight normalization fix
import { RecurringBillManager } from './RecurringBillManager.js';

// Simple test runner for midnight normalization fix
const runMidnightNormalizationTests = () => {
  console.log('🧪 Testing Midnight Normalization Fix...\n');

  // Test 1: Bill due TODAY should stay today (not advance to next period)
  test('Bill due today should NOT advance when current time is later in the day', () => {
    // Simulate: Bill due 2025-11-11 at midnight, current time is 2025-11-11 01:20:08
    const billDueDate = new Date(2025, 10, 11, 0, 0, 0, 0); // Nov 11, 2025 at midnight
    const currentDateTime = new Date(2025, 10, 11, 1, 20, 8, 0); // Nov 11, 2025 at 01:20:08

    // Weekly bill
    const nextWeekly = RecurringBillManager.calculateNextWeeklyDate(billDueDate, currentDateTime);
    assert(
      nextWeekly.getTime() === billDueDate.getTime(),
      `Weekly bill due today should stay today. Expected: ${billDueDate.toISOString()}, Got: ${nextWeekly.toISOString()}`
    );

    // Bi-weekly bill
    const nextBiWeekly = RecurringBillManager.calculateNextBiWeeklyDate(
      billDueDate,
      currentDateTime
    );
    assert(
      nextBiWeekly.getTime() === billDueDate.getTime(),
      `Bi-weekly bill due today should stay today. Expected: ${billDueDate.toISOString()}, Got: ${nextBiWeekly.toISOString()}`
    );

    // Monthly bill
    const nextMonthly = RecurringBillManager.calculateNextMonthlyDate(billDueDate, currentDateTime);
    assert(
      nextMonthly.getTime() === billDueDate.getTime(),
      `Monthly bill due today should stay today. Expected: ${billDueDate.toISOString()}, Got: ${nextMonthly.toISOString()}`
    );

    // Quarterly bill
    const nextQuarterly = RecurringBillManager.calculateNextQuarterlyDate(
      billDueDate,
      currentDateTime
    );
    assert(
      nextQuarterly.getTime() === billDueDate.getTime(),
      `Quarterly bill due today should stay today. Expected: ${billDueDate.toISOString()}, Got: ${nextQuarterly.toISOString()}`
    );

    // Annual bill
    const nextAnnual = RecurringBillManager.calculateNextAnnualDate(billDueDate, currentDateTime);
    assert(
      nextAnnual.getTime() === billDueDate.getTime(),
      `Annual bill due today should stay today. Expected: ${billDueDate.toISOString()}, Got: ${nextAnnual.toISOString()}`
    );

    console.log('✅ Bill due today stays today (not advanced to next period)');
  });

  // Test 2: Bill due YESTERDAY should advance to next period
  test('Bill due yesterday should advance to next period', () => {
    // Simulate: Bill due 2025-11-10 at midnight, current time is 2025-11-11 01:20:08
    const billDueDate = new Date(2025, 10, 10, 0, 0, 0, 0); // Nov 10, 2025 at midnight
    const currentDateTime = new Date(2025, 10, 11, 1, 20, 8, 0); // Nov 11, 2025 at 01:20:08

    // Weekly bill
    const nextWeekly = RecurringBillManager.calculateNextWeeklyDate(billDueDate, currentDateTime);
    const expectedWeekly = new Date(2025, 10, 17, 0, 0, 0, 0); // Nov 17, 2025
    assert(
      nextWeekly.getTime() === expectedWeekly.getTime(),
      `Weekly bill due yesterday should advance 7 days. Expected: ${expectedWeekly.toISOString()}, Got: ${nextWeekly.toISOString()}`
    );

    // Bi-weekly bill
    const nextBiWeekly = RecurringBillManager.calculateNextBiWeeklyDate(
      billDueDate,
      currentDateTime
    );
    const expectedBiWeekly = new Date(2025, 10, 24, 0, 0, 0, 0); // Nov 24, 2025
    assert(
      nextBiWeekly.getTime() === expectedBiWeekly.getTime(),
      `Bi-weekly bill due yesterday should advance 14 days. Expected: ${expectedBiWeekly.toISOString()}, Got: ${nextBiWeekly.toISOString()}`
    );

    // Monthly bill
    const nextMonthly = RecurringBillManager.calculateNextMonthlyDate(billDueDate, currentDateTime);
    const expectedMonthly = new Date(2025, 11, 10, 0, 0, 0, 0); // Dec 10, 2025
    assert(
      nextMonthly.getTime() === expectedMonthly.getTime(),
      `Monthly bill due yesterday should advance 1 month. Expected: ${expectedMonthly.toISOString()}, Got: ${nextMonthly.toISOString()}`
    );

    console.log('✅ Bill due yesterday advances to next period');
  });

  // Test 3: Bill due in 3 days should stay in 3 days
  test('Bill due in 3 days should stay in 3 days (not off by one)', () => {
    // Simulate: Bill due 2025-11-14 at midnight, current time is 2025-11-11 01:20:08
    const billDueDate = new Date(2025, 10, 14, 0, 0, 0, 0); // Nov 14, 2025 at midnight
    const currentDateTime = new Date(2025, 10, 11, 1, 20, 8, 0); // Nov 11, 2025 at 01:20:08

    // Weekly bill
    const nextWeekly = RecurringBillManager.calculateNextWeeklyDate(billDueDate, currentDateTime);
    assert(
      nextWeekly.getTime() === billDueDate.getTime(),
      `Weekly bill due in 3 days should stay in 3 days. Expected: ${billDueDate.toISOString()}, Got: ${nextWeekly.toISOString()}`
    );

    console.log('✅ Bill due in 3 days stays in 3 days (no off-by-one error)');
  });

  // Test 4: normalizeToMidnight helper function
  test('normalizeToMidnight helper function works correctly', () => {
    const dateWithTime = new Date(2025, 10, 11, 13, 45, 30, 500); // Nov 11, 2025 at 13:45:30.500
    const normalized = RecurringBillManager.normalizeToMidnight(dateWithTime);

    assert(normalized.getHours() === 0, 'Hours should be 0');
    assert(normalized.getMinutes() === 0, 'Minutes should be 0');
    assert(normalized.getSeconds() === 0, 'Seconds should be 0');
    assert(normalized.getMilliseconds() === 0, 'Milliseconds should be 0');
    assert(normalized.getFullYear() === 2025, 'Year should be preserved');
    assert(normalized.getMonth() === 10, 'Month should be preserved');
    assert(normalized.getDate() === 11, 'Date should be preserved');

    console.log('✅ normalizeToMidnight helper function works correctly');
  });

  // Test 5: Edge case - bill due at 23:59:59 yesterday vs 00:00:01 today
  test('Edge case: Time of day should not affect day-level comparison', () => {
    // Bill due yesterday at 23:59:59
    const billDueYesterday = new Date(2025, 10, 10, 23, 59, 59, 999); // Nov 10, 2025 at 23:59:59
    const currentMorning = new Date(2025, 10, 11, 0, 0, 1, 0); // Nov 11, 2025 at 00:00:01

    const nextWeekly = RecurringBillManager.calculateNextWeeklyDate(
      billDueYesterday,
      currentMorning
    );
    const expectedWeekly = new Date(2025, 10, 17, 0, 0, 0, 0); // Should advance to Nov 17

    assert(
      nextWeekly.getTime() === expectedWeekly.getTime(),
      'Bill due yesterday at 23:59:59 should advance when current time is today at 00:00:01'
    );

    console.log('✅ Edge case handled correctly');
  });

  // Test 6: Consistency across all hours of the day
  test('Consistency: Same date should produce same result at any hour', () => {
    const billDueDate = new Date(2025, 10, 11, 0, 0, 0, 0); // Nov 11, 2025 at midnight

    // Test at different hours throughout the day
    const hours = [0, 1, 6, 12, 18, 23];
    const results = [];

    hours.forEach((hour) => {
      const currentDateTime = new Date(2025, 10, 11, hour, 0, 0, 0); // Nov 11, 2025 at various hours
      const nextWeekly = RecurringBillManager.calculateNextWeeklyDate(
        billDueDate,
        currentDateTime
      );
      results.push(nextWeekly.getTime());
    });

    // All results should be the same
    const allSame = results.every((result) => result === results[0]);
    assert(
      allSame,
      `Results should be consistent regardless of hour. Got: ${results.map((r) => new Date(r).toISOString()).join(', ')}`
    );

    console.log('✅ Consistent results across all hours of the day');
  });

  console.log('\n🎉 All midnight normalization tests passed! Fix is working correctly.\n');
};

// Simple assertion helper
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`❌ Assertion failed: ${message}`);
  }
};

// Simple test helper
const test = (name, testFn) => {
  try {
    testFn();
  } catch (error) {
    console.error(`❌ Test failed: ${name}`);
    console.error(error.message);
    throw error;
  }
};

// Export for use in other contexts
export { runMidnightNormalizationTests };

// Run tests if this file is executed directly
if (
  typeof window !== 'undefined' &&
  window.location
) {
  // Browser environment - add to window for manual testing
  window.testMidnightNormalization = runMidnightNormalizationTests;
} else if (
  typeof globalThis !== 'undefined' &&
  globalThis.process &&
  globalThis.process.env &&
  globalThis.process.env.NODE_ENV === 'test'
) {
  // Node.js test environment
  runMidnightNormalizationTests();
}
