// components/UtilizationBar.jsx
import React from "react";

export default function UtilizationBar({ balance=0, limit=0 }) {
  const pct = limit ? Math.min(100, Math.max(0, (Number(balance)||0) / Number(limit) * 100)) : 0;
  let color = "bg-gray-300";
  if (pct < 30) color = "bg-green-500";
  else if (pct < 70) color = "bg-yellow-500";
  else color = "bg-red-500";

  return (
    <div className="mt-2">
      <div className="h-2 w-full rounded bg-gray-200 overflow-hidden">
        <div className={`h-2 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-gray-600 mt-1">
        {isFinite(pct) ? `${pct.toFixed(0)}% used` : "—"} {limit ? `(${currency(balance)} / ${currency(limit)})` : ""}
      </div>
    </div>
  );
}

function currency(n) {
  try { return Number(n).toLocaleString(undefined, { style: "currency", currency: "USD" }); }
  catch { return `$${Number(n||0).toFixed(2)}`; }
}