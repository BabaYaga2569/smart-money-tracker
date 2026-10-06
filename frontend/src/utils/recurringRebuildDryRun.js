const normalizeName = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const money = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
};

const frequency = (value) =>
  String(value || 'monthly').toLowerCase().replace('yearly', 'annually');

const dateDay = (value) => {
  if (!value) return null;
  const text = typeof value === 'string'
    ? value.slice(0, 10)
    : typeof value?.toDate === 'function'
      ? value.toDate().toISOString().slice(0, 10)
      : null;
  if (!text) return null;
  const day = Number(text.slice(8, 10));
  return Number.isFinite(day) ? day : null;
};

const arraysEqual = (a = [], b = []) => {
  const left = [...a].map(Number).sort((x, y) => x - y);
  const right = [...b].map(Number).sort((x, y) => x - y);
  return left.length === right.length && left.every((value, index) => value === right[index]);
};

const scheduleLabel = (proposal) => {
  const rule = proposal.scheduleRule || {};
  if (rule.kind === 'dayOfMonth') return `Monthly on day ${rule.day}`;
  if (rule.kind === 'lastDayOfMonth') return 'Monthly on the last day of the month';
  if (rule.kind === 'quarterEndLastDay') return 'Quarterly on Mar/Jun/Sep/Dec month-end';
  return proposal.frequency || 'monthly';
};

const compactCurrent = (item) => ({
  id: item.id,
  name: item.name || 'Unnamed pattern',
  amount: money(item.amount ?? item.cost),
  frequency: frequency(item.frequency || item.recurrence),
  nextOccurrence: item.nextOccurrence || item.nextDueDate || item.dueDate || null,
  type: item.type || 'expense',
  status: item.status || 'active',
  customRecurrence: Boolean(item.customRecurrence),
  activeMonths: item.activeMonths || [],
});

const compactProposal = (proposal) => ({
  ...proposal,
  scheduleLabel: scheduleLabel(proposal),
});

export function buildRecurringRebuildDryRun(currentPatterns, proposal, reviewItems = [], exclusions = []) {
  const current = (currentPatterns || []).map(compactCurrent);
  const proposed = (proposal || []).map(compactProposal);

  const exactIndex = new Map();
  const aliasIndex = new Map();

  proposed.forEach((item, index) => {
    const exact = normalizeName(item.name);
    if (exact) exactIndex.set(exact, index);

    for (const alias of item.aliases || []) {
      const key = normalizeName(alias);
      if (!key) continue;
      if (!aliasIndex.has(key)) aliasIndex.set(key, []);
      aliasIndex.get(key).push(index);
    }
  });

  const usedCurrentIds = new Set();
  const results = [];

  proposed.forEach((target, proposalIndex) => {
    let matched = current.find(item =>
      !usedCurrentIds.has(item.id) &&
      normalizeName(item.name) === normalizeName(target.name)
    );

    if (!matched) {
      const possibleCurrent = current.filter(item => {
        if (usedCurrentIds.has(item.id)) return false;
        const indexes = aliasIndex.get(normalizeName(item.name)) || [];
        return indexes.length === 1 && indexes[0] === proposalIndex;
      });
      if (possibleCurrent.length === 1) matched = possibleCurrent[0];
    }

    if (!matched) {
      results.push({
        action: 'add',
        current: null,
        proposed: target,
        changes: ['New recurring pattern'],
      });
      return;
    }

    usedCurrentIds.add(matched.id);
    const changes = [];

    if (Math.abs(matched.amount - money(target.amount)) > 0.009) {
      changes.push(`Amount: $${matched.amount.toFixed(2)} → $${money(target.amount).toFixed(2)}`);
    }

    if (frequency(matched.frequency) !== frequency(target.frequency)) {
      changes.push(`Frequency: ${matched.frequency} → ${target.frequency}`);
    }

    if (target.scheduleRule?.kind === 'dayOfMonth') {
      const currentDay = dateDay(matched.nextOccurrence);
      if (currentDay && currentDay !== target.scheduleRule.day) {
        changes.push(`Due day: ${currentDay} → ${target.scheduleRule.day}`);
      }
    }

    if (target.customRecurrence &&
        (!matched.customRecurrence || !arraysEqual(matched.activeMonths, target.activeMonths))) {
      changes.push(
        `Active months: ${matched.activeMonths?.length ? matched.activeMonths.join(',') : 'not configured'} → ${target.activeMonths.join(',')}`
      );
    }

    results.push({
      action: changes.length ? 'update' : 'keep',
      current: matched,
      proposed: target,
      changes,
    });
  });

  const unmatchedCurrent = current.filter(item => !usedCurrentIds.has(item.id));
  const preserve = unmatchedCurrent.filter(item => item.type !== 'expense');
  const remove = unmatchedCurrent.filter(item => item.type === 'expense');

  const engineRequirements = [...new Set(
    proposed.map(item => item.engineRequirement).filter(Boolean)
  )];

  return {
    summary: {
      currentPatterns: current.length,
      proposedBills: proposed.length,
      keep: results.filter(item => item.action === 'keep').length,
      update: results.filter(item => item.action === 'update').length,
      add: results.filter(item => item.action === 'add').length,
      removeCandidates: remove.length,
      preserveNonExpense: preserve.length,
      needsReview: reviewItems.length,
    },
    results,
    removeCandidates: remove,
    preserveNonExpense: preserve,
    reviewItems,
    exclusions,
    engineRequirements,
    safeToApply: engineRequirements.length === 0 && reviewItems.length === 0,
  };
}
