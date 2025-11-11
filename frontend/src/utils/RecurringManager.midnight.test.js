// RecurringManager.midnight.test.js - Test for midnight normalization in calculateNextOccurrenceAfterPayment
import { RecurringManager } from './RecurringManager.js';

// Simple test runner for RecurringManager midnight normalization fix
const runRecurringManagerMidnightTests = () => {
  console.log('🧪 Testing RecurringManager Midnight Normalization Fix...\n');

  // Test 1: calculateNextOccurrenceAfterPayment normalizes to midnight
  test('calculateNextOccurrenceAfterPayment normalizes dates to midnight', () => {
    // Test with a date string (YYYY-MM-DD format)
    const currentOccurrence = '2025-11-11';

    // Weekly
    const nextWeekly = RecurringManager.calculateNextOccurrenceAfterPayment(
      currentOccurrence,
      'weekly'
    );
    assert(nextWeekly.getHours() === 0, 'Weekly: Hours should be 0');
    assert(nextWeekly.getMinutes() === 0, 'Weekly: Minutes should be 0');
    assert(nextWeekly.getSeconds() === 0, 'Weekly: Seconds should be 0');
    assert(nextWeekly.getMilliseconds() === 0, 'Weekly: Milliseconds should be 0');

    // Bi-weekly
    const nextBiWeekly = RecurringManager.calculateNextOccurrenceAfterPayment(
      currentOccurrence,
      'bi-weekly'
    );
    assert(nextBiWeekly.getHours() === 0, 'Bi-weekly: Hours should be 0');
    assert(nextBiWeekly.getMinutes() === 0, 'Bi-weekly: Minutes should be 0');
    assert(nextBiWeekly.getSeconds() === 0, 'Bi-weekly: Seconds should be 0');
    assert(nextBiWeekly.getMilliseconds() === 0, 'Bi-weekly: Milliseconds should be 0');

    // Monthly
    const nextMonthly = RecurringManager.calculateNextOccurrenceAfterPayment(
      currentOccurrence,
      'monthly'
    );
    assert(nextMonthly.getHours() === 0, 'Monthly: Hours should be 0');
    assert(nextMonthly.getMinutes() === 0, 'Monthly: Minutes should be 0');
    assert(nextMonthly.getSeconds() === 0, 'Monthly: Seconds should be 0');
    assert(nextMonthly.getMilliseconds() === 0, 'Monthly: Milliseconds should be 0');

    // Quarterly
    const nextQuarterly = RecurringManager.calculateNextOccurrenceAfterPayment(
      currentOccurrence,
      'quarterly'
    );
    assert(nextQuarterly.getHours() === 0, 'Quarterly: Hours should be 0');
    assert(nextQuarterly.getMinutes() === 0, 'Quarterly: Minutes should be 0');
    assert(nextQuarterly.getSeconds() === 0, 'Quarterly: Seconds should be 0');
    assert(nextQuarterly.getMilliseconds() === 0, 'Quarterly: Milliseconds should be 0');

    // Annually
    const nextAnnually = RecurringManager.calculateNextOccurrenceAfterPayment(
      currentOccurrence,
      'annually'
    );
    assert(nextAnnually.getHours() === 0, 'Annually: Hours should be 0');
    assert(nextAnnually.getMinutes() === 0, 'Annually: Minutes should be 0');
    assert(nextAnnually.getSeconds() === 0, 'Annually: Seconds should be 0');
    assert(nextAnnually.getMilliseconds() === 0, 'Annually: Milliseconds should be 0');

    console.log('✅ calculateNextOccurrenceAfterPayment normalizes all dates to midnight');
  });

  // Test 2: Verify correct advancement for each frequency
  test('calculateNextOccurrenceAfterPayment advances dates correctly', () => {
    const currentOccurrence = '2025-11-11'; // Nov 11, 2025

    // Weekly - should advance 7 days
    const nextWeekly = RecurringManager.calculateNextOccurrenceAfterPayment(
      currentOccurrence,
      'weekly'
    );
    const expectedWeekly = new Date(2025, 10, 18, 0, 0, 0, 0); // Nov 18, 2025
    assert(
      nextWeekly.getTime() === expectedWeekly.getTime(),
      `Weekly should advance 7 days. Expected: ${expectedWeekly.toISOString()}, Got: ${nextWeekly.toISOString()}`
    );

    // Bi-weekly - should advance 14 days
    const nextBiWeekly = RecurringManager.calculateNextOccurrenceAfterPayment(
      currentOccurrence,
      'bi-weekly'
    );
    const expectedBiWeekly = new Date(2025, 10, 25, 0, 0, 0, 0); // Nov 25, 2025
    assert(
      nextBiWeekly.getTime() === expectedBiWeekly.getTime(),
      `Bi-weekly should advance 14 days. Expected: ${expectedBiWeekly.toISOString()}, Got: ${nextBiWeekly.toISOString()}`
    );

    // Monthly - should advance 1 month
    const nextMonthly = RecurringManager.calculateNextOccurrenceAfterPayment(
      currentOccurrence,
      'monthly'
    );
    const expectedMonthly = new Date(2025, 11, 11, 0, 0, 0, 0); // Dec 11, 2025
    assert(
      nextMonthly.getTime() === expectedMonthly.getTime(),
      `Monthly should advance 1 month. Expected: ${expectedMonthly.toISOString()}, Got: ${nextMonthly.toISOString()}`
    );

    // Quarterly - should advance 3 months
    const nextQuarterly = RecurringManager.calculateNextOccurrenceAfterPayment(
      currentOccurrence,
      'quarterly'
    );
    const expectedQuarterly = new Date(2026, 1, 11, 0, 0, 0, 0); // Feb 11, 2026
    assert(
      nextQuarterly.getTime() === expectedQuarterly.getTime(),
      `Quarterly should advance 3 months. Expected: ${expectedQuarterly.toISOString()}, Got: ${nextQuarterly.toISOString()}`
    );

    // Annually - should advance 1 year
    const nextAnnually = RecurringManager.calculateNextOccurrenceAfterPayment(
      currentOccurrence,
      'annually'
    );
    const expectedAnnually = new Date(2026, 10, 11, 0, 0, 0, 0); // Nov 11, 2026
    assert(
      nextAnnually.getTime() === expectedAnnually.getTime(),
      `Annually should advance 1 year. Expected: ${expectedAnnually.toISOString()}, Got: ${nextAnnually.toISOString()}`
    );

    console.log('✅ calculateNextOccurrenceAfterPayment advances dates correctly');
  });

  // Test 3: Monthly edge case - month-end dates
  test('calculateNextOccurrenceAfterPayment handles month-end dates correctly', () => {
    // Bill due on Jan 31
    const jan31 = '2025-01-31';

    // Next occurrence should be Feb 28 (2025 is not a leap year)
    const nextMonthly = RecurringManager.calculateNextOccurrenceAfterPayment(jan31, 'monthly');
    assert(nextMonthly.getMonth() === 1, 'Should be February');
    assert(nextMonthly.getDate() === 28, 'Should be Feb 28 (not leap year)');
    assert(nextMonthly.getFullYear() === 2025, 'Should be 2025');

    console.log('✅ Month-end dates handled correctly');
  });

  // Test 4: Quarterly edge case - month-end dates
  test('calculateNextOccurrenceAfterPayment handles quarterly month-end dates correctly', () => {
    // Bill due on Nov 30
    const nov30 = '2025-11-30';

    // Next occurrence should be Feb 28 (2026 is not a leap year)
    const nextQuarterly = RecurringManager.calculateNextOccurrenceAfterPayment(nov30, 'quarterly');
    assert(nextQuarterly.getMonth() === 1, 'Should be February');
    assert(nextQuarterly.getDate() === 28, 'Should be Feb 28 (not leap year)');
    assert(nextQuarterly.getFullYear() === 2026, 'Should be 2026');

    console.log('✅ Quarterly month-end dates handled correctly');
  });

  console.log(
    '\n🎉 All RecurringManager midnight normalization tests passed! Fix is working correctly.\n'
  );
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
export { runRecurringManagerMidnightTests };

// Run tests if this file is executed directly
if (typeof window !== 'undefined' && window.location) {
  // Browser environment - add to window for manual testing
  window.testRecurringManagerMidnight = runRecurringManagerMidnightTests;
} else if (
  typeof globalThis !== 'undefined' &&
  globalThis.process &&
  globalThis.process.env &&
  globalThis.process.env.NODE_ENV === 'test'
) {
  // Node.js test environment
  runRecurringManagerMidnightTests();
}
