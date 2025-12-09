// AutoBillDetection.demo.js - Demo script to show settings respect
// This demonstrates the fix for the ghost bills issue

import { runAutoDetection, generateNextBill } from './AutoBillDetection.js';

const mockUserId = 'demo-user';

// Demo: Show that auto-detection is disabled when settings say so
const demoAutoDetectionDisabled = async () => {
  console.log('\n🎬 DEMO 1: Auto-detection disabled via settings');
  console.log('═'.repeat(60));
  
  const settings = {
    autoDetectBills: false,
    disableAutoGeneration: true,
    ignoredMerchants: []
  };
  
  const transactions = [
    { id: 'tx1', name: "Smith's Fuel", amount: 45.00, date: '2025-01-05' },
    { id: 'tx2', name: 'Netflix', amount: 15.99, date: '2025-01-08' }
  ];
  
  const bills = [
    { id: 'bill1', name: "Smith's Fuel", amount: 45.00, dueDate: '2025-01-05', isPaid: false },
    { id: 'bill2', name: 'Netflix', amount: 15.99, dueDate: '2025-01-08', isPaid: false }
  ];
  
  console.log('\n📊 Input:');
  console.log('  Settings: autoDetectBills = false');
  console.log('  Transactions:', transactions.length);
  console.log('  Unpaid Bills:', bills.length);
  
  const result = await runAutoDetection(mockUserId, transactions, bills, settings);
  
  console.log('\n📋 Result:');
  console.log('  Success:', result.success);
  console.log('  Matches:', result.matchCount);
  console.log('  Message:', result.message);
  console.log('  Auto-approved bills:', result.autoApproved || 0);
  
  console.log('\n✅ Expected: No bills auto-matched because settings disabled it');
  console.log('✅ Actual: Matches =', result.matchCount);
};

// Demo: Show that ignored merchants are not processed
const demoIgnoredMerchants = async () => {
  console.log('\n\n🎬 DEMO 2: Ignored merchants are not auto-generated');
  console.log('═'.repeat(60));
  
  const settings = {
    autoDetectBills: true,
    disableAutoGeneration: false,
    ignoredMerchants: ['smiths fuel', "smith's fuel", 'smithsfuel']
  };
  
  const bill = {
    id: 'bill1',
    name: "Smith's Fuel",
    amount: 45.00,
    recurrence: 'monthly',
    dueDate: '2025-01-05'
  };
  
  console.log('\n📊 Input:');
  console.log('  Bill name:', bill.name);
  console.log('  Ignored merchants:', settings.ignoredMerchants);
  
  const result = await generateNextBill(mockUserId, bill, settings);
  
  console.log('\n📋 Result:');
  console.log('  Next bill generated:', result !== null ? 'YES' : 'NO');
  
  console.log('\n✅ Expected: No next bill generated because merchant is ignored');
  console.log('✅ Actual:', result === null ? 'Correctly skipped' : 'ERROR: Bill was generated!');
};

// Demo: Show that enabled settings allow processing
const demoEnabledSettings = async () => {
  console.log('\n\n🎬 DEMO 3: Auto-detection works when enabled');
  console.log('═'.repeat(60));
  
  const settings = {
    autoDetectBills: true,
    disableAutoGeneration: false,
    ignoredMerchants: []
  };
  
  const transactions = [
    { id: 'tx1', name: 'Netflix', amount: 15.99, date: '2025-01-08' }
  ];
  
  const bills = [];
  
  console.log('\n📊 Input:');
  console.log('  Settings: autoDetectBills = true, disableAutoGeneration = false');
  console.log('  Transactions:', transactions.length);
  console.log('  Unpaid Bills:', bills.length);
  
  const result = await runAutoDetection(mockUserId, transactions, bills, settings);
  
  console.log('\n📋 Result:');
  console.log('  Success:', result.success);
  console.log('  Matches:', result.matchCount);
  console.log('  Message:', result.message || 'N/A');
  
  console.log('\n✅ Expected: Auto-detection runs normally (0 matches because no bills to match)');
  console.log('✅ Actual: Success =', result.success);
};

// Run all demos
const runDemos = async () => {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║  AUTO-BILL DETECTION - SETTINGS RESPECT DEMONSTRATION     ║');
  console.log('║  Fix for: Ghost bills that keep coming back after delete ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  
  try {
    await demoAutoDetectionDisabled();
    await demoIgnoredMerchants();
    await demoEnabledSettings();
    
    console.log('\n\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  ✅ ALL DEMOS COMPLETED SUCCESSFULLY                      ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
  } catch (error) {
    console.error('\n❌ Demo failed:', error);
    process.exit(1);
  }
};

// Run demos if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDemos();
}

export { runDemos };
