// Regression test for the date-proximity fix.
// Reproduces the 2026-07-15 production bug: old transactions with matching
// name+amount must NOT pay current bills anymore.
import { matchTransactionsToBills } from '../utils/BillMatchingService.js';

const bill = {
  id: 'b1', name: 'Chrysler Capital Durango Payment', amount: 618,
  dueDate: '2026-07-15', merchantNames: ['chrysler capital'],
};

const oldTx   = { id: 't-may',  name: 'Chrysler Capital', amount: -618, date: '2026-05-15', pending: false };
const rightTx = { id: 't-july', name: 'Chrysler Capital', amount: -618, date: '2026-07-15', pending: false };
const pendTx  = { id: 't-pend', name: 'Chrysler Capital', amount: -618, date: '2026-07-15', pending: true };

let pass = 0, fail = 0;
const check = (label, cond) => { cond ? pass++ : fail++; console.log(`${cond ? '✅' : '❌'} ${label}`); };

// 1) Old transaction alone must NOT match (this was the bug)
check('60-day-old transaction does NOT match current bill',
  matchTransactionsToBills([oldTx], [bill]).length === 0);

// 2) On-date transaction DOES match
check('on-date transaction matches',
  matchTransactionsToBills([rightTx], [bill]).length === 1);

// 3) Pending transaction does NOT match
check('pending transaction does NOT match',
  matchTransactionsToBills([pendTx], [bill]).length === 0);

// 4) Given both old and current, the CURRENT one is chosen
const both = matchTransactionsToBills([oldTx, rightTx], [bill]);
check('with both available, current transaction is chosen',
  both.length === 1 && both[0].transaction.id === 't-july');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
