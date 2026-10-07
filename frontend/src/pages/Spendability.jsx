import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { PayCycleCalculator } from '../utils/PayCycleCalculator';
import { RecurringBillManager } from '../utils/RecurringBillManager';
import { projectCashFlow, nextOwnPaydays, spousePaydaysBetween, addDays } from '../utils/CashFlowProjection';
import { formatDateForDisplay, formatDateForInput, getDaysUntilDateInPacific, getManualPacificDaysUntilPayday } from '../utils/DateUtils';
import { getPacificTime } from '../utils/timezoneHelpers';
import { SettingsSchemaManager } from '../utils/SettingsSchemaManager';
import { getVisiblePlaidAccounts, isDepositoryAccount } from '../utils/accountVisibility';
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
      
      const [settingsDocSnap, payCycleDocSnap, accountsResponse] = await Promise.all([
        getDoc(settingsDocRef),
        getDoc(payCycleDocRef),
        fetch(`${apiUrl}/api/accounts?userId=${currentUser.uid}&_t=${Date.now()}`).catch(err => {
          console.error('[Spendability] Backend API error, will use Firebase cache as fallback:', err);
          return null;
        })
      ]);

      if (!settingsDocSnap.exists()) {
        throw new Error('No financial data found. Please set up your Settings first.');
      }

      let settingsData = settingsDocSnap.data();
      
      // ✅ Validate and migrate if needed
      if (!settingsData.schemaVersion || settingsData.schemaVersion < SettingsSchemaManager.CURRENT_SCHEMA_VERSION) {
        console.log('🔄 Spendability: Migrating settings from v', settingsData.schemaVersion || 1, 'to v', SettingsSchemaManager.CURRENT_SCHEMA_VERSION);
        settingsData = SettingsSchemaManager.migrateSettings(settingsData);
        
        // Use the migrated shape in memory only. Persisting schema changes from a
        // read-only view is intentionally disabled during the safety freeze.
        console.log('✅ Spendability: Using migrated settings in memory');
      }
      
      const validation = SettingsSchemaManager.validateSettings(settingsData);
      if (!validation.valid) {
        console.error('⚠️ Settings validation failed in Spendability:', validation.errors);
        // Use safe defaults for missing fields
        settingsData = SettingsSchemaManager.ensureRequiredFields(settingsData);
        console.log('✅ Spendability: Required fields ensured with defaults');
      }
      
      let payCycleData = payCycleDocSnap.exists() ? payCycleDocSnap.data() : null;
	  let paydayCalcResult = null;
      // Safety freeze: payday state is not advanced or persisted simply by
      // opening Spendability. The existing stored schedule is used as-is.

  // ✅ FIX: Load FRESH balances from backend API like Accounts page does
  let allPlaidAccounts = [];
  try {
    if (import.meta.env.DEV) {
      console.log('[Spendability] Fetching fresh balances from backend API...');
    }
    
    if (accountsResponse && accountsResponse.ok) {
      const data = await accountsResponse.json();

      if (data.success && data.accounts && data.accounts.length > 0) {
        // Format backend accounts using the same logic as Accounts page
        allPlaidAccounts = data.accounts.map(account => {
          const { currentBalance, availableBalance, liveBalance, pendingAdjustment } = extractBalances(account);

          return {
            account_id: account.account_id ?? '',
            name: account.name ?? 'Unknown Account',
            official_name: account.official_name ?? account.name ?? 'Unknown Account',
            type: account.subtype || account.type || 'checking',
            balance: liveBalance.toFixed(2), // ✅ main displayed balance (uses available_balance)
            available: availableBalance.toFixed(2),
            current: currentBalance.toFixed(2),
            pending_adjustment: pendingAdjustment.toFixed(2),
            mask: account.mask ?? '',
            isPlaid: true,
            item_id: account.item_id ?? '',
            institution_name: account.institution_name ?? data?.institution_name ?? '',
            institution_id: account.institution_id ?? '',
            // Store original type and subtype for filtering
            originalType: account.type,
            originalSubtype: account.subtype,
            subtype: account.subtype // Keep subtype for filtering logic
          };
        });
        if (import.meta.env.DEV) {
          console.log('[Spendability] ✅ Loaded', allPlaidAccounts.length, 'fresh accounts from backend API');
        }
      } else {
        console.warn('[Spendability] ⚠️ Backend returned no accounts, falling back to Firebase cache');
        allPlaidAccounts = getVisiblePlaidAccounts(settingsData.plaidAccounts || [], settingsData);
      }
    } else {
      console.warn('[Spendability] ⚠️ Backend API unavailable, falling back to Firebase cache');
      allPlaidAccounts = getVisiblePlaidAccounts(settingsData.plaidAccounts || [], settingsData);
    }
  } catch (error) {
    console.error('[Spendability] ❌ Error loading from backend API:', error);
    if (import.meta.env.DEV) {
      console.log('[Spendability] Falling back to Firebase cache');
    }
    allPlaidAccounts = getVisiblePlaidAccounts(settingsData.plaidAccounts || [], settingsData);
  }

      // Safe-to-Spend only uses visible cash/depository accounts.
      const depositoryAccounts = allPlaidAccounts.filter(isDepositoryAccount);

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
      const totalAvailable = depositoryAccounts.reduce((sum, account) => {
        // Use available balance directly - it's already "projected" by the bank
        const availableBalance = parseFloat(account.available || account.balance) || 0;
        return sum + availableBalance;
      }, 0);

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

