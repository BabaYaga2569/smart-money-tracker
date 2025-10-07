// BalanceCalculator.test.js - Test for pending transaction balance calculations
import { calculateProjectedBalance, calculateTotalProjectedBalance } from './BalanceCalculator.js';

// Simple test runner for pending transaction balance calculation
const runBalanceCalculatorTests = () => {
    console.log('🧪 Testing Pending Transaction Balance Calculator...\n');

    // Test 1: Projected balance should include pending transactions
    test('Projected balance includes pending charges', () => {
        const accountId = 'bofa_checking_123';
        const liveBalance = 2000.00;  // Current cleared balance
        
        const transactions = [
            {
                transaction_id: 'tx_1',
                account_id: accountId,
                amount: 14.36,  // Pending charge (Plaid uses positive for debits)
                pending: true,
                name: 'Amazon Purchase'
            },
            {
                transaction_id: 'tx_2',
                account_id: accountId,
                amount: 32.50,  // Pending charge
                pending: true,
                name: 'Gas Station'
            }
        ];
        
        const projectedBalance = calculateProjectedBalance(accountId, liveBalance, transactions);
        
        // Expected: $2000 - $14.36 - $32.50 = $1953.14
        const expectedBalance = 1953.14;
        
        assert(
            Math.abs(projectedBalance - expectedBalance) < 0.01,
            `Projected balance should be ${expectedBalance}, got ${projectedBalance}`
        );
        
        console.log('✅ Pending charges correctly reduce projected balance');
    });

    // Test 2: Only pending transactions should affect projected balance
    test('Only pending transactions affect projected balance', () => {
        const accountId = 'bofa_checking_123';
        const liveBalance = 2000.00;
        
        const transactions = [
            {
                transaction_id: 'tx_1',
                account_id: accountId,
                amount: 14.36,
                pending: true,  // This should be included
                name: 'Amazon Purchase'
            },
            {
                transaction_id: 'tx_2',
                account_id: accountId,
                amount: 50.00,
                pending: false,  // This should NOT be included (already in live balance)
                name: 'Grocery Store'
            }
        ];
        
        const projectedBalance = calculateProjectedBalance(accountId, liveBalance, transactions);
        
        // Expected: $2000 - $14.36 = $1985.64 (only pending transaction)
        const expectedBalance = 1985.64;
        
        assert(
            Math.abs(projectedBalance - expectedBalance) < 0.01,
            `Projected balance should be ${expectedBalance}, got ${projectedBalance}`
        );
        
        console.log('✅ Only pending transactions included in projection');
    });

    // Test 3: Multiple accounts - total projected balance
    test('Total projected balance across multiple accounts', () => {
        const accounts = [
            {
                account_id: 'bofa_checking_123',
                balance: '1361.97'
            },
            {
                account_id: 'capone_savings_456',
                balance: '24.74'
            },
            {
                account_id: 'usaa_checking_789',
                balance: '143.36'
            }
        ];
        
        const transactions = [
            {
                transaction_id: 'tx_1',
                account_id: 'bofa_checking_123',
                amount: 14.36,
                pending: true
            },
            {
                transaction_id: 'tx_2',
                account_id: 'bofa_checking_123',
                amount: 32.50,
                pending: true
            }
        ];
        
        const totalProjected = calculateTotalProjectedBalance(accounts, transactions);
        
        // Expected: (1361.97 - 14.36 - 32.50) + 24.74 + 143.36 = 1483.21
        const expectedTotal = 1483.21;
        
        assert(
            Math.abs(totalProjected - expectedTotal) < 0.01,
            `Total projected should be ${expectedTotal}, got ${totalProjected}`
        );
        
        console.log('✅ Total projected balance calculated correctly');
    });

    // Test 4: No pending transactions - projected equals live
    test('No pending transactions - projected equals live balance', () => {
        const accountId = 'bofa_checking_123';
        const liveBalance = 2000.00;
        const transactions = [];
        
        const projectedBalance = calculateProjectedBalance(accountId, liveBalance, transactions);
        
        assert(
            projectedBalance === liveBalance,
            `Projected should equal live balance when no pending transactions`
        );
        
        console.log('✅ Projected equals live when no pending transactions');
    });

    console.log('\n✅ All Balance Calculator tests passed!');
};

// Simple assertion helper
const assert = (condition, message) => {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
};

// Simple test helper
const test = (name, fn) => {
    try {
        fn();
    } catch (error) {
        console.error(`❌ Test failed: ${name}`);
        console.error(error.message);
        throw error;
    }
};

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runBalanceCalculatorTests();
}

export { runBalanceCalculatorTests };
