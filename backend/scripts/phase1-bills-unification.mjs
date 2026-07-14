// phase1-bills-unification.mjs
// PHASE 1: Bills unification + backfill.
//
//   node scripts/phase1-bills-unification.mjs            ← DRY RUN (default, no writes)
//   node scripts/phase1-bills-unification.mjs --execute  ← performs the writes
//
// What it does:
//  A) BACKFILL: for every active expense template in recurringPatterns with no
//     unpaid bill, generate ONE unpaid bill in financialEvents at the next
//     FUTURE occurrence (never creates fake overdue bills for the past).
//  B) MIGRATE billInstances: unpaid ones are copied into financialEvents in
//     canonical shape, then the originals are marked migrated (not deleted).
//  C) REPORT-ONLY: counts for paidBills / bill_payments / orphans, as input
//     for the later history-consolidation phase. No changes to those.

import admin from 'firebase-admin';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const EXECUTE = process.argv.includes('--execute');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, '..');

function findKey() {
  const files = readdirSync(backendDir);
  const c = files.find(f => f === 'firebase-key.json') ||
            files.find(f => /adminsdk.*\.json$/i.test(f));
  if (!c) throw new Error('No service account key found in backend folder');
  return path.join(backendDir, c);
}
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(findKey(), 'utf8'))) });
const db = admin.firestore();

const todayStr = new Date().toISOString().slice(0, 10);

// Compute next FUTURE due date from a template
function nextFutureDate(tpl) {
  const freq = (tpl.billingCycle || tpl.frequency || 'monthly').toLowerCase();
  let d = tpl.nextOccurrence ? new Date(tpl.nextOccurrence + 'T12:00:00') : null;
  if (!d || isNaN(d)) {
    // fall back to dayOfMonth this/next month
    const day = tpl.dayOfMonth || 1;
    d = new Date();
    d.setDate(Math.min(day, 28) === day ? day : day); // keep literal day; JS clamps overflow to next month naturally below
    d.setHours(12, 0, 0, 0);
    d.setDate(day);
  }
  const advance = () => {
    if (freq === 'weekly') d.setDate(d.getDate() + 7);
    else if (freq === 'biweekly') d.setDate(d.getDate() + 14);
    else if (freq === 'quarterly') d.setMonth(d.getMonth() + 3);
    else if (freq === 'annually' || freq === 'yearly') d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1); // monthly default
  };
  let guard = 0;
  while (d.toISOString().slice(0, 10) < todayStr && guard++ < 60) advance();
  return d.toISOString().slice(0, 10);
}

function billFromTemplate(tpl, dueDate, billId) {
  return {
    id: billId,
    type: 'bill',
    name: tpl.name,
    amount: Number(tpl.cost ?? tpl.amount) || 0,
    dueDate, nextDueDate: dueDate, originalDueDate: dueDate,
    category: tpl.category || 'Bills & Utilities',
    recurrence: tpl.billingCycle || tpl.frequency || 'monthly',
    recurringPatternId: tpl.id,
    isPaid: false, status: 'pending',
    paidDate: null, paidAmount: null, linkedTransactionId: null,
    paymentHistory: [],
    merchantNames: [tpl.name.toLowerCase(), tpl.name.toLowerCase().replace(/[^a-z0-9]/g, '')],
    autoPayEnabled: false, notes: null,
    createdAt: new Date().toISOString(),
    createdBy: 'phase1-migration',
  };
}

