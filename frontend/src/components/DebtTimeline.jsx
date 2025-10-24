// components/DebtTimeline.jsx
import React from "react";
import { currency } from "../utils/debt";

/**
 * Simple textual timeline & summary for payoff plan
 * @param {Object} plan - from buildPayoffPlan
 * @param {Array} accounts - original accounts list
 */
export default function DebtTimeline({ plan, accounts }) {
  if (!plan || (plan?.order?.length || 0) === 0) {
    return null;
  }
  const nameById = Object.fromEntries(accounts.map(a => [a.account_id, a.name || a.official_name || "Credit Card"]));
  const orderedNames = plan.order.map(id => nameById[id] || id);

  return (
    <div className="rounded-2xl border p-4 bg-white shadow-sm grid gap-3">
      <div className="grid md:grid-cols-4 gap-4">
        <Stat label="Debt-Free In" value={`${plan.totalMonths} months`} />
        <Stat label="Projected Interest" value={currency(plan.totalInterest)} />
        <Stat label="Cards in Plan" value={String(plan.order.length)} />
        <div className="text-xs text-gray-600 self-center">Payoff Order: <span className="font-semibold">{orderedNames.join(" → ")}</span></div>
      </div>
      <div className="text-xs text-gray-500">
        * Interest projection assumes fixed APRs and balances update monthly. Real issuer compounding may differ slightly.
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}