/**
 * CashFlowProjection.js
 *
 * The pay-cycle projection engine — implements the day-by-day running-balance
 * method (a.k.a. "the spreadsheet algorithm"):
 *
 *   The pay cycle is anchored to the USER'S OWN paycheck. It runs from today
 *   through the day before the user's next own money arrives (the early
 *   deposit if enabled, else the main payday). Spouse paydays that land
 *   inside the window are mid-cycle INCOME. Every unpaid bill in the window
 *   (including overdue ones, applied immediately) is an outflow on its due
 *   date. Weekly essentials drip out daily. Safe-to-spend is the LOWEST
 *   point the projected balance ever touches, minus the safety buffer —
 *   because money you spend today must survive every dip between now and
 *   refill, not just the average.
 *
 * Pure functions, no I/O — fully unit-testable.
 */

const DAY_MS = 86400000;

/** Parse YYYY-MM-DD as a calendar day anchored at UTC noon (TZ/DST-immune). */
export function parseDay(str) {
  return new Date(String(str).slice(0, 10) + 'T12:00:00Z');
}

/** Format a Date back to YYYY-MM-DD. */
export function fmtDay(date) {
  return date.toISOString().slice(0, 10);
}

/** Add n calendar days to a YYYY-MM-DD string. */
export function addDays(str, n) {
  const d = parseDay(str);
  d.setUTCDate(d.getUTCDate() + n);
  return fmtDay(d);
}

/** Whole calendar days from a to b (b - a). */
export function daysBetween(aStr, bStr) {
  return Math.round((parseDay(bStr) - parseDay(aStr)) / DAY_MS);
}

/**
 * Next OWN paydays strictly after `todayStr`, from a bi-weekly anchor.
 * Returns { mainDate, earlyDate } (earlyDate null when early deposit is off).
 */
export function nextOwnPaydays(lastPayDateStr, todayStr, {
  earlyDepositEnabled = false,
  daysBeforePayday = 1,
} = {}) {
  if (!lastPayDateStr) return { mainDate: null, earlyDate: null };
  let main = String(lastPayDateStr).slice(0, 10);
  let guard = 0;
  while (main <= todayStr && guard++ < 120) main = addDays(main, 14);
  const early = earlyDepositEnabled ? addDays(main, -Math.abs(daysBeforePayday || 1)) : null;
  return { mainDate: main, earlyDate: early };
}

/**
 * Spouse paydays (15th & 30th; 30th clamps to month-end for February) that
 * fall inside (todayStr, endStr] — i.e., strictly after today, up to and
 * including the cycle end.
 */
export function spousePaydaysBetween(todayStr, endStr, amount) {
  if (!amount || !endStr || endStr < todayStr) return [];
  const out = [];
  const start = parseDay(todayStr);
  const end = parseDay(endStr);
  // Walk months from start's month to end's month
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1, 12));
  while (cursor <= end) {
    const y = cursor.getUTCFullYear(), m = cursor.getUTCMonth();
    const lastDom = new Date(Date.UTC(y, m + 1, 0, 12)).getUTCDate();
    for (const dom of [15, Math.min(30, lastDom)]) {
      const dStr = fmtDay(new Date(Date.UTC(y, m, dom, 12)));
      if (dStr > todayStr && dStr <= endStr) {
        out.push({ date: dStr, amount: Number(amount), label: 'Spouse payday' });
      }
    }
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

/**
 * The core projection.
 *
 * @param {Object} p
 * @param {number} p.startingBalance   Current real total available balance
 * @param {string} p.todayStr          YYYY-MM-DD
 * @param {string} p.cycleEndStr       Last day of the cycle (day before own next money)
 * @param {Array}  p.incomes           [{date, amount, label}] inside (today, cycleEnd]
 * @param {Array}  p.bills             Unpaid bills [{name, amount, dueDate}] — overdue
 *                                     (dueDate < today) are applied on day 0
 * @param {number} p.weeklyEssentials  Dollars/week for groceries/gas/needs (dripped daily)
 * @param {number} p.safetyBuffer      Minimum balance floor
 *
 * @returns {Object} {
 *   safeToSpend, minBalance, minDate, endBalance,
 *   totalBills, totalIncome, essentialsTotal, daysInCycle,
 *   ledger: [{date, income, bills, essentials, balance, events[]}]
 * }
 */
export function projectCashFlow({
  startingBalance = 0,
  todayStr,
  cycleEndStr,
  incomes = [],
  bills = [],
  weeklyEssentials = 0,
  safetyBuffer = 0,
}) {
  const daysInCycle = Math.max(0, daysBetween(todayStr, cycleEndStr)) + 1; // inclusive of today
  const essentialsDaily = (Number(weeklyEssentials) || 0) / 7;

  // Index incomes and bills by date; overdue bills land on day 0 (today)
  const incomeByDate = new Map();
  for (const inc of incomes) {
    const d = String(inc.date).slice(0, 10);
    if (d <= todayStr || d > cycleEndStr) continue; // only future income inside window
    if (!incomeByDate.has(d)) incomeByDate.set(d, []);
    incomeByDate.get(d).push(inc);
  }

  const billsByDate = new Map();
  for (const b of bills) {
    const raw = String(b.dueDate || b.nextDueDate || b.date || '').slice(0, 10);
    if (!raw) continue;
    if (raw > cycleEndStr) continue;                 // outside this cycle
    const d = raw < todayStr ? todayStr : raw;        // overdue → hits today
    if (!billsByDate.has(d)) billsByDate.set(d, []);
    billsByDate.get(d).push(b);
  }

  const ledger = [];
  let balance = Number(startingBalance) || 0;
  let minBalance = Infinity;
  let minDate = todayStr;
  let totalBills = 0;
  let totalIncome = 0;

  for (let i = 0; i < daysInCycle; i++) {
    const date = addDays(todayStr, i);
    const dayIncomes = incomeByDate.get(date) || [];
    const dayBills = billsByDate.get(date) || [];

    const incomeSum = dayIncomes.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const billSum = dayBills.reduce((s, x) => s + Math.abs(Number(x.amount ?? x.cost) || 0), 0);

    balance += incomeSum;
    balance -= billSum;
    balance -= essentialsDaily;

    totalIncome += incomeSum;
    totalBills += billSum;

    if (balance < minBalance) {
      minBalance = balance;
      minDate = date;
    }

    ledger.push({
      date,
      income: incomeSum,
      bills: billSum,
      essentials: essentialsDaily,
      balance: Math.round(balance * 100) / 100,
      events: [
        ...dayIncomes.map(x => `+ ${x.label || 'Income'} $${Number(x.amount).toFixed(2)}`),
        ...dayBills.map(x => `- ${x.name} $${Math.abs(Number(x.amount ?? x.cost) || 0).toFixed(2)}`),
      ],
    });
  }

  if (minBalance === Infinity) minBalance = balance;

  const round2 = (n) => Math.round(n * 100) / 100;
  return {
    safeToSpend: round2(minBalance - (Number(safetyBuffer) || 0)),
    minBalance: round2(minBalance),
    minDate,
    endBalance: round2(balance),
    totalBills: round2(totalBills),
    totalIncome: round2(totalIncome),
    essentialsTotal: round2(essentialsDaily * daysInCycle),
    daysInCycle,
    ledger,
  };
}
