/**
 * BalanceCalculator.js
 * Utility functions for calculating Live and Projected balances
 * 
 * Live Balance: Current balance from Plaid (read-only from bank)
 * Projected Balance: Live balance adjusted by manual transactions tracked in the app
 */

/**
 * Calculate projected balance for a specific account
 * @param {string} accountId - The account ID or key
 * @param {number} liveBalance - Current balance from Plaid or manual entry
 * @param {Array} transactions - Array of manual transactions
 * @returns {number} - Projected balance
 */
export const calculateProjectedBalance = (accountId, liveBalance, transactions) => {
  if (!transactions || transactions.length === 0) {
    return liveBalance;
  }

  // Filter transactions for this account
  const accountTransactions = transactions.filter(
    (t) => t.account === accountId
  );

  // Calculate the sum of manual transaction adjustments
  // Expenses are negative, income is positive
  const transactionAdjustments = accountTransactions.reduce((sum, transaction) => {
    const amount = parseFloat(transaction.amount) || 0;
    return sum + amount;
  }, 0);

  return liveBalance + transactionAdjustments;
};

/**
 * Calculate projected balances for all accounts
 * @param {Object|Array} accounts - Accounts object/array (Plaid or manual)
 * @param {Array} transactions - Array of manual transactions
 * @returns {Object} - Map of account IDs to their projected balances
 */
export const calculateAllProjectedBalances = (accounts, transactions) => {
  const projectedBalances = {};

  // Handle Plaid accounts (array format)
  if (Array.isArray(accounts)) {
    accounts.forEach((account) => {
      const accountId = account.account_id;
      const liveBalance = parseFloat(account.balance) || 0;
      projectedBalances[accountId] = calculateProjectedBalance(
        accountId,
        liveBalance,
        transactions
      );
    });
  } else {
    // Handle manual accounts (object format)
    Object.entries(accounts).forEach(([accountId, account]) => {
      const liveBalance = parseFloat(account.balance) || 0;
      projectedBalances[accountId] = calculateProjectedBalance(
        accountId,
        liveBalance,
        transactions
      );
    });
  }

  return projectedBalances;
};

/**
 * Calculate total projected balance across all accounts
 * @param {Object|Array} accounts - Accounts object/array
 * @param {Array} transactions - Array of manual transactions
 * @returns {number} - Total projected balance
 */
export const calculateTotalProjectedBalance = (accounts, transactions) => {
  const projectedBalances = calculateAllProjectedBalances(accounts, transactions);
  return Object.values(projectedBalances).reduce((sum, balance) => sum + balance, 0);
};

/**
 * Get the difference between projected and live balance
 * @param {number} projectedBalance - Projected balance
 * @param {number} liveBalance - Live balance
 * @returns {number} - Difference (positive means pending income, negative means pending expenses)
 */
export const getBalanceDifference = (projectedBalance, liveBalance) => {
  return projectedBalance - liveBalance;
};

/**
 * Format balance difference for display
 * @param {number} difference - Balance difference
 * @returns {string} - Formatted string with sign and description
 */
export const formatBalanceDifference = (difference) => {
  if (difference === 0) {
    return 'No pending transactions';
  }
  
  const absValue = Math.abs(difference);
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(absValue);
  
  if (difference > 0) {
    return `+${formatted} (pending income)`;
  } else {
    return `-${formatted} (pending expenses)`;
  }
};

