// components/DashboardTileCreditCard.jsx
import React, { useEffect, useState } from "react";
import { currency } from "../utils/debt";
import { getMonthlyOutflowForAccounts, subscribePlans } from "../store/creditCards";
import { useAuth } from "../contexts/AuthContext";
import { isCreditAccount } from "../utils/accountVisibility";

export default function DashboardTileCreditCard() {
  const { currentUser } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [liabByAcc, setLiabByAcc] = useState({});
  const [tick, setTick] = useState(0); // re-render on plan changes

  useEffect(() => {
    if (!currentUser) {
      setAccounts([]);
      return undefined;
    }

    const apiUrl =
      import.meta.env.VITE_API_URL ||
      "https://smart-money-tracker-09ks.onrender.com";

    fetch(`${apiUrl}/api/accounts?userId=${currentUser.uid}&_t=${Date.now()}`)
      .then(r => r.json())
      .then(data => {
        const credit = (data.accounts || []).filter(isCreditAccount);
        setAccounts(credit);
      })
      .catch(() => setAccounts([]));

    // No backend liabilities endpoint is currently implemented. Card plan
    // settings remain local until a canonical liabilities source is added.
    setLiabByAcc({});

    const unsub = subscribePlans(() => setTick(t => t + 1));
    return () => unsub();
  }, [currentUser]);

  const totalBalance = accounts.reduce((sum, account) => sum + Number(account.current_balance ?? account.current ?? account.balances?.current ?? account.balance ?? 0), 0);
  const monthlyOutflow = getMonthlyOutflowForAccounts(accounts, liabByAcc);

  return (
    <a href="/creditcards" className="block rounded-2xl border p-4 bg-white shadow-sm hover:shadow-md transition">
      <div className="text-sm text-gray-500">Credit Cards</div>
      <div className="text-xl font-semibold">{currency(totalBalance)}</div>
      <div className="mt-2 text-xs text-gray-600">Planned Monthly Payments: <span className="font-semibold">{currency(monthlyOutflow)}</span></div>
    </a>
  );
}