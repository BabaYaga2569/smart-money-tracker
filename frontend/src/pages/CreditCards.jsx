// pages/CreditCards.jsx
import React, { useEffect, useState, useMemo } from "react";
import CreditCardCard from "../components/CreditCardCard";
import DebtTimeline from "../components/DebtTimeline";
import { currency } from "../utils/debt";
import { subscribePlans } from "../store/creditCards";
import { buildPayoffPlan } from "../utils/snowball";

export default function CreditCards() {
  const [cards, setCards] = useState([]); // Plaid credit accounts
  const [liabByAcc, setLiabByAcc] = useState({}); // optional liabilities
  const [tick, setTick] = useState(0); // refresh counter

  // Snowball / Avalanche
  const [mode, setMode] = useState("snowball");
  const [extra, setExtra] = useState(0);

  useEffect(() => {
    // Fetch Plaid accounts
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data) => {
        const list = data.accounts || data || [];
        const credit = list.filter((a) => a.type === "credit");
        setCards(credit);
      })
      .catch(() => setCards([]));

    // Fetch liabilities if available
    fetch("/api/liabilities/credit")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => {
        const map = {};
        (list || []).forEach((l) => (map[l.account_id] = l));
        setLiabByAcc(map);
      })
      .catch(() => setLiabByAcc({}));

    const unsub = subscribePlans(() => setTick((t) => t + 1));
    return () => unsub();
  }, []);

  // Build payoff plan
  const plan = useMemo(() => buildPayoffPlan(cards, liabByAcc, mode, extra), [cards, liabByAcc, mode, extra, tick]);

  // Totals
  const totalBalance = cards.reduce((sum, c) => sum + (c.balances?.current || 0), 0);

  return (
    <div className="page-container text-green-400 p-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold mb-2">💳 Credit Cards</h1>
        <p className="text-gray-300">
          Snowball/Avalanche payoff planning, utilization awareness, and Spendability integration.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <div className="bg-zinc-900 rounded-xl p-4 shadow-md">
          <h2 className="font-semibold text-lg text-green-300 mb-2">Total CC Balance</h2>
          <p className="text-3xl font-bold">{currency(totalBalance)}</p>
        </div>

        <div className="bg-zinc-900 rounded-xl p-4 shadow-md">
          <h2 className="font-semibold text-lg text-green-300 mb-2">Cards Tracked</h2>
          <p className="text-3xl font-bold">{cards.length}</p>
        </div>

        <div className="bg-zinc-900 rounded-xl p-4 shadow-md">
          <h2 className="font-semibold text-lg text-green-300 mb-2">Strategy</h2>
          <div className="flex items-center gap-3 mt-2">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="strategy"
                value="snowball"
                checked={mode === "snowball"}
                onChange={(e) => setMode(e.target.value)}
              />
              Snowball
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="strategy"
                value="avalanche"
                checked={mode === "avalanche"}
                onChange={(e) => setMode(e.target.value)}
              />
              Avalanche
            </label>
          </div>
          <div className="mt-4">
            <label className="block text-sm mb-1">Extra Monthly Paydown</label>
            <input
              type="number"
              value={extra}
              onChange={(e) => setExtra(parseFloat(e.target.value) || 0)}
              className="bg-zinc-800 text-green-400 rounded px-2 py-1 w-24"
            />
          </div>
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="bg-zinc-900 rounded-xl p-6 text-center text-green-400 shadow-md">
          No credit card accounts detected from Plaid yet.<br />
          Make sure your connected institutions include credit cards.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {cards.map((card) => (
              <CreditCardCard
                key={card.account_id}
                card={card}
                liability={liabByAcc[card.account_id]}
                mode={mode}
                extra={extra}
              />
            ))}
          </div>

          <div className="mt-10">
            <DebtTimeline plan={plan} />
          </div>
        </>
      )}
    </div>
  );
}
