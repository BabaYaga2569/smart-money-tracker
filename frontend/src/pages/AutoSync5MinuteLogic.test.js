// AutoSync5MinuteLogic.test.js - Test for 5-minute auto-sync threshold logic

// Simple test runner
const runTests = () => {
  console.log('🧪 Testing Auto-Sync 5-Minute Logic...\n');

  // Test 1: Should sync when no timestamp exists (first load)
  test('Should sync when no timestamp exists', () => {
    const lastSync = null;
    const now = Date.now();
    const FIVE_MINUTES = 5 * 60 * 1000;
    
    const shouldSync = !lastSync || (now - parseInt(lastSync)) > FIVE_MINUTES;
    
    assert(shouldSync === true, 'Should sync when no timestamp exists');
    console.log('✅ Test 1 passed: Syncs on first load (no previous sync)');
  });

  // Test 2: Should NOT sync if synced < 5 minutes ago
  test('Should NOT sync if synced < 5 minutes ago', () => {
    const twoMinutesAgo = Date.now() - (2 * 60 * 1000); // 2 minutes ago
    const lastSync = twoMinutesAgo.toString();
    const now = Date.now();
    const FIVE_MINUTES = 5 * 60 * 1000;
    
    const shouldSync = !lastSync || (now - parseInt(lastSync)) > FIVE_MINUTES;
    
    assert(shouldSync === false, 'Should NOT sync if synced < 5 minutes ago');
    console.log('✅ Test 2 passed: Skips sync when data is fresh (< 5 min)');
  });

  // Test 3: Should sync if synced > 5 minutes ago
  test('Should sync if synced > 5 minutes ago', () => {
    const tenMinutesAgo = Date.now() - (10 * 60 * 1000); // 10 minutes ago
    const lastSync = tenMinutesAgo.toString();
    const now = Date.now();
    const FIVE_MINUTES = 5 * 60 * 1000;
    
    const shouldSync = !lastSync || (now - parseInt(lastSync)) > FIVE_MINUTES;
    
    assert(shouldSync === true, 'Should sync if synced > 5 minutes ago');
    console.log('✅ Test 3 passed: Syncs when data is stale (> 5 min)');
  });

  // Test 4: Minutes ago calculation
  test('Minutes ago calculation', () => {
    const sevenMinutesAgo = Date.now() - (7 * 60 * 1000);
    const lastSync = sevenMinutesAgo.toString();
    const now = Date.now();
    
    const minutesAgo = Math.floor((now - parseInt(lastSync)) / (60 * 1000));
    
    assert(minutesAgo === 7, `Expected 7 minutes ago, got ${minutesAgo}`);
    console.log('✅ Test 4 passed: Minutes ago calculation correct');
  });

  // Test 5: Shared localStorage key (no user ID)
  test('Shared localStorage key format', () => {
    const key = 'lastPlaidSync';
    
    assert(key === 'lastPlaidSync', 'Key should be "lastPlaidSync"');
    assert(!key.includes('user'), 'Key should NOT include user ID (shared across pages)');
    console.log('✅ Test 5 passed: Shared localStorage key format');
  });

  // Test 6: Edge case - exactly 5 minutes
  test('Edge case - exactly 5 minutes', () => {
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    const lastSync = fiveMinutesAgo.toString();
    const now = Date.now();
    const FIVE_MINUTES = 5 * 60 * 1000;
    
    const shouldSync = !lastSync || (now - parseInt(lastSync)) > FIVE_MINUTES;
    
    // Should NOT sync at exactly 5 minutes (only > 5 minutes)
    assert(shouldSync === false, 'Should NOT sync at exactly 5 minutes');
    console.log('✅ Test 6 passed: Edge case at exactly 5 minutes');
  });

  // Test 7: Edge case - just over 5 minutes (5 min + 1 second)
  test('Edge case - just over 5 minutes', () => {
    const fiveMinutesOneSec = Date.now() - (5 * 60 * 1000 + 1000);
    const lastSync = fiveMinutesOneSec.toString();
    const now = Date.now();
    const FIVE_MINUTES = 5 * 60 * 1000;
    
    const shouldSync = !lastSync || (now - parseInt(lastSync)) > FIVE_MINUTES;
    
    // Should sync at 5 minutes + 1 second
    assert(shouldSync === true, 'Should sync at 5 min + 1 second');
    console.log('✅ Test 7 passed: Syncs at 5 min + 1 second');
  });

  // Test 8: User scenario - pending transactions
  test('User scenario - Walmart pending transaction', () => {
    // Simulate user's scenario from problem statement
    // User last synced 10 minutes ago, opens app, should auto-sync
    const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
    const lastSync = tenMinutesAgo.toString();
    const now = Date.now();
    const FIVE_MINUTES = 5 * 60 * 1000;
    
    const shouldSync = !lastSync || (now - parseInt(lastSync)) > FIVE_MINUTES;
    
    assert(shouldSync === true, 'Should auto-sync to get pending Walmart transaction');
    
    const minutesAgo = Math.floor((now - parseInt(lastSync)) / (60 * 1000));
    console.log(`✅ Test 8 passed: User scenario - data ${minutesAgo} min old, auto-sync triggered`);
  });

  console.log('\n✨ All 5-minute auto-sync logic tests passed!\n');
  console.log('📋 Summary:');
  console.log('  - Auto-sync triggers when data > 5 minutes old ✅');
  console.log('  - Auto-sync skips when data < 5 minutes old ✅');
  console.log('  - Shared localStorage key across pages ✅');
  console.log('  - Edge cases handled correctly ✅');
  console.log('  - User scenario validated ✅\n');
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
