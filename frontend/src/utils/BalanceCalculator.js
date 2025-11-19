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
    // ✅ IMPROVED FIX: More reliable pending detection with stale data prevention
    
    // Explicit false or posted/cleared status means definitely not pending
    if (transaction.pending === false || 
        transaction.status === 'posted' || 
        transaction.status === 'cleared') {
      return sum;
    }
    
    // Check if transaction is marked as pending
    const hasPendingFlag = (
      transaction.pending === true ||
      transaction.pending === 'true' ||
      transaction.status === 'pending'
    );
    
    if (!hasPendingFlag) {
      return sum; // No pending indicator
    }
    
    // Additional validation: check transaction age to detect stale pending flags
    const txDate = new Date(transaction.date);
    const now = new Date();
    const daysSinceTransaction = (now - txDate) / (1000 * 60 * 60 * 24);
    
    // If transaction is marked pending but is older than 5 days, it's likely stale data
    if (daysSinceTransaction > 5) {
      console.warn(`⚠️ [BalanceCalculator] Stale pending transaction detected (${daysSinceTransaction.toFixed(1)} days old):`, {
        merchant: transaction.merchant_name || transaction.name,
        date: transaction.date,
        amount: transaction.amount,
        account_id: transaction.account_id
      });
      return sum;
    }
    
    // Transaction is truly pending
    const amount = parseFloat(transaction.amount) || 0;
    
    console.log(`[BalanceCalculator] Pending transaction found:`, {
      merchant: transaction.merchant_name || transaction.name,
      amount: amount,
      date: transaction.date,
      pending: transaction.pending,
      status: transaction.status,
      account_id: transaction.account_id
    });
    
    // After PR #154, all transactions use accounting convention:
    // - Negative amount = Expense (decreases balance)
    // - Positive amount = Income (increases balance)
    // So we just add the amount directly (negative amounts will decrease the sum)
    return sum + amount;
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
  
  // ✅ IMPROVED FIX: Get ALL truly pending transactions with better validation
  const pendingTxs = transactions.filter(tx => {
    // Explicit false or posted/cleared status means definitely not pending
    if (tx.pending === false || 
        tx.status === 'posted' || 
        tx.status === 'cleared') {
      return false;
    }
    
    // Check if transaction is marked as pending
    const hasPendingFlag = (
      tx.pending === true ||
      tx.pending === 'true' ||
      tx.status === 'pending'
    );
    
    if (!hasPendingFlag) {
      return false; // No pending indicator
    }
    
    // Additional validation: check transaction age to detect stale pending flags
    const txDate = new Date(tx.date);
    const now = new Date();
    const daysSinceTransaction = (now - txDate) / (1000 * 60 * 60 * 24);
    
    // If transaction is marked pending but is older than 5 days, it's likely stale data
    if (daysSinceTransaction > 5) {
      console.warn(`⚠️ [BalanceCalculator] Stale pending transaction detected (${daysSinceTransaction.toFixed(1)} days old):`, {
        merchant: tx.merchant_name || tx.name,
        date: tx.date,
        amount: tx.amount
      });
      return false;
    }
    
    return true; // Transaction is truly pending
  });
  
  console.log('[BalanceCalculator] Total pending transactions:', pendingTxs.length);
  
  // Log each pending transaction for debugging
  pendingTxs.forEach(tx => {
    console.log(`[BalanceCalculator] Pending transaction found:`, {
      merchant: tx.merchant_name || tx.name,
      amount: parseFloat(tx.amount) || 0,
      date: tx.date,
      pending: tx.pending,
      status: tx.status,
      account_id: tx.account_id
    });
  });
  
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
