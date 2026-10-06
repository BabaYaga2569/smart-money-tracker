const normalizeName = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const compactName = (value) => normalizeName(value).replace(/\s+/g, '');

const tokens = (value) =>
  normalizeName(value)
    .split(/\s+/)
    .filter(Boolean)
    .filter(token => !['the', 'and', 'for', 'payment', 'bill', 'card'].includes(token));

const money = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
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

const tokenSimilarity = (left, right) => {
  const a = new Set(tokens(left));
  const b = new Set(tokens(right));
  if (!a.size || !b.size) return 0;

  let intersection = 0;
  a.forEach(token => {
    if (b.has(token)) intersection += 1;
  });

  return (2 * intersection) / (a.size + b.size);
};

const isAffirm = (value) => normalizeName(value).includes('affirm');

const scheduleLabel = (proposal) => {
  const rule = proposal.scheduleRule || {};
  if (rule.kind === 'dayOfMonth') return `Monthly on day ${rule.day}`;
  if (rule.kind === 'quarterEndLastDay') return 'Quarterly on Mar/Jun/Sep/Dec month-end';
  if (rule.kind === 'preserveCurrent') return 'Keep existing schedule';
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
  category: item.category || null,
  institutionName:
    item.institutionName ||
    item.institution ||
    item.linkedInstitution ||
    item.accountInstitution ||
    null,
  linkedAccount: item.linkedAccount || item.accountId || null,
  variableAmount: Boolean(item.variableAmount),
  installmentPlan: Boolean(item.installmentPlan),
  remainingPayments: item.remainingPayments ?? null,
  remainingBalance: money(item.remainingBalance),
  endDate: item.endDate || null,
  finalPaymentAmount: money(item.finalPaymentAmount),
  customRecurrence: Boolean(item.customRecurrence),
  activeMonths: item.activeMonths || [],
});

const compactProposal = (proposal) => ({
  ...proposal,
  amount: money(proposal.amount),
  scheduleLabel: scheduleLabel(proposal),
});

const aliasExact = (currentName, target) => {
  const current = compactName(currentName);
  return (target.aliases || []).some(alias => compactName(alias) === current);
};

const nameEvidence = (currentName, target) => {
  const current = compactName(currentName);
  const proposed = compactName(target.name);

  if (current === proposed) return { score: 100, reason: 'exact-name' };
  if (aliasExact(currentName, target)) return { score: 95, reason: 'known-alias' };

  const similarity = tokenSimilarity(currentName, target.name);
  if (similarity >= 0.86) return { score: 70, reason: 'strong-name-similarity' };

  const currentNormalized = normalizeName(currentName);
  const targetNormalized = normalizeName(target.name);
  if (
    currentNormalized.length >= 8 &&
    targetNormalized.length >= 8 &&
    (currentNormalized.includes(targetNormalized) || targetNormalized.includes(currentNormalized))
  ) {
    return { score: 65, reason: 'name-contained' };
  }

  if (similarity >= 0.65) return { score: 45, reason: 'moderate-name-similarity' };
  return { score: 0, reason: null };
};

const scoreCandidate = (current, target) => {
  const name = nameEvidence(current.name, target);
  let score = name.score;
  const reasons = name.reason ? [name.reason] : [];

  const currentAmount = money(current.amount);
  const targetAmount = money(target.amount);
  const amountComparable = !target.variableAmount && targetAmount !== null && currentAmount !== null;
  const amountMatches = amountComparable && Math.abs(currentAmount - targetAmount) <= 0.01;

  if (amountMatches) {
    score += 20;
    reasons.push('amount');
  }

  const currentDay = dateDay(current.nextOccurrence);
  const targetDay = target.scheduleRule?.kind === 'dayOfMonth'
    ? target.scheduleRule.day
    : null;
  const dayMatches = currentDay && targetDay && currentDay === targetDay;

  if (dayMatches) {
    score += 15;
    reasons.push('due-day');
  }

  if (frequency(current.frequency) === frequency(target.frequency)) {
    score += 5;
    reasons.push('frequency');
  }

  const currentInstitution = compactName(current.institutionName);
  const targetInstitution = compactName(target.institutionName);
  if (currentInstitution && targetInstitution && currentInstitution === targetInstitution) {
    score += 5;
    reasons.push('institution');
  }

  // Distinct Affirm installment plans must not collapse just because the
  // merchant name contains "Affirm". Require strong name evidence, or both
  // amount and due-day evidence, before considering the candidate.
  if (isAffirm(current.name) || isAffirm(target.name)) {
    const strongAffirmIdentity =
      name.score >= 65 ||
      (amountMatches && dayMatches);

    if (!strongAffirmIdentity) {
      return { score: -1, reasons: ['affirm-identity-not-proven'] };
    }
  }

  return { score, reasons };
};

