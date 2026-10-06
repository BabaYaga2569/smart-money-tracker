import crypto from 'node:crypto';

export const RECURRING_REBUILD_VERSION = '2026-10-06-v1';

export const RECURRING_REBUILD_SOURCE = {
  spreadsheet: 'Our Monthly Bills 3.0',
  sheet: 'TEMPLATE',
  capturedAt: '2026-10-06'
};

const monthly = (name, amount, day, institutionName = null, extra = {}) => ({
  name,
  amount,
  type: 'expense',
  frequency: 'monthly',
  status: 'active',
  institutionName,
  scheduleRule: { kind: 'dayOfMonth', day },
  ...extra
});

const preserveSchedule = (name, amount, extra = {}) => ({
  name,
  amount,
  type: 'expense',
  frequency: 'monthly',
  status: 'active',
  scheduleRule: { kind: 'preserveCurrent' },
  ...extra
});

export const RECURRING_REBUILD_PROPOSAL = [
  monthly('Charger Payment', 571.32, 1, 'Bank of America'),
  monthly('Affirm Smoker', 55.25, 3, null, { aliases: ['tractor supply', 'Tractor Supply'], installmentPlan: true, remainingPayments: 8, remainingBalance: 418.01, nextOccurrence: '2026-11-03', endDate: '2027-06-03', finalPaymentAmount: 31.26, scheduleNote: 'Affirm installment plan; final scheduled payment Jun 3, 2027.' }),
  monthly('Dodge Challenger Tracker', 8.95, 3, null, { aliases: ['Challenger Tracker'] }),
  monthly('Starlink Internet', 55.00, 4, 'SoFi', { aliases: ['Starlink'], amountNote: 'Current rate is $55/month; prior $35 rate was a three-month promotion.' }),
  monthly('Pierce Prime Platinum Movies', 37.45, 6, null, { aliases: ['Pierceprime', 'Pierce Prime'] }),
  monthly('Affirm Dog Water Bowl and Vacuum', 21.21, 7, 'Capital One', { aliases: ['Amazon'], installmentPlan: true, remainingPayments: 2, remainingBalance: 42.39, nextOccurrence: '2026-10-07', endDate: '2026-11-07', finalPaymentAmount: 21.18, scheduleNote: 'Affirm installment plan; final scheduled payment Nov 7, 2026.' }),
  monthly('Geico SXS', 31.42, 8, 'Bank of America'),
  monthly('LAS VEGAS VALLEY Water Bill', 26.30, 8, 'SoFi', { aliases: ['Valley', 'Las Vegas Valley Water District'] }),
  monthly('Barclay Card', 30.00, 9, 'Capital One', { aliases: ['Barclays'] }),
  monthly('Geico For all cars kids included', 496.94, 10, null, { aliases: ['Geico Charger Durango', 'Geico Charger Durango Challenger', 'Geico Charger Durango and Challenger', 'Geico Charger, Durango, and Challenger'] }),
  monthly('Walmart Card', null, 10, null, { variableAmount: true, amountNote: 'Amount is set month-to-month based on actual card usage.' }),
  monthly('Affirm Vevor Meat Slicer', 35.83, 10, null, { aliases: ['VEVOR'], installmentPlan: true, remainingPayments: 1, remainingBalance: 35.83, nextOccurrence: '2026-10-10', endDate: '2026-10-10', finalPaymentAmount: 35.83, scheduleNote: 'Affirm installment plan; final scheduled payment Oct 10, 2026.' }),
  monthly('Clean Freak Car Wash Subscription', 27.00, 11, null, { aliases: ['Clean Freak Car Wash'] }),
  monthly('CVS Membership', 5.00, 12, null, { aliases: ['CVS Pharmacy', 'CVS ExtraCare'] }),
  monthly('Affirm Tancis Shopping', 27.32, 14, null, { aliases: ['Walmart Affirm', 'Walmart Affirm Virtual Card'], installmentPlan: true, remainingPayments: 4, remainingBalance: 108.05, nextOccurrence: '2026-10-14', endDate: '2027-01-14', finalPaymentAmount: 26.09, scheduleNote: 'Affirm installment plan; final scheduled payment Jan 14, 2027.' }),
  monthly('Rent - Raylene (15th)', 350.00, 15, 'Capital One', { aliases: ['Zelle to Raylene', 'Rent (mid-month)', 'Rent mid month'] }),
  monthly('Side X Side America 1st Credit Union', 295.36, 15, 'Bank of America', { aliases: ['AMERICA FIRST CU LOAN Bill Payment', 'America First Credit Union loan payment'] }),
  monthly('Dodge Ram Tracker', 8.95, 15, null),
  monthly('CHRYSLER CAPITAL Durango Payment', 618.00, 15, 'USAA', { aliases: ['Chrysler Capital'] }),
  monthly('Season Tickets Rams', 601.00, 15, 'USAA', { aliases: ['The Los Angeles Rams', 'Los Angeles Rams', 'Rams Season Tickets'], customRecurrence: true, activeMonths: [1,2,3,4,5,6,7,8,11,12], scheduleNote: '10 monthly payments; skip September and October' }),
  monthly('Care Credit', 50.00, 15, null),
  monthly('Citi Card - Costco Card', 200.00, 16, 'Bank of America', { aliases: ['CITI CARD ONLINE'] }),
  monthly('Peacock / Apple Pay', 12.99, 17, null, { aliases: ['Peacock'] }),
  monthly('Clean Freak Tancis Car', 27.00, 17, null, { aliases: ['Clean Freak Car Wash'] }),
  monthly('Disney Plus / Apple Pay', 18.99, 19, null, { aliases: ['Disney Plus'] }),
  monthly('Affirm Buffet setup and Network Switch', 32.46, 19, null, { aliases: ['Amazon'], installmentPlan: true, remainingPayments: 2, remainingBalance: 64.91, nextOccurrence: '2026-10-19', endDate: '2026-11-19', finalPaymentAmount: 32.45, scheduleNote: 'Affirm installment plan; final scheduled payment Nov 19, 2026.' }),
  monthly('Sirius Bubba', 12.99, 19, null, { aliases: ['SiriusXM'] }),
  monthly('Courtneys BofA Credit Card', 200.00, 20, null),
  monthly('T-Mobile Cell Phone Bill', 485.26, 21, null, { aliases: ['T-Mobile'] }),
  monthly('Family Apple Music / Apple Pay', 19.99, 21, null, { aliases: ['Family Apple Music', 'Apple Music'] }),
  monthly('Optimum Cell Phone', 15.64, 25, 'Bank of America', { aliases: ['Optimum', 'Optimum Mobile'] }),
  preserveSchedule('Plaid Technologies Inc', 6.26, { aliases: ['Plaid Technologies', 'Plaid'], scheduleNote: 'Keep the existing recurring schedule; only the subscription identity is confirmed.' }),
  monthly('NV Energy', 177.00, 26, 'Bank of America'),
  monthly('GitHub Subscription', 10.00, 26, null, { aliases: ['GitHub'] }),
  monthly('Apple iCloud Plus / Apple Pay', 10.99, 28, null, { aliases: ['Apple iCloud', 'iCloud'] }),
  monthly('Claude AI Subscription', 20.00, 28, null, { aliases: ['Anthropic', 'Claude'] }),
  monthly('Blink Camera', 11.99, 29, null, { aliases: ['Amazon Blink', 'Blink'] }),
  monthly('Southwest Gas', 36.62, 29, null),
  monthly('Google One Storage', 19.99, 30, null, { aliases: ['Google One'] }),
  monthly('Bankruptcy Payment', 1390.99, 30, null),
  monthly('Rent - Raylene (30th)', 350.00, 30, 'Capital One', { aliases: ['Zelle to Raylene', 'Rent (end of month)', 'Rent end of month'], scheduleNote: 'Second partial rent payment; fixed on the 30th.' }),
  {
    name: 'Republic Services',
    amount: 59.19,
    type: 'expense',
    frequency: 'quarterly',
    status: 'active',
    institutionName: 'Bank of America',
    aliases: ['Republic Services'],
    scheduleRule: { kind: 'quarterEndLastDay', months: [3,6,9,12] },
    scheduleNote: 'Quarterly trash service; Mar/Jun/Sep/Dec month-end'
  }
];

