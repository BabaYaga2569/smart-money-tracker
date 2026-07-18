// test-projection-engine.mjs — proves the pay-cycle projection engine's math.
// Every expected value below was computed BY HAND before running.
//
//   cd backend && node scripts/test-projection-engine.mjs

import {
  projectCashFlow, nextOwnPaydays, spousePaydaysBetween, addDays,
} from '../../frontend/src/utils/CashFlowProjection.js';

let pass = 0, fail = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  ok ? pass++ : fail++;
  console.log(`${ok ? '✅' : '❌'} ${label}${ok ? '' : `\n     expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
};

// ───────────────────────────────────────────────────────────────────────────
console.log('\n— basic walk: bills + daily essentials, no income —');
// balance 1000, 6 days (7/16→7/21), one $300 bill on 7/20, essentials $70/wk
// = $10/day, buffer $100. Hand-walked: 990,980,970,960,650,640 → min 640.
{
  const r = projectCashFlow({
    startingBalance: 1000, todayStr: '2026-07-16', cycleEndStr: '2026-07-21',
    bills: [{ name: 'Big Bill', amount: 300, dueDate: '2026-07-20' }],
    incomes: [], weeklyEssentials: 70, safetyBuffer: 100,
  });
  check('min balance is 640 on the last day', [r.minBalance, r.minDate], [640, '2026-07-21']);
  check('safeToSpend = min − buffer = 540', r.safeToSpend, 540);
  check('cycle is 6 days', r.daysInCycle, 6);
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n— THE KEY INSIGHT: a dip before mid-cycle income limits spending —');
// balance 500; $400 bill on day 2; $1000 income day 4. Ending balance is fat
// ($1100) but the dip to $100 before the income is what limits safe-to-spend.
{
  const r = projectCashFlow({
    startingBalance: 500, todayStr: '2026-07-16', cycleEndStr: '2026-07-20',
    bills: [{ name: 'Rent', amount: 400, dueDate: '2026-07-17' }],
    incomes: [{ date: '2026-07-19', amount: 1000, label: 'Spouse payday' }],
    weeklyEssentials: 0, safetyBuffer: 0,
  });
  check('dip bottoms at 100 on the bill day', [r.minBalance, r.minDate], [100, '2026-07-17']);
  check('safeToSpend is the DIP (100), not the ending balance (1100)', r.safeToSpend, 100);
  check('ending balance is 1100', r.endBalance, 1100);
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n— overdue bills claim money TODAY —');
{
  const r = projectCashFlow({
    startingBalance: 1000, todayStr: '2026-07-16', cycleEndStr: '2026-07-18',
    bills: [{ name: 'Old Bill', amount: 250, dueDate: '2026-07-01' }],
    incomes: [], weeklyEssentials: 0, safetyBuffer: 0,
  });
  check('overdue $250 applied on day one', r.ledger[0].bills, 250);
  check('safeToSpend reflects it immediately', r.safeToSpend, 750);
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n— bills beyond the cycle end are excluded —');
{
  const r = projectCashFlow({
    startingBalance: 1000, todayStr: '2026-07-16', cycleEndStr: '2026-07-18',
    bills: [{ name: 'Next Cycle Bill', amount: 999, dueDate: '2026-07-25' }],
    incomes: [], weeklyEssentials: 0, safetyBuffer: 0,
  });
  check('out-of-window bill ignored', r.totalBills, 0);
  check('safeToSpend untouched', r.safeToSpend, 1000);
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n— spouse payday generator: 15th & 30th, Feb clamps to 28th —');
{
  const july = spousePaydaysBetween('2026-07-10', '2026-07-31', 1892.26).map(x => x.date);
  check('July window contains 15th and 30th', july, ['2026-07-15', '2026-07-30']);

  const feb = spousePaydaysBetween('2026-02-01', '2026-02-28', 1892.26).map(x => x.date);
  check('February clamps 30th to the 28th', feb, ['2026-02-15', '2026-02-28']);

  const excl = spousePaydaysBetween('2026-07-15', '2026-07-20', 1892.26).map(x => x.date);
  check('payday ON today is excluded (already in balance)', excl, []);
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n— own next paydays from a bi-weekly anchor —');
{
  const r = nextOwnPaydays('2026-07-10', '2026-07-16', { earlyDepositEnabled: true, daysBeforePayday: 2 });
  check('main payday advances to 7/24', r.mainDate, '2026-07-24');
  check('early deposit lands 7/22', r.earlyDate, '2026-07-22');

  const onPayday = nextOwnPaydays('2026-07-10', '2026-07-24', {});
  check("on payday morning, next main is 8/7 (today's pay is in balance)", onPayday.mainDate, '2026-08-07');
}

// ───────────────────────────────────────────────────────────────────────────
console.log('\n— GOLDEN SCENARIO: Steve-shaped week, hand-computed —');
// Balance $1,821.55 on 7/16. Own pay: last 7/10, early-deposit 2 days before
// main 7/24 → own money arrives 7/22, cycle = 7/16..7/21 (6 days).
// Tanci's 15th passed, 30th is outside → no income in window.
// Bills in window: Citi 200 (16th), Peacock 10.99 (17th), Geico 307.89 (18th),
// SiriusXM 13.32 (18th), Disney+ 18.99 (19th)  → total 551.19.
// Essentials $230/wk → 32.857142.../day × 6 = 197.142857...
// End/min = 1821.55 − 551.19 − 197.142857 = 1073.217142... → 1073.22
// Safe = 1073.22 − 200 buffer = 873.22
{
  const { mainDate, earlyDate } = nextOwnPaydays('2026-07-10', '2026-07-16', { earlyDepositEnabled: true, daysBeforePayday: 2 });
  const cycleEndStr = addDays(earlyDate || mainDate, -1);
  check('cycle end computed as 7/21', cycleEndStr, '2026-07-21');

  const r = projectCashFlow({
    startingBalance: 1821.55, todayStr: '2026-07-16', cycleEndStr,
    incomes: spousePaydaysBetween('2026-07-16', cycleEndStr, 1892.26),
    bills: [
      { name: 'Citi Card - Costco Card', amount: 200, dueDate: '2026-07-16' },
      { name: 'Peacock', amount: 10.99, dueDate: '2026-07-17' },
      { name: 'Geico Charger Durango Challenger', amount: 307.89, dueDate: '2026-07-18' },
      { name: 'SiriusXM', amount: 13.32, dueDate: '2026-07-18' },
      { name: 'Disney Plus', amount: 18.99, dueDate: '2026-07-19' },
    ],
    weeklyEssentials: 230, safetyBuffer: 200,
  });
  check('no spouse income lands in this window', r.totalIncome, 0);
  check('window bills total 551.19', r.totalBills, 551.19);
  check('lowest point 1073.22 (hand-computed)', r.minBalance, 1073.22);
  check('SAFE TO SPEND = 873.22 (hand-computed)', r.safeToSpend, 873.22);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
