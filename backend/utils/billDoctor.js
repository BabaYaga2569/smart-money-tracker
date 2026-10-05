const DAY_MS = 24 * 60 * 60 * 1000;

const normalizeName = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();

const normalizeAmount = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
};

const normalizeDate = (value) => {
  if (!value) return null;

  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value?.toDate === 'function') {
    return value.toDate().toISOString().slice(0, 10);
  }

  if (typeof value?._seconds === 'number') {
    return new Date(value._seconds * 1000).toISOString().slice(0, 10);
  }

  return null;
};

const isPaidBill = (bill) =>
  bill?.isPaid === true || String(bill?.status || '').toLowerCase() === 'paid';

const isExpensePattern = (pattern) =>
  (pattern?.type || 'expense') === 'expense' &&
  (pattern?.status || 'active') === 'active';

const billOccurrenceKey = (bill) =>
  [
    normalizeName(bill?.name),
    normalizeAmount(bill?.amount ?? bill?.cost),
    normalizeDate(
      bill?.dueDate ||
      bill?.nextDueDate ||
      bill?.nextOccurrence ||
      bill?.originalDueDate
    ) || 'no-date'
  ].join('::');

const patternIdentityKey = (pattern) =>
  [
    normalizeName(pattern?.name),
    normalizeAmount(pattern?.amount ?? pattern?.cost),
    String(pattern?.frequency || pattern?.recurrence || 'monthly').toLowerCase()
  ].join('::');

const hasTransactionEvidence = (bill) => {
  if (bill?.linkedTransactionId) return true;
  if (bill?.transactionId) return true;
  if (Array.isArray(bill?.linkedTransactionIds) && bill.linkedTransactionIds.length > 0) return true;
  if (bill?.payment?.transactionId) return true;
  return false;
};

const compactBill = (bill) => ({
  id: bill.id,
  name: bill.name || bill.billName || 'Unnamed bill',
  amount: normalizeAmount(bill.amount ?? bill.cost),
  dueDate: normalizeDate(
    bill.dueDate ||
    bill.nextDueDate ||
    bill.nextOccurrence ||
    bill.originalDueDate
  ),
  status: bill.status || null,
  isPaid: bill.isPaid === true,
  recurringPatternId:
    bill.recurringPatternId ||
    bill.sourcePatternId ||
    bill.templateId ||
    bill.recurringTemplateId ||
    null,
  linkedTransaction: hasTransactionEvidence(bill),
  paidDate: normalizeDate(bill.paidDate || bill.lastPaidDate || bill.paymentDate)
});

const compactPattern = (pattern) => ({
  id: pattern.id,
  name: pattern.name || 'Unnamed pattern',
  amount: normalizeAmount(pattern.amount ?? pattern.cost),
  frequency: pattern.frequency || pattern.recurrence || 'monthly',
  nextOccurrence: normalizeDate(
    pattern.nextOccurrence ||
    pattern.nextDueDate ||
    pattern.dueDate
  ),
  status: pattern.status || 'active',
  type: pattern.type || 'expense',
  dataSource: pattern.dataSource || pattern.createdFrom || null
});

const findDuplicateGroups = (items, keyFn, mapper) => {
  const groups = new Map();

  for (const item of items) {
    const key = keyFn(item);
    if (!key || key.startsWith('::')) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(mapper(item));
  }

  return [...groups.values()].filter(group => group.length > 1);
};

const todayString = (now) => {
  const date = now instanceof Date ? now : new Date(now || Date.now());
  return date.toISOString().slice(0, 10);
};

