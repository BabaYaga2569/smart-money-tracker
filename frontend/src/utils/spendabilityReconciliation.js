const dateOnly = (value) => String(value || '').slice(0, 10);

export const getBillReserveAmount = (item) => {
  const expected = Number(item?.amount ?? item?.cost);
  const expectedAmount = Number.isFinite(expected) ? Math.abs(expected) : 0;

  if (item?.paymentReviewCandidate !== true) {
    return expectedAmount;
  }

  const reviewed = Number(item?.paymentReviewActualAmount);
  const reviewedAmount = Number.isFinite(reviewed) ? Math.abs(reviewed) : 0;

  // Until the user explicitly accepts the reviewed bank debit, reserve the
  // more conservative of the expected obligation and the detected debit.
  return Math.max(expectedAmount, reviewedAmount);
};

const amountOf = (item) => getBillReserveAmount(item);

export function buildSpendabilityReconciliation({
  recurringPatterns = [],
  currentCycleBills = [],
  reservedBills = [],
  pendingPaymentBills = [],
  reviewCandidateBills = [],
  todayStr,
  cycleEndStr,
  totalAvailable = 0,
  safeToSpend = 0
} = {}) {
  const activePatterns = recurringPatterns.filter(pattern =>
    pattern?.archived !== true &&
    pattern?.status !== 'ended' &&
    pattern?.status !== 'paused' &&
    (pattern?.type || 'expense') === 'expense' &&
    dateOnly(pattern?.nextOccurrence)
  );

  const expectedPatterns = activePatterns.filter(pattern => {
    const due = dateOnly(pattern.nextOccurrence);
    return due && due <= cycleEndStr;
  });

  const occurrenceKeys = new Set(
    currentCycleBills
      .filter(bill => bill?.recurringPatternId && dateOnly(bill?.dueDate || bill?.nextDueDate))
      .map(bill => `${bill.recurringPatternId}|${dateOnly(bill.dueDate || bill.nextDueDate)}`)
  );

  const missingOccurrences = expectedPatterns
    .filter(pattern => {
      const due = dateOnly(pattern.nextOccurrence);
      return !occurrenceKeys.has(`${pattern.id}|${due}`);
    })
    .map(pattern => ({
      id: pattern.id,
      name: pattern.name || 'Unnamed recurring item',
      dueDate: dateOnly(pattern.nextOccurrence),
      amount: Number.isFinite(Number(pattern.amount))
        ? Math.abs(Number(pattern.amount))
        : null,
      variableAmount: pattern.variableAmount === true,
      category: pattern.category || 'Bills & Utilities'
    }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const unlinkedOccurrences = currentCycleBills
    .filter(bill => !bill?.recurringPatternId)
    .map(bill => ({
      id: bill.id,
      name: bill.name || 'Unnamed bill',
      dueDate: dateOnly(bill.dueDate || bill.nextDueDate),
      amount: amountOf(bill),
      pendingPayment: bill.pendingPayment === true
    }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const reservedTotal = reservedBills.reduce((sum, bill) => sum + amountOf(bill), 0);
  const pendingExcludedTotal = pendingPaymentBills.reduce((sum, bill) => sum + amountOf(bill), 0);
  const reviewReservedTotal = reviewCandidateBills.reduce((sum, bill) => sum + amountOf(bill), 0);

  return {
    todayStr,
    cycleEndStr,
    totalAvailable: Number(totalAvailable) || 0,
    reservedTotal,
    pendingExcludedTotal,
    reviewReservedTotal,
    safeToSpend: Number(safeToSpend) || 0,
    reservedCount: reservedBills.length,
    pendingExcludedCount: pendingPaymentBills.length,
    reviewReservedCount: reviewCandidateBills.length,
    expectedPatternCount: expectedPatterns.length,
    missingOccurrences,
    unlinkedOccurrences,
    equation: {
      startingBalance: Number(totalAvailable) || 0,
      reservedBills: reservedTotal,
      result: Number(safeToSpend) || 0
    }
  };
}
