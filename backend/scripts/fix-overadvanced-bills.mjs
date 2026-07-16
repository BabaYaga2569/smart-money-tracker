// fix-overadvanced-bills.mjs — resets the 9 bills the matcher over-advanced
// back to their correct next occurrence.
//
//   node scripts/fix-overadvanced-bills.mjs            ← DRY RUN (no writes)
//   node scripts/fix-overadvanced-bills.mjs --execute  ← applies the fixes

import admin from 'firebase-admin';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const EXECUTE = process.argv.includes('--execute');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, '..');
const key = readdirSync(backendDir).find(f => f === 'firebase-key.json' || /adminsdk.*\.json$/i.test(f));
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(path.join(backendDir, key), 'utf8'))) });
const db = admin.firestore();

// Explicit corrections: bill name (as stored) -> correct next due date.
// July occurrences were genuinely paid (or are posting now), so most reset to August.
// AfterPay resets to its original July 23 biweekly slot.
// Starlink/Pierceprime were originally August bills; restored to those dates.
const CORRECTIONS = {
  'AfterPay':                          '2026-07-23',
  'Plaid Technologies Inc':            '2026-08-13',
  'Chrysler Capital Durango Payment':  '2026-08-15',
  'Citi Card - Costco Card':           '2026-08-16',
  'Adobe':                             '2026-08-20',
  'Claude AI Subscription':            '2026-08-28',
  'Google One Storage':                '2026-08-30',
  'Starlink':                          '2026-08-05',
  'Pierceprime':                       '2026-08-06',
};

async function main() {
  console.log(`\n===== FIX OVER-ADVANCED BILLS ${EXECUTE ? '*** EXECUTE ***' : '(DRY RUN)'} =====\n`);
  const usersSnap = await db.collection('users').get();
  for (const userDoc of usersSnap.docs) {
    const u = db.collection('users').doc(userDoc.id);
    const feSnap = await u.collection('financialEvents').get();

    let fixes = 0;
    for (const docSnap of feSnap.docs) {
      const b = docSnap.data();
      if (b.type !== 'bill' || b.isPaid) continue;
      const correctDate = CORRECTIONS[b.name];
      if (!correctDate) continue;
      const current = String(b.dueDate || b.nextDueDate).slice(0, 10);
      if (current === correctDate) { console.log(`  = "${b.name}" already at ${correctDate}`); continue; }

      console.log(`  ~ "${b.name}"  ${current}  →  ${correctDate}`);
      fixes++;
      if (EXECUTE) {
        await docSnap.ref.update({
          dueDate: correctDate,
          nextDueDate: correctDate,
          originalDueDate: correctDate,
          _dateFixedBy: 'fix-overadvanced-bills',
          _dateFixedAt: new Date().toISOString(),
        });
      }
    }
    console.log(`\n  ${EXECUTE ? 'FIXED' : 'Would fix'}: ${fixes} bills`);

    // Also fix the matching recurringPatterns templates' nextOccurrence
    const rpSnap = await u.collection('recurringPatterns').get();
    let tplFixes = 0;
    for (const docSnap of rpSnap.docs) {
      const p = docSnap.data();
      const correctDate = CORRECTIONS[p.name];
      if (!correctDate) continue;
      const current = String(p.nextOccurrence || '').slice(0, 10);
      if (current === correctDate) continue;
      console.log(`  ~ template "${p.name}"  nextOccurrence ${current || '?'}  →  ${correctDate}`);
      tplFixes++;
      if (EXECUTE) {
        await docSnap.ref.update({ nextOccurrence: correctDate });
      }
    }
    console.log(`  ${EXECUTE ? 'FIXED' : 'Would fix'}: ${tplFixes} templates`);
  }
  console.log(`\n===== ${EXECUTE ? 'DONE' : 'DRY RUN DONE — rerun with --execute to apply'} =====\n`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
