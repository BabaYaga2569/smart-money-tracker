// components/WhatIfPanel.jsx
import React, { useMemo, useState } from "react";
import { estimateMinimumPayment, simulatePayoff, currency } from "../utils/debt";

const fmtDuration = (months) => {
  const y = Math.floor(months / 12);
  const m = months % 12;
  return `${y}y ${m}m`;
};

export default function WhatIfPanel({ balance, apr, minPayment, initialPayment, onAdoptPlan }) {
  const defaultMin = useMemo(() => (minPayment != null ? Number(minPayment) : estimateMinimumPayment(Number(balance)||0, Number(apr)||0)), [minPayment, balance, apr]);
  const [payment, setPayment] = useState(() => Math.round(defaultMin));

  const result = useMemo(() => simulatePayoff(Number(balance)||0, Number(apr)||0, Number(payment)||0), [balance, apr, payment]);

  const warnNeg = result.negativeAmortization;

  return (
    <div className="rounded-2xl border p-4 shadow-sm bg-white">
      <div className="grid gap-3 md:grid-cols-4 items-end">
        <Field label="Current Balance" value={currency(balance)} />
        <Field label="APR" value={`${Number(apr||0).toFixed(2)}%`} />
        <Field label="Minimum Payment" value={currency(defaultMin)} />
        <div>
          <div className="text-sm text-gray-600">Your Monthly Payment</div>
          <input
            type="number"
            className="w-full rounded-xl border px-3 py-2"
            value={payment}
            min={0}
            onChange={(e) => setPayment(parseFloat(e.target.value || "0"))}
          />
        </div>
      </div>

      <div className="mt-4 grid md:grid-cols-4 gap-4">
        <Stat label="Payoff Time" value={warnNeg ? "Never (increase payment)" : fmtDuration(result.months)} />
        <Stat label="Total Interest" value={warnNeg ? "—" : currency(result.totalInterest)} />
        <Stat label="Total Paid" value={warnNeg ? "—" : currency(result.totalPaid)} />
        <button
          className="rounded-xl bg-black text-white px-4 py-2 font-semibold"
          onClick={() => onAdoptPlan && onAdoptPlan(Number(payment)||0)}
        >
          Adopt This Payment Plan
        </button>
      </div>

      {warnNeg && (
        <p className="mt-3 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2">
          Your payment is not covering monthly interest. Increase it until "Payoff Time" shows a real value.
        </p>
      )}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div className="text-sm text-gray-600">{label}</div>
      <div className="font-semibold">{value}</div>
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