const bestMatchForTarget = (availableCurrent, target) => {
  const ranked = availableCurrent
    .map(current => ({
      current,
      ...scoreCandidate(current, target),
    }))
    .filter(candidate => candidate.score >= 0)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) return null;

  const best = ranked[0];
  const second = ranked[1];

  // Exact/known alias matches are safe. Fuzzy matches need corroboration and
  // must beat the runner-up by enough margin to avoid accidental merges.
  const hasStrongIdentity = best.reasons.includes('exact-name') || best.reasons.includes('known-alias');
  const hasCorroboration =
    best.reasons.includes('amount') ||
    best.reasons.includes('due-day') ||
    best.reasons.includes('institution');

  if (hasStrongIdentity && best.score >= 95) return best;

  if (best.score >= 80 && hasCorroboration) {
    if (!second || best.score - second.score >= 12) return best;
  }

  return null;
};

export function buildRecurringRebuildDryRun(currentPatterns, proposal, reviewItems = [], exclusions = []) {
  const current = (currentPatterns || []).map(compactCurrent);
  const proposed = (proposal || []).map(compactProposal);
  const usedCurrentIds = new Set();
  const results = [];

  proposed.forEach(target => {
    const availableCurrent = current.filter(item => !usedCurrentIds.has(item.id));
    const match = bestMatchForTarget(availableCurrent, target);
    const matched = match?.current || null;

    if (!matched) {
      results.push({
        action: 'add',
        current: null,
        proposed: target,
        matchReasons: [],
        changes: ['New recurring pattern'],
      });
      return;
    }

    usedCurrentIds.add(matched.id);
    const changes = [];

    if (!target.variableAmount) {
      const currentAmount = money(matched.amount);
      const targetAmount = money(target.amount);
      if (
        currentAmount !== null &&
        targetAmount !== null &&
        Math.abs(currentAmount - targetAmount) > 0.009
      ) {
        changes.push(
          `Amount: $${currentAmount.toFixed(2)} → $${targetAmount.toFixed(2)}`
        );
      }
    } else if (!matched.variableAmount) {
      changes.push('Amount mode: fixed → variable');
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

    if (
      target.customRecurrence &&
      (!matched.customRecurrence || !arraysEqual(matched.activeMonths, target.activeMonths))
    ) {
      changes.push(
        `Active months: ${matched.activeMonths?.length ? matched.activeMonths.join(',') : 'not configured'} → ${target.activeMonths.join(',')}`
      );
    }
    if (target.installmentPlan) {
      if (!matched.installmentPlan) {
        changes.push('Installment plan: not configured → finite plan');
      }

      if (target.nextOccurrence && matched.nextOccurrence !== target.nextOccurrence) {
        changes.push(
          `Next payment: ${matched.nextOccurrence || 'not configured'} → ${target.nextOccurrence}`
        );
      }

      if (Number(matched.remainingPayments) !== Number(target.remainingPayments)) {
        changes.push(
          `Payments left: ${matched.remainingPayments ?? 'not configured'} → ${target.remainingPayments}`
        );
      }

      if (matched.endDate !== target.endDate) {
        changes.push(
          `Final payment date: ${matched.endDate || 'not configured'} → ${target.endDate}`
        );
      }

      const matchedFinal = money(matched.finalPaymentAmount);
      const targetFinal = money(target.finalPaymentAmount);
      if (
        matchedFinal === null ||
        targetFinal === null ||
        Math.abs(matchedFinal - targetFinal) > 0.009
      ) {
        changes.push(
          `Final payment: ${matchedFinal === null ? 'not configured' : '
    if (normalizeName(matched.name) !== normalizeName(target.name)) {
      changes.push(`Canonical name: ${matched.name} → ${target.name}`);
    }

    results.push({
      action: changes.length ? 'update' : 'keep',
      current: matched,
      proposed: target,
      matchReasons: match?.reasons || [],
      changes,
    });
  });

  const unmatchedCurrent = current.filter(item => !usedCurrentIds.has(item.id));
  const preserve = unmatchedCurrent.filter(item => item.type !== 'expense');
  const unmatchedExpense = unmatchedCurrent.filter(item => item.type === 'expense');

  const confirmedRetireNames = new Set(
    (exclusions || [])
      .filter(item => /no longer|no longer active|no longer exists/i.test(item.reason || ''))
      .map(item => normalizeName(item.sourceName))
  );

  const retireCandidates = unmatchedExpense.filter(item =>
    confirmedRetireNames.has(normalizeName(item.name))
  );

  const unresolvedExpense = unmatchedExpense.filter(item =>
    !confirmedRetireNames.has(normalizeName(item.name))
  );

  const unmatchedReviews = unresolvedExpense.map(item => ({
    sourceName: item.name,
    amount: item.amount,
    reason: 'Existing expense pattern could not be matched confidently to the TEMPLATE proposal.',
    suggestedAction: 'Review before any retirement decision.',
    currentPattern: item,
  }));

  const allReviewItems = [...reviewItems, ...unmatchedReviews];

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
      unmatchedExisting: unresolvedExpense.length,
      confirmedRetire: retireCandidates.length,
      preserveNonExpense: preserve.length,
      needsReview: allReviewItems.length,
    },
    results,
    unmatchedExisting: unresolvedExpense,
    retireCandidates,
    preserveNonExpense: preserve,
    reviewItems: allReviewItems,
    exclusions,
    engineRequirements,
    safeToApply: engineRequirements.length === 0 && allReviewItems.length === 0,
  };
}
 + matchedFinal.toFixed(2)} → ${targetFinal.toFixed(2)}`
        );
      }

      const matchedBalance = money(matched.remainingBalance);
      const targetBalance = money(target.remainingBalance);
      if (
        matchedBalance === null ||
        targetBalance === null ||
        Math.abs(matchedBalance - targetBalance) > 0.009
      ) {
        changes.push(
          `Remaining balance: ${matchedBalance === null ? 'not configured' : '
    if (normalizeName(matched.name) !== normalizeName(target.name)) {
      changes.push(`Canonical name: ${matched.name} → ${target.name}`);
    }

    results.push({
      action: changes.length ? 'update' : 'keep',
      current: matched,
      proposed: target,
      matchReasons: match?.reasons || [],
      changes,
    });
  });

  const unmatchedCurrent = current.filter(item => !usedCurrentIds.has(item.id));
  const preserve = unmatchedCurrent.filter(item => item.type !== 'expense');
  const unmatchedExpense = unmatchedCurrent.filter(item => item.type === 'expense');

  const confirmedRetireNames = new Set(
    (exclusions || [])
      .filter(item => /no longer|no longer active|no longer exists/i.test(item.reason || ''))
      .map(item => normalizeName(item.sourceName))
  );

  const retireCandidates = unmatchedExpense.filter(item =>
    confirmedRetireNames.has(normalizeName(item.name))
  );

  const unresolvedExpense = unmatchedExpense.filter(item =>
    !confirmedRetireNames.has(normalizeName(item.name))
  );

  const unmatchedReviews = unresolvedExpense.map(item => ({
    sourceName: item.name,
    amount: item.amount,
    reason: 'Existing expense pattern could not be matched confidently to the TEMPLATE proposal.',
    suggestedAction: 'Review before any retirement decision.',
    currentPattern: item,
  }));

  const allReviewItems = [...reviewItems, ...unmatchedReviews];

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
      unmatchedExisting: unresolvedExpense.length,
      confirmedRetire: retireCandidates.length,
      preserveNonExpense: preserve.length,
      needsReview: allReviewItems.length,
    },
    results,
    unmatchedExisting: unresolvedExpense,
    retireCandidates,
    preserveNonExpense: preserve,
    reviewItems: allReviewItems,
    exclusions,
    engineRequirements,
    safeToApply: engineRequirements.length === 0 && allReviewItems.length === 0,
  };
}
 + matchedBalance.toFixed(2)} → ${targetBalance.toFixed(2)}`
        );
      }
    }


    if (normalizeName(matched.name) !== normalizeName(target.name)) {
      changes.push(`Canonical name: ${matched.name} → ${target.name}`);
    }

    results.push({
      action: changes.length ? 'update' : 'keep',
      current: matched,
      proposed: target,
      matchReasons: match?.reasons || [],
      changes,
    });
  });

  const unmatchedCurrent = current.filter(item => !usedCurrentIds.has(item.id));
  const preserve = unmatchedCurrent.filter(item => item.type !== 'expense');
  const unmatchedExpense = unmatchedCurrent.filter(item => item.type === 'expense');

  const confirmedRetireNames = new Set(
    (exclusions || [])
      .filter(item => /no longer|no longer active|no longer exists/i.test(item.reason || ''))
      .map(item => normalizeName(item.sourceName))
  );

  const retireCandidates = unmatchedExpense.filter(item =>
    confirmedRetireNames.has(normalizeName(item.name))
  );

  const unresolvedExpense = unmatchedExpense.filter(item =>
    !confirmedRetireNames.has(normalizeName(item.name))
  );

  const unmatchedReviews = unresolvedExpense.map(item => ({
    sourceName: item.name,
    amount: item.amount,
    reason: 'Existing expense pattern could not be matched confidently to the TEMPLATE proposal.',
    suggestedAction: 'Review before any retirement decision.',
    currentPattern: item,
  }));

  const allReviewItems = [...reviewItems, ...unmatchedReviews];

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
      unmatchedExisting: unresolvedExpense.length,
      confirmedRetire: retireCandidates.length,
      preserveNonExpense: preserve.length,
      needsReview: allReviewItems.length,
    },
    results,
    unmatchedExisting: unresolvedExpense,
    retireCandidates,
    preserveNonExpense: preserve,
    reviewItems: allReviewItems,
    exclusions,
    engineRequirements,
    safeToApply: engineRequirements.length === 0 && allReviewItems.length === 0,
  };
}
