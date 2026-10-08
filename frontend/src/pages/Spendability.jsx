import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { PayCycleCalculator } from '../utils/PayCycleCalculator';
import { RecurringBillManager } from '../utils/RecurringBillManager';
import { projectCashFlow, addDays } from '../utils/CashFlowProjection';
import { formatDateForDisplay, formatDateForInput, getDaysUntilDateInPacific, getManualPacificDaysUntilPayday } from '../utils/DateUtils';
import { getPacificTime } from '../utils/timezoneHelpers';
import { SettingsSchemaManager } from '../utils/SettingsSchemaManager';
import { buildFinancialCycle, normalizeFinancialSettings } from '../utils/financialCycleEngine';
import { isDepositoryAccount } from '../utils/accountVisibility';
import { loadCanonicalFinancialAccounts } from '../utils/financialAccounts';
import { visibleBillOccurrences } from '../utils/billVisibility';
import { buildSpendabilityReconciliation } from '../utils/spendabilityReconciliation';
import './Spendability.css';
import { useAuth } from '../contexts/AuthContext';
// Force rebuild 2025-11-12 v2 - Fix spendability issues
const REBUILD_VERSION = '2025-11-12-v3-FORCE-REBUILD';
const SpendabilityV2 = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [spendAmount, setSpendAmount] = useState('');
  const [canSpend, setCanSpend] = useState(null);
  const [notification, setNotification] = useState({ message: '', type: '' });
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Force refresh mechanism
  
  const [financialData, setFinancialData] = useState({
    totalAvailable: 0,
    checking: 0,
    savings: 0,
    billsBeforePayday: [],
    billsAfterPayday: [],
    totalBillsDue: 0,
    safeToSpend: 0,
    safeToSpendToday: 0,
    projection: null,
    availableAfterPayday: 0,
    // depositsTodayAmount removed - not needed anymore
    nextPayday: 'No date',
    daysUntilPayday: 0,
    weeklyEssentials: 0,
    safetyBuffer: 0,
    paidBillsCount: 0,
    pendingPaymentBillsCount: 0,
    reconciliation: null,
    paydays: [] // Array of payday objects: { date, amount, bank, type }
  });
  
  // State for collapsible sections
  const [billsBeforeCollapsed, setBillsBeforeCollapsed] = useState(false);
  const [billsAfterCollapsed, setBillsAfterCollapsed] = useState(true); // Start collapsed

  useEffect(() => {
    fetchFinancialData();
  }, [refreshTrigger]); // Re-fetch when refresh is triggered
  // Helper function to extract balance data from account object
  // Prefers available_balance (what you can spend), falls back to balance
  const extractBalances = (account) => {
    const balances = account.balances || {};
    const currentBalance = parseFloat(account.current_balance ?? balances.current ?? 0);
    const availableBalance = parseFloat(account.available_balance ?? balances.available ?? currentBalance);
    const liveBalance = availableBalance; // available includes pending
    const pendingAdjustment = availableBalance - currentBalance;
    
    return { currentBalance, availableBalance, liveBalance, pendingAdjustment };
  };

  const fetchFinancialData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Safety freeze: Spendability is read-only during page load.
      // Data migrations must run through an explicit migration path, never from a view.

      // ✅ OPTIMIZATION: Load settings, payCycle, and backend API in parallel
      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      const payCycleDocRef = doc(db, 'users', currentUser.uid, 'financial', 'payCycle');
      const apiUrl = import.meta.env.VITE_API_URL || 'https://smart-money-tracker-09ks.onrender.com';
      
      // Do not let a slow/cold backend block the entire Spendability page.
      // If live balances do not answer quickly, render from the last cached
      // Plaid balances in Settings and let the user refresh when the API is warm.
      const [settingsDocSnap, payCycleDocSnap] = await Promise.all([
        getDoc(settingsDocRef),
        getDoc(payCycleDocRef)
      ]);

      if (!settingsDocSnap.exists()) {
        throw new Error('No financial data found. Please set up your Settings first.');
      }

      // Canonical read-only normalization shared with Dashboard and Pay Cycle.
      // Never persist migrations from a view.
      let settingsData = normalizeFinancialSettings(settingsDocSnap.data());
      
      let payCycleData = payCycleDocSnap.exists() ? payCycleDocSnap.data() : null;
	  let paydayCalcResult = null;
      // Safety freeze: payday state is not advanced or persisted simply by
      // opening Spendability. The existing stored schedule is used as-is.

      // Canonical account loader shared by Dashboard, Spendability, and Pay Cycle.
      const canonicalAccounts = await loadCanonicalFinancialAccounts({
        userId: currentUser.uid,
        settings: settingsData,
        apiUrl,
        timeoutMs: 5000
      });
      const allPlaidAccounts = canonicalAccounts.visibleAccounts;
      const depositoryAccounts = canonicalAccounts.depositoryAccounts;

      // Safe-to-Spend only uses visible cash/depository accounts.

      if (import.meta.env.DEV) {
        console.log(`[Spendability] Filtered ${allPlaidAccounts.length} accounts to ${depositoryAccounts.length} depository accounts (excluded credit cards)`);
      }

      // Load transactions to calculate projected balances
      // ✅ OPTIMIZATION: Load only last 30 days of transactions instead of ALL transactions
      // Note: Using limit(100) is safe because we primarily care about recent pending transactions
      // for balance calculations. Historical transactions beyond 30 days don't affect current balances.
      const transactionsRef = collection(db, 'users', currentUser.uid, 'transactions');
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const transactionsQuery = query(
        transactionsRef, 
        where('date', '>=', thirtyDaysAgo.toISOString().split('T')[0]),
        orderBy('date', 'desc'),
        limit(100)
      );
      const transactionsSnapshot = await getDocs(transactionsQuery);
      const transactions = transactionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      if (import.meta.env.DEV) {
        console.log('Spendability: Loaded transactions', {
          count: transactions.length,
          pendingCount: transactions.filter(t => t.pending).length
        });
      }

      // For Plaid accounts, available_balance is ALREADY the correct spendable amount
      // The bank has already subtracted pending transactions from current balance
      const totalAvailable = canonicalAccounts.totalAvailable;

      if (import.meta.env.DEV) {
        console.log('Spendability: Balance calculation', {
          accountCount: depositoryAccounts.length,
          totalAvailable: totalAvailable,
          accounts: depositoryAccounts.map(a => ({
            name: a.name,
            available: parseFloat(a.available || a.balance),
            current: parseFloat(a.current || a.balance)
          }))
        });
      }

      // 🔍 COMPREHENSIVE DEBUG LOGGING
      if (import.meta.env.DEV) {
        console.log('🔍 SPENDABILITY DEBUG:', {
          timestamp: new Date().toISOString(),
          allAccountsCount: allPlaidAccounts.length,
          depositoryAccountsCount: depositoryAccounts.length,
          excludedAccounts: allPlaidAccounts.filter(a => 
            !depositoryAccounts.some(d => d.account_id === a.account_id)
          ).map(a => ({
            name: a.name,
            type: a.type,
            subtype: a.subtype,
            balance: a.balance
          })),
          depositoryAccounts: depositoryAccounts.map(a => ({
            name: a.name,
            subtype: a.subtype,
            type: a.type,
            account_id: a.account_id,
            available: a.available,
            balance: a.balance,
            usedBalance: parseFloat(a.available || a.balance) || 0
          })),
          transactionsCount: transactions.length,
          pendingTransactionsCount: transactions.filter(t => t.pending).length,
          totalBalance: depositoryAccounts.reduce((sum, a) => sum + parseFloat(a.balance || 0), 0),
          totalAvailableBalance: totalAvailable
        });
      } 
     // Get pay cycle data
