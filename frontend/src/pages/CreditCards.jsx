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
    <div className="flex flex-col p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-green-400 flex items-center gap-2">
            💳 Credit Cards
          </h1>
          <p className="text-gray-300">
            View and manage your credit card balances, utilization, and payoff details.
          </p>
        </div>
      </div>

      {/* Summary Tiles (identical to Accounts.jsx) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-b from-zinc-900 to-black border border-green-500 rounded-xl p-4 shadow-md text-center">
          <h2 className="text-green-300 font-semibold">Live Balance</h2>
          <p className="text-3xl font-bold">{currency(liveBalance)}</p>
        </div>

        <div className="bg-gradient-to-b from-zinc-900 to-black border border-green-500 rounded-xl p-4 shadow-md text-center">
          <h2 className="text-green-300 font-semibold">Projected Balance</h2>
          <p className="text-3xl font-bold">{currency(projectedBalance)}</p>
        </div>

        <div className="bg-gradient-to-b from-zinc-900 to-black border border-green-500 rounded-xl p-4 shadow-md text-center">
          <h2 className="text-green-300 font-semibold">Difference</h2>
          <p
            className={`text-3xl font-bold ${
              difference >= 0 ? "text-green-400" : "text-red-400"
            }`}
          >
            {difference >= 0 ? "+" : ""}
            {currency(difference)}
          </p>
        </div>
      </div>

      {/* Credit Card Tiles */}
      {cards.length === 0 ? (
        <div className="bg-zinc-900 border border-green-500 rounded-xl p-6 text-center text-green-400 shadow-md">
          No credit card accounts detected from Plaid yet.
          <br />
          Make sure your connected institutions include credit cards.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map((card) => {
            const available = card.balances?.available ?? 0;
            const current = card.balances?.current ?? 0;
            const utilization = available
              ? ((current / available) * 100).toFixed(1)
              : 0;

            return (
              <div
                key={card.account_id}
                className="bg-gradient-to-b from-zinc-900 to-black border border-green-500 rounded-2xl p-5 shadow-md hover:shadow-lg hover:scale-[1.01] transition-all"
              >
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-green-300 font-semibold">{card.name}</h3>
                  <span className="text-sm text-gray-400">
                    {card.subtype || "Credit"}
                  </span>
                </div>

                <div className="text-sm text-gray-400 space-y-1">
                  <p>
                    Available Credit:{" "}
                    <span className="text-green-400">
                      {currency(available)}
                    </span>
                  </p>
                  <p>
                    Current Balance:{" "}
                    <span className="text-red-400">
                      {currency(current)}
                    </span>
                  </p>
                  <p>Utilization: {utilization}%</p>
                </div>

                <div className="mt-3 w-full bg-gray-700 h-2 rounded-full">
                  <div
                    className="bg-green-400 h-2 rounded-full"
                    style={{ width: `${Math.min(utilization, 100)}%` }}
                  />
                </div>

                <button className="bg-green-600 hover:bg-green-700 text-black font-semibold py-1 px-3 rounded mt-4 w-full">
                  View Details
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
