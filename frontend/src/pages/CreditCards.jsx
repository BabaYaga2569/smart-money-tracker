// pages/CreditCards.jsx
import React, { useEffect, useState } from "react";
import { currency } from "../utils/debt";

export default function CreditCards() {
  const [cards, setCards] = useState([]);

  useEffect(() => {
    fetch("/api/accounts")
      .then((r) => r.json())
      .then((data) => {
        const list = data.accounts || [];
        const credit = list.filter((a) => a.type === "credit");
        setCards(credit);
      })
      .catch(() => setCards([]));
  }, []);

  const liveBalance = cards.reduce((sum, c) => sum + (c.balances?.current || 0), 0);
  const projectedBalance = cards.reduce((sum, c) => sum + (c.balances?.available || 0), 0);

  return (
    <div className="page-container">
      <header className="page-header">
        <h1 className="page-title text-3xl font-bold text-green-400 mb-1">
          💳 Credit Cards
        </h1>
        <p className="text-gray-300 mb-6">
          View and manage your credit card balances and payoff strategies.
        </p>
      </header>

      {/* Summary cards like Accounts page */}
      <div className="flex flex-wrap gap-4 mb-8">
        <div className="bg-zinc-900 rounded-xl p-4 flex-1 min-w-[250px] shadow-md">
          <h2 className="text-green-300 font-semibold mb-1">Live Balance</h2>
          <p className="text-3xl font-bold">{currency(liveBalance)}</p>
        </div>
        <div className="bg-zinc-900 rounded-xl p-4 flex-1 min-w-[250px] shadow-md">
          <h2 className="text-green-300 font-semibold mb-1">Projected Balance</h2>
          <p className="text-3xl font-bold">{currency(projectedBalance)}</p>
        </div>
        <div className="bg-zinc-900 rounded-xl p-4 flex-1 min-w-[250px] shadow-md">
          <h2 className="text-green-300 font-semibold mb-1">Cards Linked</h2>
          <p className="text-3xl font-bold">{cards.length}</p>
        </div>
      </div>

      {/* Cards grid */}
      {cards.length === 0 ? (
        <div className="bg-zinc-900 rounded-xl p-6 text-center text-green-400 shadow-md">
          No credit card accounts detected from Plaid yet.
          <br />
          Make sure your connected institutions include credit cards.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((card) => (
            <div
              key={card.account_id}
              className="bg-gradient-to-b from-zinc-900 to-black rounded-2xl p-4 border border-green-500 shadow-md hover:shadow-lg hover:scale-[1.01] cursor-pointer transition-all"
            >
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-green-300 font-semibold">{card.name}</h3>
                <span className="text-sm text-gray-400">
                  {card.subtype || "Credit"}
                </span>
              </div>

              <p className="text-lg">
                Available: <span className="text-green-400">{currency(card.balances?.available || 0)}</span>
              </p>
              <p className="text-lg">
                Current Balance: <span className="text-red-400">{currency(card.balances?.current || 0)}</span>
              </p>

              <div className="mt-3">
                <button className="bg-green-600 hover:bg-green-700 text-black font-semibold py-1 px-3 rounded w-full">
                  View Details
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