if (settingsData.nextPaydayOverride) {
  nextPayday = settingsData.nextPaydayOverride;
  daysUntilPayday = getDaysUntilDateInPacific(nextPayday);
} else if (payCycleData && payCycleData.date) {
  // ✅ FIX: Validate cached date is in the future
  const cachedDate = new Date(payCycleData.date);
  const today = getPacificTime();
  today.setHours(0, 0, 0, 0);
  
  if (cachedDate >= today) {
    // Cached date is valid (today or future)
    nextPayday = payCycleData.date;
    daysUntilPayday = getDaysUntilDateInPacific(nextPayday);
    console.log('✅ Using valid cached payday:', nextPayday);
  } else {
    // Cached date is in the past - recalculate!
    console.warn('❌ Cached payday is in the past:', payCycleData.date, '- recalculating...');
    
    // Fall through to calculation from schedules (set payCycleData to null to trigger calculation)
    payCycleData.date = null;
  }
}

if (!payCycleData || !payCycleData.date) {
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

const result = PayCycleCalculator.calculateNextPayday(yoursSchedule, spouseSchedule);
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
 
      // ✅ NEW: Calculate multiple paydays if early deposit is enabled
      let paydays = [];
      let totalPaydayAmount = 0;
      let lastPaydayDate = nextPayday;
      
      // Check BOTH nested and flat field structures for backward compatibility
      const earlyDepositEnabled = 
        settingsData.earlyDeposit?.enabled === true || 
        settingsData.enableEarlyDeposit === true;

      const earlyDepositAmount = parseFloat(
        settingsData.earlyDeposit?.amount || 
        settingsData.earlyDepositAmount || 
        0
      );

      const earlyDepositBank = 
        settingsData.earlyDeposit?.bankName || 
        settingsData.earlyDepositBank || 
        'Early Deposit Account';

      const daysBeforePayday = parseInt(
        settingsData.earlyDeposit?.daysBefore || 
        settingsData.earlyDeposit?.daysBeforePayday ||
        settingsData.daysBeforePayday || 
        2
      );

      const remainderBank = 
        settingsData.earlyDeposit?.remainderBank || 
        settingsData.remainderBank || 
        'Main Account';

      // Log what we found for debugging
      console.log('🔍 Early deposit field detection:', {
        nestedEnabled: settingsData.earlyDeposit?.enabled,
        flatEnabled: settingsData.enableEarlyDeposit,
        finalEnabled: earlyDepositEnabled,
        nestedAmount: settingsData.earlyDeposit?.amount,
        flatAmount: settingsData.earlyDepositAmount,
        finalAmount: earlyDepositAmount,
        daysBeforePayday: daysBeforePayday
      });
      
      // Whose payday is next? Early-deposit split only applies to YOUR paycheck.
      const paydayInfo = paydayCalcResult || payCycleData || {};
      const paydaySource = paydayInfo.source || 'yours';
      const isSpousePayday = String(paydaySource).toLowerCase().includes('spouse');

      if (earlyDepositEnabled && earlyDepositAmount > 0 && !isSpousePayday) {
        // Early deposit is enabled - calculate both deposits
        const mainPaydayDate = new Date(nextPayday);
        const earlyDepositDate = new Date(mainPaydayDate);
        earlyDepositDate.setDate(earlyDepositDate.getDate() - daysBeforePayday);
        
        const earlyAmount = earlyDepositAmount;
        // NOTE: Fallback chain for backward compatibility with different settings schema versions
        // Newer schema uses payAmount, older schema uses paySchedules.yours.amount
        const totalPayAmount = parseFloat(settingsData.payAmount || settingsData.paySchedules?.yours?.amount) || 0;
        const mainAmount = totalPayAmount - earlyAmount;
        
        // ✅ VALIDATION: Ensure early deposit doesn't exceed total pay
        if (earlyAmount > totalPayAmount) {
          console.warn('⚠️ Early deposit amount exceeds total pay amount.');
          console.warn(`   Early: $${earlyAmount}, Total: $${totalPayAmount}`);
          
          // Fallback to single payday with warning
          paydays = [
            { 
              date: nextPayday, 
              amount: totalPayAmount, 
              bank: remainderBank, 
              type: 'single',
              daysUntil: daysUntilPayday
            }
          ];
          totalPaydayAmount = totalPayAmount;
        } else {
          // Normal case - split between early and main
          paydays = [
            { 
              date: formatDateForInput(earlyDepositDate), 
              amount: earlyAmount, 
              bank: earlyDepositBank, 
              type: 'early',
              daysUntil: getDaysUntilDateInPacific(formatDateForInput(earlyDepositDate))
            },
            { 
              date: nextPayday, 
              amount: mainAmount, 
              bank: remainderBank, 
              type: 'main',
              daysUntil: daysUntilPayday
            }
          ];
          
          totalPaydayAmount = earlyAmount + mainAmount;
        }
        
        lastPaydayDate = nextPayday; // Use main payday as the cutoff for bills
        
        console.log('✅ Early deposit enabled - split payday:', {
          earlyDate: paydays[0]?.date,
          earlyAmount: paydays[0]?.amount,
          earlyBank: paydays[0]?.bank,
          mainDate: paydays[paydays.length - 1]?.date,
          mainAmount: paydays[paydays.length - 1]?.amount,
          mainBank: paydays[paydays.length - 1]?.bank,
          total: totalPaydayAmount
        });
      } else {
        // Single payday (default). Use the amount for WHOSE payday this is:
        // the calculator returns spouse's amount on spouse's payday.
        const totalPayAmount = parseFloat(paydayInfo.amount) ||
          parseFloat(settingsData.payAmount || settingsData.paySchedules?.yours?.amount) || 0;
        
        paydays = [
          { 
            date: nextPayday, 
            amount: totalPayAmount, 
            bank: isSpousePayday ? 'Spouse Deposit' : (remainderBank || 'Main Bank'), 
            type: 'single',
            daysUntil: daysUntilPayday
          }
        ];
        
        totalPaydayAmount = totalPayAmount;
        lastPaydayDate = nextPayday;
        
        console.log('ℹ️ Single payday mode:', {
          reason: !earlyDepositEnabled ? 'Early deposit not enabled' : 'Early deposit amount is 0',
          amount: totalPayAmount,
          date: nextPayday
        });
      }
 
      // ✅ FIX: Load bills from financialEvents collection (where Bills.jsx reads from)
      let allBills = [];
      try {
        const financialEventsRef = collection(db, 'users', currentUser.uid, 'financialEvents');
        const billsQuery = query(financialEventsRef, where('type', '==', 'bill'));
        const billsSnapshot = await getDocs(billsQuery);
        
        allBills = billsSnapshot.docs
          .map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              name: data.name,
              amount: data.amount,
              dueDate: data.dueDate,
              nextDueDate: data.dueDate,
              category: data.category,
              recurrence: data.recurrence || 'monthly',
              isPaid: data.isPaid,
              status: data.status,
              isSubscription: data.isSubscription || false,
              subscriptionId: data.subscriptionId,
              paymentHistory: data.paymentHistory || [],
              linkedTransactionIds: data.linkedTransactionIds || [],
              merchantNames: data.merchantNames || [],
              originalDueDate: data.originalDueDate
            };
          })
          .filter(bill => {
            // Only exclude if EXPLICITLY paid or skipped
            if (bill.status === 'paid') return false;
            if (bill.status === 'skipped') return false;
            if (bill.isPaid === true) return false;
            return true;
          });
        console.log('✅ Spendability: Loaded bills from financialEvents', {
          count: allBills.length,
          bills: allBills.map(b => ({ name: b.name, amount: b.amount, dueDate: b.dueDate, status: b.status }))
        });
      } catch (error) {
        console.error('❌ Spendability: Error loading bills from financialEvents:', error);
      }

      // Canonical bill paid/unpaid state comes from the backend Bill Engine.
      // Spendability does not run its own transaction matcher.

      // Add default recurrence if missing
      const billsWithRecurrence = allBills.map(bill => ({
        ...bill,
        recurrence: bill.recurrence || 'monthly'
      }));

      const processedBills = RecurringBillManager.processBills(billsWithRecurrence);

      // ✅ NEW LOGIC: Split bills into "before payday" and "after payday" groups
      const today = getPacificTime();
      today.setHours(0, 0, 0, 0);
      // Use the last (furthest) payday date as the cutoff for bills
      const paydayDate = new Date(lastPaydayDate);

      // Separate bills into before and after payday
      const billsBeforePaydayRaw = [];
      const billsAfterPaydayRaw = [];
      
      processedBills.forEach(bill => {
        const billDueDate = new Date(bill.nextDueDate || bill.dueDate);
        
        // Classify based on due date relative to payday
        if (billDueDate < paydayDate || billDueDate < today) {
          // Overdue or due before payday
          billsBeforePaydayRaw.push(bill);
          console.log(`📌 Bill before payday: ${bill.name} (due ${bill.nextDueDate})`);
        } else {
          // Due on or after payday
          billsAfterPaydayRaw.push(bill);
          console.log(`📅 Bill after payday: ${bill.name} (due ${bill.nextDueDate})`);
        }
      });

      console.log(`✅ Spendability: Split ${processedBills.length} bills into ${billsBeforePaydayRaw.length} before payday, ${billsAfterPaydayRaw.length} after payday`);

      // Add status info to bills before payday and sort by priority (overdue bills first)
      const billsDueBeforePayday = billsBeforePaydayRaw
        .map(bill => ({
          ...bill,
          statusInfo: RecurringBillManager.determineBillStatus(bill)
        }))
        .sort((a, b) => {
          // Overdue bills ALWAYS at top
          if (a.statusInfo.priority !== b.statusInfo.priority) {
            return b.statusInfo.priority - a.statusInfo.priority;
          }
          // Then by due date
          return new Date(a.nextDueDate) - new Date(b.nextDueDate);
        });
      
      // Add status info to bills after payday and sort by due date
      const billsDueAfterPayday = billsAfterPaydayRaw
        .map(bill => ({
          ...bill,
          statusInfo: RecurringBillManager.determineBillStatus(bill)
        }))
        .sort((a, b) => {
          // Sort by due date
          return new Date(a.nextDueDate) - new Date(b.nextDueDate);
        });
      
      // financialEvents has already been filtered to canonical unpaid,
      // non-skipped bill occurrences. Do not second-guess that state by
      // re-matching bank transactions in the browser.
      const unpaidBillsBeforePayday = billsDueBeforePayday;
      const unpaidBillsAfterPayday = billsDueAfterPayday;

      const totalUnpaidBills = unpaidBillsBeforePayday.reduce((sum, bill) => {
        return sum + (Number(bill.amount ?? bill.cost) || 0);
      }, 0);

      const totalBillsDue = totalUnpaidBills;
      const paidBillsCount = 0;
      const totalBillsDueLegacy = totalUnpaidBills;

      const preferences = settingsData.preferences || {};
      const weeklyEssentials = preferences.weeklyEssentials || 0;
      const safetyBuffer = preferences.safetyBuffer || 0;
      const weeksUntilPayday = Math.ceil(daysUntilPayday / 7);
      const essentialsNeeded = weeklyEssentials * weeksUntilPayday;

      // ═══════════ PAY-CYCLE PROJECTION ENGINE ═══════════
      // Day-by-day running balance from today through the day BEFORE the
      // user's own next money arrives (early deposit if enabled, else main
      // payday). Spouse paydays inside the window are mid-cycle income; all
      // unpaid bills in the window (including overdue) are outflows on their
      // dates; essentials drip daily. Safe-to-spend = the LOWEST projected
      // dip minus the safety buffer — the spreadsheet algorithm.
      const todayStrProj = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Los_Angeles'
      }).format(new Date());

      const ownLastPay = settingsData.lastPayDate || settingsData.paySchedules?.yours?.lastPaydate;
      const { mainDate: ownMainNext, earlyDate: ownEarlyNext } = nextOwnPaydays(
        ownLastPay, todayStrProj,
        { earlyDepositEnabled, daysBeforePayday }
      );
      const ownBoundary = ownEarlyNext || ownMainNext;   // first own money arrival
      const cycleEndStr = ownBoundary ? addDays(ownBoundary, -1) : nextPayday;

      const spouseAmt = parseFloat(
        settingsData.paySchedules?.spouse?.amount || settingsData.spouseAmount
      ) || 0;
      const cycleIncomes = spousePaydaysBetween(todayStrProj, cycleEndStr, spouseAmt);

      const allUnpaidCycleBills = [
        ...(unpaidBillsBeforePayday || []),
        ...(unpaidBillsAfterPayday || []),
      ];

      const projection = projectCashFlow({
        startingBalance: totalAvailable,
        todayStr: todayStrProj,
        cycleEndStr,
        incomes: cycleIncomes,
        bills: allUnpaidCycleBills,
        weeklyEssentials,
        safetyBuffer,
      });

      console.log('📈 PAY-CYCLE PROJECTION:', {
        cycle: `${todayStrProj} → ${cycleEndStr} (${projection.daysInCycle} days)`,
        ownNextMoney: ownBoundary,
        cycleIncome: projection.totalIncome,
        cycleBills: projection.totalBills,
        lowestPoint: `$${projection.minBalance} on ${projection.minDate}`,
        safeToSpend: projection.safeToSpend,
      });

      const safeToSpendToday = projection.safeToSpend;
      
      // Calculate what will be available AFTER all deposits arrive (projection)
      const availableAfterPayday = 
        totalAvailable +
        totalPaydayAmount -        // All future deposits
        totalBillsDue -
        essentialsNeeded -
        safetyBuffer;
      
      // Legacy field for backward compatibility (now points to "safe to spend today")
      const safeToSpend = safeToSpendToday;
      
      console.log('💰 Safe to Spend Calculation:', {
        totalAvailable,
        totalPaydayAmount,
        totalBillsDue,
        safetyBuffer,
        essentialsNeeded,
        safeToSpendToday,
        availableAfterPayday,
        paydays: paydays.map(p => ({ date: p.date, amount: p.amount, type: p.type, daysUntil: p.daysUntil }))
      });

      const finalDaysUntilPayday = Math.max(0, daysUntilPayday);
      
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
        const balance = parseFloat(account.available || account.balance) || 0;
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
        const balance = parseFloat(account.available || account.balance) || 0;
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
        safeToSpendToday,  // NEW: What's safe to spend RIGHT NOW
        projection: {
          cycleEnd: cycleEndStr,
          minDate: projection.minDate,
          minBalance: projection.minBalance,
          totalCycleBills: projection.totalBills,
          cycleIncome: projection.totalIncome,
          daysInCycle: projection.daysInCycle,
        },
        availableAfterPayday,  // NEW: What will be available after all deposits
        // depositsTodayAmount removed
        nextPayday,
        daysUntilPayday: finalDaysUntilPayday,
        weeklyEssentials: essentialsNeeded,
        safetyBuffer,
        paidBillsCount: billsDueBeforePayday.length - unpaidBillsBeforePayday.length,
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
        <p>Find out how much you can safely spend until your next payday</p>
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
              Bills Due Before Payday 
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
                    {bill.statusInfo?.status === 'overdue' && (
                      <div className="overdue-warning">
                        🚨 OVERDUE by {bill.statusInfo.daysOverdue} day{bill.statusInfo.daysOverdue !== 1 ? 's' : ''} - LATE FEES MAY APPLY!
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="no-bills">No bills due before next payday! 🎉</p>
            )}
            <div className="total-bills">
              <span><strong>Total Bills:</strong></span>
              <span><strong>{formatCurrency(financialData.totalBillsDue)}</strong></span>
            </div>
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
              Bills Due After Payday
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
              <p className="no-bills">No bills due after payday</p>
            )}
          </div>
        </div>

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
              <div className="calc-item negative">
                <span>- Weekly Essentials:</span>
                <span>-{formatCurrency(financialData.weeklyEssentials)}</span>
              </div>
              <div className="calc-item negative">
                <span>- Safety Buffer:</span>
                <span>-{formatCurrency(financialData.safetyBuffer)}</span>
              </div>
            </div>
            
            {/* Results Section */}
            <div className="calc-results">
              <div className={`calc-total ${financialData.safeToSpendToday < 0 ? 'negative' : 'positive'}`}>
                <span className="result-label">Safe to Spend NOW:</span>
                <span className="result-amount">{formatCurrency(financialData.safeToSpendToday)}</span>
              </div>
              
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
 
