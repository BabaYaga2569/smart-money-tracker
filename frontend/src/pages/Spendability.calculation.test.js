/**
 * Test for Spendability calculation logic
 * Validates that "Safe to Spend NOW" calculation correctly excludes future deposits
 */

// Mock date helpers
const getPacificTime = () => {
  // Simulating January 6, 2026 for testing
  return new Date('2026-01-06T00:00:00-08:00');
};

// Simulated calculation logic from Spendability.jsx
const calculateSafeToSpend = (config) => {
  const {
    totalAvailable,
    paydays,
    totalBillsDue,
    weeklyEssentials,
    safetyBuffer
  } = config;

  const today = getPacificTime();
  today.setHours(0, 0, 0, 0);
  
  // Filter deposits that have ALREADY happened TODAY
  const depositsToday = paydays.filter(payday => {
    const paydayDate = new Date(payday.date);
    paydayDate.setHours(0, 0, 0, 0);
    return paydayDate <= today; // Deposit is today or earlier
  });
  
  const depositsTodayAmount = depositsToday.reduce((sum, p) => sum + p.amount, 0);
  const totalPaydayAmount = paydays.reduce((sum, p) => sum + p.amount, 0);
  
  // Calculate what's safe to spend RIGHT NOW (conservative)
  const safeToSpendToday = 
    totalAvailable +
    depositsTodayAmount -      // Only include deposits that happened today or earlier
    totalBillsDue -
    weeklyEssentials -
    safetyBuffer;
  
  // Calculate what will be available AFTER all deposits arrive (projection)
  const availableAfterPayday = 
    totalAvailable +
    totalPaydayAmount -        // All future deposits
    totalBillsDue -
    weeklyEssentials -
    safetyBuffer;
  
  return {
    safeToSpendToday,
    availableAfterPayday,
    depositsTodayAmount,
    totalPaydayAmount
  };
};

// Test scenarios
const runTests = () => {
  console.log('🧪 Testing Spendability Calculation Logic\n');

  // Test Case 1: User Currently Short (Like Current Situation from Issue)
  console.log('Test Case 1: User Currently Short (Early Deposit Today)');
  const test1 = calculateSafeToSpend({
    totalAvailable: 138.19,
    paydays: [
      { date: '2026-01-06', amount: 400, type: 'early' },      // TODAY!
      { date: '2026-01-09', amount: 1483.81, type: 'main' }    // 3 days away
    ],
    totalBillsDue: 45,
    weeklyEssentials: 100,
    safetyBuffer: 100
  });
  
  console.log('  Current balance:', 138.19);
  console.log('  Early deposit (TODAY):', 400);
  console.log('  Main payday (future):', 1483.81);
  console.log('  Expected Safe to Spend NOW:', 293.19, '(includes today\'s $400)');
  console.log('  Actual Safe to Spend NOW:', test1.safeToSpendToday.toFixed(2));
  console.log('  Expected After Payday:', 1777.0);
  console.log('  Actual After Payday:', test1.availableAfterPayday.toFixed(2));
  console.log('  ✅ Test 1:', 
    Math.abs(test1.safeToSpendToday - 293.19) < 0.01 && 
    Math.abs(test1.availableAfterPayday - 1777.0) < 0.01 ? 'PASSED' : 'FAILED');
  console.log('');

  // Test Case 2: User Actually Negative
  console.log('Test Case 2: User Actually Negative (Future Early Deposit)');
  const test2 = calculateSafeToSpend({
    totalAvailable: 50,
    paydays: [
      { date: '2026-01-08', amount: 400, type: 'early' }       // 2 days away - FUTURE
    ],
    totalBillsDue: 200,
    weeklyEssentials: 100,
    safetyBuffer: 100
  });
  
  console.log('  Current balance:', 50);
  console.log('  Early deposit (FUTURE):', 400);
  console.log('  Expected Safe to Spend NOW:', -350, '(NEGATIVE - no future income)');
  console.log('  Actual Safe to Spend NOW:', test2.safeToSpendToday.toFixed(2));
  console.log('  Expected After Payday:', 50);
  console.log('  Actual After Payday:', test2.availableAfterPayday.toFixed(2));
  console.log('  ✅ Test 2:', 
    Math.abs(test2.safeToSpendToday - (-350)) < 0.01 && 
    Math.abs(test2.availableAfterPayday - 50) < 0.01 ? 'PASSED' : 'FAILED');
  console.log('');

  // Test Case 3: No Early Deposit
  console.log('Test Case 3: No Early Deposit (Single Payday)');
  const test3 = calculateSafeToSpend({
    totalAvailable: 500,
    paydays: [
      { date: '2026-01-09', amount: 1883.81, type: 'single' }  // 3 days away
    ],
    totalBillsDue: 100,
    weeklyEssentials: 100,
    safetyBuffer: 100
  });
  
  console.log('  Current balance:', 500);
  console.log('  Single payday (future):', 1883.81);
  console.log('  Expected Safe to Spend NOW:', 200, '(only current balance)');
  console.log('  Actual Safe to Spend NOW:', test3.safeToSpendToday.toFixed(2));
  console.log('  Expected After Payday:', 2083.81);
  console.log('  Actual After Payday:', test3.availableAfterPayday.toFixed(2));
  console.log('  ✅ Test 3:', 
    Math.abs(test3.safeToSpendToday - 200) < 0.01 && 
    Math.abs(test3.availableAfterPayday - 2083.81) < 0.01 ? 'PASSED' : 'FAILED');
  console.log('');

  // Test Case 4: Multiple deposits today
  console.log('Test Case 4: Multiple Deposits Today');
  const test4 = calculateSafeToSpend({
    totalAvailable: 100,
    paydays: [
      { date: '2026-01-06', amount: 200, type: 'early' },      // TODAY!
      { date: '2026-01-06', amount: 300, type: 'main' },       // ALSO TODAY!
      { date: '2026-01-09', amount: 500, type: 'bonus' }       // Future
    ],
    totalBillsDue: 50,
    weeklyEssentials: 50,
    safetyBuffer: 50
  });
  
  console.log('  Current balance:', 100);
  console.log('  Deposits TODAY:', 500, '(200 + 300)');
  console.log('  Future deposits:', 500);
  console.log('  Expected Safe to Spend NOW:', 450, '(includes both today\'s deposits)');
  console.log('  Actual Safe to Spend NOW:', test4.safeToSpendToday.toFixed(2));
  console.log('  Expected After Payday:', 950);
  console.log('  Actual After Payday:', test4.availableAfterPayday.toFixed(2));
  console.log('  ✅ Test 4:', 
    Math.abs(test4.safeToSpendToday - 450) < 0.01 && 
    Math.abs(test4.availableAfterPayday - 950) < 0.01 ? 'PASSED' : 'FAILED');
  console.log('');

  console.log('✅ All tests completed!');
};

// Run tests
runTests();
