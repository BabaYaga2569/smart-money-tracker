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
                amount: -14.36,  // Pending charge (After PR #154: negative for expenses)
                pending: true,
                name: 'Amazon Purchase'
            },
            {
                transaction_id: 'tx_2',
                account_id: accountId,
                amount: -32.50,  // Pending charge (negative for expense)
                pending: true,
                name: 'Gas Station'
            }
        ];
        
        const projectedBalance = calculateProjectedBalance(accountId, liveBalance, transactions);
        
        // Expected: $2000 + (-$14.36) + (-$32.50) = $1953.14
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
                amount: -14.36,  // Pending expense (negative after PR #154)
                pending: true,  // This should be included
                name: 'Amazon Purchase'
            },
            {
                transaction_id: 'tx_2',
                account_id: accountId,
                amount: -50.00,  // Cleared expense (negative after PR #154)
                pending: false,  // This should NOT be included (already in live balance)
                name: 'Grocery Store'
            }
        ];
        
        const projectedBalance = calculateProjectedBalance(accountId, liveBalance, transactions);
        
        // Expected: $2000 + (-$14.36) = $1985.64 (only pending transaction)
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
                amount: -14.36,  // Pending expense (negative after PR #154)
                pending: true
            },
            {
                transaction_id: 'tx_2',
                account_id: 'bofa_checking_123',
                amount: -32.50,  // Pending expense (negative after PR #154)
                pending: true
            }
        ];
        
        const totalProjected = calculateTotalProjectedBalance(accounts, transactions);
        
        // Expected: (1361.97 + (-14.36) + (-32.50)) + 24.74 + 143.36 = 1483.21
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

    // Test 5: Pending as string 'true' should be counted
    test('Pending field as string "true" is recognized', () => {
        const accountId = 'bofa_checking_123';
        const liveBalance = 2000.00;
        
        const transactions = [
            {
                transaction_id: 'tx_1',
                account_id: accountId,
                amount: -12.03,
                pending: 'true',  // String instead of boolean
                name: 'Starbucks'
            }
        ];
        
        const projectedBalance = calculateProjectedBalance(accountId, liveBalance, transactions);
        
        // Expected: $2000 + (-$12.03) = $1987.97
        const expectedBalance = 1987.97;
        
        assert(
            Math.abs(projectedBalance - expectedBalance) < 0.01,
            `Projected balance should be ${expectedBalance}, got ${projectedBalance}`
        );
        
        console.log('✅ Pending as string "true" correctly recognized');
    });

    // Test 6: Status field 'pending' should be counted
    test('Status field "pending" is recognized', () => {
        const accountId = 'bofa_checking_123';
        const liveBalance = 2000.00;
        
        const transactions = [
            {
                transaction_id: 'tx_1',
                account_id: accountId,
                amount: -12.03,
                status: 'pending',  // Using status field instead
                name: 'Starbucks'
            }
        ];
        
        const projectedBalance = calculateProjectedBalance(accountId, liveBalance, transactions);
        
        // Expected: $2000 + (-$12.03) = $1987.97
        const expectedBalance = 1987.97;
        
        assert(
            Math.abs(projectedBalance - expectedBalance) < 0.01,
            `Projected balance should be ${expectedBalance}, got ${projectedBalance}`
        );
        
        console.log('✅ Status field "pending" correctly recognized');
    });

    // Test 7: Multiple pending indicators in same dataset
    test('Mixed pending indicators all counted', () => {
        const accountId = 'bofa_checking_123';
        const liveBalance = 293.32;
        
        const transactions = [
            {
                transaction_id: 'tx_1',
                account_id: accountId,
                amount: -25.00,
                pending: true,  // Boolean
                name: 'Zelle Transfer'
            },
            {
                transaction_id: 'tx_2',
                account_id: accountId,
                amount: -12.03,
                pending: 'true',  // String
                name: 'Starbucks'
            }
        ];
        
        const projectedBalance = calculateProjectedBalance(accountId, liveBalance, transactions);
        
        // Expected: $293.32 + (-$25.00) + (-$12.03) = $256.29
        const expectedBalance = 256.29;
        
        assert(
            Math.abs(projectedBalance - expectedBalance) < 0.01,
            `Projected balance should be ${expectedBalance}, got ${projectedBalance}`
        );
        
        console.log('✅ Mixed pending indicators all counted (matches bank available balance)');
    });

    // Test 8: Credit card accounts should be filtered out before calculation
    test('Credit card accounts excluded from total projected balance', () => {
        const accounts = [
            {
                account_id: 'checking_123',
                name: 'USAA Checking',
                type: 'depository',
                subtype: 'checking',
                balance: '591.70'
            },
            {
                account_id: 'savings_456',
                name: 'Ally Savings',
                type: 'depository',
                subtype: 'savings',
                balance: '639.71'
            },
            {
                account_id: 'credit_789',
                name: 'Citi Credit Card',
                type: 'credit',
                subtype: 'credit card',
                balance: '626.21'  // This is available credit, NOT cash
            },
            {
                account_id: 'credit_890',
                name: 'Costco Credit Card',
                type: 'credit',
                subtype: 'credit card',
                balance: '1721.24'  // This is available credit, NOT cash
            }
        ];
        
        // Filter out credit cards BEFORE calling calculateTotalProjectedBalance
        const depositoryAccounts = accounts.filter(account => {
            // Include if type is depository
            if (account.type === 'depository') return true;
            
            // Include if subtype is checking, savings, or money market
            const depositorySubtypes = ['checking', 'savings', 'money market', 'cd', 'hsa'];
            if (depositorySubtypes.includes(account.subtype?.toLowerCase())) return true;
            
            // Exclude if type is credit
            if (account.type === 'credit') return false;
            
            // Exclude if subtype contains 'credit'
            if (account.subtype?.toLowerCase().includes('credit')) return false;
            
            // Default: include for manual accounts
            return true;
        });
        
        const transactions = [];
        
        const totalProjected = calculateTotalProjectedBalance(depositoryAccounts, transactions);
        
        // Expected: Only checking + savings (591.70 + 639.71 = 1231.41)
        // Should NOT include credit card available credit (626.21 + 1721.24)
        const expectedTotal = 1231.41;
        
        assert(
            Math.abs(totalProjected - expectedTotal) < 0.01,
            `Total projected should be ${expectedTotal} (depository accounts only), got ${totalProjected}`
        );
        
        assert(
            depositoryAccounts.length === 2,
            `Should have filtered to 2 depository accounts, got ${depositoryAccounts.length}`
        );
        
        console.log('✅ Credit card accounts correctly excluded from balance calculation');
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
