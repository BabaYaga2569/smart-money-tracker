import React from "react";
import { FaWallet, FaExchangeAlt, FaMoneyBillWave, FaFileInvoice, FaRedo, FaBullseye, FaThLarge, FaChartLine, FaCalendarAlt } from "react-icons/fa";

const tiles = [
  { title: "Accounts", icon: <FaWallet /> },
  { title: "Transactions", icon: <FaExchangeAlt /> },
  { title: "Spendability", icon: <FaMoneyBillWave /> },
  { title: "Bills", icon: <FaFileInvoice /> },
  { title: "Recurring", icon: <FaRedo /> },
  { title: "Goals", icon: <FaBullseye /> },
  { title: "Categories", icon: <FaThLarge /> },
  { title: "Cash Flow", icon: <FaChartLine /> },
  { title: "Pay Cycle", icon: <FaCalendarAlt /> },
];

export default function Dashboard() {
  return (
    <div className="p-6">
      <h1 className="text-4xl font-bold text-green-400 mb-8">Smart Money Tracker</h1>
      <p className="text-green-300 mb-6">Backend status: Backend is working!</p>
      
      {/* Grid layout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {tiles.map((tile, index) => (
          <div
            key={index}
            className="bg-black border border-green-600 rounded-xl shadow-md p-6 flex flex-col items-center text-center hover:shadow-green-500/50 transition"
          >
            <div className="text-4xl text-green-400 mb-4">{tile.icon}</div>
            <h2 className="text-xl font-bold text-green-300 mb-2">{tile.title}</h2>
            <p className="text-sm text-green-500 mb-4">Preview coming soon…</p>
            <button className="px-4 py-2 border border-green-500 text-green-400 rounded-lg hover:bg-green-500 hover:text-black transition">
              View All
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
