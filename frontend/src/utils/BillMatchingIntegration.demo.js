// BillMatchingIntegration.demo.js - Demonstration of automated bill matching workflow
import { PlaidIntegrationManager } from './PlaidIntegrationManager.js';

/**
 * Demonstration of the complete bill matching workflow
 * This shows how the system works with Plaid sandbox data
 */

console.log('ðŸŽ¯ Bill Matching Integration Demo\n');
console.log('This demo shows how automated bill detection works with Plaid transactions.\n');

// Step 1: Initialize the integration
console.log('Step 1: Initialize Plaid Integration');
await PlaidIntegrationManager.initialize({
    enabled: true,
    transactionTolerance: 0.05,  // 5% tolerance
    autoMarkPaid: true
});
console.log('âœ… Integration initialized\n');

// Step 2: Set up sample bills (simulating what's in the database)
console.log('Step 2: Set up sample recurring bills');
const sampleBills = [
    {
        id: 'bill-1',
        name: 'Netflix',
        amount: 15.99,
        status: 'pending',
        nextDueDate: '2025-01-15',
        recurrence: 'monthly'
    },
    {
        id: 'bill-2',
        name: 'Electric Bill',
        amount: 125.50,
        status: 'pending',
        nextDueDate: '2025-01-20',
        recurrence: 'monthly'
    },
    {
        id: 'bill-3',
        name: 'Phone Bill',
        amount: 65.00,
        status: 'pending',
        nextDueDate: '2025-01-10',
        recurrence: 'monthly'
    }
];

PlaidIntegrationManager.setBillsProvider(async () => {
    return sampleBills.filter(bill => bill.status !== 'paid');
});

console.log(`ðŸ“‹ ${sampleBills.length} bills configured:`);
sampleBills.forEach(bill => {
    console.log(`   - ${bill.name}: $${bill.amount} (due ${bill.nextDueDate})`);
});
console.log('');

// Step 3: Simulate Plaid transactions (what would come from the API)
console.log('Step 3: Simulate Plaid transactions');
const sampleTransactions = [
    {
        transaction_id: 'txn_001',
        account_id: 'acc_123',
        amount: 15.99,
        merchant_name: 'Netflix',
        date: '2025-01-15',
        category: ['Entertainment', 'Streaming']
    },
    {
        transaction_id: 'txn_002',
        account_id: 'acc_123',
        amount: 126.00,  // Slightly different amount
        merchant_name: 'Electric Company',
        date: '2025-01-18',  // 2 days before due
        category: ['Bills', 'Utilities']
    },
    {
        transaction_id: 'txn_003',
        account_id: 'acc_123',
        amount: 65.00,
        merchant_name: 'Phone Service Inc',
        date: '2025-01-12',  // 2 days after due
        category: ['Bills', 'Phone']
    }
];

console.log(`ðŸ’³ ${sampleTransactions.length} transactions to process:`);
sampleTransactions.forEach(txn => {
    console.log(`   - ${txn.merchant_name}: $${txn.amount} on ${txn.date}`);
});
console.log('');

// Step 4: Find matches for each transaction
console.log('Step 4: Find matching bills for each transaction\n');

for (const transaction of sampleTransactions) {
    console.log(`\nðŸ” Processing transaction: ${transaction.merchant_name}`);
    console.log(`   Amount: $${transaction.amount}, Date: ${transaction.date}`);
    
    // Find matching bills
    const matches = await PlaidIntegrationManager.findMatchingBills({
        amount: transaction.amount,
        merchantName: transaction.merchant_name,
        date: transaction.date,
        tolerance: 0.05
    });
    
    console.log(`   Found ${matches.length} matching bill(s):`);
    
    if (matches.length > 0) {
        matches.forEach(bill => {
            const confidence = PlaidIntegrationManager.calculateMatchConfidence(bill, transaction);
            console.log(`   âœ“ ${bill.name}`);
            console.log(`     - Bill amount: $${bill.amount} vs Transaction: $${transaction.amount}`);
            console.log(`     - Confidence: ${confidence}%`);
            
            // Show matching details
            const billAmount = parseFloat(bill.amount);
            const amountDiff = Math.abs(billAmount - transaction.amount);
            const amountPct = ((amountDiff / billAmount) * 100).toFixed(1);
            
            const billDate = new Date(bill.nextDueDate);
            const txnDate = new Date(transaction.date);
            const daysDiff = Math.abs((txnDate - billDate) / (1000 * 60 * 60 * 24));
            
            console.log(`     - Amount difference: ${amountPct}%`);
            console.log(`     - Days from due date: ${daysDiff} days`);
        });
    } else {
        console.log('   âœ— No matching bills found');
    }
}

// Step 5: Test confidence scoring
console.log('\n\nStep 5: Confidence Score Analysis');
console.log('='  .repeat(60));

const testCases = [
    {
        name: 'Perfect Match',
        bill: { name: 'Netflix', amount: 15.99, nextDueDate: '2025-01-15' },
        transaction: { merchant_name: 'Netflix', amount: 15.99, date: '2025-01-15' },
        expected: 100
    },
    {
        name: 'Small Amount Difference',
        bill: { name: 'Netflix', amount: 15.99, nextDueDate: '2025-01-15' },
        transaction: { merchant_name: 'Netflix', amount: 16.50, date: '2025-01-15' },
        expected: '60-70'
    },
    {
        name: 'Different Date',
        bill: { name: 'Netflix', amount: 15.99, nextDueDate: '2025-01-15' },
        transaction: { merchant_name: 'Netflix', amount: 15.99, date: '2025-01-18' },
        expected: '80-90'
    },
    {
        name: 'Different Merchant Name',
        bill: { name: 'Electric Bill', amount: 125.50, nextDueDate: '2025-01-20' },
        transaction: { merchant_name: 'Power Company', amount: 125.50, date: '2025-01-20' },
        expected: '40-60'
    }
];

testCases.forEach(testCase => {
    const confidence = PlaidIntegrationManager.calculateMatchConfidence(testCase.bill, testCase.transaction);
    console.log(`\n${testCase.name}:`);
    console.log(`  Bill: ${testCase.bill.name} ($${testCase.bill.amount})`);
    console.log(`  Transaction: ${testCase.transaction.merchant_name} ($${testCase.transaction.amount})`);
    console.log(`  Confidence Score: ${confidence}%`);
    console.log(`  Expected Range: ${testCase.expected}`);
});

// Step 6: Summary
console.log('\n\n' + '='.repeat(60));
console.log('ðŸ“Š Demo Summary');
console.log('='.repeat(60));
console.log('\nâœ… Automated Bill Matching Features:');
console.log('   â€¢ Fuzzy merchant name matching (70% similarity threshold)');
console.log('   â€¢ Amount tolerance matching (Â±5%)');
console.log('   â€¢ Date proximity matching (Â±5 days)');
console.log('   â€¢ Confidence scoring (0-100 scale)');
console.log('   â€¢ Duplicate prevention');
console.log('\nðŸ’¡ Integration Points:');
console.log('   â€¢ Plaid sandbox API for transaction data');
console.log('   â€¢ Automatic bill payment detection');
console.log('   â€¢ Manual refresh capability');
console.log('   â€¢ User notifications on match');
console.log('   â€¢ Manual override support');
console.log('\nðŸŽ¯ Ready for Plaid Sandbox Testing!');
console.log('   Connect a Plaid sandbox account to test with real transaction data.\n');