export const RECURRING_REBUILD_RETIRE = [
  { names: ['Optimum Internet'], reason: 'Internet service is no longer active.' },
  { names: ['AfterPay'], reason: 'Recurring expense no longer exists.' },
  { names: ['Adobe'], reason: 'Recurring expense no longer exists.' }
];

const normalizeName = value =>
  String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const compactName = value => normalizeName(value).replace(/\s+/g, '');

const tokens = value =>
  normalizeName(value)
    .split(/\s+/)
    .filter(Boolean)
    .filter(token => !['the', 'and', 'for', 'payment', 'bill', 'card'].includes(token));

const tokenSimilarity = (left, right) => {
  const a = new Set(tokens(left));
  const b = new Set(tokens(right));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  a.forEach(token => { if (b.has(token)) intersection += 1; });
  return (2 * intersection) / (a.size + b.size);
};

const money = value => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
};

const dateOnly = value => {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  if (typeof value?.toDate === 'function') return value.toDate().toISOString().slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return null;
};

const dateDay = value => {
  const date = dateOnly(value);
  return date ? Number(date.slice(8, 10)) : null;
};

const isAffirm = value => normalizeName(value).includes('affirm');

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

  const a = normalizeName(currentName);
  const b = normalizeName(target.name);
  if (a.length >= 8 && b.length >= 8 && (a.includes(b) || b.includes(a))) {
    return { score: 65, reason: 'name-contained' };
  }
  if (similarity >= 0.65) return { score: 45, reason: 'moderate-name-similarity' };
  return { score: 0, reason: null };
};

