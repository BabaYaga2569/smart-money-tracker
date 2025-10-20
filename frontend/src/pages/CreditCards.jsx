// pages/CreditCards.jsx
import React, { useEffect, useMemo, useState } from "react";
import CreditCardCard from "../components/CreditCardCard";
import DebtTimeline from "../components/DebtTimeline";
import { currency } from "../utils/debt";
import { subscribePlans } from "../store/creditCards";
import { buildPayoffPlan } from "../utils/snowball";
import "../styles.css";

export default function CreditCards() {
  const [cards, setCards] = useState([]); // Plaid credit accounts
  const [liabByAcc, setLiabByAcc] = useState({}); // optional liabilities
  const [tick, setTick] = useState(0); // re-render on plan updates

  // Phase 2 controls
  const [mode, setMode] = useState("snowball"); // "snowball" | "avalanche"
  const [extra, setExtra] = useState(0);

  useEffect(() => {
    // 1) Fetch all accounts and filter client-side to credit
    fetch("/api/accounts")
      .then(r => r.json())
      .then(data => {
        const list = data.accounts || data || [];
        const credit = list.filter(a => a.type === "credit");
        setCards(credit);
      })
      .catch(() => setCards([]));

    // 2) Try to fetch liabilities (if your backend exposes it). It's optional.
    fetch("/api/liabilities/credit")
      .then(r => (r.ok ? r.json() : []))
      .then(list => {
        const map = {};
        (list || []).forEach(l => { map[l.account_id] = l; });
        setLiabByAcc(map);
      })
      .catch(() => setLiabByAcc({}));

    const unsub = subscribePlans(() => setTick(t => t + 1));
    return () => unsub();
  }, []);

  const totalBalance = useMemo(() => cards.reduce((s, c) => s + (c?.balances?.current || 0), 0), [cards, tick]);
  const plan = useMemo(() => buildPayoffPlan(cards, liabByAcc, mode, Number(extra)||0), [cards, liabByAcc, mode, extra]);

  return (
    <div className="max-w-6xl mx-auto p-4 grid gap-6">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Credit Cards</h1>
          <p className="text-gray-600">Snowball/Avalanche payoff planning, utilization awareness, and Spendability integration.</p>
        </div>
      </header>

      <div className="grid md:grid-cols-4 gap-4">
        <Stat label="Total CC Balance" value={currency(totalBalance)} />
        <Stat label="Cards Tracked" value={String(cards.length)} />
        <Stat label="Data Source" value="Plaid (live)" />
        <div className="rounded-2xl border p-4 bg-white shadow-sm grid gap-2">
          <div className="text-xs text-gray-500">Strategy</div>
          <div className="flex items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="mode" value="snowball" checked={mode==="snowball"} onChange={() => setMode("snowball")} />
              Snowball
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="mode" value="avalanche" checked={mode==="avalanche"} onChange={() => setMode("avalanche")} />
              Avalanche
            </label>
          </div>
          <label className="grid gap-1 text-sm">
            <span className="text-gray-600">Extra Monthly Paydown</span>
            <input
              className="rounded-xl border px-3 py-2"
              type="number"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="0"
              min={0}
            />
          </label>
        </div>
      </div>

      <DebtTimeline plan={plan} accounts={cards} />

      <section className="grid gap-4">
        {cards.map(acc => (
          <CreditCardCard key={acc.account_id} account={acc} liability={liabByAcc[acc.account_id]} />
        ))}
        {cards.length === 0 && (
          <div className="rounded-xl border p-4 bg-white text-sm text-gray-600">
            No credit card accounts detected from Plaid yet. Make sure your connected institution includes credit cards.
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border p-4 bg-white shadow-sm">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}