// utils/snowball.js
// Debt Snowball / Avalanche calculator for credit cards (plain JS)
import { estimateMinimumPayment } from "./debt";

/**
 * Build payoff plan for a set of credit accounts.
 * @param {Array} accounts - Plaid accounts with balances + limit (type === "credit")
 * @param {Object} liabilitiesByAccount - map of account_id -> liability (min payment, due date, aprs)
 * @param {"snowball"|"avalanche"} mode - ordering strategy
 * @param {number} extraBudget - extra dollars per month on top of minimums
 * @returns {{order: Array, totalMonths: number, totalInterest: number, perAccount: Array}}
 */
export function buildPayoffPlan(accounts=[], liabilitiesByAccount={}, mode="snowball", extraBudget=0) {
  // Prepare working structures
  const items = accounts.map(acc => {
    const bal = Number(acc?.balances?.current || 0);
    const apr = extractApr(liabilitiesByAccount[acc.account_id]) ?? 20;
    const minPay = Number(liabilitiesByAccount[acc.account_id]?.minimum_payment_amount ?? estimateMinimumPayment(bal, apr));
    const limit = Number(acc?.balances?.limit || 0) || undefined;
    return {
      id: acc.account_id,
      name: acc.name || acc.official_name || "Credit Card",
      balance: bal,
      apr,
      minPay,
      limit,
    };
  }).filter(x => x.balance > 0.01);

  if (items.length === 0) {
    return { order: [], totalMonths: 0, totalInterest: 0, perAccount: [] };
  }

  // Order by mode
  if (mode === "snowball") {
    items.sort((a,b) => a.balance - b.balance);
  } else {
    // avalanche
    items.sort((a,b) => b.apr - a.apr);
  }

  const rMonthly = (apr) => (apr/100)/12;

  // Simulate month-by-month
  const MAX = 480; // 40 years hard cap
  let month = 0;
  let totalInterest = 0;
  const perAccount = items.map(x => ({ id: x.id, name: x.name, months: 0 }));
  const order = items.map(x => x.id);

  while (items.some(x => x.balance > 0.01) && month < MAX) {
    month++;
    // base: pay minimums on all open accounts
    let budget = extraBudget;
    for (const x of items) {
      if (x.balance <= 0.01) continue;
      const interest = x.balance * rMonthly(x.apr);
      totalInterest += interest;
      x.balance += interest;
    }
    // Apply minimums first
    for (const x of items) {
      if (x.balance <= 0.01) continue;
      const pay = Math.min(x.minPay, x.balance);
      x.balance -= pay;
    }
    // Apply extraBudget to the first still-open account in order
    const target = items.find(x => x.balance > 0.01);
    if (target && budget > 0) {
      const extraPay = Math.min(budget, target.balance);
      target.balance -= extraPay;
      budget -= extraPay;
    }
    // Track months on open accounts
    for (const p of perAccount) {
      const src = items.find(i => i.id === p.id);
      if (src && src.balance > 0.01) p.months++;
    }
  }

  const totalMonths = month;
  return { order, totalMonths, totalInterest, perAccount };
}

export function extractApr(liab) {
  if (!liab || !Array.isArray(liab.aprs)) return undefined;
  const item = liab.aprs.find(a => typeof a.apr_percentage === "number");
  return item?.apr_percentage;
}