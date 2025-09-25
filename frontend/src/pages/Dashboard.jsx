import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { PayCycleCalculator } from '../utils/PayCycleCalculator';
import { RecurringBillManager } from '../utils/RecurringBillManager';
import './Dashboard.css';

const Dashboard = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState({
    totalBalance: 0,
    accountCount: 0,
    safeToSpend: 0,
    billsDueSoon: 0,
    recurringCount: 0,
    daysUntilPayday: 0,
    monthlyIncome: 0,
    monthlyExpenses: 0
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
      const settingsDocSnap = await getDoc(settingsDocRef);
      
      const payCycleDocRef = doc(db, 'users', 'steve-colburn', 'financial', 'payCycle');
      const payCycleDocSnap = await getDoc(payCycleDocRef);

      if (settingsDocSnap.exists()) {
        const data = settingsDocSnap.data();
        
        // Calculate account data
        const bankAccounts = data.bankAccounts || {};
        const totalBalance = Object.values(bankAccounts).reduce((sum, account) => {
          return sum + (parseFloat(account.balance) || 0);
        }, 0);
        const accountCount = Object.keys(bankAccounts).length;

        // Calculate bills data
        const bills = data.bills || [];
        const processedBills = RecurringBillManager.processBills(bills);
        const nextWeekDate = new Date();
        nextWeekDate.setDate(nextWeekDate.getDate() + 7);
        const billsDueSoon = RecurringBillManager.getBillsDueBefore(processedBills, nextWeekDate).length;
        const recurringCount = bills.filter(bill => bill.recurrence && bill.recurrence !== 'one-time').length;

        // Calculate spendability
        const payCycleData = payCycleDocSnap.exists() ? payCycleDocSnap.data() : null;
        let nextPayday = '2025-09-30';
        let daysUntilPayday = 5;
        
        if (payCycleData && payCycleData.date) {
          nextPayday = payCycleData.date;
          const today = new Date();
          const paydayDate = new Date(nextPayday);
          daysUntilPayday = Math.ceil((paydayDate - today) / (1000 * 60 * 60 * 24));
        }

        const billsBeforePayday = RecurringBillManager.getBillsDueBefore(processedBills, new Date(nextPayday));
        const totalBillsDue = billsBeforePayday.reduce((sum, bill) => sum + (parseFloat(bill.amount) || 0), 0);
        
        const preferences = data.preferences || {};
        const weeklyEssentials = preferences.weeklyEssentials || 0;
        const safetyBuffer = preferences.safetyBuffer || 0;
        const weeksUntilPayday = Math.ceil(daysUntilPayday / 7);
        const essentialsNeeded = weeklyEssentials * weeksUntilPayday;
        
        const safeToSpend = totalBalance - totalBillsDue - safetyBuffer - essentialsNeeded;

        // Calculate monthly income/expenses
        const paySchedules = data.paySchedules || {};
        const yourMonthlyPay = (parseFloat(paySchedules.yours?.amount) || 0) * 2.17; // Bi-weekly to monthly
        const spouseMonthlyPay = (parseFloat(paySchedules.spouse?.amount) || 0) * 2; // Bi-monthly to monthly
        const monthlyIncome = yourMonthlyPay + spouseMonthlyPay;
        
        const monthlyBills = bills.reduce((sum, bill) => {
          if (bill.recurrence === 'monthly') return sum + (parseFloat(bill.amount) || 0);
          if (bill.recurrence === 'weekly') return sum + ((parseFloat(bill.amount) || 0) * 4.33);
          if (bill.recurrence === 'bi-weekly') return sum + ((parseFloat(bill.amount) || 0) * 2.17);
          return sum;
        }, 0);
        const monthlyExpenses = monthlyBills + (weeklyEssentials * 4.33);

        setDashboardData({
          totalBalance,
          accountCount,
          safeToSpend,
          billsDueSoon,
          recurringCount,
          daysUntilPayday: Math.max(0, daysUntilPayday),
          monthlyIncome,
          monthlyExpenses
        });
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
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

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="page-header">
          <h2>💰 Smart Money Tracker</h2>
          <p>Loading your financial overview...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="page-header">
        <h2>💰 Smart Money Tracker</h2>
        <p>Your complete financial overview</p>
        <div className="backend-status">
          <span className="status-indicator online"></span>
          Backend status: Connected
        </div>
      </div>

      <div className="dashboard-tiles-grid">
        {tiles.map((tile, index) => (
          <div 
            key={index} 
            className={`dashboard-tile ${tile.color}`}
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