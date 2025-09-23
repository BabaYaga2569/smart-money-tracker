import React, { useState, useEffect } from "react";
import "./Dashboard.css";
import { 
  FaWallet, FaList, FaDollarSign, FaFileInvoice, 
  FaRedo, FaBullseye, FaThLarge, FaChartLine, FaCalendarAlt 
} from "react-icons/fa";

const Dashboard = () => {
  const [backendStatus, setBackendStatus] = useState("Checking...");

  // Test backend connection
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const response = await fetch("http://localhost:5000/api/hello");
        if (response.ok) {
          const data = await response.json();
          setBackendStatus(data.message);
        } else {
          setBackendStatus("Backend offline");
        }
      } catch (error) {
        setBackendStatus("Backend offline");
      }
    };

    checkBackend();
  }, []);

  const tiles = [
    { 
      title: "Accounts", 
      icon: <FaWallet />, 
      preview: "View your bank accounts and balances",
      count: "3 accounts" 
    },
    { 
      title: "Transactions", 
      icon: <FaList />, 
      preview: "Recent transaction history",
      count: "124 this month" 
    },
    { 
      title: "Spendability", 
      icon: <FaDollarSign />, 
      preview: "How much you can safely spend",
      count: "$1,247.50" 
    },
    { 
      title: "Bills", 
      icon: <FaFileInvoice />, 
      preview: "Upcoming and overdue bills",
      count: "2 due soon" 
    },
    { 
      title: "Recurring", 
      icon: <FaRedo />, 
      preview: "Recurring transactions and subscriptions",
      count: "8 active" 
    },
    { 
      title: "Goals", 
      icon: <FaBullseye />, 
      preview: "Financial goals and progress",
      count: "3 in progress" 
    },
    { 
      title: "Categories", 
      icon: <FaThLarge />, 
      preview: "Spending by category",
      count: "12 categories" 
    },
    { 
      title: "Cash Flow", 
      icon: <FaChartLine />, 
      preview: "Income vs expenses over time",
      count: "+$543 this month" 
    },
    { 
      title: "Pay Cycle", 
      icon: <FaCalendarAlt />, 
      preview: "Next payday countdown",
      count: "5 days" 
    },
  ];

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Smart Money Tracker</h1>
        <p className="backend-status">Backend status: {backendStatus}</p>
      </div>
      
      <div className="tile-grid">
        {tiles.map((tile, index) => (
          <div className="tile" key={index}>
            <div className="tile-icon">{tile.icon}</div>
            <h2>{tile.title}</h2>
            <p className="tile-preview">{tile.preview}</p>
            <p className="tile-count">{tile.count}</p>
            <button className="tile-button">View All</button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;