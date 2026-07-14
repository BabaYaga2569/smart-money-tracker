// audit-data-stores.mjs — Phase 0: READ-ONLY database census
//
// Counts documents in every data store, detects overlaps and anomalies,
// and prints a report. MAKES NO WRITES OF ANY KIND.
//
// Run from the backend folder (it has firebase-admin installed):
//   cd C:\Users\Steve\smart-money-tracker\backend
//   node scripts/audit-data-stores.mjs
//
// It auto-finds your service-account key (firebase-key.json or
// smartmoneycockpit-*.json) in the backend folder.

import admin from 'firebase-admin';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, '..');

// ---- init (read-only usage) ------------------------------------------------
function findKey() {
  const files = readdirSync(backendDir);
  const candidate =
    files.find(f => f === 'firebase-key.json') ||
    files.find(f => /adminsdk.*\.json$/i.test(f)) ||
    files.find(f => /^smartmoneycockpit-.*\.json$/i.test(f));
  if (!candidate) throw new Error('No service account key found in backend folder');
  return path.join(backendDir, candidate);
}
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(readFileSync(findKey(), 'utf8'))),
});
const db = admin.firestore();

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

async function main() {
  const usersSnap = await db.collection('users').get();
  console.log(`\n==================== PHASE 0 CENSUS ====================`);
  console.log(`Users found: ${usersSnap.size}\n`);

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const u = db.collection('users').doc(uid);
    console.log(`──────────────────────────────────────────────`);
    console.log(`USER: ${uid}`);
    console.log(`──────────────────────────────────────────────`);

    // ---- 1. Doc counts per store ------------------------------------------
    const stores = [
      'financialEvents', 'billInstances', 'paidBills', 'bill_payments',
      'recurringPatterns', 'recurringItems', 'subscriptions',
      'transactions', 'manual_transactions', 'accounts', 'plaid_items',
      'paymentRules', 'goals', 'categories', 'categoryRules', 'budgets',
    ];
    const snaps = {};
    console.log(`\n[1] Document counts:`);
    for (const s of stores) {
      snaps[s] = await u.collection(s).get();
      if (snaps[s].size > 0) console.log(`   ${s.padEnd(22)} ${snaps[s].size}`);
    }

    // ---- 2. Settings doc data arrays ---------------------------------------
    console.log(`\n[2] Legacy data arrays inside settings/personal:`);
    const settings = await u.collection('settings').doc('personal').get();
    if (settings.exists) {
      const d = settings.data();
      for (const k of ['bills', 'recurringItems', 'plaidAccounts', 'bankAccounts']) {
        if (Array.isArray(d[k])) console.log(`   settings.${k.padEnd(16)} ${d[k].length} entries`);
      }
    } else console.log('   (no settings/personal doc)');

    // ---- 3. Bills breakdown -------------------------------------------------
    console.log(`\n[3] financialEvents breakdown:`);
    const fe = snaps['financialEvents'].docs.map(x => x.data());
    const feBills = fe.filter(x => x.type === 'bill');
    console.log(`   bills: ${feBills.length} (paid: ${feBills.filter(b => b.isPaid).length}, unpaid: ${feBills.filter(b => !b.isPaid).length})`);
    const otherTypes = {};
    fe.filter(x => x.type !== 'bill').forEach(x => otherTypes[x.type] = (otherTypes[x.type] || 0) + 1);
    if (Object.keys(otherTypes).length) console.log(`   other types:`, otherTypes);
    const orphans = feBills.filter(b => b.recurringPatternId &&
      !snaps['recurringPatterns'].docs.some(p => p.id === b.recurringPatternId));
    console.log(`   orphan bills (pattern deleted): ${orphans.length}`);
    const templatesWithoutBills = snaps['recurringPatterns'].docs.filter(p => {
      const pd = p.data();
      return (pd.status ?? 'active') === 'active' && (pd.type ?? 'expense') === 'expense' &&
        !feBills.some(b => b.recurringPatternId === p.id && !b.isPaid);
    });
    console.log(`   active expense templates with NO unpaid bill: ${templatesWithoutBills.length}`);
    templatesWithoutBills.slice(0, 50).forEach(p => console.log(`      - ${p.data().name}`));

    // ---- 4. Recurring overlap detection -------------------------------------
    console.log(`\n[4] Recurring overlaps (name+amount fuzzy):`);
    const patterns = snaps['recurringPatterns'].docs.map(x => ({ id: x.id, ...x.data() }));
    const subs = snaps['subscriptions'].docs.map(x => ({ id: x.id, ...x.data() }));
    const legacyColl = snaps['recurringItems'].docs.map(x => ({ id: x.id, ...x.data() }));
    const legacyArr = settings.exists ? (settings.data().recurringItems || []) : [];
    console.log(`   recurringPatterns: ${patterns.length} | subscriptions: ${subs.length} | legacy collection: ${legacyColl.length} | legacy settings array: ${legacyArr.length}`);
    let subOverlap = 0;
    for (const s of subs) {
      const sAmt = Number(s.cost ?? s.amount) || 0;
      if (patterns.some(p => {
        const pAmt = Number(p.amount ?? p.cost) || 0;
        const nameHit = norm(p.name).includes(norm(s.name)) || norm(s.name).includes(norm(p.name));
        const amtHit = pAmt > 0 && Math.abs(pAmt - sAmt) / pAmt < 0.05;
        return nameHit || (amtHit && nameHit);
      })) { subOverlap++; console.log(`   OVERLAP: subscription "${s.name}" ($${sAmt}) ≈ a recurringPattern`); }
    }
    console.log(`   subscriptions overlapping patterns: ${subOverlap}/${subs.length}`);
    // duplicate patterns within recurringPatterns
    const seen = new Map();
    for (const p of patterns) {
      const key = `${norm(p.name)}::${Math.round(Number(p.amount ?? p.cost) || 0)}`;
      if (seen.has(key)) console.log(`   DUPLICATE pattern: "${p.name}" ≈ "${seen.get(key)}"`);
      else seen.set(key, p.name);
    }

    // ---- 5. Transaction date-type census ------------------------------------
    console.log(`\n[5] Transactions date-type census:`);
    const txs = snaps['transactions'].docs.map(x => x.data());
    const kinds = { string: 0, timestamp: 0, date: 0, number: 0, other: 0, missing: 0 };
    let newestString = '', newestTs = null, stalePending = 0;
    const now = Date.now();
    for (const t of txs) {
      const d = t.date;
      if (d == null) kinds.missing++;
      else if (typeof d === 'string') { kinds.string++; if (d > newestString) newestString = d; }
      else if (typeof d.toDate === 'function') { kinds.timestamp++; const dt = d.toDate(); if (!newestTs || dt > newestTs) newestTs = dt; }
      else if (d instanceof Date) kinds.date++;
      else if (typeof d === 'number') kinds.number++;
      else kinds.other++;
      if (t.pending) {
        const dt = typeof d === 'string' ? new Date(d) : (d?.toDate?.() ?? new Date(NaN));
        if (!isNaN(dt) && (now - dt.getTime()) > 30 * 86400000) stalePending++;
      }
    }
    console.log(`   total: ${txs.length}`, kinds);
    console.log(`   newest string-date: ${newestString || 'n/a'} | newest timestamp-date: ${newestTs ? newestTs.toISOString().slice(0,10) : 'n/a'}`);
    console.log(`   pending >30 days old (fossils): ${stalePending}`);

    // ---- 6. Plaid items / accounts ------------------------------------------
    console.log(`\n[6] Plaid items: ${snaps['plaid_items'].size}`);
    snaps['plaid_items'].docs.forEach(x => {
      const d = x.data();
      console.log(`   ${x.id}: ${d.institutionName || d.institution_name || '?'} | lastSync: ${d.lastSyncedAt || d.last_synced_at || d.lastSync || 'NULL ← epoch-bug source'}`);
    });
  }
  console.log(`\n==================== END CENSUS (no writes performed) ====================\n`);
  process.exit(0);
}

main().catch(e => { console.error('AUDIT FAILED:', e); process.exit(1); });
