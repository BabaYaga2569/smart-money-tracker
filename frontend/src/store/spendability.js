// store/spendability.js
import { getMonthlyOutflowForAccounts } from "./creditCards";

// Helper: subtract credit card planned payments from your existing spendability
export function computeSpendableWithCards(baseSpendable, creditAccounts, liabilitiesByAccount = {}) {
  const ccOutflow = getMonthlyOutflowForAccounts(creditAccounts, liabilitiesByAccount);
  return (Number(baseSpendable) || 0) - ccOutflow;
}
