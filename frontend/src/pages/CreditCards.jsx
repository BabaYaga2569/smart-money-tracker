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
  const difference = projectedBalance - liveBalance;

  return (
    <div className="page-container text-green-400">
      <header className="page-header flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-1 flex items-center gap-2">
            💳 Credit Cards
          </h1>
          <p className="text-gray-300">
            View and manage your credit card balances, utilization, and payoff details.
          </p>
        </div>
      </header>

      {/* Summary Block */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-zinc-900 rounded-xl p-4 text-center shadow-md border border-green-500">
          <h2 className="text-green-300 font-semibold">Live Balance</h2>
          <p className="text-3xl font-bold">{currency(liveBalance)}</p>
        </div>
        <div className="bg-zinc-900 rounded-xl p-4 text-center shadow-md border border-green-500">
          <h2 className="text-green-300 font-semibold">Projected Balance</h2>
          <p className="text-3xl font-bold">{currency(projectedBalance)}</p>
        </div>
        <div className="bg-zinc-900 rounded-xl p-4 text-center shadow-md border border-green-500">
          <h2 className="text-green-300 font-semibold">Difference</h2>
          <p className={`text-3xl font-bold ${difference >= 0 ? "text-green-400" : "text-red-400"}`}>
            {difference >= 0 ? "+" : ""}
            {currency(difference)}
          </p>
        </div>
      </div>

      {/* Cards Grid */}
      {cards.length === 0 ? (
        <div className="bg-zinc-900 rounded-xl p-6 text-center text-green-400 border border-green-500 shadow-md">
          No credit card accounts detected from Plaid yet. <br />
          Make sure your connected institutions include credit cards.
        </div>
      ) : (
        <>
          <p className="text-gray-400 mb-2">Across {cards.length} credit card{cards.length > 1 ? "s" : ""}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map((card) => {
              const available = card.balances?.available ?? 0;
              const current = card.balances?.current ?? 0;
              const utilization = available
                ? ((current / available) * 100).toFixed(1)
                : 0;

              return (
                <div
                  key={card.account_id}
                  className="bg-gradient-to-b from-zinc-900 to-black rounded-2xl p-4 border border-green-500 shadow-md hover:shadow-lg hover:scale-[1.01] cursor-pointer transition-all"
                >
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-green-300 font-semibold">{card.name}</h3>
                    <span className="text-sm text-gray-400">
                      {card.subtype || "Credit"}
                    </span>
                  </div>

                  <p className="text-sm text-gray-400 mb-1">
                    Available Credit:{" "}
                    <span className="text-green-400">
                      {currency(available)}
                    </span>
                  </p>

                  <p className="text-sm text-gray-400 mb-1">
                    Current Balance:{" "}
                    <span className="text-red-400">
                      {currency(current)}
                    </span>
                  </p>

                  <div className="w-full bg-gray-700 h-2 rounded-full mt-2">
                    <div
                      className="bg-green-400 h-2 rounded-full"
                      style={{ width: `${Math.min(utilization, 100)}%` }}
                    />
                  </div>

                  <p className="text-xs text-gray-400 mt-1">
                    Utilization: {utilization}%
                  </p>

                  <button className="bg-green-600 hover:bg-green-700 text-black font-semibold py-1 px-3 rounded mt-3 w-full">
                    View Details
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
