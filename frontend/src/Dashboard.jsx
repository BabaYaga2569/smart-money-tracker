import React, { useState, useEffect } from "react";
import "./Dashboard.css";
import { 
  FaWallet, FaList, FaDollarSign, FaFileInvoice, 
  FaRedo, FaBullseye, FaThLarge, FaChartLine, FaCalendarAlt 
} from "react-icons/fa";
import { useAuth } from './contexts/AuthContext';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { RecurringBillManager } from './utils/RecurringBillManager';
import { CashFlowAnalytics } from './utils/CashFlowAnalytics';
import { PayCycleCalculator } from './utils/PayCycleCalculator';

const Dashboard = () => {
  const { currentUser } = useAuth();
  const [backendStatus, setBackendStatus] = useState("Checking...");
  const [loading, setLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState({
    accountsCount: 0,
    transactionsCount: 0,
    spendability: 0,
    billsCount: 0,
    recurringCount: 0,
    goalsCount: 0,
    categoriesCount: 0,
    cashFlow: 0,
    payCycleDays: 0
  });

  // Test backend connection
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'https://smart-money-tracker-09ks.onrender.com';
        const response = await fetch(`${apiUrl}/api/hello`);
        if (response.ok) {
          const data = await response.json();
          setBackendStatus(data.message);
        } else {
          setBackendStatus("Backend offline");
        }
      } catch {
        setBackendStatus("Backend offline");
      }
    };

    checkBackend();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load settings document for accounts and bills
      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      const settingsDocSnap = await getDoc(settingsDocRef);
      
      let accountsCount = 0;
      let billsCount = 0;
      let recurringCount = 0;
      let spendability = 0;
      let payCycleDays = 0;
      
      if (settingsDocSnap.exists()) {
        const settingsData = settingsDocSnap.data();
        
        // Count accounts
        const plaidAccounts = settingsData.plaidAccounts || [];
        accountsCount = plaidAccounts.length;
        
        // Calculate spendability (total balance)
        spendability = plaidAccounts.reduce((sum, account) => {
          return sum + (parseFloat(account.balance) || 0);
        }, 0);
        
        // Count bills and recurring bills
        const bills = settingsData.bills || [];
        const processedBills = RecurringBillManager.processBills(bills);
        
        // Count bills that are not paid
        billsCount = processedBills.filter(bill => bill.status !== 'paid').length;
        
        // Count recurring bills (bills with recurrence field set)
        recurringCount = bills.filter(bill => bill.recurrence && bill.recurrence !== 'one-time').length;
        
        // Calculate pay cycle days
        const payCycleDocRef = doc(db, 'users', currentUser.uid, 'financial', 'payCycle');
        const payCycleDocSnap = await getDoc(payCycleDocRef);
        
        if (payCycleDocSnap.exists()) {
          const payCycleData = payCycleDocSnap.data();
          payCycleDays = payCycleData.daysUntil || 0;
        } else if (settingsData.paySchedules?.yours?.lastPaydate) {
          // Calculate from pay schedules
          const result = PayCycleCalculator.calculateNextPayday(
            settingsData.paySchedules.yours,
            settingsData.paySchedules?.spouse || { amount: 0 }
          );
          payCycleDays = result.daysUntil || 0;
        }
      }
      
      // Load goals
      const goalsRef = collection(db, 'users', currentUser.uid, 'goals');
      const goalsSnapshot = await getDocs(goalsRef);
      const goalsCount = goalsSnapshot.size;
      
      // Load transactions
      const transactionsRef = collection(db, 'users', currentUser.uid, 'transactions');
      const transactionsSnapshot = await getDocs(transactionsRef);
      
      const transactions = [];
      transactionsSnapshot.forEach((doc) => {
        transactions.push({ id: doc.id, ...doc.data() });
      });
      
      // Count transactions from current month
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const transactionsCount = transactions.filter(t => {
        const transactionDate = new Date(t.date);
        return transactionDate.getMonth() === currentMonth && 
               transactionDate.getFullYear() === currentYear;
      }).length;
      
      // Calculate cash flow for current month
      const cashFlowMetrics = CashFlowAnalytics.calculateCashFlowMetrics(transactions);
      const cashFlow = cashFlowMetrics.netFlow;
      
      // Count categories (unique categories from transactions)
      const uniqueCategories = new Set(transactions.map(t => t.category).filter(Boolean));
      const categoriesCount = uniqueCategories.size;
      
      setDashboardData({
        accountsCount,
        transactionsCount,
        spendability,
        billsCount,
        recurringCount,
        goalsCount,
        categoriesCount,
        cashFlow,
        payCycleDays
      });
      
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load real data from Firebase
  useEffect(() => {
    if (currentUser) {
      loadDashboardData();
    }
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatCount = (count, singular, plural) => {
    if (count === 0) return `0 ${plural}`;
    if (count === 1) return `1 ${singular}`;
    return `${count} ${plural}`;
  };

  const tiles = [
    { 
      title: "Accounts", 
      icon: <FaWallet />, 
      preview: "View your bank accounts and balances",
      count: loading ? "Loading..." : 
             dashboardData.accountsCount === 0 ? "0 accounts - Connect your bank to get started" :
             formatCount(dashboardData.accountsCount, "account", "accounts")
    },
    { 
      title: "Transactions", 
      icon: <FaList />, 
      preview: "Recent transaction history",
      count: loading ? "Loading..." : 
             dashboardData.transactionsCount === 0 ? "0 transactions - Connect accounts to see transactions" :
             `${dashboardData.transactionsCount} this month`
    },
    { 
      title: "Spendability", 
      icon: <FaDollarSign />, 
      preview: "How much you can safely spend",
      count: loading ? "Loading..." : 
             dashboardData.accountsCount === 0 ? "$0.00 - Connect accounts to see spendability" :
             formatCurrency(dashboardData.spendability)
    },
    { 
      title: "Bills", 
      icon: <FaFileInvoice />, 
      preview: "Upcoming and overdue bills",
      count: loading ? "Loading..." : 
             dashboardData.billsCount === 0 ? "0 bills - Add your first bill" :
             `${dashboardData.billsCount} due soon`
    },
    { 
      title: "Recurring", 
      icon: <FaRedo />, 
      preview: "Recurring transactions and subscriptions",
      count: loading ? "Loading..." : 
             dashboardData.recurringCount === 0 ? "0 recurring - Add recurring bills" :
             `${dashboardData.recurringCount} active`
    },
    { 
      title: "Goals", 
      icon: <FaBullseye />, 
      preview: "Financial goals and progress",
      count: loading ? "Loading..." : 
             dashboardData.goalsCount === 0 ? "0 goals - Set your first goal" :
             `${dashboardData.goalsCount} in progress`
    },
    { 
      title: "Categories", 
      icon: <FaThLarge />, 
      preview: "Spending by category",
      count: loading ? "Loading..." : 
             dashboardData.categoriesCount === 0 ? "0 categories - Start tracking expenses" :
             formatCount(dashboardData.categoriesCount, "category", "categories")
    },
    { 
      title: "Cash Flow", 
      icon: <FaChartLine />, 
      preview: "Income vs expenses over time",
      count: loading ? "Loading..." : 
             dashboardData.transactionsCount === 0 ? "$0.00 - No data yet" :
             `${dashboardData.cashFlow >= 0 ? '+' : ''}${formatCurrency(dashboardData.cashFlow)} this month`
    },
    { 
      title: "Pay Cycle", 
      icon: <FaCalendarAlt />, 
      preview: "Next payday countdown",
      count: loading ? "Loading..." : 
             dashboardData.payCycleDays === 0 ? "Not configured - Set up in Settings" :
             `${dashboardData.payCycleDays} ${dashboardData.payCycleDays === 1 ? 'day' : 'days'}`
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