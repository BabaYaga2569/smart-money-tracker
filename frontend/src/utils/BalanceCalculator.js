/**
 * Calculate projected balance for a specific account
 * @param {string} accountId - The account ID or key
 * @param {number} liveBalance - Current balance from Plaid or manual entry
 * @param {Array} transactions - Array of all transactions (including pending)
 * @returns {number} - Projected balance
 */
export const calculateProjectedBalance = (accountId, liveBalance, transactions) => {
  if (!transactions || transactions.length === 0) {
    return liveBalance;
  }

  // Filter transactions for this account
  const accountTransactions = transactions.filter(
    (t) => t.account === accountId || t.account_id === accountId
  );

  // Calculate the sum of pending transaction adjustments
  const pendingAdjustments = accountTransactions.reduce((sum, transaction) => {
    // ✅ FIX: Check both boolean AND string 'true' for backward compatibility
    const isPending = (
      transaction.pending === true ||
      transaction.pending === 'true' ||
      transaction.status === 'pending'
    );
    
    if (isPending) {
      const amount = parseFloat(transaction.amount) || 0;
      // After PR #154, all transactions use accounting convention:
      // - Negative amount = Expense (decreases balance)
      // - Positive amount = Income (increases balance)
      // So we just add the amount directly (negative amounts will decrease the sum)
      return sum + amount;
    }
    return sum;
  }, 0);

  return liveBalance + pendingAdjustments;
};

// ✅ FIXED: Handles both boolean and string pending values for backward compatibility
export const calculateTotalProjectedBalance = (accounts, transactions) => {
  if (!accounts || !transactions) return 0;
  
  console.log('[BalanceCalculator] Starting calculation...');
  console.log('[BalanceCalculator] Accounts:', Array.isArray(accounts) ? accounts.length : Object.keys(accounts).length);
  console.log('[BalanceCalculator] Transactions:', transactions.length);
  
  // Calculate total live balance
  let liveTotal = 0;
  
  if (Array.isArray(accounts)) {
    liveTotal = accounts.reduce((sum, acc) => {
      return sum + (parseFloat(acc.balance) || 0);
    }, 0);
  } else {
    liveTotal = Object.values(accounts).reduce((sum, acc) => {
      return sum + (parseFloat(acc.balance) || 0);
    }, 0);
  }
  
  console.log('[BalanceCalculator] Live total:', liveTotal);
  
  // ✅ FIX: Get ALL pending transactions (handle both boolean AND string)
  const pendingTxs = transactions.filter(tx => 
    tx.pending === true || tx.pending === 'true'
  );
  
  console.log('[BalanceCalculator] Total pending transactions:', pendingTxs.length);
  
  // Calculate total pending amount using proper accounting convention
  // Negative amount = Expense (decreases balance)
  // Positive amount = Income (increases balance)
  const pendingTotal = pendingTxs.reduce((sum, tx) => {
    const amount = parseFloat(tx.amount) || 0;
    return sum + amount;
  }, 0);
  
  console.log('[BalanceCalculator] Total pending amount (with signs):', pendingTotal);
  
  const projectedTotal = liveTotal + pendingTotal;
  console.log('[BalanceCalculator] Projected total:', projectedTotal);
  
  return projectedTotal;
};

export const getBalanceDifference = (liveBalance, projectedBalance) => {
  const difference = projectedBalance - liveBalance;
  
  return {
    amount: Math.abs(difference),
    isPositive: difference > 0,
    hasDifference: Math.abs(difference) > 0.01
  };
};

export const formatBalanceDifference = (differenceObj) => {
  if (!differenceObj.hasDifference) return '';
  
  const sign = differenceObj.isPositive ? '+' : '-';
  return `${sign}${differenceObj.amount.toFixed(2)}`;
};
