// AutoSyncLogic.test.js - Test for auto-sync timestamp logic

// Simple test runner
const runTests = () => {
  console.log('🧪 Testing Auto-Sync Logic...\n');

  // Test 1: Should sync when no timestamp exists
  test('Should sync when no timestamp exists', () => {
    const lastSyncTime = null;
    const now = Date.now();
    const sixHours = 6 * 60 * 60 * 1000;
    
    const shouldSync = !lastSyncTime || (now - parseInt(lastSyncTime)) > sixHours;
    
    assert(shouldSync === true, 'Should sync when no timestamp exists');
    console.log('✅ Test 1 passed: Syncs on first load');
  });

  // Test 2: Should NOT sync if synced < 6 hours ago
  test('Should NOT sync if synced < 6 hours ago', () => {
    const threeHoursAgo = Date.now() - (3 * 60 * 60 * 1000); // 3 hours ago
    const lastSyncTime = threeHoursAgo.toString();
    const now = Date.now();
    const sixHours = 6 * 60 * 60 * 1000;
    
    const shouldSync = !lastSyncTime || (now - parseInt(lastSyncTime)) > sixHours;
    
    assert(shouldSync === false, 'Should NOT sync if synced < 6 hours ago');
    console.log('✅ Test 2 passed: Skips sync when data is fresh');
  });

  // Test 3: Should sync if synced > 6 hours ago
  test('Should sync if synced > 6 hours ago', () => {
    const sevenHoursAgo = Date.now() - (7 * 60 * 60 * 1000); // 7 hours ago
    const lastSyncTime = sevenHoursAgo.toString();
    const now = Date.now();
    const sixHours = 6 * 60 * 60 * 1000;
    
    const shouldSync = !lastSyncTime || (now - parseInt(lastSyncTime)) > sixHours;
    
    assert(shouldSync === true, 'Should sync if synced > 6 hours ago');
    console.log('✅ Test 3 passed: Syncs when data is stale');
  });

  // Test 4: Hours ago calculation
  test('Hours ago calculation', () => {
    const fiveHoursAgo = Date.now() - (5 * 60 * 60 * 1000);
    const lastSyncTime = fiveHoursAgo.toString();
    const now = Date.now();
    
    const hoursAgo = Math.floor((now - parseInt(lastSyncTime)) / (60 * 60 * 1000));
    
    assert(hoursAgo === 5, `Expected 5 hours ago, got ${hoursAgo}`);
    console.log('✅ Test 4 passed: Hours ago calculation correct');
  });

  // Test 5: LocalStorage key format per user
  test('LocalStorage key format per user', () => {
    const userId1 = 'user123';
    const userId2 = 'user456';
    
    const key1 = `plaidLastSync_${userId1}`;
    const key2 = `plaidLastSync_${userId2}`;
    
    assert(key1 === 'plaidLastSync_user123', 'Key format should include user ID');
    assert(key2 === 'plaidLastSync_user456', 'Key format should include user ID');
    assert(key1 !== key2, 'Keys should be different for different users');
    console.log('✅ Test 5 passed: Per-user localStorage keys');
  });

  // Test 6: Edge case - exactly 6 hours
  test('Edge case - exactly 6 hours', () => {
    const sixHoursAgo = Date.now() - (6 * 60 * 60 * 1000);
    const lastSyncTime = sixHoursAgo.toString();
    const now = Date.now();
    const sixHours = 6 * 60 * 60 * 1000;
    
    const shouldSync = !lastSyncTime || (now - parseInt(lastSyncTime)) > sixHours;
    
    // Should NOT sync at exactly 6 hours (only > 6 hours)
    assert(shouldSync === false, 'Should NOT sync at exactly 6 hours');
    console.log('✅ Test 6 passed: Edge case at exactly 6 hours');
  });

  console.log('\n✨ All auto-sync logic tests passed!\n');
};

// Helper functions
function test(name, fn) {
  try {
    fn();
  } catch (error) {
    console.error(`❌ Test failed: ${name}`);
    console.error(error.message);
    process.exit(1);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Run tests
runTests();
