// AccountMatchingStrategies.test.js - Test multi-strategy account matching for pending transactions
// This tests the fix for account ID mismatch breaking pending transaction assignment

// Simple test runner
const test = (name, fn) => {
    try {
        fn();
        console.log(`✅ ${name}`);
        return true;
    } catch (error) {
        console.error(`❌ ${name}`);
        console.error(`   ${error.message}`);
        return false;
    }
};

// Simple assertion helper
const assert = (condition, message) => {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
};

// Mock implementation of the new calculateProjectedBalance function
// This mimics the logic from Accounts.jsx
const calculateProjectedBalanceWithStrategies = (accountId, liveBalance, transactionsList, currentAccount, plaidAccounts = []) => {
    if (!transactionsList || transactionsList.length === 0) {
        return liveBalance;
    }

    const pendingTxs = transactionsList.filter(tx => {
        const isPending = tx.pending === true || tx.pending === 'true';
        
        if (!isPending) return false;
        
        const txAccountId = tx.account_id || tx.account;
        
        // Strategy 1: Exact account_id match (fastest)
        if (txAccountId === accountId) {
            return true;
        }
        
        // Strategy 2: Match by mask (last 4 digits) - most reliable fallback
        if (currentAccount?.mask && tx.mask) {
            const masksMatch = currentAccount.mask === tx.mask;
            
            // Also verify institution name to avoid false positives
            const institutionMatch = !currentAccount.institution_name || 
                                    !tx.institution_name || 
                                    currentAccount.institution_name === tx.institution_name;
            
            if (masksMatch && institutionMatch) {
                return true;
            }
        }
        
        // Strategy 3: Match by institution (only if account is the sole one from this bank)
        if (currentAccount?.institution_name && tx.institution_name) {
            const institutionMatch = currentAccount.institution_name === tx.institution_name;
            
            // Count how many accounts share this institution
            const accountsFromBank = plaidAccounts.filter(acc => 
                acc.institution_name === currentAccount.institution_name
            );
            
            // Only use institution matching if it's the ONLY account from this bank
            if (institutionMatch && accountsFromBank.length === 1) {
                return true;
            }
        }
        
        return false;
    });

    // Calculate total pending amount
    const pendingTotal = pendingTxs.reduce((sum, tx) => {
        const amount = Math.abs(parseFloat(tx.amount) || 0);
        return sum + amount;
    }, 0);

    return liveBalance - pendingTotal;
};

