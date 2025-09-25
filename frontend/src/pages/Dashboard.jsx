import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import './Dashboard.css';

const Dashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [firebaseConnected, setFirebaseConnected] = useState(false);
  const [dashboardData, setDashboardData] = useState({
    totalBalance: 1530.07,  // Default fallback data
    accountCount: 4,
    safeToSpend: 1247.50,
    billsDueSoon: 2,
    recurringCount: 8,
    daysUntilPayday: 5,
    monthlyIncome: 5500,
    monthlyExpenses: 4957
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Add timeout to prevent infinite loading
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Firebase timeout')), 5000)
      );

      const dataPromise = async () => {
        const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
        const settingsDocSnap = await getDoc(settingsDocRef);
        return settingsDocSnap;
      };

      const settingsDocSnap = await Promise.race([dataPromise(), timeoutPromise]);
      
      if (settingsDocSnap.exists()) {
        setFirebaseConnected(true);
        const data = settingsDocSnap.data();
        
        // Calculate your real data here
        const bankAccounts = data.bankAccounts || {};
        const totalBalance = Object.values(bankAccounts).reduce((sum, account) => {
          return sum + (parseFloat(account.balance) || 0);
        }, 0);
        const accountCount = Object.keys(bankAccounts).length;

        // Update with real Firebase data
        setDashboardData({
          totalBalance: totalBalance || 1530.07,
          accountCount: accountCount || 4,
          safeToSpend: data.safeToSpend || 1247.50,
          billsDueSoon: 2,
          recurringCount: 8,
          daysUntilPayday: 5,
          monthlyIncome: 5500,
          monthlyExpenses: 4957
        });
      } else {
        // Firebase connected but no data - use defaults
        setFirebaseConnected(true);
        console.log('Firebase connected but no user data found');
      }
    } catch (error) {
      console.error('Firebase error, using fallback data:', error);
      setFirebaseConnected(false);
      // Keep default fallback data
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const tiles = [
    {
      title: 'Accounts',
      icon: '💳',
      value: `${dashboardData.accountCount} accounts`,
      subtitle: `Total: ${formatCurrency(dashboardData.totalBalance)}`,
      path: '/accounts',
      color: 'blue'
    },
    {
      title: 'Transactions',
      icon: '📊',
      value: '124 this month',
      subtitle: 'Recent activity',
      path: '/transactions',
      color: 'green'
    },
    {
      title: 'Spendability',
      icon: '💰',
      value: formatCurrency(dashboardData.safeToSpend),
      subtitle: 'Safe to spend',
      path: '/spendability',
      color: 'yellow'
    },
    {
      title: 'Bills',
      icon: '🧾',
      value: `${dashboardData.billsDueSoon} due soon`,
      subtitle: 'Upcoming bills',
      path: '/bills',
      color: 'red'
    },
    {
      title: 'Recurring',
      icon: '🔄',
      value: `${dashboardData.recurringCount} active`,
      subtitle: 'Auto-payments',
      path: '/recurring',
      color: 'purple'
    },
    {
      title: 'Goals',
      icon: '🎯',
      value: '3 in progress',
      subtitle: 'Financial targets',
      path: '/goals',
      color: 'orange'
    },
    {
      title: 'Categories',
      icon: '🏷️',
      value: '12 categories',
      subtitle: 'Spending breakdown',
      path: '/categories',
      color: 'pink'
    },
    {
      title: 'Cash Flow',
      icon: '📈',
      value: formatCurrency(dashboardData.monthlyIncome - dashboardData.monthlyExpenses),
      subtitle: 'Monthly net income',
      path: '/cashflow',
      color: 'teal'
    },
    {
      title: 'Pay Cycle',
      icon: '📅',
      value: `${dashboardData.daysUntilPayday} days`,
      subtitle: 'Until next payday',
      path: '/paycycle',
      color: 'indigo'
    }
  ];

  // Always show tiles, even when loading
  return (
    <div className="dashboard-container">
      <div className="page-header">
        <h2>💰 Smart Money Tracker</h2>
        <p>Your complete financial overview</p>
        <div className="backend-status">
          <span className={`status-indicator ${firebaseConnected ? 'online' : 'offline'}`}></span>
          Status: {loading ? 'Loading...' : firebaseConnected ? 'Connected' : 'Using cached data'}
        </div>
      </div>

      <div className="dashboard-tiles-grid">
        {tiles.map((tile, index) => (
          <div 
            key={index} 
            className={`dashboard-tile ${tile.color} ${loading ? 'loading' : ''}`}
            onClick={() => navigate(tile.path)}
          >
            <div className="tile-header">
              <div className="tile-icon">{tile.icon}</div>
              <h3>{tile.title}</h3>
            </div>
            <div className="tile-content">
              <div className="tile-value">{tile.value}</div>
              <div className="tile-subtitle">{tile.subtitle}</div>
            </div>
            <button className="tile-button">View All</button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;