const scoreCandidate = (current, target) => {
  const name = nameEvidence(current.name, target);
  let score = name.score;
  const reasons = name.reason ? [name.reason] : [];

  const currentAmount = money(current.amount ?? current.cost);
  const targetAmount = money(target.amount);
  const amountComparable = !target.variableAmount && currentAmount !== null && targetAmount !== null;
  const amountMatches = amountComparable && Math.abs(currentAmount - targetAmount) <= 0.01;
  if (amountMatches) { score += 20; reasons.push('amount'); }

  const targetDay = target.scheduleRule?.kind === 'dayOfMonth' ? Number(target.scheduleRule.day) : null;
  const currentDay = dateDay(current.nextOccurrence || current.nextDueDate || current.dueDate);
  const dayMatches = Boolean(currentDay && targetDay && currentDay === targetDay);
  if (dayMatches) { score += 15; reasons.push('due-day'); }

  if (String(current.frequency || current.recurrence || 'monthly').toLowerCase() === target.frequency) {
    score += 5;
    reasons.push('frequency');
  }

  if (isAffirm(current.name) || isAffirm(target.name)) {
    if (!(name.score >= 65 || (amountMatches && dayMatches))) {
      return { score: -1, reasons: ['affirm-identity-not-proven'] };
    }
  }

  return { score, reasons };
};

const bestMatchForTarget = (available, target) => {
  const ranked = available
    .map(current => ({ current, ...scoreCandidate(current, target) }))
    .filter(candidate => candidate.score >= 0)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) return null;
  const best = ranked[0];
  const second = ranked[1];
  const strongIdentity = best.reasons.includes('exact-name') || best.reasons.includes('known-alias');
  const corroborated = best.reasons.includes('amount') || best.reasons.includes('due-day');

  if (strongIdentity && best.score >= 95) return best;
  if (best.score >= 80 && corroborated && (!second || best.score - second.score >= 12)) return best;
  return null;
};

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

