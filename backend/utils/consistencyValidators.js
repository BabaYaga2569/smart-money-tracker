/**
 * Data Consistency Validators
 * Validates data before writes to ensure consistency
 */

import logger from './logger.js';

/**
 * Validate account data before save
 * 
 * @param {Object} account - Account object to validate
 * @returns {boolean} True if valid
 * @throws {Error} If validation fails
 */
export function validateAccount(account) {
  const errors = [];
  
  if (!account.account_id) errors.push('Missing account_id');
  // Institution name is optional for some accounts
  if (typeof account.balances?.current !== 'number') errors.push('Invalid balance');
  
  if (errors.length > 0) {
    logger.error('VALIDATION', 'Account validation failed', null, { errors, account });
    throw new Error(`Account validation failed: ${errors.join(', ')}`);
  }
  
  return true;
}

/**
 * Validate transaction data before save
 * 
 * @param {Object} transaction - Transaction object to validate
 * @returns {boolean} True if valid
 * @throws {Error} If validation fails
 */
export function validateTransaction(transaction) {
  const errors = [];
  
  if (!transaction.transaction_id) errors.push('Missing transaction_id');
  if (!transaction.account_id) errors.push('Missing account_id');
  if (typeof transaction.amount !== 'number') errors.push('Invalid amount');
  if (!transaction.date) errors.push('Missing date');
  
  if (errors.length > 0) {
    logger.error('VALIDATION', 'Transaction validation failed', null, { errors, transaction });
    throw new Error(`Transaction validation failed: ${errors.join(', ')}`);
  }
  
  return true;
}

/**
 * Validate balance consistency
 * Checks if sum of account balances matches expected total
 * 
 * @param {Array} accounts - Array of account objects
 * @param {number} expectedTotal - Expected total balance
 * @returns {boolean} True if balances are consistent
 */
export function validateBalanceConsistency(accounts, expectedTotal) {
  const actualTotal = accounts.reduce((sum, acc) => sum + (acc.balances?.current || 0), 0);
  const difference = Math.abs(actualTotal - expectedTotal);
  
  if (difference > 0.01) { // Allow 1 cent rounding difference
    logger.warn('VALIDATION', 'Balance mismatch detected', {
      expectedTotal,
      actualTotal,
      difference,
      accountCount: accounts.length
    });
    return false;
  }
  
  return true;
}

/**
 * Check for duplicate transactions
 * Compares new transaction against existing transactions
 * 
 * @param {Object} newTransaction - New transaction to check
 * @param {Array} existingTransactions - Array of existing transactions
 * @returns {Object|null} Duplicate transaction if found, null otherwise
 */
export function checkDuplicateTransaction(newTransaction, existingTransactions) {
  const duplicate = existingTransactions.find(existing => 
    existing.transaction_id === newTransaction.transaction_id ||
    (existing.amount === newTransaction.amount &&
     existing.date === newTransaction.date &&
     existing.name === newTransaction.name)
  );
  
  if (duplicate) {
    logger.warn('VALIDATION', 'Duplicate transaction detected', {
      newTransaction: newTransaction.transaction_id,
      existingTransaction: duplicate.transaction_id
    });
    return duplicate;
  }
  
  return null;
}
