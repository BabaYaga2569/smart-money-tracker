import React from "react";
import { FaWallet, FaList, FaDollarSign, FaFileInvoice, FaRedo, FaBullseye, FaThLarge, FaChartLine, FaCalendarAlt } from "react-icons/fa";

const Dashboard = () => {
  const tiles = [
    { title: "Accounts", icon: <FaWallet />, preview: "Preview coming soon..." },
    { title: "Transactions", icon: <FaList />, preview: "Preview coming soon..." },
    { title: "Spendability", icon: <FaDollarSign />, preview: "Preview coming soon..." },
    { title: "Bills", icon: <FaFileInvoice />, preview: "Preview coming soon..." },
    { title: "Recurring", icon: <FaRedo />, preview: "Preview coming soon..." },
    { title: "Goals", icon: <FaBullseye />, preview: "Preview coming soon..." },
    { title: "Categories", icon: <FaThLarge />, preview: "Preview coming soon..." },
    { title: "Cash Flow", icon: <FaChartLine />, preview: "Preview coming soon..." },
    { title: "Pay Cycle", icon: <FaCalendarAlt />, preview: "Preview coming soon..." },
  ];

  return (
    <div className="dashboard">
      <h1>Smart Money Tracker</h1>
      <p className="backend-status">Backend status: Backend is working!</p>
      <div className="tile-grid">
        {tiles.map((tile, index) => (
          <div className="tile" key={index}>
            <div className="tile-icon">{tile.icon}</div>
            <h2>{tile.title}</h2>
            <p>{tile.preview}</p>
            <button>View All</button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;
