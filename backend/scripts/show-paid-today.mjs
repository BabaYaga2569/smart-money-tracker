// show-paid-today.mjs — READ-ONLY: shows exactly what the auto-matcher did.
// Lists every bill marked paid recently, its due date, and the DATE of the
// transaction it was linked to. No writes.
//
//   cd C:\Users\Steve\smart-money-tracker\backend
//   node scripts/show-paid-today.mjs

import admin from 'firebase-admin';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, '..');
const key = readdirSync(backendDir).find(f => f === 'firebase-key.json' || /adminsdk.*\.json$/i.test(f));
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(path.join(backendDir, key), 'utf8'))) });
const db = admin.firestore();

const fmtDate = (d) => {
  if (!d) return 'null';
  if (typeof d === 'string') return d.slice(0, 10);
  if (typeof d.toDate === 'function') return d.toDate().toISOString().slice(0, 10);
  return String(d).slice(0, 10);
};

async function main() {
  const usersSnap = await db.collection('users').get();
  for (const userDoc of usersSnap.docs) {
    const u = db.collection('users').doc(userDoc.id);

    // All PAID bills in financialEvents, most recent first
    const feSnap = await u.collection('financialEvents').get();
    const paid = feSnap.docs
      .map(d => ({ _id: d.id, ...d.data() }))
      .filter(b => b.type === 'bill' && b.isPaid)
      .sort((a, b) => String(fmtDate(b.paidDate)).localeCompare(String(fmtDate(a.paidDate))));

    console.log(`\n=== ${paid.length} PAID bills in financialEvents (newest first, top 15) ===`);
    for (const b of paid.slice(0, 15)) {
      console.log(`  "${b.name}"  $${b.amount}`);
      console.log(`     due: ${fmtDate(b.dueDate || b.nextDueDate)} | paid: ${fmtDate(b.paidDate)} | paidAmount: ${b.paidAmount ?? '?'} | linkedTx: ${b.linkedTransactionId || 'none'}`);
      if (b.linkedTransactionId) {
        const tx = await u.collection('transactions').doc(b.linkedTransactionId).get();
        if (tx.exists) {
          const t = tx.data();
          console.log(`     ↳ matched transaction: "${t.merchant_name || t.name}" $${t.amount} on ${fmtDate(t.date)}`);
        } else {
          console.log(`     ↳ linked transaction not found by id`);
        }
      }
    }

    // Any UNPAID bill instances with suspicious far-future due dates (>45 days out)
    const unpaid = feSnap.docs.map(d => d.data())
      .filter(b => b.type === 'bill' && !b.isPaid);
    const horizon = new Date(); horizon.setDate(horizon.getDate() + 45);
    const weird = unpaid.filter(b => new Date(fmtDate(b.dueDate || b.nextDueDate)) > horizon);
    console.log(`\n=== Unpaid bills due suspiciously far out (>45 days) ===`);
    weird.forEach(b => console.log(`  "${b.name}" $${b.amount} due ${fmtDate(b.dueDate || b.nextDueDate)}  ← probably over-advanced`));
    if (!weird.length) console.log('  (none)');

    // Where did today's payments get recorded? Count recent docs per store
    const [pb, bp] = await Promise.all([
      u.collection('paidBills').get(),
      u.collection('bill_payments').get(),
    ]);
    console.log(`\n=== History store counts (why Archive shows 0) ===`);
    console.log(`  financialEvents paid: ${paid.length} | paidBills: ${pb.size} | bill_payments: ${bp.size}`);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
