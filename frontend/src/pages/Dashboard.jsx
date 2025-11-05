import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { calculateTotalProjectedBalance } from '../utils/BalanceCalculator';
import PlaidConnectionManager from '../utils/PlaidConnectionManager';
import './Dashboard.css';
import { useAuth } from '../contexts/AuthContext';
import DashboardTileCreditCard from "../components/DashboardTileCreditCard";
import { useTransactionsQuery } from '../hooks/useFirebaseQuery';


const Dashboard = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [firebaseConnected, setFirebaseConnected] = useState(false);
  const [plaidStatus, setPlaidStatus] = useState({
    isConnected: false,
    hasError: false,
    errorMessage: null
  });
  const [hasPlaidAccounts, setHasPlaidAccounts] = useState(false);
  const [dashboardData, setDashboardData] = useState({    
  totalBalance: 0,
  totalProjectedBalance: 0,
  accountCount: 0,
  safeToSpend: 0,
  billsDueSoon: 0,
  recurringCount: 0,
  subscriptionsCount: 0,
  subscriptionsBurn: 0,
  daysUntilPayday: 0,
  monthlyIncome: 0,
  monthlyExpenses: 0,
  transactionCount: 0
});

  // ✅ React Query - Cached transactions query (instant on subsequent visits!)
  const { data: cachedTransactions = [], isLoading: transactionsLoading } = useTransactionsQuery(
    currentUser?.uid,
    { limitCount: 100, orderByField: 'timestamp', orderDirection: 'desc' }
  );
  useEffect(() => {
    loadDashboardData();
    checkPlaidConnection();
    
    // Subscribe to Plaid connection changes
    const unsubscribe = PlaidConnectionManager.subscribe((status) => {
      setPlaidStatus({
        isConnected: status.hasToken && status.isApiWorking === true && status.hasAccounts,
        hasError: status.error !== null,
        errorMessage: status.error
      });
    });
    
    return () => unsubscribe();
  }, []);

  const checkPlaidConnection = async () => {
    try {
      const status = await PlaidConnectionManager.checkConnection();
      setPlaidStatus({
        isConnected: status.hasToken && status.isApiWorking === true && status.hasAccounts,
        hasError: status.error !== null,
        errorMessage: status.error
      });
    } catch (error) {
      console.error('Error checking Plaid connection:', error);
    }
  };

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Add timeout to prevent infinite loading
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Firebase timeout')), 5000)
      );

      const dataPromise = async () => {
        const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
        const settingsDocSnap = await getDoc(settingsDocRef);
        return settingsDocSnap;
      };

      const settingsDocSnap = await Promise.race([dataPromise(), timeoutPromise]);
      
      if (settingsDocSnap.exists()) {
        setFirebaseConnected(true);
        const data = settingsDocSnap.data();
        
        // Calculate your real data here
        // Prioritize Plaid accounts if they exist (fully automated flow)
        const plaidAccountsList = data.plaidAccounts || [];
        const bankAccounts = data.bankAccounts || {};
        
        // Update PlaidConnectionManager with account info
        PlaidConnectionManager.setPlaidAccounts(plaidAccountsList);
        setHasPlaidAccounts(plaidAccountsList.length > 0);
        
        let totalBalance = 0;
        let accountCount = 0;
        let accountsData = null;
        
        if (plaidAccountsList.length > 0) {
          // Use only Plaid accounts when they exist
          totalBalance = plaidAccountsList.reduce((sum, account) => {
            return sum + (parseFloat(account.balance) || 0);
          }, 0);
          accountCount = plaidAccountsList.length;
          accountsData = plaidAccountsList;
        } else {
          // Fall back to manual accounts
          totalBalance = Object.values(bankAccounts).reduce((sum, account) => {
            return sum + (parseFloat(account.balance) || 0);
          }, 0);
          accountCount = Object.keys(bankAccounts).length;
          accountsData = bankAccounts;
        }

        // Load transactions for projected balance calculation
        const transactions = await loadTransactions();
        const totalProjectedBalance = calculateTotalProjectedBalance(accountsData, transactions);

        // Load current month transaction count
        const transactionCount = await loadCurrentMonthTransactionCount();

       // Calculate bills data from Firebase
const bills = data.bills || [];
const billsDueSoon = bills.filter(b => b.status !== 'paid').length;
const recurringCount = bills.filter(b => b.recurrence && b.recurrence !== 'one-time').length;

// Load goals count
const goalsRef = collection(db, 'users', currentUser.uid, 'goals');
const goalsSnapshot = await getDocs(goalsRef);
const goalsCount = goalsSnapshot.size;

// Calculate categories count
const uniqueCategories = new Set(transactions.map(t => t.category).filter(Boolean));
const categoriesCount = uniqueCategories.size;

// Load subscription data
let subscriptionsCount = 0;
let subscriptionsBurn = 0;
try {
  const subscriptionsRef = collection(db, 'users', currentUser.uid, 'subscriptions');
  const subscriptionsSnapshot = await getDocs(subscriptionsRef);
  const subscriptions = subscriptionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Calculate active subscriptions count and monthly burn
  const activeSubscriptions = subscriptions.filter(sub => sub.status === 'active');
  subscriptionsCount = activeSubscriptions.length;
  
  // Calculate monthly burn
  subscriptionsBurn = activeSubscriptions.reduce((sum, sub) => {
    const cost = parseFloat(sub.cost) || 0;
    switch (sub.billingCycle) {
      case 'Monthly':
        return sum + cost;
      case 'Annual':
        return sum + (cost / 12);
      case 'Quarterly':
        return sum + (cost / 3);
      default:
        return sum + cost;
    }
  }, 0);
} catch (error) {
  console.error('Error loading subscriptions:', error);
}

// Calculate spendability (same logic as Spendability page)
let calculatedSafeToSpend = 0;
try {
  // Get pay cycle data for bills filtering
  const payCycleDocRef = doc(db, 'users', currentUser.uid, 'financial', 'payCycle');
  const payCycleDocSnap = await getDoc(payCycleDocRef);
  
  // Calculate next payday and days until payday
  let nextPaydayDate = new Date();
  let daysUntilPayday = 0;
  
  // Check for override or cached payCycle data
  if (data.nextPaydayOverride) {
    nextPaydayDate = new Date(data.nextPaydayOverride);
    const { getDaysUntilDateInPacific } = await import('../utils/DateUtils');
    daysUntilPayday = getDaysUntilDateInPacific(nextPaydayDate);
  } else if (payCycleDocSnap.exists() && payCycleDocSnap.data().date) {
    const payCycleData = payCycleDocSnap.data();
    nextPaydayDate = new Date(payCycleData.date);
    daysUntilPayday = payCycleData.daysUntil || 0;
  } else if (data.paySchedules) {
    // Fallback: Calculate from pay schedules if no cached data
    const { PayCycleCalculator } = await import('../utils/PayCycleCalculator');
    const result = PayCycleCalculator.calculateNextPayday(
      { 
        lastPaydate: data.paySchedules?.yours?.lastPaydate, 
        amount: data.paySchedules?.yours?.amount || 0 
      },
      { 
        type: data.paySchedules?.spouse?.type,
        amount: data.paySchedules?.spouse?.amount || 0 
      }
    );
    nextPaydayDate = new Date(result.date);
    daysUntilPayday = result.daysUntil;
  }
  
  // Calculate bills due before next payday
  const RecurringBillManager = (await import('../utils/RecurringBillManager')).RecurringBillManager;
  const billsWithRecurrence = bills.map(bill => ({
    ...bill,
    recurrence: bill.recurrence || 'monthly'
  }));
  const processedBills = RecurringBillManager.processBills(billsWithRecurrence);
  const billsDueBeforePayday = RecurringBillManager.getBillsDueBefore(processedBills, nextPaydayDate);
  const totalBillsDue = billsDueBeforePayday.reduce((sum, bill) => sum + (parseFloat(bill.amount) || 0), 0);
  
  // Get preferences for weekly essentials and safety buffer
  const preferences = data.preferences || {};
  const weeklyEssentials = preferences.weeklyEssentials || 0;
  const safetyBuffer = preferences.safetyBuffer || 0;
  
  // Calculate weeks until payday
  const weeksUntilPayday = Math.ceil(daysUntilPayday / 7);
  const essentialsNeeded = weeklyEssentials * weeksUntilPayday;
  
  // Calculate safe to spend: Total Available - Bills - Essentials - Safety Buffer
  calculatedSafeToSpend = totalProjectedBalance - totalBillsDue - essentialsNeeded - safetyBuffer;
} catch (error) {
  console.error('Error calculating spendability:', error);
  calculatedSafeToSpend = 0;
}

// Update with real Firebase data - NO FALLBACKS!
setDashboardData({
  totalBalance: totalBalance,                    // ✅ Real data only
  totalProjectedBalance: totalProjectedBalance || totalBalance,
  accountCount: accountCount,                    // ✅ Real data only
  safeToSpend: calculatedSafeToSpend,           // ✅ Calculated, not from Firebase
  billsDueSoon: billsDueSoon,                    // ✅ Calculated from Firebase
  recurringCount: recurringCount,                // ✅ Calculated from Firebase
  subscriptionsCount: subscriptionsCount,        // ✅ Calculated from Firebase
  subscriptionsBurn: subscriptionsBurn,          // ✅ Calculated from Firebase
  daysUntilPayday: data.daysUntilPayday || 0,   // ✅ From Firebase or 0
  monthlyIncome: data.monthlyIncome || 0,       // ✅ From Firebase or 0
  monthlyExpenses: data.monthlyExpenses || 0,   // ✅ From Firebase or 0
  transactionCount: transactionCount,
  goalsCount: goalsCount,                        // ✅ Add this for Goals tile
  categoriesCount: categoriesCount               // ✅ Add this for Categories tile
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

  const loadTransactions = async () => {
    // ✅ React Query - Use cached data if available (instant!)
    // This eliminates redundant Firebase queries on subsequent page visits
    if (cachedTransactions && cachedTransactions.length > 0) {
      console.log('✅ Using cached transactions from React Query (instant load!)');
      return cachedTransactions;
    }
    
    // Fallback to direct Firebase query if cache is empty
    try {
      const transactionsRef = collection(db, 'users', currentUser.uid, 'transactions');
      const q = query(transactionsRef, orderBy('timestamp', 'desc'), limit(100));
      const querySnapshot = await getDocs(q);
      
      const transactionsList = [];
      querySnapshot.forEach((doc) => {
        transactionsList.push({ id: doc.id, ...doc.data() });
      });
      
      return transactionsList;
    } catch (error) {
      console.error('Error loading transactions:', error);
      return [];
    }
  };

  const loadCurrentMonthTransactionCount = async () => {
    try {
      const currentDate = new Date();
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      
      // Format dates for Firebase query (YYYY-MM-DD format)
      const startDateStr = startOfMonth.toISOString().split('T')[0];
      const endDateStr = endOfMonth.toISOString().split('T')[0];
      
      const transactionsRef = collection(db, 'users', currentUser.uid, 'transactions');
      const q = query(
        transactionsRef, 
        where('date', '>=', startDateStr),
        where('date', '<=', endDateStr)
      );
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.size;
    } catch (error) {
      console.error('Error loading transaction count:', error);
      return 0;
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
      subtitle: dashboardData.totalBalance !== dashboardData.totalProjectedBalance
        ? `Live: ${formatCurrency(dashboardData.totalBalance)} | Projected: ${formatCurrency(dashboardData.totalProjectedBalance)}`
        : `Total: ${formatCurrency(dashboardData.totalBalance)}`,
      path: '/accounts',
      color: 'blue',
      tooltip: 'Live balance from bank, Projected includes manual transactions'
    },
    {
      title: 'Transactions',
      icon: '📊',
      value: `${dashboardData.transactionCount} this month`,
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
  title: 'Credit Cards',
  icon: '💳',
  value: 'View balances & payoffs',
  subtitle: 'Snowball + Utilization',
  path: '/creditcards',
  color: 'emerald', // match your theme
  tooltip: 'Live credit card data from Plaid'
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
      title: 'Subscriptions',
      icon: '💳',
      value: `${dashboardData.subscriptionsCount || 0} active`,
      subtitle: `${formatCurrency(dashboardData.subscriptionsBurn || 0)}/mo`,
      path: '/subscriptions',
      color: 'cyan'
    },
    {
      title: 'Goals',
      icon: '🎯',
      value: `${dashboardData.goalsCount || 0} in progress`,  // ✅ Real data
      subtitle: 'Financial targets',
      path: '/goals',
      color: 'orange'
    },
    {
      title: 'Categories',
      icon: '🏷️',
      value: `${dashboardData.categoriesCount || 0} categories`,
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
        <div className="backend-status" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            padding: '6px 12px',
            borderRadius: '6px',
            background: firebaseConnected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(251, 191, 36, 0.1)',
            border: `1px solid ${firebaseConnected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(251, 191, 36, 0.3)'}`
          }}>
            <span className={`status-indicator ${firebaseConnected ? 'online' : 'offline'}`}></span>
            <span style={{ 
              fontSize: '13px', 
              fontWeight: '500',
              color: firebaseConnected ? '#059669' : '#d97706'
            }}>
              Firebase: {loading ? 'Loading...' : firebaseConnected ? 'Connected' : 'Offline'}
            </span>
          </div>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            padding: '6px 12px',
            borderRadius: '6px',
            background: (plaidStatus.isConnected || hasPlaidAccounts) ? 'rgba(16, 185, 129, 0.1)' : (plaidStatus.hasError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(251, 191, 36, 0.1)'),
            border: `1px solid ${(plaidStatus.isConnected || hasPlaidAccounts) ? 'rgba(16, 185, 129, 0.3)' : (plaidStatus.hasError ? 'rgba(239, 68, 68, 0.3)' : 'rgba(251, 191, 36, 0.3)')}`
          }}>
            <span style={{ fontSize: '12px' }}>
              {(plaidStatus.isConnected || hasPlaidAccounts) ? '✅' : (plaidStatus.hasError ? '❌' : '⚠️')}
            </span>
            <span style={{ 
              fontSize: '13px', 
              fontWeight: '500',
              color: (plaidStatus.isConnected || hasPlaidAccounts) ? '#059669' : (plaidStatus.hasError ? '#dc2626' : '#d97706')
            }}
            title={plaidStatus.hasError ? PlaidConnectionManager.getErrorMessage() : ''}
            >
              Plaid: {plaidStatus.isConnected || hasPlaidAccounts ? 'Connected' : (plaidStatus.hasError ? 'Error' : 'Not Connected')}
            </span>
            {!plaidStatus.isConnected && !hasPlaidAccounts && !loading && (
              <button
                onClick={() => navigate('/accounts')}
                style={{
                  background: plaidStatus.hasError ? '#dc2626' : '#d97706',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  marginLeft: '4px'
                }}
                title={plaidStatus.hasError ? 'Click to view error details' : 'Connect your bank account'}
              >
                {plaidStatus.hasError ? 'Fix' : 'Connect'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="dashboard-tiles-grid">
        {tiles.map((tile, index) => (
          <div 
            key={index} 
            className={`dashboard-tile ${tile.color} ${loading ? 'loading' : ''}`}
            onClick={() => navigate(tile.path)}
            title={tile.tooltip || ''}
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