export function analyzeBillStores(stores, now = new Date()) {
  const recurringPatterns = stores.recurringPatterns || [];
  const recurringItems = stores.recurringItems || [];
  const subscriptions = stores.subscriptions || [];
  const financialEvents = stores.financialEvents || [];
  const billInstances = stores.billInstances || [];
  const paidBills = stores.paidBills || [];
  const billPayments = stores.billPayments || [];
  const paymentRules = stores.paymentRules || [];
  const settingsBills = stores.settingsBills || [];
  const settingsRecurringItems = stores.settingsRecurringItems || [];

  const today = todayString(now);
  const financialBills = financialEvents.filter(event => event.type === 'bill');
  const patternIds = new Set(recurringPatterns.map(pattern => pattern.id).filter(Boolean));

  const activeExpensePatterns = recurringPatterns.filter(isExpensePattern);
  const unpaidFinancialBills = financialBills.filter(bill => !isPaidBill(bill));
  const paidFinancialBills = financialBills.filter(isPaidBill);

  const overdueFinancialBills = unpaidFinancialBills.filter(bill => {
    const dueDate = normalizeDate(
      bill.dueDate ||
      bill.nextDueDate ||
      bill.nextOccurrence ||
      bill.originalDueDate
    );
    return Boolean(dueDate && dueDate < today);
  });

  const linkedButUnpaid = unpaidFinancialBills.filter(hasTransactionEvidence);
  const paidStateConflicts = financialBills.filter(bill => {
    const status = String(bill.status || '').toLowerCase();
    return (
      (bill.isPaid === true && status && status !== 'paid') ||
      (bill.isPaid === false && status === 'paid')
    );
  });

  const orphanBillLinks = financialBills.filter(bill => {
    const patternId =
      bill.recurringPatternId ||
      bill.sourcePatternId ||
      bill.templateId ||
      bill.recurringTemplateId;

    return Boolean(patternId && !patternIds.has(patternId));
  });

  const unlinkedFinancialBills = financialBills.filter(bill => {
    const patternId =
      bill.recurringPatternId ||
      bill.sourcePatternId ||
      bill.templateId ||
      bill.recurringTemplateId;

    return !patternId;
  });

  const patternsWithoutOccurrences = activeExpensePatterns.filter(pattern =>
    !financialBills.some(bill => {
      const patternId =
        bill.recurringPatternId ||
        bill.sourcePatternId ||
        bill.templateId ||
        bill.recurringTemplateId;
      return patternId === pattern.id;
    })
  );

  const patternsWithoutOpenOccurrence = activeExpensePatterns.filter(pattern =>
    !unpaidFinancialBills.some(bill => {
      const patternId =
        bill.recurringPatternId ||
        bill.sourcePatternId ||
        bill.templateId ||
        bill.recurringTemplateId;
      return patternId === pattern.id;
    })
  );

  const duplicatePatterns = findDuplicateGroups(
    recurringPatterns,
    patternIdentityKey,
    compactPattern
  );

  const duplicateOccurrences = findDuplicateGroups(
    financialBills,
    billOccurrenceKey,
    compactBill
  );

  const legacyActiveRecordCount =
    recurringItems.length +
    billInstances.length +
    paidBills.length +
    billPayments.length +
    settingsBills.length +
    settingsRecurringItems.length;

  const issues = [];

  const pushIssue = (severity, code, title, description, items = []) => {
    issues.push({
      severity,
      code,
      title,
      description,
      count: items.length,
      items
    });
  };

  if (linkedButUnpaid.length > 0) {
    pushIssue(
      'critical',
      'LINKED_BUT_UNPAID',
      'Bills have payment evidence but are still unpaid',
      'These are prime candidates for the paid-but-still-lingering problem.',
      linkedButUnpaid.map(compactBill)
    );
  }

  if (paidStateConflicts.length > 0) {
    pushIssue(
      'critical',
      'PAID_STATE_CONFLICT',
      'Bill paid flags and status fields disagree',
      'A bill should never be simultaneously paid and pending/overdue, or unpaid and status=paid.',
      paidStateConflicts.map(compactBill)
    );
  }

  if (overdueFinancialBills.length > 0) {
    pushIssue(
      'high',
      'OVERDUE_OPEN_BILLS',
      'Unpaid bill occurrences are past due',
      'These may be legitimate unpaid bills or stale occurrences that never cleared.',
      overdueFinancialBills.map(compactBill)
    );
  }

  if (orphanBillLinks.length > 0) {
    pushIssue(
      'high',
      'ORPHAN_PATTERN_LINKS',
      'Bill occurrences point to missing recurring patterns',
      'These occurrences cannot reliably inherit or advance recurring rules.',
      orphanBillLinks.map(compactBill)
    );
  }

  if (duplicateOccurrences.length > 0) {
    pushIssue(
      'high',
      'DUPLICATE_OCCURRENCES',
      'Duplicate bill occurrences exist',
      'Same normalized name, amount, and due date appears more than once.',
      duplicateOccurrences.flat()
    );
  }

  if (duplicatePatterns.length > 0) {
    pushIssue(
      'medium',
      'DUPLICATE_PATTERNS',
      'Duplicate recurring patterns exist',
      'Same normalized name, amount, and frequency appears more than once.',
      duplicatePatterns.flat()
    );
  }

  if (patternsWithoutOccurrences.length > 0) {
    pushIssue(
      'medium',
      'PATTERN_WITHOUT_OCCURRENCE',
      'Active recurring patterns have no bill occurrence',
      'These templates exist but have never produced a financialEvents bill.',
      patternsWithoutOccurrences.map(compactPattern)
    );
  }

  if (patternsWithoutOpenOccurrence.length > 0) {
    pushIssue(
      'medium',
      'PATTERN_WITHOUT_OPEN_OCCURRENCE',
      'Active recurring patterns have no unpaid occurrence',
      'These templates may have stopped generating future bills.',
      patternsWithoutOpenOccurrence.map(compactPattern)
    );
  }

  if (unlinkedFinancialBills.length > 0) {
    pushIssue(
      'medium',
      'UNLINKED_BILLS',
      'Bill occurrences are not linked to a recurring pattern',
      'One-off bills can be valid, but recurring-looking records should have a pattern link.',
      unlinkedFinancialBills.map(compactBill)
    );
  }

  if (legacyActiveRecordCount > 0) {
    pushIssue(
      'medium',
      'LEGACY_STORES_POPULATED',
      'Legacy bill/recurring stores still contain data',
      'Old stores increase the chance that different pages disagree about what is due or paid.',
      []
    );
    issues[issues.length - 1].count = legacyActiveRecordCount;
  }

  const healthScore = Math.max(
    0,
    100 -
      issues.reduce((score, issue) => {
        const weights = {
          critical: 18,
          high: 10,
          medium: 5,
          low: 2
        };
        return score + (weights[issue.severity] || 0);
      }, 0)
  );

  return {
    generatedAt: new Date(now).toISOString(),
    healthScore,
    canonical: {
      recurringPatterns: {
        total: recurringPatterns.length,
        activeExpenses: activeExpensePatterns.length
      },
      financialEvents: {
        total: financialEvents.length,
        bills: financialBills.length,
        paidBills: paidFinancialBills.length,
        unpaidBills: unpaidFinancialBills.length,
        overdueBills: overdueFinancialBills.length
      },
      transactions: {
        paymentRules: paymentRules.length
      }
    },
    legacy: {
      recurringItemsCollection: recurringItems.length,
      settingsRecurringItems: settingsRecurringItems.length,
      billInstances: billInstances.length,
      settingsBills: settingsBills.length,
      paidBills: paidBills.length,
      billPayments: billPayments.length,
      subscriptions: subscriptions.length,
      totalLegacyRecords: legacyActiveRecordCount
    },
    issueCounts: {
      critical: issues.filter(issue => issue.severity === 'critical').length,
      high: issues.filter(issue => issue.severity === 'high').length,
      medium: issues.filter(issue => issue.severity === 'medium').length,
      low: issues.filter(issue => issue.severity === 'low').length
    },
    issues,
    samples: {
      recurringPatterns: recurringPatterns.slice(0, 100).map(compactPattern),
      financialBills: financialBills.slice(0, 150).map(compactBill)
    },
    readOnly: true
  };
}

export {
  normalizeName,
  normalizeAmount,
  normalizeDate,
  isPaidBill,
  billOccurrenceKey,
  patternIdentityKey,
  hasTransactionEvidence
};
