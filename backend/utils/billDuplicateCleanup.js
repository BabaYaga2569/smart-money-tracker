import crypto from 'node:crypto';

const normalizeName = value =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const money = value => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(Math.abs(number) * 100) / 100 : null;
};

const dateOnly = bill =>
  String(
    bill?.dueDate ||
    bill?.nextDueDate ||
    bill?.nextOccurrence ||
    ''
  ).slice(0, 10);

const hasPaymentEvidence = bill =>
  Boolean(
    bill?.linkedTransactionId ||
    bill?.paymentRecordId ||
    bill?.paidDate ||
    Number(bill?.paidAmount || 0) !== 0 ||
    (Array.isArray(bill?.paymentHistory) && bill.paymentHistory.length > 0) ||
    bill?.isPaid ||
    bill?.status === 'paid'
  );

const stableValue = value => {
  if (value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = stableValue(value[key]);
      return out;
    }, {});
  }
  return value;
};

export const fingerprintBills = bills => {
  const normalized = [...bills]
    .map(bill => ({ id: bill.id, ...stableValue(bill) }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
};

const exactKey = bill => {
  const name = normalizeName(bill?.name);
  const amount = money(bill?.amount);
  const due = dateOnly(bill);
  if (!name || amount === null || !due) return null;
  return `${name}|${amount.toFixed(2)}|${due}`;
};

const scoreKeeper = bill => {
  const due = dateOnly(bill);
  const patternId = String(bill?.recurringPatternId || '');
  const deterministicId = patternId && due
    ? `bill_${patternId}_${due}`
    : null;

  let score = 0;
  const reasons = [];

  if (deterministicId && bill.id === deterministicId) {
    score += 100;
    reasons.push('deterministic-canonical-id');
  }

  if (String(bill?.createdFrom || '').startsWith('canonical-bill-engine')) {
    score += 50;
    reasons.push('canonical-engine-created');
  }

  if (bill?.recurringPatternId) {
    score += 20;
    reasons.push('linked-recurring-pattern');
  }

  if (Array.isArray(bill?.merchantNames) && bill.merchantNames.length > 0) {
    score += 5;
    reasons.push('merchant-aliases-present');
  }

  return { score, reasons };
};

const chooseKeeper = group => {
  const ranked = [...group]
    .map(bill => ({ bill, ...scoreKeeper(bill) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return String(a.bill.id).localeCompare(String(b.bill.id));
    });

  return ranked[0];
};

export const buildBillDuplicateCleanupPlan = bills => {
  const activeUnpaid = (bills || []).filter(bill =>
    bill?.type === 'bill' &&
    bill?.isPaid !== true &&
    bill?.hiddenFromBills !== true &&
    bill?.archivedDuplicate !== true
  );

  const groups = new Map();
  activeUnpaid.forEach(bill => {
    const key = exactKey(bill);
    if (!key) return;
    const list = groups.get(key) || [];
    list.push(bill);
    groups.set(key, list);
  });

  const duplicateGroups = [...groups.values()].filter(group => group.length > 1);

  const safeGroups = [];
  const reviewGroups = [];

  for (const group of duplicateGroups) {
    const recurringPatternIds = new Set(
      group.map(bill => bill?.recurringPatternId || null)
    );
    const dueDates = new Set(group.map(dateOnly));
    const paymentEvidence = group.some(hasPaymentEvidence);

    const safe =
      group.length === 2 &&
      recurringPatternIds.size === 1 &&
      !recurringPatternIds.has(null) &&
      dueDates.size === 1 &&
      !paymentEvidence;

    const keeper = chooseKeeper(group);
    const duplicateBills = group.filter(bill => bill.id !== keeper.bill.id);

    const entry = {
      name: group[0]?.name || 'Unnamed bill',
      amount: money(group[0]?.amount),
      dueDate: dateOnly(group[0]),
      recurringPatternId: group[0]?.recurringPatternId || null,
      keeperBillId: keeper.bill.id,
      keeperReasons: keeper.reasons,
      duplicateBillIds: duplicateBills.map(bill => bill.id),
      documents: group.map(bill => ({
        id: bill.id,
        createdFrom: bill.createdFrom || null,
        recurringPatternId: bill.recurringPatternId || null,
        linkedTransactionId: bill.linkedTransactionId || null,
        paymentRecordId: bill.paymentRecordId || null,
        paymentHistoryCount: Array.isArray(bill.paymentHistory)
          ? bill.paymentHistory.length
          : 0
      }))
    };

    if (safe) safeGroups.push(entry);
    else reviewGroups.push(entry);
  }

  return {
    safeGroups,
    reviewGroups,
    summary: {
      activeUnpaid: activeUnpaid.length,
      duplicateGroups: duplicateGroups.length,
      safeGroups: safeGroups.length,
      reviewGroups: reviewGroups.length,
      duplicatesToArchive: safeGroups.reduce(
        (sum, group) => sum + group.duplicateBillIds.length,
        0
      )
    },
    canApply: duplicateGroups.length > 0 && reviewGroups.length === 0
  };
};
