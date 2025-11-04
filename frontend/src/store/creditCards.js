// store/creditCards.js
// Stores per-card user plan settings keyed by Plaid account_id.
// We DO NOT store balances/APR from Plaid here; backend is source of truth.
const KEY = 'smt_cc_plans_v1';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}
function save(obj) {
  localStorage.setItem(KEY, JSON.stringify(obj));
}

const plans = load(); // { [account_id]: { includeInSpendability: bool, customMonthlyPayment: number } }

let listeners = [];
export function subscribePlans(fn) {
  listeners.push(fn);
  fn(plans);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}
function emit() {
  listeners.forEach((fn) => fn(plans));
}

export function getPlan(accountId) {
  return plans[accountId] || { includeInSpendability: true, customMonthlyPayment: undefined };
}
export function updatePlan(accountId, patch) {
  plans[accountId] = { ...getPlan(accountId), ...patch };
  save(plans);
  emit();
}
export function removePlan(accountId) {
  delete plans[accountId];
  save(plans);
  emit();
}

// Compute monthly outflow across cards currently visible (accounts array from Plaid)
export function getMonthlyOutflowForAccounts(accounts, liabilitiesByAccount = {}) {
  return (accounts || []).reduce((sum, acc) => {
    const plan = getPlan(acc.account_id);
    if (!plan.includeInSpendability) return sum;
    const liab = liabilitiesByAccount[acc.account_id] || {};
    const minPay = liab.minimum_payment_amount;
    const chosen =
      plan.customMonthlyPayment != null ? Number(plan.customMonthlyPayment) : Number(minPay) || 0;
    return sum + (Number.isFinite(chosen) ? chosen : 0);
  }, 0);
}
