import { runBillMatching } from './BillMatchingService.js';

function isoDateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().split('T')[0];
}

/**
 * Canonical post-sync bill pipeline.
 *
 * Every transaction ingestion path (manual sync, Plaid webhook, future jobs)
 * should call this function instead of implementing its own bill-clearing flow.
 */
export async function runCanonicalBillEngine({
  db,
  userId,
  lookbackDays = 60,
  matcher = runBillMatching,
  log = console
}) {
  if (!db) throw new Error('db is required');
  if (!userId) throw new Error('userId is required');

  const userRef = db.collection('users').doc(userId);

  const [billsSnapshot, txSnapshot] = await Promise.all([
    userRef
      .collection('financialEvents')
      .where('type', '==', 'bill')
      .where('isPaid', '==', false)
      .get(),
    userRef
      .collection('transactions')
      .where('date', '>=', isoDateDaysAgo(lookbackDays))
      .get()
  ]);

  const unpaidBills = billsSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  const transactions = txSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  if (unpaidBills.length === 0 || transactions.length === 0) {
    return {
      success: true,
      cleared: 0,
      advanced: 0,
      generated: 0,
      billsScanned: unpaidBills.length,
      transactionsScanned: transactions.length
    };
  }

  const result = await matcher(db, userId, transactions, unpaidBills);

  if (!result?.success) {
    const message = result?.error || 'Bill engine failed';
    log?.error?.('[BILL_ENGINE] Canonical bill engine failed', new Error(message));
    return {
      success: false,
      error: message,
      cleared: result?.cleared || 0,
      advanced: result?.advanced || 0,
      generated: result?.generated || 0,
      billsScanned: unpaidBills.length,
      transactionsScanned: transactions.length
    };
  }

  return {
    ...result,
    billsScanned: unpaidBills.length,
    transactionsScanned: transactions.length
  };
}

export default runCanonicalBillEngine;
