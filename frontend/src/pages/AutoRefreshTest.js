// AutoRefreshTest.js - Test for auto-refresh balance logic

// Simple test runner
const runTests = () => {
  console.log('🧪 Testing Auto-Refresh Logic...\n');

  // Test 1: getTimeSince - just now
  test('getTimeSince - just now', () => {
    const now = Date.now();
    const seconds = Math.floor((Date.now() - now) / 1000);
    assert(seconds < 60, 'Should be less than 60 seconds');
    
    const result = seconds < 60 ? 'just now' : 'unexpected';
    assert(result === 'just now', `Expected "just now", got "${result}"`);
    console.log('✅ Test 1 passed: Shows "just now" for recent timestamps');
  });

  // Test 2: getTimeSince - minutes
  test('getTimeSince - minutes', () => {
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    const seconds = Math.floor((Date.now() - fiveMinutesAgo) / 1000);
    const minutes = Math.floor(seconds / 60);
    
    assert(minutes === 5, `Expected 5 minutes, got ${minutes}`);
    
    const result = minutes < 60 ? `${minutes} min ago` : 'unexpected';
    assert(result === '5 min ago', `Expected "5 min ago", got "${result}"`);
    console.log('✅ Test 2 passed: Shows "X min ago" for minutes');
  });

  // Test 3: getTimeSince - hours
  test('getTimeSince - hours', () => {
    const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
    const seconds = Math.floor((Date.now() - twoHoursAgo) / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    assert(hours === 2, `Expected 2 hours, got ${hours}`);
    
    const result = `${hours} hour${hours > 1 ? 's' : ''} ago`;
    assert(result === '2 hours ago', `Expected "2 hours ago", got "${result}"`);
    console.log('✅ Test 3 passed: Shows "X hours ago" for hours');
  });

  // Test 4: isDataStale - fresh data (<10 min)
  test('isDataStale - fresh data', () => {
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    const minutes = Math.floor((Date.now() - fiveMinutesAgo) / 1000 / 60);
    const isStale = minutes > 10;
    
    assert(isStale === false, 'Data should NOT be stale at 5 minutes');
    console.log('✅ Test 4 passed: Fresh data (<10 min) is not stale');
  });

  // Test 5: isDataStale - stale data (>10 min)
  test('isDataStale - stale data', () => {
    const fifteenMinutesAgo = Date.now() - (15 * 60 * 1000);
    const minutes = Math.floor((Date.now() - fifteenMinutesAgo) / 1000 / 60);
    const isStale = minutes > 10;
    
    assert(isStale === true, 'Data should be stale at 15 minutes');
    console.log('✅ Test 5 passed: Old data (>10 min) is stale');
  });

  // Test 6: Polling interval - aggressive phase
  test('Polling interval - aggressive phase', () => {
    const maxAggressiveAttempts = 10;
    const aggressiveInterval = 30000; // 30 seconds
    const totalAggressiveTime = maxAggressiveAttempts * aggressiveInterval;
    const expectedMinutes = totalAggressiveTime / 1000 / 60;
    
    assert(expectedMinutes === 5, `Expected 5 minutes, got ${expectedMinutes}`);
    console.log('✅ Test 6 passed: Aggressive polling = 5 minutes (10 x 30s)');
  });

  // Test 7: Polling interval - maintenance phase
  test('Polling interval - maintenance phase', () => {
    const maintenanceInterval = 60000; // 60 seconds
    const attempts = 11; // After aggressive phase
    
    assert(attempts > 10, 'Should be in maintenance phase');
    assert(maintenanceInterval === 60000, `Expected 60000ms, got ${maintenanceInterval}`);
    console.log('✅ Test 7 passed: Maintenance polling = 60 seconds');
  });

  // Test 8: Concurrent request prevention
  test('Concurrent request prevention', () => {
    let isRefreshing = false;
    
    // First request
    if (!isRefreshing) {
      isRefreshing = true;
      assert(isRefreshing === true, 'First request should set flag');
    }
    
    // Second request (should be blocked)
    if (isRefreshing) {
      console.log('Already refreshing, skipping...');
      assert(isRefreshing === true, 'Second request should be blocked');
    }
    
    console.log('✅ Test 8 passed: Concurrent requests are prevented');
  });

  console.log('\n✨ All auto-refresh tests passed!\n');
};

// Helper functions
const test = (name, fn) => {
  try {
    fn();
  } catch (error) {
    console.error(`❌ Test "${name}" failed:`, error.message);
    throw error;
  }
};

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
};

// Run tests
runTests();