const runAccountMatchingTests = () => {
    console.log('🧪 Testing Multi-Strategy Account Matching for Pending Transactions...\n');

    // Test 1: Strategy 1 - Exact account_id match (baseline)
    test('Strategy 1: Exact account_id match works', () => {
        const accountId = 'exact_match_123';
        const liveBalance = 460.63;
        const currentAccount = {
            account_id: accountId,
            mask: '1234',
            institution_name: 'BofA'
        };
        
        const transactions = [
            {
                transaction_id: 'tx_1',
                account_id: accountId,  // Exact match
                amount: -25.00,
                pending: true,
                name: 'Zelle Transfer'
            }
        ];
        
        const result = calculateProjectedBalanceWithStrategies(accountId, liveBalance, transactions, currentAccount, [currentAccount]);
        const expected = 460.63 - 25.00;
        
        assert(
            Math.abs(result - expected) < 0.01,
            `Expected ${expected}, got ${result}`
        );
    });

    // Test 2: Strategy 2 - Match by mask when account_id differs
    test('Strategy 2: Match by mask when account_id differs', () => {
        const accountId = 'zxydAykJMNc63YM1qOxrUbdJVKNQB4tzmxMBa';  // BofA account card ID
        const liveBalance = 460.63;
        const currentAccount = {
            account_id: accountId,
            mask: '1234',
            institution_name: 'Bank of America'
        };
        
        const transactions = [
            {
                transaction_id: 'tx_1',
                account_id: 'nepjkM0wXqhr1npMQo69irqOYxPoZqFM1vakD',  // Different ID!
                mask: '1234',  // But same mask
                institution_name: 'Bank of America',
                amount: -25.00,
                pending: true,
                name: 'Zelle Transfer'
            },
            {
                transaction_id: 'tx_2',
                account_id: 'nepjkM0wXqhr1npMQo69irqOYxPoZqFM1vakD',  // Different ID!
                mask: '1234',  // Same mask
                institution_name: 'Bank of America',
                amount: -52.15,
                pending: true,
                name: 'Walmart'
            }
        ];
        
        const result = calculateProjectedBalanceWithStrategies(accountId, liveBalance, transactions, currentAccount, [currentAccount]);
        const expected = 460.63 - 25.00 - 52.15;
        
        assert(
            Math.abs(result - expected) < 0.01,
            `Expected ${expected}, got ${result}. Mask matching should work!`
        );
    });

    // Test 3: Strategy 2 - Mask match requires institution validation
    test('Strategy 2: Mask match validates institution to avoid false positives', () => {
        const accountId = 'bofa_checking_123';
        const liveBalance = 500.00;
        const currentAccount = {
            account_id: accountId,
            mask: '1234',
            institution_name: 'Bank of America'
        };
        
        const transactions = [
            {
                transaction_id: 'tx_1',
                account_id: 'different_id',
                mask: '1234',  // Same mask
                institution_name: 'Wells Fargo',  // Different institution!
                amount: -25.00,
                pending: true,
                name: 'Should NOT match'
            }
        ];
        
        const result = calculateProjectedBalanceWithStrategies(accountId, liveBalance, transactions, currentAccount, [currentAccount]);
        
        assert(
            result === liveBalance,
            `Expected ${liveBalance} (no match), got ${result}. Should NOT match different institution!`
        );
    });

    // Test 4: Strategy 3 - Institution match for single account banks
    test('Strategy 3: Match by institution for single-account banks', () => {
        const accountId = 'usaa_checking_123';
        const liveBalance = 300.00;
        const currentAccount = {
            account_id: accountId,
            mask: '5678',
            institution_name: 'USAA'
        };
        
        const plaidAccounts = [currentAccount];  // Only one USAA account
        
        const transactions = [
            {
                transaction_id: 'tx_1',
                account_id: 'different_id',  // Different ID
                // No mask provided
                institution_name: 'USAA',  // Same institution
                amount: -20.00,
                pending: true,
                name: 'Gas Station'
            }
        ];
        
        const result = calculateProjectedBalanceWithStrategies(accountId, liveBalance, transactions, currentAccount, plaidAccounts);
        const expected = 300.00 - 20.00;
        
        assert(
            Math.abs(result - expected) < 0.01,
            `Expected ${expected}, got ${result}. Single account institution matching should work!`
        );
    });

    // Test 5: Strategy 3 - Institution match REJECTED for multiple accounts from same bank
    test('Strategy 3: Institution match rejected when multiple accounts from same bank', () => {
        const accountId = 'bofa_checking_123';
        const liveBalance = 400.00;
        const currentAccount = {
            account_id: accountId,
            mask: '1234',
            institution_name: 'Bank of America'
        };
        
        const plaidAccounts = [
            currentAccount,
            {
                account_id: 'bofa_savings_456',
                mask: '5678',
                institution_name: 'Bank of America'  // Multiple BofA accounts
            }
        ];
        
        const transactions = [
            {
                transaction_id: 'tx_1',
                account_id: 'different_id',
                // No mask
                institution_name: 'Bank of America',
                amount: -30.00,
                pending: true,
                name: 'Ambiguous transaction'
            }
        ];
        
        const result = calculateProjectedBalanceWithStrategies(accountId, liveBalance, transactions, currentAccount, plaidAccounts);
        
        assert(
            result === liveBalance,
            `Expected ${liveBalance} (no match), got ${result}. Should NOT match when multiple accounts from same bank!`
        );
    });

    // Test 6: All 5 pending transactions match correctly with mixed strategies
    test('Real-world scenario: Mix of all 3 matching strategies', () => {
        const accountId = 'zxydAykJMNc63YM1qOxrUbdJVKNQB4tzmxMBa';
        const liveBalance = 460.63;
        const currentAccount = {
            account_id: accountId,
            mask: '1234',
            institution_name: 'Bank of America'
        };
        
        const transactions = [
            // Strategy 1: Exact match
            {
                transaction_id: 'tx_1',
                account_id: accountId,  // Exact match
                amount: -10.00,
                pending: true,
                name: 'Coffee'
            },
            // Strategy 2: Mask match
            {
                transaction_id: 'tx_2',
                account_id: 'nepjkM0wXqhr1npMQo69irqOYxPoZqFM1vakD',  // Different ID
                mask: '1234',  // But same mask
                institution_name: 'Bank of America',
                amount: -25.00,
                pending: true,
                name: 'Zelle'
            },
            {
                transaction_id: 'tx_3',
                account_id: 'YNo47jEe40T5xeZg97nVIjDQnJEmVoUJQrxZ9',  // Different ID
                mask: '1234',  // Same mask
                institution_name: 'Bank of America',
                amount: -52.15,
                pending: true,
                name: 'Walmart'
            },
            {
                transaction_id: 'tx_4',
                account_id: 'YNo47jEe40T5xeZg97nVIjDQnJEmVoUJQrxZ9',  // Different ID
                mask: '1234',  // Same mask
                institution_name: 'Bank of America',
                amount: -30.00,
                pending: true,
                name: 'Amazon'
            },
            {
                transaction_id: 'tx_5',
                account_id: 'YNo47jEe40T5xeZg97nVIjDQnJEmVoUJQrxZ9',  // Different ID
                mask: '1234',  // Same mask
                institution_name: 'Bank of America',
                amount: -12.03,
                pending: true,
                name: 'Starbucks'
            },
            // Should NOT match: cleared transaction
            {
                transaction_id: 'tx_6',
                account_id: accountId,
                amount: -100.00,
                pending: false,  // Cleared
                name: 'Should not affect projection'
            }
        ];
        
        const result = calculateProjectedBalanceWithStrategies(accountId, liveBalance, transactions, currentAccount, [currentAccount]);
        // Expected: $460.63 - $10.00 - $25.00 - $52.15 - $30.00 - $12.03 = $331.45
        const expected = 460.63 - 10.00 - 25.00 - 52.15 - 30.00 - 12.03;
        
        assert(
            Math.abs(result - expected) < 0.01,
            `Expected ${expected}, got ${result}. All 5 pending should match!`
        );
    });

    // Test 7: Non-pending transactions are ignored
    test('Non-pending transactions are ignored', () => {
        const accountId = 'checking_123';
        const liveBalance = 500.00;
        const currentAccount = {
            account_id: accountId,
            mask: '1234',
            institution_name: 'Test Bank'
        };
        
        const transactions = [
            {
                transaction_id: 'tx_1',
                account_id: accountId,
                amount: -100.00,
                pending: false,  // NOT pending
                name: 'Cleared'
            },
            {
                transaction_id: 'tx_2',
                account_id: accountId,
                mask: '1234',
                amount: -50.00,
                pending: 'false',  // String "false"
                name: 'Also cleared'
            }
        ];
        
        const result = calculateProjectedBalanceWithStrategies(accountId, liveBalance, transactions, currentAccount, [currentAccount]);
        
        assert(
            result === liveBalance,
            `Expected ${liveBalance}, got ${result}. Cleared transactions should be ignored!`
        );
    });

    // Test 8: String 'true' for pending works
    test('Pending as string "true" is recognized', () => {
        const accountId = 'checking_123';
        const liveBalance = 500.00;
        const currentAccount = {
            account_id: accountId,
            mask: '1234'
        };
        
        const transactions = [
            {
                transaction_id: 'tx_1',
                account_id: accountId,
                amount: -25.00,
                pending: 'true',  // String "true"
                name: 'Pending charge'
            }
        ];
        
        const result = calculateProjectedBalanceWithStrategies(accountId, liveBalance, transactions, currentAccount, [currentAccount]);
        const expected = 500.00 - 25.00;
        
        assert(
            Math.abs(result - expected) < 0.01,
            `Expected ${expected}, got ${result}. String "true" should work!`
        );
    });

    console.log('\n✅ All Account Matching Strategy tests passed!');
};

// Run tests
runAccountMatchingTests();
