// components/DashboardTileCreditCard.jsx
import React, { useEffect, useState } from "react";
import { currency } from "../utils/debt";
import { getMonthlyOutflowForAccounts, subscribePlans } from "../store/creditCards";

export default function DashboardTileCreditCard() {
  const [accounts, setAccounts] = useState([]);
  const [liabByAcc, setLiabByAcc] = useState({});
  const [tick, setTick] = useState(0); // re-render on plan changes

  useEffect(() => {
    // Pull all accounts then filter locally
    fetch("/api/accounts")
      .then(r => r.json())
      .then(data => {
        const credit = (data.accounts || data || []).filter(a => a.type === "credit");
        setAccounts(credit);
      })
      .catch(() => {});

    // Try liabilities if available (optional)
    fetch("/api/liabilities/credit")
      .then(r => r.ok ? r.json() : [])
      .then(list => {
        const map = {};
        (list || []).forEach(l => { map[l.account_id] = l; });
        setLiabByAcc(map);
      })
      .catch(() => {});

    const unsub = subscribePlans(() => setTick(t => t + 1));
    return () => unsub();
  }, []);

  const totalBalance = accounts.reduce((s, a) => s + (a?.balances?.current || 0), 0);
  const monthlyOutflow = getMonthlyOutflowForAccounts(accounts, liabByAcc);

  return (
    <a href="/creditcards" className="block rounded-2xl border p-4 bg-white shadow-sm hover:shadow-md transition">
      <div className="text-sm text-gray-500">Credit Cards</div>
      <div className="text-xl font-semibold">{currency(totalBalance)}</div>
      <div className="mt-2 text-xs text-gray-600">Planned Monthly Payments: <span className="font-semibold">{currency(monthlyOutflow)}</span></div>
    </a>
  );
}