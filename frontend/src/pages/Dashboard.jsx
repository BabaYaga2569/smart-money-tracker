import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { calculateTotalProjectedBalance } from '../utils/BalanceCalculator';
import PlaidConnectionManager from '../utils/PlaidConnectionManager';
import './Dashboard.css';
import { useAuth } from '../contexts/AuthContext';
import { useTransactionsQuery } from '../hooks/useFirebaseQuery';
import { loadCanonicalFinancialAccounts } from '../utils/financialAccounts';
import { visibleBillOccurrences } from '../utils/billVisibility';
import { buildFinancialCycle, normalizeFinancialSettings } from '../utils/financialCycleEngine';


const Dashboard = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [firebaseConnected, setFirebaseConnected] = useState(false);
  const [notification, setNotification] = useState({ message: '', type: '' });
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
  transactionCount: 0,
  dueTodayCount: 0,
  dueNext7Count: 0,
  remainingMonthAmount: 0,
  overdueCount: 0,
  upcomingBills: [],
  recentTransactions: []
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
        let data = normalizeFinancialSettings(settingsDocSnap.data());
        
        // Safety freeze: Dashboard is a reader. It must not advance payday
        // state or delete cached financial data merely because it was opened.
        
        // Canonical live account source shared with Spendability and Pay Cycle.
        const canonicalPlaidAccounts = data.plaidAccounts || [];
        const canonicalAccounts = await loadCanonicalFinancialAccounts({
          userId: currentUser.uid,
          settings: data,
          timeoutMs: 5000
        });
        const plaidAccountsList = canonicalAccounts.depositoryAccounts;
        const bankAccounts = data.bankAccounts || {};
        
        // Connection state is based on canonical accounts, not visibility.
        PlaidConnectionManager.setPlaidAccounts(canonicalPlaidAccounts);
        setHasPlaidAccounts(canonicalPlaidAccounts.length > 0 || plaidAccountsList.length > 0);
        
        let totalBalance = canonicalAccounts.totalAvailable;
        let accountCount = plaidAccountsList.length;
        let accountsData = plaidAccountsList;
        
        if (plaidAccountsList.length === 0) {
          // Manual-account fallback only when no Plaid depository accounts exist.
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

       // Load canonical bill occurrences and recurring templates.
       // Dashboard must read the same sources as Bills/Recurring instead of
       // the legacy settings.bills array.
const billsRef = collection(db, 'users', currentUser.uid, 'financialEvents');
const recurringPatternsRef = collection(db, 'users', currentUser.uid, 'recurringPatterns');

const [billsSnapshot, recurringPatternsSnapshot] = await Promise.all([
  getDocs(query(
    billsRef,
    where('type', '==', 'bill'),
    where('isPaid', '==', false)
  )),
  getDocs(recurringPatternsRef)
]);

const bills = visibleBillOccurrences(
  billsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
);
const recurringPatterns = recurringPatternsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

const billsDueSoon = bills.length;
const recurringCount = recurringPatterns.filter(pattern => pattern.status === 'active').length;

const nowLocal = new Date();
const todayYmd = [
  nowLocal.getFullYear(),
  String(nowLocal.getMonth() + 1).padStart(2, '0'),
  String(nowLocal.getDate()).padStart(2, '0')
].join('-');

const next7 = new Date(nowLocal);
next7.setDate(next7.getDate() + 7);
const next7Ymd = [
  next7.getFullYear(),
  String(next7.getMonth() + 1).padStart(2, '0'),
  String(next7.getDate()).padStart(2, '0')
].join('-');

const currentMonthPrefix = todayYmd.slice(0, 7);
const billDueDate = bill => String(
  bill.dueDate || bill.nextDueDate || bill.nextOccurrence || ''
).slice(0, 10);

const dueTodayCount = bills.filter(bill => billDueDate(bill) === todayYmd).length;
const dueNext7Count = bills.filter(bill => {
  const due = billDueDate(bill);
  return due && due >= todayYmd && due <= next7Ymd;
}).length;
const overdueCount = bills.filter(bill => {
  const due = billDueDate(bill);
  return due && due < todayYmd;
}).length;
const remainingMonthAmount = bills
  .filter(bill => billDueDate(bill).startsWith(currentMonthPrefix))
  .reduce((sum, bill) => sum + (Number(bill.amount) || 0), 0);
const upcomingBills = [...bills]
  .filter(bill => billDueDate(bill))
  .sort((a, b) => billDueDate(a).localeCompare(billDueDate(b)))
  .slice(0, 6);

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

// Canonical financial-cycle engine: this is the same calculation used by
// Spendability and Pay Cycle. Dashboard does not interpret pay schedules itself.
let calculatedSafeToSpend = null;
let calculatedDaysUntilPayday = null;
try {
  const cycle = buildFinancialCycle({
    settings: data,
    bills,
    currentAvailableBalance: totalBalance,
    horizonDays: 45
  });

  calculatedSafeToSpend = cycle.safeToSpend;
  calculatedDaysUntilPayday = cycle.daysUntilRefill;

  if (!cycle.nextRefillDate) {
    console.warn('Dashboard spendability unavailable: canonical cycle engine resolved no refill date');
  }
} catch (error) {
  console.error('Error calculating dashboard spendability:', error);
  calculatedSafeToSpend = null;
  calculatedDaysUntilPayday = null;
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
  daysUntilPayday: calculatedDaysUntilPayday,
  monthlyIncome: data.monthlyIncome || 0,       // ✅ From Firebase or 0
  monthlyExpenses: data.monthlyExpenses || 0,   // ✅ From Firebase or 0
  transactionCount: transactionCount,
  goalsCount: goalsCount,
  categoriesCount: categoriesCount,
  dueTodayCount,
  dueNext7Count,
  remainingMonthAmount,
  overdueCount,
  upcomingBills,
  recentTransactions: transactions.slice(0, 6)
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

  const shortcuts = [
    {
      title: 'Accounts',
      icon: '💳',
      value: `${dashboardData.accountCount} connected`,
      subtitle: formatCurrency(dashboardData.totalBalance),
      path: '/accounts'
    },
    {
      title: 'Recurring',
      icon: '🔁',
      value: `${dashboardData.recurringCount} active`,
      subtitle: 'Schedules & installments',
      path: '/recurring'
    },
    {
      title: 'Credit Cards',
      icon: '💳',
      value: 'Balances & payoff',
      subtitle: 'Utilization and snowball',
      path: '/creditcards'
    },
    {
      title: 'Subscriptions',
      icon: '▶️',
      value: `${dashboardData.subscriptionsCount || 0} active`,
      subtitle: `${formatCurrency(dashboardData.subscriptionsBurn || 0)}/mo`,
      path: '/subscriptions'
    },
    {
      title: 'Cash Flow',
      icon: '↕️',
      value: formatCurrency(dashboardData.monthlyIncome - dashboardData.monthlyExpenses),
      subtitle: 'Monthly net',
      path: '/cashflow'
    },
    {
      title: 'Goals',
      icon: '🎯',
      value: `${dashboardData.goalsCount || 0} in progress`,
      subtitle: 'Financial targets',
      path: '/goals'
    },
    {
      title: 'Reports',
      icon: '📈',
      value: 'Insights',
      subtitle: 'Trends and summaries',
      path: '/reports'
    }
  ];

  const formatShortDate = (value) => {
    if (!value) return 'No date';
    const normalized = String(value).slice(0, 10);
    const parts = normalized.split('-');
    if (parts.length !== 3) return normalized;
    const [year, month, day] = parts.map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const billDueDate = (bill) =>
    bill?.dueDate || bill?.nextDueDate || bill?.nextOccurrence || '';

  const transactionName = (transaction) =>
    transaction?.merchant_name ||
    transaction?.merchantName ||
    transaction?.name ||
    transaction?.description ||
    'Transaction';

  const plaidHealthy = plaidStatus.isConnected || hasPlaidAccounts;
  const hour = new Date().getHours();
  const greeting = hour < 12
    ? 'Good morning'
    : hour < 17
      ? 'Good afternoon'
      : 'Good evening';

  return (
    <div className="dashboard-container smt-page">
      <header className="dashboard-topbar">
        <div className="dashboard-title-block">
          <div className="dashboard-eyebrow">Smart Money Tracker</div>
          <h1>{greeting}</h1>
          <p>Your money, bills, and activity at a glance.</p>
        </div>

        <div className="dashboard-connection-status" aria-label="Connection status">
          <span className={`connection-pill ${firebaseConnected ? 'healthy' : 'warning'}`}>
            <span className="connection-dot" />
            {loading ? 'Loading data' : firebaseConnected ? 'Data connected' : 'Data offline'}
          </span>
          <button
            type="button"
            className={`connection-pill connection-button ${plaidHealthy ? 'healthy' : plaidStatus.hasError ? 'danger' : 'warning'}`}
            onClick={() => !plaidHealthy && navigate('/accounts')}
            title={plaidStatus.hasError ? PlaidConnectionManager.getErrorMessage() : ''}
          >
            <span className="connection-dot" />
            {plaidHealthy ? 'Banks connected' : plaidStatus.hasError ? 'Bank connection issue' : 'Connect banks'}
          </button>
        </div>
      </header>

      <section className="dashboard-hero-grid">
        <button
          type="button"
          className="dashboard-safe-card"
          onClick={() => navigate('/spendability')}
        >
          <div className="dashboard-card-kicker">Safe to spend</div>
          <div className="dashboard-safe-value">
            {loading || dashboardData.safeToSpend == null ? '—' : formatCurrency(dashboardData.safeToSpend)}
          </div>
          <div className="dashboard-safe-caption">
            {dashboardData.daysUntilPayday == null
              ? 'Pay schedule unavailable'
              : dashboardData.daysUntilPayday > 0
                ? `Available until payday in ${dashboardData.daysUntilPayday} day${dashboardData.daysUntilPayday === 1 ? '' : 's'}`
                : 'Available after upcoming obligations'}
          </div>
          <div className="dashboard-safe-link">Open Spendability <span>→</span></div>
        </button>

        <div className="dashboard-key-metrics">
          <button type="button" className="dashboard-metric-card" onClick={() => navigate('/accounts')}>
            <span>Projected cash</span>
            <strong>{loading ? '—' : formatCurrency(dashboardData.totalProjectedBalance)}</strong>
            <small>{dashboardData.accountCount} account{dashboardData.accountCount === 1 ? '' : 's'}</small>
          </button>

          <button type="button" className="dashboard-metric-card" onClick={() => navigate('/bills')}>
            <span>Open bills</span>
            <strong>{loading ? '—' : dashboardData.billsDueSoon}</strong>
            <small>{formatCurrency(dashboardData.remainingMonthAmount)} remaining this month</small>
          </button>

          <button type="button" className="dashboard-metric-card" onClick={() => navigate('/paycycle')}>
            <span>Next payday</span>
            <strong>
              {loading
                ? '—'
                : dashboardData.daysUntilPayday == null
                  ? 'Schedule unavailable'
                  : dashboardData.daysUntilPayday === 0
                    ? 'Today / due'
                    : `${dashboardData.daysUntilPayday} days`}
            </strong>
            <small>Pay-cycle planning</small>
          </button>
        </div>
      </section>

      <section className="dashboard-attention-strip" aria-label="Bills needing attention">
        <button type="button" onClick={() => navigate('/bills')}>
          <span className="attention-number">{dashboardData.dueTodayCount}</span>
          <span className="attention-label">Due today</span>
        </button>
        <button type="button" onClick={() => navigate('/bills')}>
          <span className={`attention-number ${dashboardData.overdueCount > 0 ? 'danger' : ''}`}>
            {dashboardData.overdueCount}
          </span>
          <span className="attention-label">Overdue</span>
        </button>
        <button type="button" onClick={() => navigate('/bills')}>
          <span className="attention-number">{dashboardData.dueNext7Count}</span>
          <span className="attention-label">Due in 7 days</span>
        </button>
        <button type="button" onClick={() => navigate('/transactions')}>
          <span className="attention-number">{dashboardData.transactionCount}</span>
          <span className="attention-label">Transactions this month</span>
        </button>
      </section>

      <section className="dashboard-main-grid">
        <div className="dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <span className="dashboard-section-kicker">Coming up</span>
              <h2>Upcoming bills</h2>
            </div>
            <button type="button" onClick={() => navigate('/bills')}>View all</button>
          </div>

          <div className="dashboard-list">
            {dashboardData.upcomingBills.length > 0 ? (
              dashboardData.upcomingBills.map((bill) => (
                <button
                  type="button"
                  className="dashboard-list-row"
                  key={bill.id}
                  onClick={() => navigate('/bills')}
                >
                  <div className="dashboard-list-icon">🧾</div>
                  <div className="dashboard-list-copy">
                    <strong>{bill.name || 'Unnamed bill'}</strong>
                    <span>{formatShortDate(billDueDate(bill))} · {bill.category || 'Bill'}</span>
                  </div>
                  <div className="dashboard-list-amount">
                    {formatCurrency(Number(bill.amount) || 0)}
                  </div>
                </button>
              ))
            ) : (
              <div className="dashboard-empty">No upcoming bill occurrences.</div>
            )}
          </div>
        </div>

        <div className="dashboard-panel">
          <div className="dashboard-section-header">
            <div>
              <span className="dashboard-section-kicker">Activity</span>
              <h2>Recent transactions</h2>
            </div>
            <button type="button" onClick={() => navigate('/transactions')}>View all</button>
          </div>

          <div className="dashboard-list">
            {dashboardData.recentTransactions.length > 0 ? (
              dashboardData.recentTransactions.map((transaction) => (
                <button
                  type="button"
                  className="dashboard-list-row"
                  key={transaction.id}
                  onClick={() => navigate('/transactions')}
                >
                  <div className="dashboard-list-icon">↕️</div>
                  <div className="dashboard-list-copy">
                    <strong>{transactionName(transaction)}</strong>
                    <span>
                      {formatShortDate(transaction.date)} · {transaction.category || transaction.account_name || 'Transaction'}
                    </span>
                  </div>
                  <div className="dashboard-list-amount">
                    {formatCurrency(Math.abs(Number(transaction.amount) || 0))}
                  </div>
                </button>
              ))
            ) : (
              <div className="dashboard-empty">No recent transactions loaded.</div>
            )}
          </div>
        </div>
      </section>

      <section className="dashboard-shortcuts-section">
        <div className="dashboard-section-header standalone">
          <div>
            <span className="dashboard-section-kicker">Explore</span>
            <h2>Financial tools</h2>
          </div>
        </div>

        <div className="dashboard-shortcuts-grid">
          {shortcuts.map((shortcut) => (
            <button
              type="button"
              key={shortcut.title}
              className="dashboard-shortcut"
              onClick={() => navigate(shortcut.path)}
            >
              <div className="dashboard-shortcut-icon">{shortcut.icon}</div>
              <div>
                <strong>{shortcut.title}</strong>
                <span>{shortcut.value}</span>
                <small>{shortcut.subtitle}</small>
              </div>
              <div className="dashboard-shortcut-arrow">→</div>
            </button>
          ))}
        </div>
      </section>

      {notification.message && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}
    </div>
  );
};

export default Dashboard;
