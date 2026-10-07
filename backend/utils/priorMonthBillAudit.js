import { matchTransactionsToBills } from './BillMatchingService.js';

const dateOnly = value => String(value || '').slice(0, 10);

const hasDirectPaymentEvidence = bill =>
  Boolean(
    bill?.linkedTransactionId ||
    bill?.paymentRecordId ||
    bill?.paidDate ||
    Number(bill?.paidAmount || 0) !== 0 ||
    (Array.isArray(bill?.paymentHistory) && bill.paymentHistory.length > 0) ||
    bill?.isPaid === true ||
    bill?.status === 'paid'
  );

const currentMonthStartYmd = referenceDate => {
  const [year, month] = String(referenceDate).slice(0, 10).split('-');
  return `${year}-${month}-01`;
};

const postedTransactions = transactions =>
  (transactions || []).filter(tx => tx && tx.pending !== true && tx.date);

const candidateMatchesForBill = (bill, transactions) => {
  const candidates = [];

  for (const tx of postedTransactions(transactions)) {
    const matches = matchTransactionsToBills([tx], [bill]);
    if (!matches.length) continue;

    const match = matches[0];
    candidates.push({
      transactionId: tx.id || tx.transaction_id || null,
      name: tx.name || tx.merchant_name || 'Unknown transaction',
      amount: Math.abs(Number(tx.amount) || 0),
      date: tx.date,
      confidence: match.confidence,
      criteria: match.matches
    });
  }

  return candidates.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return String(a.date).localeCompare(String(b.date));
  });
};

export const auditPriorMonthUnpaidBills = ({
  bills = [],
  transactions = [],
  recurringPatterns = [],
  referenceDate = new Date().toISOString().slice(0, 10)
} = {}) => {
  const currentMonthStart = currentMonthStartYmd(referenceDate);
  const patternsById = new Map(
    recurringPatterns.map(pattern => [pattern.id, pattern])
  );

  const staleBills = bills
    .filter(bill =>
      bill?.type === 'bill' &&
      bill?.isPaid !== true &&
      bill?.hiddenFromBills !== true &&
      bill?.archivedDuplicate !== true
    )
    .filter(bill => {
      const dueDate = dateOnly(bill.dueDate || bill.nextDueDate);
      return dueDate && dueDate < currentMonthStart;
    })
    .sort((a, b) =>
      dateOnly(a.dueDate || a.nextDueDate)
        .localeCompare(dateOnly(b.dueDate || b.nextDueDate))
    );

  const items = staleBills.map(bill => {
    const dueDate = dateOnly(bill.dueDate || bill.nextDueDate);
    const pattern = bill.recurringPatternId
      ? patternsById.get(bill.recurringPatternId)
      : null;
    const patternNext = dateOnly(pattern?.nextOccurrence);
    const directPaymentEvidence = hasDirectPaymentEvidence(bill);
    const transactionMatches = candidateMatchesForBill(bill, transactions);
    const bestMatch = transactionMatches[0] || null;
    const patternAdvanced = Boolean(patternNext && patternNext > dueDate);

    let classification = 'REVIEW_UNPAID';
    let recommendation = 'KEEP_OPEN';
    let reason = 'No posted matching transaction or direct payment evidence was found.';

    if (directPaymentEvidence) {
      classification = 'PAYMENT_EVIDENCE_ON_BILL';
      recommendation = 'REVIEW_PAYMENT_STATE';
      reason = 'The bill contains payment evidence even though it is still marked unpaid.';
    } else if (bestMatch) {
      classification = 'POSTED_MATCH_FOUND';
      recommendation = 'MATCH_REVIEW';
      reason = 'A posted bank transaction matches the old bill within the canonical matching rules.';
    } else if (patternAdvanced) {
      classification = 'LIKELY_STALE_ORPHAN';
      recommendation = 'ARCHIVE_REVIEW';
      reason = 'No payment match was found, but the linked recurring pattern has already advanced beyond this due date.';
    } else if (!pattern) {
      classification = 'UNLINKED_OLD_BILL';
      recommendation = 'MANUAL_REVIEW';
      reason = 'The old unpaid bill is not linked to a current recurring pattern.';
    }

    return {
      billId: bill.id,
      name: bill.name || 'Unnamed bill',
      amount: Math.abs(Number(bill.amount) || 0),
      dueDate,
      recurringPatternId: bill.recurringPatternId || null,
      recurringPatternName: pattern?.name || null,
      patternNextOccurrence: patternNext || null,
      patternStatus: pattern?.status || null,
      patternAdvanced,
      directPaymentEvidence,
      linkedTransactionId: bill.linkedTransactionId || null,
      paymentRecordId: bill.paymentRecordId || null,
      paymentHistoryCount: Array.isArray(bill.paymentHistory)
        ? bill.paymentHistory.length
        : 0,
      classification,
      recommendation,
      reason,
      bestMatch,
      candidateMatches: transactionMatches.slice(0, 3)
    };
  });

  const counts = items.reduce((out, item) => {
    out[item.recommendation] = (out[item.recommendation] || 0) + 1;
    return out;
  }, {});

  return {
    referenceDate,
    currentMonthStart,
    items,
    summary: {
      total: items.length,
      postedMatches: items.filter(item => item.classification === 'POSTED_MATCH_FOUND').length,
      likelyStale: items.filter(item => item.classification === 'LIKELY_STALE_ORPHAN').length,
      paymentStateReview: items.filter(item => item.classification === 'PAYMENT_EVIDENCE_ON_BILL').length,
      keepOpen: items.filter(item => item.recommendation === 'KEEP_OPEN').length,
      manualReview: items.filter(item => item.recommendation === 'MANUAL_REVIEW').length,
      byRecommendation: counts
    }
  };
};
