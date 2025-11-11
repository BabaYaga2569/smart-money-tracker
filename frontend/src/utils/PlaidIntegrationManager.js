import { findMatchingTransactionForBill } from './billMatcher';
import { RecurringBillManager } from './RecurringBillManager';

/**
 * Handles checking Plaid transactions against your bill list.
 * If a transaction matches an unpaid bill (by name, amount, and date window),
 * it automatically marks that bill as paid.
 */
export async function autoMarkPaidBills(bills, transactions) {
  if (!Array.isArray(bills) || !Array.isArray(transactions)) return [];

  const updates = [];
  for (const bill of bills) {
    if (bill.status === 'paid') continue;

    const match = findMatchingTransactionForBill(bill, transactions);
    if (match) {
      const updatedBill = RecurringBillManager.markBillAsPaid(bill, new Date(match.date), {
        source: 'plaid',
        transactionId: match.id,
        method: 'auto',
        accountId: match.accountId
      });
      updates.push({ billId: bill.id, txnId: match.id, amount: match.amount, updatedBill });
      console.log(`✅ Auto-marked ${bill.name} as paid via ${match.name}`);
    }
  }
  return updates;
}

/**
 * Mock fetch from Plaid — replace with real API calls when live.
 */
export async function fetchRecentTransactionsFromPlaid(userId) {
  console.log(`🔗 Fetching recent transactions for user ${userId}...`);
  // In production, you'd call your Plaid API proxy here.
  return [];
}

export const PlaidIntegrationManager = {
  autoMarkPaidBills,
  fetchRecentTransactionsFromPlaid,
  
  /**
   * Simulate a Plaid transaction for testing auto-payment
   * @param {Object} transactionData - The transaction to simulate
   * @param {number} transactionData.amount - Transaction amount
   * @param {string} transactionData.merchantName - Merchant name
   * @param {string} transactionData.date - Transaction date (YYYY-MM-DD)
   */
  simulateTransaction: async (transactionData) => {
    console.log('🧪 Simulating Plaid transaction:', transactionData);
    
    // In a real implementation, this would create a mock transaction
    // that matches against bills and triggers auto-payment
    const mockTransaction = {
      id: `sim_${Date.now()}`,
      name: transactionData.merchantName,
      amount: -Math.abs(transactionData.amount),
      date: transactionData.date,
      accountId: 'test_account',
      pending: false
    };
    
    console.log('✅ Mock transaction created:', mockTransaction);
    return mockTransaction;
  }
};