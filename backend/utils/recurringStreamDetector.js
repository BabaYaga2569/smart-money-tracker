// recurringStreamDetector.js
// Detects recurring bill/subscription/income streams from raw transaction history.
// Zero external API cost — runs entirely on transactions already synced via /transactions/sync.
//
// Usage:
//   import { detectRecurringStreams } from './utils/recurringStreamDetector.js';
//   const result = detectRecurringStreams(transactions);
//   // result = { expenseStreams: [...], incomeStreams: [...], skipped: {...} }

// ---------------------------------------------------------------------------
// Merchant name normalization
// ---------------------------------------------------------------------------

const NOISE_PATTERNS = [
  /\b(pos|ach|debit|credit|purchase|payment|pymt|pmt|autopay|auto pay|web|online|recurring)\b/gi,
  /\b(conf|confirmation|ref|reference|id|trace)[#:\s]*[a-z0-9]+\b/gi,
  /\b\d{2}[/-]\d{2}([/-]\d{2,4})?\b/g,      // dates embedded in descriptors
  /\b[a-z]*\d{4,}\b/gi,                       // long digit runs (card fragments, ids)
  /[*#]+/g,
  /\s{2,}/g,
];

const ORDINALS = { '1st': 'first', '2nd': 'second', '3rd': 'third', '4th': 'fourth' };

export function normalizeMerchant(raw, { maxTokens = 3 } = {}) {
  if (!raw) return '';
  let s = String(raw).toLowerCase().trim();
  for (const p of NOISE_PATTERNS) s = s.replace(p, ' ');
  s = s.replace(/\b(\d+)(st|nd|rd|th)\b/g, (_, n) => ({ '1':'first','2':'second','3':'third','4':'fourth' }[n] || n)); // 1st -> first
  s = s.replace(/[-'\u2019.]/g, '');           // t-mobile -> tmobile, apple.com -> applecom
  s = s.replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  let tokens = s.split(' ').filter(Boolean).map(t => ORDINALS[t] || t);
  if (maxTokens > 0) tokens = tokens.slice(0, maxTokens);
  return tokens.join(' ');
}

// ---------------------------------------------------------------------------
// Frequency classification from day-gaps
// ---------------------------------------------------------------------------

const FREQUENCY_BANDS = [
  { name: 'weekly',       min: 5,   max: 9 },
  { name: 'biweekly',     min: 12,  max: 16 },
  { name: 'semimonthly',  min: 13,  max: 18 },  // disambiguated below via day-of-month
  { name: 'monthly',      min: 26,  max: 35 },
  { name: 'quarterly',    min: 80,  max: 100 },
  { name: 'annually',     min: 340, max: 390 },
];

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function stddev(nums) {
  if (nums.length < 2) return 0;
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  return Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / (nums.length - 1));
}

function classifyFrequency(gaps, dates) {
  const med = median(gaps);
  const candidates = FREQUENCY_BANDS.filter(b => med >= b.min && med <= b.max);
  if (candidates.length === 0) return null;

  // Disambiguate biweekly vs semimonthly: semimonthly lands on ~fixed days of month
  // (e.g. 15th & 30th), biweekly drifts through the calendar.
  if (candidates.some(c => c.name === 'biweekly' || c.name === 'semimonthly')) {
    const days = dates.map(d => d.getDate());
    const uniqueDays = new Set(days.map(d => (d >= 28 ? 31 : d))); // treat 28-31 as "end of month"
    return uniqueDays.size <= 2 ? 'semimonthly' : 'biweekly';
  }
  return candidates[0].name;
}

// ---------------------------------------------------------------------------
// Core detection
// ---------------------------------------------------------------------------

/**
 * @param {Array} transactions  Firestore transaction docs. Expected fields:
 *   name / merchant_name, amount (expenses negative), date (YYYY-MM-DD or Date),
 *   account_id, institution_name, pending, category
 * @param {Object} opts
 *   minOccurrences (default 3), maxAmountVariancePct (default 0.25),
 *   lookbackDays (default 400)
 */
export function detectRecurringStreams(transactions, opts = {}) {
  const {
    minOccurrences = 3,
    maxAmountVariancePct = 0.25,
    lookbackDays = 400,
  } = opts;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lookbackDays);

  const skipped = { pending: 0, tooOld: 0, noName: 0, internalTransfer: 0 };

  // --- Pre-filter and index -------------------------------------------------
  const usable = [];
  for (const tx of transactions) {
    if (tx.pending) { skipped.pending++; continue; }
    const rawName = tx.merchant_name || tx.name || tx.description;
    if (!rawName) { skipped.noName++; continue; }
    const date = tx.date instanceof Date ? tx.date : new Date(String(tx.date) + 'T12:00:00');
    if (isNaN(date) || date < cutoff) { skipped.tooOld++; continue; }
    usable.push({ ...tx, _date: date, _name: rawName, _key: normalizeMerchant(rawName) });
  }

  // --- Drop internal transfers: same |amount|, opposite signs, within 3 days,
  //     different accounts ---------------------------------------------------
  const transferIds = new Set();
  const byAbsAmount = new Map();
  for (const tx of usable) {
    const k = Math.abs(Number(tx.amount)).toFixed(2);
    if (!byAbsAmount.has(k)) byAbsAmount.set(k, []);
    byAbsAmount.get(k).push(tx);
  }
  for (const group of byAbsAmount.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i], b = group[j];
        if (
          Math.sign(a.amount) !== Math.sign(b.amount) &&
          a.account_id !== b.account_id &&
          Math.abs(a._date - b._date) <= 3 * 86400000
        ) {
          transferIds.add(a.transaction_id || a.id);
          transferIds.add(b.transaction_id || b.id);
        }
      }
    }
  }

  // --- Group by (merchant key, rounded amount) so multiple subscriptions at
  //     the same merchant (Apple!) become separate streams --------------------
  const groups = new Map();
  for (const tx of usable) {
    if (transferIds.has(tx.transaction_id || tx.id)) { skipped.internalTransfer++; continue; }
    const amt = Number(tx.amount) || 0;
    if (amt === 0) continue;
    const amountBucket = Math.round(Math.abs(amt)); // $9.99 and $10.49 share a bucket edge-case; refined below
    const key = `${tx._key}::${amountBucket}::${amt < 0 ? 'out' : 'in'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tx);
  }

  // Merge adjacent amount buckets for the same merchant (handles $9.99 vs $10)
  // and small price drift, by re-grouping merchant-side and splitting on gaps > 15%.
  const merged = new Map();
  for (const [key, txs] of groups) {
    const [mKey, , dir] = key.split('::');
    const mk = `${mKey}::${dir}`;
    if (!merged.has(mk)) merged.set(mk, []);
    merged.get(mk).push(...txs);
  }

  const expenseStreams = [];
  const incomeStreams = [];
  const endedStreams = [];

  for (const [mk, txs] of merged) {
    const [merchantKey, dir] = mk.split('::');
    if (!merchantKey) continue;

    // Split this merchant's txs into amount clusters (within 15% of cluster mean)
    const sortedByAmt = [...txs].sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount));
    const clusters = [];
    for (const tx of sortedByAmt) {
      const abs = Math.abs(tx.amount);
      const cluster = clusters.find(c => Math.abs(abs - c.mean) / c.mean <= 0.08);
      if (cluster) {
        cluster.txs.push(tx);
        cluster.mean = cluster.txs.reduce((s, t) => s + Math.abs(t.amount), 0) / cluster.txs.length;
      } else {
        clusters.push({ mean: abs, txs: [tx] });
      }
    }

    for (const cluster of clusters) {
      const ctxs = cluster.txs.sort((a, b) => a._date - b._date);
      if (ctxs.length < minOccurrences) continue;

      const gaps = [];
      for (let i = 1; i < ctxs.length; i++) {
        gaps.push((ctxs[i]._date - ctxs[i - 1]._date) / 86400000);
      }
      const freq = classifyFrequency(gaps, ctxs.map(t => t._date));
      if (!freq) continue;

      const amounts = ctxs.map(t => Math.abs(t.amount));
      const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const amountSpread = (Math.max(...amounts) - Math.min(...amounts)) / avgAmount;
      if (amountSpread > maxAmountVariancePct * 2) continue; // too erratic to be a bill

      const gapStd = stddev(gaps);
      const gapMed = median(gaps);

      // Confidence: more occurrences, tighter gaps, tighter amounts => higher
      const occScore = Math.min(ctxs.length / 6, 1);          // saturates at 6 sightings
      const regularity = Math.max(0, 1 - gapStd / Math.max(gapMed, 1));
      const amountScore = Math.max(0, 1 - amountSpread / maxAmountVariancePct);
      const confidence = Math.round((occScore * 0.35 + regularity * 0.4 + amountScore * 0.25) * 100);

      const last = ctxs[ctxs.length - 1];
      const nextDate = new Date(last._date);
      if (freq === 'monthly') nextDate.setMonth(nextDate.getMonth() + 1);
      else if (freq === 'semimonthly') nextDate.setDate(nextDate.getDate() + 15);
      else nextDate.setDate(nextDate.getDate() + Math.round(gapMed));

      // Activity check: if we haven't seen this stream in ~1.75x its normal
      // cadence (plus a week of slack), it has ENDED — paid-off loan,
      // cancelled subscription — and must not be suggested as a new bill.
      const daysSinceLastSeen = Math.round((Date.now() - last._date) / 86400000);
      const activityThreshold = gapMed * 1.75 + 7;
      const isActive = daysSinceLastSeen <= activityThreshold;

      const stream = {
        displayName: last._name,
        merchantKey,
        frequency: freq,
        averageAmount: Math.round(avgAmount * 100) / 100,
        lastAmount: Math.abs(last.amount),
        amountDriftPct: Math.round(amountSpread * 100),
        occurrences: ctxs.length,
        firstSeen: ctxs[0]._date.toISOString().slice(0, 10),
        lastSeen: last._date.toISOString().slice(0, 10),
        nextPredictedDate: nextDate.toISOString().slice(0, 10),
        dayOfMonth: freq === 'monthly' ? last._date.getDate() : null,
        confidence,
        isActive,
        daysSinceLastSeen,
        accountId: last.account_id || null,
        institutionName: last.institution_name || last.institutionName || null,
        category: last.category || null,
        sampleTransactionIds: ctxs.slice(-3).map(t => t.transaction_id || t.id).filter(Boolean),
      };

      if (!isActive) {
        stream.direction = dir === 'out' ? 'expense' : 'income';
        endedStreams.push(stream);
      } else {
        (dir === 'out' ? expenseStreams : incomeStreams).push(stream);
      }
    }
  }

  expenseStreams.sort((a, b) => b.confidence - a.confidence || b.averageAmount - a.averageAmount);
  incomeStreams.sort((a, b) => b.confidence - a.confidence);

  endedStreams.sort((a, b) => a.daysSinceLastSeen - b.daysSinceLastSeen);
  return { expenseStreams, incomeStreams, endedStreams, skipped };
}

// ---------------------------------------------------------------------------
// Matching detected streams to existing recurring templates (dedup + drift)
// ---------------------------------------------------------------------------

function tokenOverlap(a, b) {
  const ta = new Set(a.split(' ').filter(Boolean));
  const tb = new Set(b.split(' ').filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let hits = 0;
  for (const t of ta) if (tb.has(t)) hits++;
  return hits / Math.min(ta.size, tb.size);
}

/**
 * @param {Array} streams   output of detectRecurringStreams().expenseStreams
 * @param {Array} templates existing recurring items [{name, amount, ...}]
 * @returns {{ newStreams: [], matched: [{stream, template, amountDrift}] }}
 */
export function matchStreamsToTemplates(streams, templates) {
  const newStreams = [];
  const matched = [];

  for (const stream of streams) {
    const sKey = normalizeMerchant(stream.displayName, { maxTokens: 0 }); // full name for matching
    let best = null;
    let bestScore = 0;

    for (const tpl of templates) {
      const tKey = normalizeMerchant(tpl.name || tpl.description || '', { maxTokens: 0 });
      const nameScore = tokenOverlap(sKey, tKey);
      const tplAmt = Math.abs(Number(tpl.amount ?? tpl.cost) || 0);
      const amtScore = tplAmt > 0
        ? Math.max(0, 1 - Math.abs(stream.averageAmount - tplAmt) / Math.max(tplAmt, 1))
        : 0;
      // Exact-amount override: identical amount (within 0.5%) plus ANY name
      // overlap is a near-certain match ("America First Cu Loan" ===
      // "Side X Side America 1st Credit Union", both $295.36).
      const amountExact = tplAmt > 0 && Math.abs(stream.averageAmount - tplAmt) / tplAmt <= 0.005;
      let score = nameScore * 0.6 + amtScore * 0.4;
      if (amountExact && nameScore >= 0.15) score = Math.max(score, 0.9);
      if (score > bestScore) { bestScore = score; best = tpl; }
    }

    if (best && bestScore >= 0.6) {
      const tplAmt = Math.abs(Number(best.amount ?? best.cost) || 0);
      matched.push({
        stream,
        templateId: best.id || null,
        templateName: best.name,
        templateAmount: tplAmt,
        amountDrift: Math.round((stream.lastAmount - tplAmt) * 100) / 100,
        matchScore: Math.round(bestScore * 100),
      });
    } else {
      newStreams.push(stream);
    }
  }

  return { newStreams, matched };
}