export const fingerprintRecurringPatterns = patterns => {
  const normalized = [...patterns]
    .map(pattern => ({ id: pattern.id, ...stableValue(pattern) }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
};

const parseYmd = value => {
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

const formatYmd = date => date.toISOString().slice(0, 10);

const lastDayUtc = (year, monthIndex) =>
  new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

const nextScheduledOccurrence = (target, referenceDate, existing = null) => {
  if (target.nextOccurrence) {
    return target.nextOccurrence;
  }

  if (target.scheduleRule?.kind === 'preserveCurrent') {
    return dateOnly(existing?.nextOccurrence || existing?.nextDueDate || existing?.dueDate);
  }

  const ref = parseYmd(referenceDate);
  const year = ref.getUTCFullYear();
  const month = ref.getUTCMonth();
  const day = ref.getUTCDate();

  if (target.scheduleRule?.kind === 'quarterEndLastDay') {
    const quarterMonths = [2, 5, 8, 11];
    for (let offset = 0; offset < 18; offset += 1) {
      const candidateMonth = month + offset;
      const cy = year + Math.floor(candidateMonth / 12);
      const cm = ((candidateMonth % 12) + 12) % 12;
      if (!quarterMonths.includes(cm)) continue;
      const cd = lastDayUtc(cy, cm);
      const candidate = new Date(Date.UTC(cy, cm, cd));
      if (candidate >= ref) return formatYmd(candidate);
    }
  }

  const preferredDay = Number(target.scheduleRule?.day || 1);
  const activeMonths = Array.isArray(target.activeMonths) ? target.activeMonths.map(Number) : [];

  for (let offset = 0; offset < 36; offset += 1) {
    const candidateMonth = month + offset;
    const cy = year + Math.floor(candidateMonth / 12);
    const cm = ((candidateMonth % 12) + 12) % 12;
    if (activeMonths.length && !activeMonths.includes(cm + 1)) continue;
    const cd = Math.min(preferredDay, lastDayUtc(cy, cm));
    if (offset === 0 && cd < day) continue;
    return formatYmd(new Date(Date.UTC(cy, cm, cd)));
  }

  return null;
};

const slug = value =>
  normalizeName(value)
    .replace(/\s+/g, '_')
    .slice(0, 90) || 'recurring';

const retirementFor = item =>
  RECURRING_REBUILD_RETIRE.find(entry =>
    entry.names.some(name => normalizeName(name) === normalizeName(item.name))
  );

const comparableCurrent = patterns =>
  patterns.filter(pattern => pattern?.archived !== true);

export const buildRecurringRebuildPlan = (patterns, referenceDate = new Date().toISOString().slice(0, 10)) => {
  const current = comparableCurrent(patterns);
  const usedIds = new Set();
  const matched = [];
  const additions = [];

  for (const target of RECURRING_REBUILD_PROPOSAL) {
    const available = current.filter(item => !usedIds.has(item.id) && !retirementFor(item));
    const match = bestMatchForTarget(available, target);

    if (!match) {
      additions.push({
        id: `rebuild_${slug(target.name)}`,
        target: {
          ...target,
          nextOccurrence: nextScheduledOccurrence(target, referenceDate, null)
        }
      });
      continue;
    }

    usedIds.add(match.current.id);
    matched.push({
      id: match.current.id,
      current: match.current,
      target: {
        ...target,
        nextOccurrence: nextScheduledOccurrence(target, referenceDate, match.current)
      },
      matchReasons: match.reasons
    });
  }

  const retirements = current
    .filter(item => retirementFor(item))
    .map(item => ({ item, retirement: retirementFor(item) }));

  const unmatched = current.filter(item =>
    !usedIds.has(item.id) &&
    !retirementFor(item)
  );

  return {
    version: RECURRING_REBUILD_VERSION,
    source: RECURRING_REBUILD_SOURCE,
    referenceDate,
    matched,
    additions,
    retirements,
    unmatched,
    summary: {
      current: current.length,
      matched: matched.length,
      add: additions.length,
      retire: retirements.length,
      unmatched: unmatched.length,
      resultingActive: matched.length + additions.length
    },
    canApply: unmatched.length === 0 &&
      matched.length + additions.length === RECURRING_REBUILD_PROPOSAL.length
  };
};

const cleanTargetForWrite = target => {
  const {
    aliases,
    scheduleNote,
    amountNote,
    ...write
  } = target;

  const out = {
    ...write,
    merchantNames: aliases || [],
    rebuildVersion: RECURRING_REBUILD_VERSION,
    rebuildSource: RECURRING_REBUILD_SOURCE
  };

  if (out.variableAmount && out.amount === null) {
    delete out.amount;
  }

  return out;
};

export const buildRecurringPatternWrite = (current, target, nowValue) => ({
  ...cleanTargetForWrite(target),
  category: current?.category || 'Bills & Utilities',
  autoPay: current?.autoPay ?? false,
  description: current?.description || '',
  linkedAccount: current?.linkedAccount || '',
  archived: false,
  updatedAt: nowValue,
  ...(current ? {} : { createdAt: nowValue })
});
