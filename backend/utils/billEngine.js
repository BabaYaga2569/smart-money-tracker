import { FieldValue } from 'firebase-admin/firestore';
import { runBillMatching } from './BillMatchingService.js';

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function billAmountForPattern(pattern) {
  if (pattern.variableAmount && (pattern.amount === null || pattern.amount === undefined)) {
    return null;
  }

  if (
    pattern.installmentPlan &&
    pattern.endDate &&
    pattern.nextOccurrence === String(pattern.endDate).slice(0, 10) &&
    Number.isFinite(Number(pattern.finalPaymentAmount))
  ) {
    return Math.abs(Number(pattern.finalPaymentAmount));
  }

  if (!Number.isFinite(Number(pattern.amount))) return null;
  return Math.abs(Number(pattern.amount));
}

function deterministicOccurrenceId(patternId, dueDate) {
  return `bill_${patternId}_${dueDate}`;
}

export async function ensureCurrentBillOccurrences({
  db,
  userId,
  patterns,
  unpaidBills,
  log = console
}) {
  const userRef = db.collection('users').doc(userId);
  const activePatterns = (patterns || []).filter(pattern =>
    pattern?.archived !== true &&
    pattern?.status !== 'ended' &&
    pattern?.status !== 'paused' &&
    (pattern?.type || 'expense') === 'expense' &&
    pattern?.nextOccurrence
  );

  const bills = [...(unpaidBills || [])];
  const existingKeys = new Set(
    bills
      .filter(bill => bill.recurringPatternId && bill.dueDate)
      .map(bill => `${bill.recurringPatternId}|${bill.dueDate}`)
  );

  const batch = db.batch();
  let writes = 0;
  let seeded = 0;
  let linked = 0;
  let skippedNoAmount = 0;

  for (const pattern of activePatterns) {
    const dueDate = String(pattern.nextOccurrence).slice(0, 10);
    const key = `${pattern.id}|${dueDate}`;
    if (existingKeys.has(key)) continue;

    const amount = billAmountForPattern(pattern);
    if (amount === null) {
      skippedNoAmount += 1;
      continue;
    }

    const safeLegacyCandidates = bills.filter(bill => {
      if (bill.recurringPatternId) return false;
      if (String(bill.dueDate || '').slice(0, 10) !== dueDate) return false;
      if (normalizeName(bill.name) !== normalizeName(pattern.name)) return false;
      const billAmount = Math.abs(Number(bill.amount));
      return Number.isFinite(billAmount) && Math.abs(billAmount - amount) <= 0.01;
    });

    if (safeLegacyCandidates.length === 1) {
      const legacy = safeLegacyCandidates[0];
      const ref = userRef.collection('financialEvents').doc(legacy.id);
      batch.set(ref, {
        recurringPatternId: pattern.id,
        recurrence: pattern.frequency || legacy.recurrence || 'monthly',
        merchantNames: pattern.merchantNames || legacy.merchantNames || [],
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });

      legacy.recurringPatternId = pattern.id;
      legacy.recurrence = pattern.frequency || legacy.recurrence || 'monthly';
      legacy.merchantNames = pattern.merchantNames || legacy.merchantNames || [];
      existingKeys.add(key);
      linked += 1;
      writes += 1;
      continue;
    }

    const id = deterministicOccurrenceId(pattern.id, dueDate);
    const ref = userRef.collection('financialEvents').doc(id);
    const bill = {
      id,
      type: 'bill',
      name: pattern.name,
      amount,
      dueDate,
      originalDueDate: dueDate,
      isPaid: false,
      status: 'pending',
      paidDate: null,
      paidAmount: null,
      linkedTransactionId: null,
      category: pattern.category || 'Bills & Utilities',
      recurrence: pattern.frequency || 'monthly',
      recurringPatternId: pattern.id,
      merchantNames: pattern.merchantNames || [],
      autoPayEnabled: pattern.autoPay || false,
      paymentHistory: [],
      notes: null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdFrom: 'canonical-bill-engine-seed'
    };

    batch.set(ref, bill, { merge: false });
    bills.push(bill);
    existingKeys.add(key);
    seeded += 1;
    writes += 1;
  }

  if (writes > 0) {
    await batch.commit();
    log?.info?.('[BILL_ENGINE] Ensured current recurring bill occurrences', {
      seeded,
      linked,
      skippedNoAmount
    });
  }

  return {
    bills,
    seeded,
    linked,
    skippedNoAmount
  };
}

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

  const [billsSnapshot, txSnapshot, patternsSnapshot] = await Promise.all([
    userRef
      .collection('financialEvents')
      .where('type', '==', 'bill')
      .where('isPaid', '==', false)
      .get(),
    userRef
      .collection('transactions')
      .where('date', '>=', isoDateDaysAgo(lookbackDays))
      .get(),
    userRef
      .collection('recurringPatterns')
      .get()
  ]);

  const initialUnpaidBills = billsSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  const patterns = patternsSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  const transactions = txSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));

  const occurrenceResult = await ensureCurrentBillOccurrences({
    db,
    userId,
    patterns,
    unpaidBills: initialUnpaidBills,
    log
  });

  const unpaidBills = occurrenceResult.bills;

  if (unpaidBills.length === 0 || transactions.length === 0) {
    return {
      success: true,
      cleared: 0,
      advanced: 0,
      generated: occurrenceResult.seeded,
      linked: occurrenceResult.linked,
      seeded: occurrenceResult.seeded,
      skippedNoAmount: occurrenceResult.skippedNoAmount,
      billsScanned: unpaidBills.length,
      transactionsScanned: transactions.length,
      patternsScanned: patterns.length
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
    seeded: occurrenceResult.seeded,
    linked: occurrenceResult.linked,
    skippedNoAmount: occurrenceResult.skippedNoAmount,
    billsScanned: unpaidBills.length,
    transactionsScanned: transactions.length,
    patternsScanned: patterns.length
  };
}

export default runCanonicalBillEngine;
