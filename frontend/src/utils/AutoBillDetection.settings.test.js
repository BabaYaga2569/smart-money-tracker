// AutoBillDetection.settings.test.js - Test user settings respect
import { runAutoDetection, generateNextBill } from './AutoBillDetection.js';

// Mock Firebase functions
const mockDb = {};
const mockUserId = 'test-user-123';

// Simple assertion helper
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`❌ Assertion failed: ${message}`);
  }
};

// Simple test helper
const test = async (name, testFn) => {
  try {
    console.log(`\n🧪 Testing: ${name}`);
    await testFn();
    console.log(`✅ PASSED: ${name}`);
  } catch (error) {
    console.error(`❌ FAILED: ${name}`);
    console.error(error.message);
    throw error;
  }
};

const runAutoDetectionSettingsTests = async () => {
  console.log('🧪 Testing Auto-Bill Detection Settings Respect...\n');

  // Test 1: Auto-detection disabled via autoDetectBills
  await test('Auto-detection should be skipped when autoDetectBills is false', async () => {
    const settings = {
      autoDetectBills: false
    };
    
    const transactions = [
      { id: 'tx1', name: 'Netflix', amount: 15.99, date: '2025-01-05' }
    ];
    
    const bills = [
      { id: 'bill1', name: 'Netflix', amount: 15.99, dueDate: '2025-01-05', isPaid: false }
    ];
    
    const result = await runAutoDetection(mockUserId, transactions, bills, settings);
    
    assert(result.success === true, 'Result should be successful');
    assert(result.matchCount === 0, 'Should have 0 matches when disabled');
    assert(result.message === 'Auto-detection is disabled in settings', 'Should return disabled message');
  });

  // Test 2: Auto-detection disabled via disableAutoGeneration
  await test('Auto-detection should be skipped when disableAutoGeneration is true', async () => {
    const settings = {
      disableAutoGeneration: true
    };
    
    const transactions = [
      { id: 'tx1', name: 'Netflix', amount: 15.99, date: '2025-01-05' }
    ];
    
    const bills = [
      { id: 'bill1', name: 'Netflix', amount: 15.99, dueDate: '2025-01-05', isPaid: false }
    ];
    
    const result = await runAutoDetection(mockUserId, transactions, bills, settings);
    
    assert(result.success === true, 'Result should be successful');
    assert(result.matchCount === 0, 'Should have 0 matches when disabled');
  });

  // Test 3: Ignored merchants should not generate bills
  await test('generateNextBill should skip merchants in ignoredMerchants list', async () => {
    const settings = {
      ignoredMerchants: ['smiths fuel', "smith's fuel"]
    };
    
    const bill = {
      id: 'bill1',
      name: "Smith's Fuel",
      amount: 45.00,
      recurrence: 'monthly',
      dueDate: '2025-01-05'
    };
    
    const result = await generateNextBill(mockUserId, bill, settings);
    
    assert(result === null, 'Should return null for ignored merchant');
  });

  // Test 4: Case-insensitive merchant matching
  await test('Ignored merchants should match case-insensitively', async () => {
    const settings = {
      ignoredMerchants: ['netflix', 'SPOTIFY']
    };
    
    const billNetflix = {
      id: 'bill1',
      name: 'Netflix Premium',
      amount: 15.99,
      recurrence: 'monthly',
      dueDate: '2025-01-05'
    };
    
    const billSpotify = {
      id: 'bill2',
      name: 'spotify family',
      amount: 16.99,
      recurrence: 'monthly',
      dueDate: '2025-01-05'
    };
    
    const resultNetflix = await generateNextBill(mockUserId, billNetflix, settings);
    const resultSpotify = await generateNextBill(mockUserId, billSpotify, settings);
    
    assert(resultNetflix === null, 'Should skip Netflix (case-insensitive)');
    assert(resultSpotify === null, 'Should skip Spotify (case-insensitive)');
  });

  // Test 5: Auto-detection enabled should allow processing
  await test('Auto-detection should work when settings allow it', async () => {
    const settings = {
      autoDetectBills: true,
      disableAutoGeneration: false,
      ignoredMerchants: []
    };
    
    const transactions = [];
    const bills = [];
    
    const result = await runAutoDetection(mockUserId, transactions, bills, settings);
    
    assert(result.success === true, 'Result should be successful');
    // With no transactions/bills, it should just return 0 matches
    assert(result.matchCount === 0, 'Should have 0 matches with empty data');
  });

  // Test 6: No settings provided (default behavior)
  await test('Auto-detection should work when no settings provided', async () => {
    const transactions = [];
    const bills = [];
    
    const result = await runAutoDetection(mockUserId, transactions, bills, null);
    
    assert(result.success === true, 'Result should be successful');
  });

  console.log('\n✅ All Auto-Detection Settings Tests Passed!');
};

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAutoDetectionSettingsTests().catch(error => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });
}

export { runAutoDetectionSettingsTests };