async function main() {
  console.log(`\n========== PHASE 1: BILLS UNIFICATION ${EXECUTE ? '*** EXECUTE MODE ***' : '(DRY RUN — no writes)'} ==========\n`);
  const usersSnap = await db.collection('users').get();

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const u = db.collection('users').doc(uid);
    console.log(`USER ${uid}`);

    const [patternsSnap, feSnap, biSnap, pbSnap, bpSnap] = await Promise.all([
      u.collection('recurringPatterns').get(),
      u.collection('financialEvents').get(),
      u.collection('billInstances').get(),
      u.collection('paidBills').get(),
      u.collection('bill_payments').get(),
    ]);
    const patterns = patternsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const feBills = feSnap.docs.map(d => d.data()).filter(x => x.type === 'bill');

    // ---------- A) BACKFILL ----------
    console.log(`\n[A] Backfill missing bills from ${patterns.length} templates:`);
    let toCreate = [];
    for (const tpl of patterns) {
      if ((tpl.status ?? 'active') !== 'active') continue;
      if ((tpl.type ?? 'expense') !== 'expense') continue;
      const hasUnpaid = feBills.some(b => b.recurringPatternId === tpl.id && !b.isPaid);
      if (hasUnpaid) continue;
      const dueDate = nextFutureDate(tpl);
      toCreate.push({ tpl, dueDate });
    }
    toCreate.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    for (const { tpl, dueDate } of toCreate) {
      console.log(`   + "${tpl.name}"  $${Number(tpl.cost ?? tpl.amount) || 0}  due ${dueDate}`);
    }
    console.log(`   → ${toCreate.length} bills would be created`);
    if (EXECUTE) {
      const batch = db.batch();
      for (const { tpl, dueDate } of toCreate) {
        const billId = `bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        batch.set(u.collection('financialEvents').doc(billId), billFromTemplate(tpl, dueDate, billId));
      }
      await batch.commit();
      console.log(`   ✅ CREATED ${toCreate.length} bills in financialEvents`);
    }

    // ---------- B) billInstances migration ----------
    console.log(`\n[B] billInstances migration (${biSnap.size} docs):`);
    let migrate = [], skip = 0;
    for (const d of biSnap.docs) {
      const b = d.data();
      if (b._migratedToFinancialEvents) { skip++; continue; }
      if (b.isPaid || b.status === 'paid') { skip++; continue; } // history stays put for Phase-later
      const junkNames = ['food', 'test'];
      if (junkNames.includes(String(b.name || '').trim().toLowerCase())) { 
        console.log(`   ✗ skipping junk item: "${b.name}"`); skip++; continue; 
      }
      const dup = feBills.some(f =>
        (f.recurringPatternId && f.recurringPatternId === (b.recurringPatternId || b.recurringTemplateId)) &&
        (f.nextDueDate || f.dueDate) === (b.nextDueDate || b.dueDate));
      if (dup) { skip++; continue; }
      migrate.push({ ref: d.ref, data: b });
    }
    migrate.forEach(m => console.log(`   → migrate unpaid: "${m.data.name}" $${m.data.amount} due ${m.data.dueDate || m.data.nextDueDate}`));
    console.log(`   → ${migrate.length} to migrate, ${skip} skipped (paid/dup/already-migrated)`);
    if (EXECUTE && migrate.length) {
      const batch = db.batch();
      for (const m of migrate) {
        const billId = `bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        batch.set(u.collection('financialEvents').doc(billId), {
          ...m.data, id: billId, type: 'bill',
          recurringPatternId: m.data.recurringPatternId || m.data.recurringTemplateId || null,
          migratedFrom: 'billInstances', createdBy: 'phase1-migration',
        });
        batch.update(m.ref, { _migratedToFinancialEvents: true, _migratedAt: new Date().toISOString() });
      }
      await batch.commit();
      console.log(`   ✅ Migrated ${migrate.length} bills (originals tagged, not deleted)`);
    }

    // ---------- C) Report-only ----------
    const orphans = feBills.filter(b => b.recurringPatternId && !patterns.some(p => p.id === b.recurringPatternId));
    console.log(`\n[C] For later phases (NO CHANGES made now):`);
    console.log(`   paidBills: ${pbSnap.size} | bill_payments: ${bpSnap.size} | financialEvents paid bills: ${feBills.filter(b => b.isPaid).length}`);
    console.log(`   orphan bills in financialEvents: ${orphans.length}`);
  }
  console.log(`\n========== PHASE 1 ${EXECUTE ? 'COMPLETE' : 'DRY RUN COMPLETE — review above, then rerun with --execute'} ==========\n`);
  process.exit(0);
}
main().catch(e => { console.error('PHASE 1 FAILED:', e); process.exit(1); });
