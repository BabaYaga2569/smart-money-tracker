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

/**
 * Simulate a transaction for testing auto-payment functionality.
 */
async function simulateTransaction(transactionData) {
  console.log('🧪 Simulating Plaid transaction:', transactionData);
  // This is a mock for testing - in production this would be a real Plaid transaction
  return {
    id: `sim_${Date.now()}`,
    ...transactionData,
    date: transactionData.date || new Date().toISOString().split('T')[0]
  };
}

// Export as PlaidIntegrationManager object for compatibility with existing imports
export const PlaidIntegrationManager = {
  autoMarkPaidBills,
  fetchRecentTransactionsFromPlaid,
  simulateTransaction
};