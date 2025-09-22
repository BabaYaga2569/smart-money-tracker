import React from "react";
import { FaWallet, FaExchangeAlt, FaChartPie, FaFileInvoiceDollar, FaRedo, FaBullseye, FaThList, FaMoneyBillWave, FaCalendarAlt } from "react-icons/fa";

const tiles = [
  { title: "Accounts", icon: <FaWallet />, description: "Preview coming soon..." },
  { title: "Transactions", icon: <FaExchangeAlt />, description: "Preview coming soon..." },
  { title: "Spendability", icon: <FaChartPie />, description: "Preview coming soon..." },
  { title: "Bills", icon: <FaFileInvoiceDollar />, description: "Preview coming soon..." },
  { title: "Recurring", icon: <FaRedo />, description: "Preview coming soon..." },
  { title: "Goals", icon: <FaBullseye />, description: "Preview coming soon..." },
  { title: "Categories", icon: <FaThList />, description: "Preview coming soon..." },
  { title: "Cash Flow", icon: <FaMoneyBillWave />, description: "Preview coming soon..." },
  { title: "Pay Cycle", icon: <FaCalendarAlt />, description: "Preview coming soon..." },
];

export default function Dashboard() {
  return (
    <div className="p-8">
      <h1 className="text-4xl font-bold mb-6 text-green-400">Smart Money Tracker</h1>
      <p className="mb-8 text-green-300">Backend status: Backend is working!</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {tiles.map((tile, index) => (
          <div
            key={index}
            className="bg-black border border-green-500 p-6 rounded-2xl shadow-lg hover:shadow-green-400 hover:scale-105 transition-transform duration-200"
          >
            <div className="text-4xl mb-4 text-green-400">{tile.icon}</div>
            <h2 className="text-xl font-bold text-green-300">{tile.title}</h2>
            <p className="text-green-200">{tile.description}</p>
            <button className="mt-4 px-4 py-2 border border-green-500 rounded-lg text-green-300 hover:bg-green-500 hover:text-black transition">
              View All
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
