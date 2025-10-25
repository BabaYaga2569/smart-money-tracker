import { findMatchingTransactionForBill } from './billMatcher';
import { markBillAsPaid } from './billStorage';

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
      await markBillAsPaid(bill.id, match);
      updates.push({ billId: bill.id, txnId: match.id, amount: match.amount });
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