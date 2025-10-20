// components/CreditCardCard.jsx
import React from "react";
import WhatIfPanel from "./WhatIfPanel";
import UtilizationBar from "./UtilizationBar";
import { currency } from "../utils/debt";
import { getPlan, updatePlan } from "../store/creditCards";
import { extractApr } from "../utils/snowball";

export default function CreditCardCard({ account, liability }) {
  const plan = getPlan(account.account_id);
  const apr = extractApr(liability) ?? 20;
  const minPayment = liability?.minimum_payment_amount;
  const balance = account.balances?.current ?? 0;
  const limit = account.balances?.limit;

  return (
    <div className="rounded-2xl border p-5 bg-white shadow-sm grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">{account.name || account.official_name || "Credit Card"}</div>
          <div className="text-sm text-gray-600">
            {(account.official_name?.split(" ")[0]) || ""} {account.mask ? `• • • • ${account.mask}` : ""}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!plan.includeInSpendability}
            onChange={(e) => updatePlan(account.account_id, { includeInSpendability: e.target.checked })}
          />
          Include in Spendability
        </label>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <Field label="Balance" value={currency(balance)} />
        <Field label="APR" value={`${Number(apr).toFixed(2)}%`} />
        <Field label="Limit" value={limit ? currency(limit) : "—"} />
        <Field label="Min Payment" value={minPayment != null ? currency(minPayment) : "—"} />
      </div>

      <UtilizationBar balance={balance} limit={limit} />

      <WhatIfPanel
        balance={balance}
        apr={apr}
        minPayment={minPayment}
        initialPayment={plan.customMonthlyPayment}
        onAdoptPlan={(p) => updatePlan(account.account_id, { customMonthlyPayment: p })}
      />

      {liability?.next_payment_due_date && (
        <div className="text-sm text-gray-600">
          Next Due: <span className="font-medium">{liability.next_payment_due_date}</span>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}