let nextPayday, daysUntilPayday;
const todayPayCycleStr = formatDateForInput(getPacificTime());
const isStrictFuturePayday = (value) =>
  String(value || '').slice(0, 10) > todayPayCycleStr;

if (settingsData.nextPaydayOverride && isStrictFuturePayday(settingsData.nextPaydayOverride)) {
  nextPayday = settingsData.nextPaydayOverride;
  daysUntilPayday = getDaysUntilDateInPacific(nextPayday);
} else if (payCycleData && payCycleData.date && isStrictFuturePayday(payCycleData.date)) {
  // Spendability works from money already in the bank. A payday that is today
  // has already refilled the balance, so the horizon must move to the next one.
  nextPayday = payCycleData.date;
  daysUntilPayday = getDaysUntilDateInPacific(nextPayday);
  console.log('✅ Using strict-future cached payday:', nextPayday);
} else {
  if (settingsData.nextPaydayOverride || payCycleData?.date) {
    console.log('↪️ Ignoring today/past payday for Spendability and rolling to next refill');
  }
  if (payCycleData) payCycleData.date = null;
}

if (!nextPayday) {
  console.log('Spendability: Calculating payday from schedules');

// ✅ FIX: Read from the ACTUAL Settings data structure
// Check multiple possible locations for lastPayDate for backward compatibility
const lastPayDateValue = settingsData.paySchedules?.yours?.lastPaydate || settingsData.lastPayDate || settingsData.yoursSchedule?.lastPaydate;
const yoursSchedule = {
  lastPaydate: lastPayDateValue,
  amount: parseFloat(settingsData.paySchedules?.yours?.amount || settingsData.payAmount || settingsData.yoursSchedule?.amount) || 0
};

const spouseSchedule = {
  type: settingsData.paySchedules?.spouse?.type || 'bi-monthly',  // 15th & 30th
  amount: parseFloat(settingsData.paySchedules?.spouse?.amount || settingsData.spousePayAmount) || 0,
  dates: settingsData.paySchedules?.spouse?.dates || [15, 30]
};

console.log('Spendability: Using schedules', {
  yours: yoursSchedule,
  spouse: spouseSchedule,
  rawSettingsData: {
    lastPayDate: settingsData.lastPayDate,
    payAmount: settingsData.payAmount,
    spousePayAmount: settingsData.spousePayAmount
  }
});

const result = PayCycleCalculator.calculateNextPayday(
  yoursSchedule,
  spouseSchedule,
  { includeToday: false }
);
paydayCalcResult = result;

console.log('Spendability: Payday calculation result', result);
nextPayday = result.date;
// ✅ FIX ISSUE #2: Use getDaysUntilDateInPacific instead of result.daysUntil
daysUntilPayday = getDaysUntilDateInPacific(nextPayday);

// Spendability is read-only. A stale/missing pay-cycle cache may be
// recalculated in memory, but this view does not persist the result.

// 📅 PAYDAY CALCULATION DEBUG
console.log('📅 PAYDAY CALCULATION DEBUG:', {
  yourSchedule: yoursSchedule,
  spouseSchedule: spouseSchedule,
  nextPayday: nextPayday,
  daysUntilPayday: daysUntilPayday,
  source: result.source || 'Check what PayCycleCalculator returned'
});

// Add comprehensive logging for debugging
console.log('🔍 PAYDAY CALCULATION DEBUG:', {
  currentDate: new Date().toISOString(),
  currentDatePacific: getPacificTime().toISOString(),
  nextPaydayOverride: settingsData.nextPaydayOverride,
  payCycleDataExists: !!payCycleData,
  payCycleDate: payCycleData?.date,
  paySchedules: {
    yours: {
      lastPaydate: settingsData.paySchedules?.yours?.lastPaydate,
      type: settingsData.paySchedules?.yours?.type,
      amount: settingsData.paySchedules?.yours?.amount
    },
    spouse: {
      type: settingsData.paySchedules?.spouse?.type,
      amount: settingsData.paySchedules?.spouse?.amount,
      dates: settingsData.paySchedules?.spouse?.dates
    }
  },
  calculatedResult: result
});
}      
 
      // Household refill, deposit window, and reserve math are resolved below
      // by the canonical financialCycleEngine after bill occurrences are loaded.

      // Load canonical unpaid bill occurrences plus recurring patterns for
      // the read-only reconciliation audit.
      let allBills = [];
      let recurringPatterns = [];
      try {
        const financialEventsRef = collection(db, 'users', currentUser.uid, 'financialEvents');
        const recurringPatternsRef = collection(db, 'users', currentUser.uid, 'recurringPatterns');
        const billsQuery = query(
          financialEventsRef,
          where('type', '==', 'bill'),
          where('isPaid', '==', false)
        );

        const [billsSnapshot, recurringPatternsSnapshot] = await Promise.all([
          getDocs(billsQuery),
          getDocs(recurringPatternsRef)
        ]);

        // Use the exact same visibility rules as Bills.jsx so hidden legacy rows
        // and archived duplicates can never leak back into Safe-to-Spend.
        allBills = visibleBillOccurrences(
          billsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }))
        )
          .filter(bill => bill.status !== 'skipped')
          .map(bill => ({
            ...bill,
            nextDueDate: String(bill.dueDate || bill.nextDueDate || '').slice(0, 10),
            recurrence: bill.recurrence || 'monthly'
          }));

        recurringPatterns = recurringPatternsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        console.log('✅ Spendability: Loaded canonical bill audit sources', {
          unpaidBills: allBills.length,
          recurringPatterns: recurringPatterns.length
        });
      } catch (error) {
        console.error('❌ Spendability: Error loading bill audit sources:', error);
      }

      // Canonical bill paid/unpaid state comes from the backend Bill Engine.
      // Spendability does not run its own transaction matcher.

      // Canonical financialEvents occurrences already have their authoritative due dates.
      // Do not recalculate or advance occurrence dates in the browser.
      const processedBills = allBills.map(bill => ({
        ...bill,
        recurrence: bill.recurrence || 'monthly',
        nextDueDate: String(bill.dueDate || bill.nextDueDate || '').slice(0, 10)
      }));

      // Canonical cycle engine owns refill boundary, bill reserve, and
      // Safe-to-Spend. No page-specific payday or reserve math below this point.
      const canonicalCycle = buildFinancialCycle({
        settings: settingsData,
        bills: processedBills,
        currentAvailableBalance: totalAvailable,
        horizonDays: 45
      });

      const todayStrProj = canonicalCycle.today;
      const nextRefillDate = canonicalCycle.nextRefillDate;
      const cycleEndStr = canonicalCycle.cycleEndDate;
      nextPayday = canonicalCycle.nextRefillDate;
      daysUntilPayday = canonicalCycle.daysUntilRefill;
      const paydays = canonicalCycle.upcomingIncome;
      const totalPaydayAmount = canonicalCycle.upcomingIncomeTotal;

      const billsDueBeforePayday = canonicalCycle.currentCycleBills
        .map(bill => ({
          ...bill,
          statusInfo: RecurringBillManager.determineBillStatus(bill)
        }))
        .sort((a, b) => {
          if (a.statusInfo.priority !== b.statusInfo.priority) {
            return b.statusInfo.priority - a.statusInfo.priority;
          }
          return new Date(a.nextDueDate || a.dueDate) - new Date(b.nextDueDate || b.dueDate);
        });

      const billsDueAfterPayday = canonicalCycle.laterBills
        .map(bill => ({
          ...bill,
          statusInfo: RecurringBillManager.determineBillStatus(bill)
        }))
        .sort((a, b) =>
          new Date(a.nextDueDate || a.dueDate) - new Date(b.nextDueDate || b.dueDate)
        );

      const pendingPaymentBillsBeforePayday = canonicalCycle.pendingBillsBeforeRefill;
      const unpaidBillsBeforePayday = canonicalCycle.reservedBills;
      const unpaidBillsAfterPayday = canonicalCycle.laterBills;

      const totalUnpaidBills = canonicalCycle.totalReserved;
      const totalBillsDue = canonicalCycle.totalReserved;
      const paidBillsCount = 0;
      const pendingPaymentBillsCount = canonicalCycle.pendingBillsBeforeRefill.length;
      const totalBillsDueLegacy = totalUnpaidBills;

      const preferences = settingsData.preferences || {};
      const weeklyEssentials = preferences.weeklyEssentials || 0;
      const safetyBuffer = preferences.safetyBuffer || 0;
      const weeksUntilPayday = Math.ceil((canonicalCycle.daysUntilRefill || 0) / 7);
      const essentialsNeeded = weeklyEssentials * weeksUntilPayday;

      const safeToSpendToday = canonicalCycle.safeToSpend;
      const protectedSafeToSpend = safeToSpendToday == null
        ? null
        : safeToSpendToday - (Number(safetyBuffer) || 0) - (Number(essentialsNeeded) || 0);
      const availableAfterPayday = canonicalCycle.afterDeposits;
      const safeToSpend = safeToSpendToday;

      // Keep the projection detail panel, but drive it from the same canonical
      // cycle boundary and reserved-bill set.
      const projection = nextRefillDate
        ? projectCashFlow({
            startingBalance: totalAvailable,
            todayStr: todayStrProj,
            cycleEndStr,
            incomes: [],
            bills: unpaidBillsBeforePayday,
            weeklyEssentials: 0,
            safetyBuffer: 0
          })
        : null;

      console.log('💰 Canonical Financial Cycle:', {
        today: canonicalCycle.today,
        nextRefillDate,
        cycleEndStr,
        currentAvailable: totalAvailable,
        reservedBills: canonicalCycle.totalReserved,
        safeToSpendToday,
        upcomingIncomeTotal: totalPaydayAmount,
        availableAfterPayday
      });

      const finalDaysUntilPayday = canonicalCycle.daysUntilRefill == null
        ? 0
        : Math.max(0, canonicalCycle.daysUntilRefill);

      const reconciliation = buildSpendabilityReconciliation({
        recurringPatterns,
        currentCycleBills: billsDueBeforePayday,
        reservedBills: unpaidBillsBeforePayday,
        pendingPaymentBills: pendingPaymentBillsBeforePayday,
        todayStr: todayStrProj,
        cycleEndStr,
        totalAvailable,
        safeToSpend: safeToSpendToday
      });
      
      // Final logging before setting component state
      console.log('Spendability: Final calculation results', {
        nextPayday,
        daysUntilPayday,
        finalDaysUntilPayday,
        totalBillsDue,
        billsCount: billsDueBeforePayday.length,
        willDisplayAs: finalDaysUntilPayday > 0 ? `${finalDaysUntilPayday} days` : 'Today!'
      });

      // Sum ALL checking accounts with projected balances (from depository accounts only)
      const checkingAccounts = depositoryAccounts.filter(a => {
        const name = (a.name || '').toLowerCase();
        const subtype = (a.subtype || '').toLowerCase();
        const accountType = (a.type || '').toLowerCase();
        
        // Include if:
        // 1. Subtype explicitly says "checking"
        // 2. Name contains "checking"
        // 3. Type is "checking" (main account type)
        // 4. Type is "depository" AND name doesn't contain "savings"
        const isChecking = 
          subtype === 'checking' ||
          subtype?.includes('checking') ||
          name.includes('checking') ||
          name.includes('chk') ||
          accountType === 'checking' ||
          (accountType === 'depository' && !name.includes('savings') && !subtype?.includes('savings'));
        
        console.log(`Account "${a.name}": isChecking=${isChecking} (subtype=${a.subtype}, type=${a.type})`);
        
        return isChecking;
      });

      // ✅ FIXED: For Plaid accounts, available balance already includes pending transactions
      const checkingTotal = checkingAccounts.reduce((sum, account) => {
        const balance = parseFloat(account.available_balance ?? account.available ?? account.balances?.available ?? account.current_balance ?? account.current ?? account.balance) || 0;
        console.log(`[Spendability] ${account.name}: balance=${balance.toFixed(2)} (using available directly)`);
        return sum + balance;
      }, 0);

      console.log(`[Spendability] Total Checking: ${checkingTotal.toFixed(2)}`);

      // Sum ALL savings accounts with projected balances (from depository accounts only)
      const savingsAccounts = depositoryAccounts.filter(a => 
        a.subtype === 'savings' || 
        a.name?.toLowerCase().includes('savings')
      );

      // ✅ FIXED: Apply same logic to savings - available balance already includes pending
      const savingsTotal = savingsAccounts.reduce((sum, account) => {
        const balance = parseFloat(account.available_balance ?? account.available ?? account.balances?.available ?? account.current_balance ?? account.current ?? account.balance) || 0;
        return sum + balance;
      }, 0);

      console.log('Spendability: Account breakdowns', {
        checking: {
          accounts: checkingAccounts.map(a => a.name),
          total: checkingTotal
        },
        savings: {
          accounts: savingsAccounts.map(a => a.name),
          total: savingsTotal
        }
      });

      // 🏦 CHECKING ACCOUNTS DEBUG
      console.log('🏦 SPENDABILITY CHECKING ACCOUNTS DEBUG:', {
        totalAccounts: depositoryAccounts.length,
        checkingAccounts: checkingAccounts.length,
        checkingAccountNames: checkingAccounts.map(a => a.name),
        checkingAccountBalances: checkingAccounts.map(a => ({
          name: a.name,
          balance: a.balance,
          available: a.available,
          current: a.current,
          subtype: a.subtype
        })),
        checkingAccountsFound: checkingAccounts.map(a => ({
          name: a.name,
          subtype: a.subtype,
          available: a.available,
          balance: a.balance,
          usedBalance: parseFloat(a.available || a.balance) || 0
        })),
        checkingTotal: checkingTotal.toFixed(2),
        savingsAccountsFound: savingsAccounts.map(a => ({
          name: a.name,
          subtype: a.subtype,
          available: a.available,
          balance: a.balance,
          usedBalance: parseFloat(a.available || a.balance) || 0
        })),
        savingsTotal: savingsTotal
      });

      setFinancialData({
        totalAvailable,  // Now uses PROJECTED balance
        checking: checkingTotal,  // Sum of all checking accounts
        savings: savingsTotal,    // Sum of all savings accounts
        billsBeforePayday: unpaidBillsBeforePayday,  // Only unpaid bills before payday
        billsAfterPayday: unpaidBillsAfterPayday,    // Only unpaid bills after payday
        totalBillsDue,  // Total of unpaid bills only
        safeToSpend,
        safeToSpendToday,  // Spreadsheet-equivalent Safe to Spend
        protectedSafeToSpend, // Optional cushion-adjusted amount
        projection: projection ? {
          cycleEnd: cycleEndStr,
          minDate: projection.minDate,
          minBalance: projection.minBalance,
          totalCycleBills: projection.totalBills,
          cycleIncome: projection.totalIncome,
          daysInCycle: projection.daysInCycle,
        } : null,
        availableAfterPayday,  // NEW: What will be available after all deposits
        // depositsTodayAmount removed
        nextPayday,
        daysUntilPayday: finalDaysUntilPayday,
        weeklyEssentials: essentialsNeeded,
        safetyBuffer,
        paidBillsCount: 0,
        pendingPaymentBillsCount,
        reconciliation,
        paydays  // Array of payday objects
      });
      
      // Force component re-render after state update
      setTimeout(() => {
        console.log('Spendability: Component state updated, days until payday:', finalDaysUntilPayday);
      }, 100);

   } catch (err) {
  console.error('Error loading data:', err);
  setError('No financial data found. Please set up your Settings first.');
  
  const emptyData = {
    totalAvailable: 0,
    checking: 0,
    savings: 0,
    billsBeforePayday: [],
    billsAfterPayday: [],
    totalBillsDue: 0,
    safeToSpend: 0,
    safeToSpendToday: 0,
    projection: null,
    availableAfterPayday: 0,
    // depositsTodayAmount removed
    nextPayday: 'Not set',
    daysUntilPayday: 0,
    weeklyEssentials: 0,
    safetyBuffer: 0,
    paidBillsCount: 0,
    pendingPaymentBillsCount: 0,
    reconciliation: null,
    paydays: []
  };
  
  setFinancialData(emptyData);
} finally {
  setLoading(false);
}
};    
  
  // NUCLEAR: Enhanced force refresh of payday calculation with immediate feedback
  const forceRefreshPaydayCalculation = () => {
    console.log('🔄 NUCLEAR REFRESH: Forcing refresh of payday calculation');
    
    // Immediate recalculation for instant feedback
    const freshCalculation = getManualPacificDaysUntilPayday();
    console.log('🔄 IMMEDIATE REFRESH RESULT:', {
      freshDaysCalculation: freshCalculation,
      currentDisplayed: financialData.daysUntilPayday,
      willUpdate: freshCalculation !== financialData.daysUntilPayday
    });
    
    // Update state immediately for instant UI feedback
    setFinancialData(prev => ({
      ...prev,
      daysUntilPayday: freshCalculation
    }));
    
    // Also trigger full refresh for completeness
    setRefreshTrigger(prev => prev + 1);
    
    // Show notification to user
    console.log(`🔄 REFRESH COMPLETE: Payday countdown updated to ${freshCalculation} days`);
  };

  const handleSpendAmountChange = (e) => {
    const amount = e.target.value;
    setSpendAmount(amount);
    
    if (amount && !isNaN(amount)) {
      // Check against "safe to spend today" (conservative)
      setCanSpend(parseFloat(amount) <= financialData.safeToSpendToday);
    } else {
      setCanSpend(null);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateString) => {
    return formatDateForDisplay(dateString, 'numeric');
  };

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification({ message: '', type: '' }), 4000);
  };

  if (loading) {
    return (
      <div className="spendability-container">
        <div className="page-header">
          <h2>💰 Spendability Calculator</h2>
          <p>Loading your financial data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="spendability-container">
        <div className="page-header">
          <h2>💰 Spendability Calculator</h2>
          <p style={{ color: '#ff6b6b' }}>Error: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="spendability-container">
      <div className="page-header">
        <h2>💰 Spendability Calculator</h2>
        <p>Find out how much you can safely spend before your next account refill</p>
        <div className="connection-status">
          <span className="status-indicator connected"></span>
          Connected to Firebase
        </div>
      </div>

      <div className="tiles-grid">
        
        {/* ✅ FIX ISSUE #3: Tile 1: Next Payday - MOVED TO TOP */}
        {/* ✅ NEW: Support multiple paydays when early deposit is enabled */}
        <div className="tile payday-tile">
          {financialData.paydays && financialData.paydays.length > 1 ? (
            // Multiple paydays (early deposit enabled)
            <>
              <h3>💰 Upcoming Income</h3>
              <div className="paydays-list">
                {financialData.paydays.map((payday, index) => (
                  <div key={index} className={`payday-item payday-${payday.type}`}>
                    <div className="payday-header">
                      <span className="payday-icon">
                        {payday.type === 'early' ? '⚡' : '💵'}
                      </span>
                      <span className="payday-label">
                        {payday.type === 'early' ? 'Early Deposit' : 'Main Payday'}
                      </span>
                    </div>
                    <div className="payday-item-date">{formatDate(payday.date)}</div>
                    <div className="payday-item-countdown">
                      ({payday.daysUntil > 0 ? `${payday.daysUntil} days` : 'Today!'})
                    </div>
                    <div className="payday-amount">{formatCurrency(payday.amount)}</div>
                    <div className="payday-bank">→ {payday.bank}</div>
                  </div>
                ))}
              </div>
              <div className="paydays-total">
                <span>Total Expected:</span>
                <span className="total-amount">
                  {formatCurrency(financialData.paydays.reduce((sum, p) => sum + p.amount, 0))}
                </span>
              </div>
              <button 
                onClick={forceRefreshPaydayCalculation}
                className="refresh-button"
                title="Refresh payday calculation"
              >
                🔄 Refresh
              </button>
            </>
          ) : (
            // Single payday (default)
            <>
              <h3>Next Payday</h3>
              <div className="payday-date">
                {formatDate(financialData.nextPayday)}
              </div>
              <div className="payday-countdown">
                {financialData.daysUntilPayday > 0 
                  ? `${financialData.daysUntilPayday} days`
                  : 'Today!'
                }
              </div>
              {financialData.paydays && financialData.paydays.length === 1 && financialData.paydays[0].amount > 0 && (
                <div className="payday-single-amount">
                  {formatCurrency(financialData.paydays[0].amount)}
                </div>
              )}
              <button 
                onClick={forceRefreshPaydayCalculation}
                className="refresh-button"
                title="Refresh payday calculation"
              >
                🔄 Refresh
              </button>
            </>
          )}
        </div>

        {/* Tile 2: Safe to Spend */}
        <div className="tile safe-spend-tile">
          <h3>💰 Spending Power</h3>
          
          {/* Primary: Safe to Spend TODAY */}
          <div className="spend-now-section">
            <div className="spend-label">Safe to Spend NOW:</div>
            <div className={`safe-amount ${financialData.safeToSpendToday < 0 ? 'negative' : 'positive'}`}>
              {formatCurrency(Math.abs(financialData.safeToSpendToday))}
              {financialData.safeToSpendToday < 0 && <span className="warning-badge">⚠️ SHORT</span>}
            </div>
            <div className="spend-note">
              {financialData.projection
                ? `Covers every bill through ${financialData.projection.cycleEnd} (${financialData.projection.daysInCycle} days) · tightest day: ${financialData.projection.minDate}`
                : 'Based on current bank balance (updates automatically)'}
            </div>
          </div>
          
          {/* Secondary: Future Projection */}
          {financialData.paydays && financialData.paydays.length > 0 && 
           financialData.paydays.some(p => {
             const pDate = new Date(p.date);
             const today = getPacificTime();
             today.setHours(0, 0, 0, 0);
             pDate.setHours(0, 0, 0, 0);
             return pDate > today;
           }) && (
            <div className="spend-future-section">
              <div className="spend-label-small">After All Deposits:</div>
              <div className="spend-amount-small positive">
                {formatCurrency(financialData.availableAfterPayday)}
              </div>
              <div className="spend-note-small">
                {(() => {
                  // Find the last future payday
                  const today = getPacificTime();
                  today.setHours(0, 0, 0, 0);
                  const futurePaydays = financialData.paydays.filter(p => {
                    const pDate = new Date(p.date);
                    pDate.setHours(0, 0, 0, 0);
                    return pDate > today;
                  });
                  const lastFuturePayday = futurePaydays[futurePaydays.length - 1];
                  return lastFuturePayday ? `Available on ${formatDate(lastFuturePayday.date)}` : '';
                })()}
              </div>
            </div>
          )}
          
          {/* Warning if currently negative */}
          {financialData.safeToSpendToday < 0 && (
            <div className="warning-message">
              ⚠️ You're currently {formatCurrency(Math.abs(financialData.safeToSpendToday))} short. 
              Avoid spending until payday to prevent overdraft fees.
            </div>
          )}
        </div>

        {/* Tile 3: Current Balances */}
        <div className="tile balances-tile">
          <h3>Current Balances</h3>
          <div className="balance-list">
            <div className="balance-item">
              <span>Checking:</span>
              <span>{formatCurrency(financialData.checking)}</span>
            </div>
            <div className="balance-item">
              <span>Savings:</span>
              <span>{formatCurrency(financialData.savings)}</span>
            </div>
            <div className="balance-total">
              <span><strong>Total Available:</strong></span>
              <span><strong>{formatCurrency(financialData.totalAvailable)}</strong></span>
            </div>
          </div>
        </div>

        {/* Tile 4: Can I Spend This Amount? - MOVED DOWN */}
        <div className="tile spend-input-tile">
          <h3>Can I spend this amount?</h3>
          <div className="spend-input-section">
            <div className="currency-input">
              <span className="currency-symbol">$</span>
              <input
                type="number"
                value={spendAmount}
                onChange={handleSpendAmountChange}
                placeholder="0.00"
                step="0.01"
                min="0"
              />
            </div>
            {canSpend !== null && (
              <div className={`spend-result ${canSpend ? 'can-spend' : 'cannot-spend'}`}>
                {canSpend 
                  ? `✅ Yes, you can safely spend ${formatCurrency(parseFloat(spendAmount))}`
                  : `❌ No, this exceeds your safe spending limit`
                }
              </div>
            )}
          </div>
        </div>

        {/* Tile 5: Bills Due Before Payday - Collapsible */}
        <div className="tile bills-tile">
          <div className="bills-tile-header" onClick={() => setBillsBeforeCollapsed(!billsBeforeCollapsed)}>
            <h3>
              Bills Due Before Next Refill 
              {financialData.billsBeforePayday.length > 0 && (
                <span className="bill-count">
                  ({financialData.billsBeforePayday.length})
                </span>
              )}
            </h3>
            <span className={`collapse-icon ${billsBeforeCollapsed ? 'collapsed' : ''}`}>
              ▼
            </span>
          </div>
          <div className={`bills-list ${billsBeforeCollapsed ? 'collapsed' : ''}`}>
            {financialData.billsBeforePayday.length > 0 ? (
              financialData.billsBeforePayday.map((bill, index) => (
                <div key={index} className={`bill-item ${bill.statusInfo?.status === 'overdue' ? 'overdue' : ''}`}>
                  <div className="bill-info">
                    <span className="bill-name">{bill.name}</span>
                    <span className="bill-due-date">Due: {formatDate(bill.nextDueDate)}</span>
                    <span className="bill-amount">{formatCurrency(bill.amount ?? bill.cost)}</span>
                    {bill.pendingPayment === true && (
                      <div
                        className="pending-payment-warning"
                        title="A matching Plaid transaction is still pending. The bank's available balance already reflects it, so this bill is not reserved again."
                        style={{
                          marginTop: '8px',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          background: 'rgba(0, 180, 255, 0.12)',
                          border: '1px solid rgba(0, 180, 255, 0.45)',
                          color: '#6fdcff',
                          fontWeight: '700'
                        }}
                      >
                        ⏳ PENDING PAYMENT — excluded from Safe-to-Spend reserve
                      </div>
                    )}
                    {bill.pendingPayment !== true && bill.statusInfo?.status === 'overdue' && (
                      <div className="overdue-warning">
                        🚨 OVERDUE by {bill.statusInfo.daysOverdue} day{bill.statusInfo.daysOverdue !== 1 ? 's' : ''} - LATE FEES MAY APPLY!
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="no-bills">No bills due before your next refill! 🎉</p>
            )}
            <div className="total-bills">
              <span><strong>Reserved Bills:</strong></span>
              <span><strong>{formatCurrency(financialData.totalBillsDue)}</strong></span>
            </div>
            {financialData.pendingPaymentBillsCount > 0 && (
              <div className="paid-bills-info">
                ⏳ {financialData.pendingPaymentBillsCount} bill(s) have pending bank payments and are not reserved again
              </div>
            )}
            {financialData.paidBillsCount > 0 && (
              <div className="paid-bills-info">
                ✅ {financialData.paidBillsCount} bill(s) already paid
              </div>
            )}
          </div>
        </div>

        {/* NEW: Bills Due After Payday - Collapsible */}
        <div className="tile bills-tile">
          <div className="bills-tile-header" onClick={() => setBillsAfterCollapsed(!billsAfterCollapsed)}>
            <h3>
              Bills Due After Next Refill
              {financialData.billsAfterPayday && financialData.billsAfterPayday.length > 0 && (
                <span className="bill-count">
                  ({financialData.billsAfterPayday.length})
                </span>
              )}
            </h3>
            <span className={`collapse-icon ${billsAfterCollapsed ? 'collapsed' : ''}`}>
              ▼
            </span>
          </div>
          <div className={`bills-list ${billsAfterCollapsed ? 'collapsed' : ''}`}>
            {financialData.billsAfterPayday && financialData.billsAfterPayday.length > 0 ? (
              <>
                {financialData.billsAfterPayday.map((bill, index) => (
                  <div key={index} className="bill-item">
                    <div className="bill-info">
                      <span className="bill-name">{bill.name}</span>
                      <span className="bill-due-date">Due: {formatDate(bill.nextDueDate)}</span>
                      <span className="bill-amount">{formatCurrency(bill.amount ?? bill.cost)}</span>
                    </div>
                  </div>
                ))}
                <div className="total-bills">
                  <span><strong>Total:</strong></span>
                  <span><strong>
                    {formatCurrency(
                      financialData.billsAfterPayday.reduce((sum, b) => sum + (Number(b.amount ?? b.cost) || 0), 0)
                    )}
                  </strong></span>
                </div>
              </>
            ) : (
              <p className="no-bills">No later unpaid bills</p>
            )}
          </div>
        </div>

        {/* Read-only Safe-to-Spend reconciliation audit */}
        {financialData.reconciliation && (
          <div className="tile calculation-tile">
            <h3>🧾 Safe-to-Spend Reconciliation</h3>
            <div className="calculation-list">
              <div className="calc-section">
                <div className="calc-section-title">Equation used</div>
                <div className="calc-item">
                  <span>Current available balance</span>
                  <span className="positive">{formatCurrency(financialData.reconciliation.equation.startingBalance)}</span>
                </div>
                <div className="calc-item negative">
                  <span>Reserved unpaid bills ({financialData.reconciliation.reservedCount})</span>
                  <span>-{formatCurrency(financialData.reconciliation.equation.reservedBills)}</span>
                </div>
                <div className="calc-total">
                  <span className="result-label">Safe to Spend</span>
                  <span className="result-amount">{formatCurrency(financialData.reconciliation.equation.result)}</span>
                </div>
              </div>

              <div className="calc-section">
                <div className="calc-section-title">Excluded from reserve</div>
                <div className="calc-item">
                  <span>Pending bank payments ({financialData.reconciliation.pendingExcludedCount})</span>
                  <span>{formatCurrency(financialData.reconciliation.pendingExcludedTotal)}</span>
                </div>
                <div className="calc-note">
                  <small>These remain officially unpaid until posted, but are not reserved again because the bank available balance already reflects them.</small>
                </div>
              </div>

              <div className="calc-section">
                <div className="calc-section-title">
                  Recurring-pattern coverage
                </div>
                {financialData.reconciliation.missingOccurrences.length > 0 ? (
                  <>
                    <div className="calc-note" style={{ marginBottom: '10px' }}>
                      <small>⚠️ Active recurring items expected before {financialData.reconciliation.cycleEndStr} with no matching unpaid bill occurrence:</small>
                    </div>
                    {financialData.reconciliation.missingOccurrences.map(item => (
                      <div className="calc-item negative" key={item.id}>
                        <span>{item.name} · due {formatDate(item.dueDate)}</span>
                        <span>{item.amount == null ? 'Variable amount' : formatCurrency(item.amount)}</span>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="calc-note">
                    <small>✅ Every active recurring pattern expected in this cycle has a matching bill occurrence.</small>
                  </div>
                )}
              </div>

              {financialData.reconciliation.unlinkedOccurrences.length > 0 && (
                <div className="calc-section">
                  <div className="calc-section-title">Manual / unlinked bill occurrences</div>
                  {financialData.reconciliation.unlinkedOccurrences.map(item => (
                    <div className="calc-item" key={item.id}>
                      <span>{item.name} · due {formatDate(item.dueDate)}</span>
                      <span>{formatCurrency(item.amount)}</span>
                    </div>
                  ))}
                  <div className="calc-note">
                    <small>These are valid bill occurrences but are not linked to a recurring pattern. Review them when reconciling against an external ledger.</small>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tile 6: Calculation Breakdown */}
        <div className="tile calculation-tile">
          <h3>📊 Calculation Breakdown</h3>
          <div className="calculation-list">
            
            {/* Current Funds Section */}
            <div className="calc-section">
              <div className="calc-section-title">💵 Available Now:</div>
              <div className="calc-item">
                <span>Current Balance:</span>
                <span className="positive">{formatCurrency(financialData.totalAvailable)}</span>
              </div>
              <div className="calc-note">
                <small>✅ Live balance from your bank accounts</small>
              </div>
            </div>
            
            {/* Future Deposits Section */}
            {financialData.paydays && financialData.paydays.length > 0 && 
             financialData.paydays.some(p => {
               const pDate = new Date(p.date);
               const today = getPacificTime();
               today.setHours(0, 0, 0, 0);
               pDate.setHours(0, 0, 0, 0);
               return pDate > today;
             }) && (
              <div className="calc-section future">
                <div className="calc-section-title">📅 Coming Soon:</div>
                {financialData.paydays.filter(p => {
                  const paydayDate = new Date(p.date);
                  const today = getPacificTime();
                  today.setHours(0, 0, 0, 0);
                  paydayDate.setHours(0, 0, 0, 0);
                  return paydayDate > today;
                }).map((payday, idx) => (
                  <div key={idx} className="calc-item future">
                    <span>
                      + {payday.type === 'early' ? 'Early Deposit' : 'Main Payday'} 
                      ({formatDate(payday.date)}):
                    </span>
                    <span className="positive">+{formatCurrency(payday.amount)}</span>
                  </div>
                ))}
              </div>
            )}
            
            {/* Obligations Section */}
            <div className="calc-section">
              <div className="calc-section-title">💸 Obligations:</div>
              <div className="calc-item negative">
                <span>- Upcoming Bills:</span>
                <span>
                  -{formatCurrency(financialData.totalBillsDue)}
                  {financialData.paidBillsCount > 0 && (
                    <span style={{ fontSize: '0.85em', color: '#10b981', marginLeft: '8px' }}>
                      ({financialData.paidBillsCount} paid)
                    </span>
                  )}
                </span>
              </div>
              {(financialData.weeklyEssentials > 0 || financialData.safetyBuffer > 0) && (
                <div className="calc-note">
                  <small>
                    Optional planning cushion: {formatCurrency(
                      (financialData.weeklyEssentials || 0) + (financialData.safetyBuffer || 0)
                    )} — shown separately and not deducted from the spreadsheet-equivalent Safe to Spend.
                  </small>
                </div>
              )}
            </div>
            
            {/* Results Section */}
            <div className="calc-results">
              <div className={`calc-total ${financialData.safeToSpendToday < 0 ? 'negative' : 'positive'}`}>
                <span className="result-label">Safe to Spend NOW:</span>
                <span className="result-amount">{formatCurrency(financialData.safeToSpendToday)}</span>
              </div>
              {(financialData.safetyBuffer > 0 || financialData.weeklyEssentials > 0) && (
                <div className="calc-total future">
                  <span className="result-label-small">After Optional Cushion:</span>
                  <span className="result-amount-small">{formatCurrency(financialData.protectedSafeToSpend)}</span>
                </div>
              )}
              
              {financialData.paydays && financialData.paydays.length > 0 && 
               financialData.paydays.some(p => {
                 const pDate = new Date(p.date);
                 const today = getPacificTime();
                 today.setHours(0, 0, 0, 0);
                 pDate.setHours(0, 0, 0, 0);
                 return pDate > today;
               }) && (
                <div className="calc-total future positive">
                  <span className="result-label-small">After Payday:</span>
                  <span className="result-amount-small">{formatCurrency(financialData.availableAfterPayday)}</span>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
      
      {/* Notification */}
      {notification.message && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}
    </div>
  );
};

export default SpendabilityV2;
 
