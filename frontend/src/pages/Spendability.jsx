import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, collection, addDoc, getDocs, serverTimestamp, arrayUnion, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { PayCycleCalculator } from '../utils/PayCycleCalculator';
import { RecurringBillManager } from '../utils/RecurringBillManager';
import { formatDateForDisplay, formatDateForInput, getDaysUntilDateInPacific, getPacificTime, getManualPacificDaysUntilPayday } from '../utils/DateUtils';
import { calculateProjectedBalance, calculateTotalProjectedBalance } from '../utils/BalanceCalculator';
import { autoMigrateBills } from '../utils/FirebaseMigration';
import { runAutoDetection } from '../utils/AutoBillDetection';
import './Spendability.css';
import { useAuth } from '../contexts/AuthContext';

const Spendability = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [spendAmount, setSpendAmount] = useState('');
  const [canSpend, setCanSpend] = useState(null);
  const [notification, setNotification] = useState({ message: '', type: '' });
  const [payingBill, setPayingBill] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0); // Force refresh mechanism
  
  const [financialData, setFinancialData] = useState({
    totalAvailable: 0,
    checking: 0,
    savings: 0,
    billsBeforePayday: [],
    totalBillsDue: 0,
    safeToSpend: 0,
    nextPayday: 'No date',
    daysUntilPayday: 0,
    weeklyEssentials: 0,
    safetyBuffer: 0
  });

  useEffect(() => {
    fetchFinancialData();
  }, [refreshTrigger]); // Re-fetch when refresh is triggered
  const autoUpdatePayday = async (settingsData) => {
  const today = getPacificTime();
  const lastPayDateStr = settingsData?.lastPayDate || settingsData?.yoursSchedule?.lastPaydate;
  
  if (!lastPayDateStr) return false;
  
  const lastPayDate = new Date(lastPayDateStr);
  const daysSinceLastPay = Math.floor((today - lastPayDate) / (1000 * 60 * 60 * 24));
  
  if (daysSinceLastPay >= 14) {
    const payPeriods = Math.floor(daysSinceLastPay / 14);
    const newLastPayDate = new Date(lastPayDate);
    newLastPayDate.setDate(lastPayDate.getDate() + (payPeriods * 14));
    
    const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
    await updateDoc(settingsDocRef, {
      lastPayDate: formatDateForInput(newLastPayDate)
    });
    
    console.log(`Auto-updated last pay date to ${formatDateForInput(newLastPayDate)}`);
    return true;
  }
  
  return false;
};

  const fetchFinancialData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Auto-migrate bills to unified structure (runs once per user)
      await autoMigrateBills(currentUser.uid);

      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      const settingsDocSnap = await getDoc(settingsDocRef);
      
      const payCycleDocRef = doc(db, 'users', currentUser.uid, 'financial', 'payCycle');
      const payCycleDocSnap = await getDoc(payCycleDocRef);

      if (!settingsDocSnap.exists()) {
        throw new Error('No financial data found. Please set up your Settings first.');
      }

      let settingsData = settingsDocSnap.data();
      const payCycleData = payCycleDocSnap.exists() ? payCycleDocSnap.data() : null;
      // Auto-update payday if needed
const wasUpdated = await autoUpdatePayday(settingsData);
if (wasUpdated) {
  const refreshedDoc = await getDoc(settingsDocRef);
  settingsData = refreshedDoc.data();
}

  const allPlaidAccounts = settingsData.plaidAccounts || [];

      // Filter: ONLY depository accounts (checking, savings, money market)
      // Exclude credit cards completely
      const depositoryAccounts = allPlaidAccounts.filter(account => {
        // Include if type is depository
        if (account.type === 'depository') return true;
        
        // Include if subtype is checking, savings, or money market
        const depositorySubtypes = ['checking', 'savings', 'money market', 'cd', 'hsa'];
        if (depositorySubtypes.includes(account.subtype?.toLowerCase())) return true;
        
        // Exclude if type is credit
        if (account.type === 'credit') return false;
        
        // Exclude if subtype contains 'credit'
        if (account.subtype?.toLowerCase().includes('credit')) return false;
        
        // Default: include for manual accounts
        return true;
      });

      console.log(`[Spendability] Filtered ${allPlaidAccounts.length} accounts to ${depositoryAccounts.length} depository accounts (excluded credit cards)`);

      // Load transactions to calculate projected balances
      const transactionsRef = collection(db, 'users', currentUser.uid, 'transactions');
      const transactionsSnapshot = await getDocs(transactionsRef);
      const transactions = transactionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      console.log('Spendability: Loaded transactions', {
        count: transactions.length,
        pendingCount: transactions.filter(t => t.pending).length
      });

      // Use PROJECTED balance (includes pending transactions)
      // Calculate balance using ONLY depository accounts (no credit cards)
      const totalAvailable = calculateTotalProjectedBalance(depositoryAccounts, transactions);

      console.log('Spendability: Balance calculation', {
        liveBalance: depositoryAccounts.reduce((sum, a) => sum + parseFloat(a.balance || 0), 0),
        projectedBalance: totalAvailable,
        difference: totalAvailable - depositoryAccounts.reduce((sum, a) => sum + parseFloat(a.balance || 0), 0)
      });

      // 🔍 COMPREHENSIVE DEBUG LOGGING
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
          liveBalance: a.balance,
          projectedBalance: calculateProjectedBalance(a.account_id, parseFloat(a.balance) || 0, transactions)
        })),
        transactionsCount: transactions.length,
        pendingTransactionsCount: transactions.filter(t => t.pending).length,
        totalLiveBalance: depositoryAccounts.reduce((sum, a) => sum + parseFloat(a.balance || 0), 0),
        totalProjectedBalance: totalAvailable
      }); 
     // Get pay cycle data
let nextPayday, daysUntilPayday;

if (settingsData.nextPaydayOverride) {
  nextPayday = settingsData.nextPaydayOverride;
  daysUntilPayday = getDaysUntilDateInPacific(nextPayday);
} else if (payCycleData && payCycleData.date) {
  nextPayday = payCycleData.date;
  // ✅ FIX ISSUE #2: Use getDaysUntilDateInPacific instead of payCycleData.daysUntil
  daysUntilPayday = getDaysUntilDateInPacific(nextPayday);
} else {
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

console.log('Spendability: Payday calculation result', result);
nextPayday = result.date;
// ✅ FIX ISSUE #2: Use getDaysUntilDateInPacific instead of result.daysUntil
daysUntilPayday = getDaysUntilDateInPacific(nextPayday);

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
 
      // Load bills from unified billInstances collection ONLY
      let allBills = [];
      try {
        // ✅ FIX ISSUE #1: Load ALL bill instances (no where clause)
        const billInstancesSnapshot = await getDocs(
          collection(db, 'users', currentUser.uid, 'billInstances')
        );
        allBills = billInstancesSnapshot.docs
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
        console.log('Spendability: Loaded bills from unified billInstances', {
          count: allBills.length,
          bills: allBills.map(b => ({ name: b.name, amount: b.amount, dueDate: b.dueDate, status: b.status }))
        });
      } catch (error) {
        console.log('Spendability: Error loading bill instances:', error.message);
      }

      // Run auto-detection for bill payments
      try {
        const autoDetectionResult = await runAutoDetection(currentUser.uid, transactions, allBills);
        
        if (autoDetectionResult.success && autoDetectionResult.matchCount > 0) {
          // Show notification to user
          const message = `✅ Auto-detected ${autoDetectionResult.paidBills.length} paid bill(s)!`;
          setNotification({ message, type: 'success' });
          setTimeout(() => setNotification({ message: '', type: '' }), 4000);
          
          // Reload bills after auto-detection marked some as paid
          const refreshedBillsSnapshot = await getDocs(
            collection(db, 'users', currentUser.uid, 'billInstances')
          );
          allBills = refreshedBillsSnapshot.docs
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
          console.log('Spendability: Reloaded bills after auto-detection', {
            count: allBills.length
          });
        }
      } catch (error) {
        console.error('Spendability: Error running auto-detection:', error);
        // Don't fail the whole page if auto-detection fails
      }

      // Add default recurrence if missing
      const billsWithRecurrence = allBills.map(bill => ({
        ...bill,
        recurrence: bill.recurrence || 'monthly'
      }));

      const processedBills = RecurringBillManager.processBills(billsWithRecurrence);
      
      // Get bills due before payday
      const billsDueBeforeNextPayday = RecurringBillManager.getBillsDueBefore(processedBills, new Date(nextPayday));
      
      // ALSO get overdue bills that haven't been paid yet
      const overdueBills = RecurringBillManager.getOverdueBills(processedBills);
      
      // Combine both arrays and remove duplicates
      const combinedBills = [...billsDueBeforeNextPayday, ...overdueBills];
      const unsortedBillsDueBeforePayday = RecurringBillManager.deduplicateBills(combinedBills);
      
      // Add status info to each bill and sort by priority (overdue bills first)
      const billsDueBeforePayday = unsortedBillsDueBeforePayday
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
      
      // Calculate total with detailed logging
      const totalBillsDue = (billsDueBeforePayday || []).reduce((sum, bill) => {
        const amount = Number(bill.amount ?? bill.cost) || 0;
        if (amount === 0 && bill.isSubscription) {
          console.warn(
            `Spendability: Subscription bill ${bill.name} has zero/invalid amount`,
            'amount:', bill.amount,
            'type:', typeof bill.amount,
            'cost:', bill.cost,
            'costType:', typeof bill.cost
          );
        }
        return sum + amount;
      }, 0);

      const preferences = settingsData.preferences || {};
      const weeklyEssentials = preferences.weeklyEssentials || 0;
      const safetyBuffer = preferences.safetyBuffer || 0;
      const weeksUntilPayday = Math.ceil(daysUntilPayday / 7);
      const essentialsNeeded = weeklyEssentials * weeksUntilPayday;

      const safeToSpend = totalAvailable - totalBillsDue - safetyBuffer - essentialsNeeded;

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

      const checkingTotal = checkingAccounts.reduce((sum, account) => {
        const projectedBalance = calculateProjectedBalance(
          account.account_id, 
          parseFloat(account.balance) || 0, 
          transactions
        );
        console.log(`  ${account.name}: projected=${projectedBalance.toFixed(2)}`);
        return sum + projectedBalance;
      }, 0);

      console.log(`Total Checking: ${checkingTotal.toFixed(2)}`);

      // Sum ALL savings accounts with projected balances (from depository accounts only)
      const savingsAccounts = depositoryAccounts.filter(a => 
        a.subtype === 'savings' || 
        a.name?.toLowerCase().includes('savings')
      );

      const savingsTotal = savingsAccounts.reduce((sum, account) => {
        const projectedBalance = calculateProjectedBalance(
          account.account_id, 
          parseFloat(account.balance) || 0, 
          transactions
        );
        return sum + projectedBalance;
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
      console.log('🏦 CHECKING ACCOUNTS DEBUG:', {
        checkingAccountsFound: checkingAccounts.map(a => ({
          name: a.name,
          subtype: a.subtype,
          liveBalance: a.balance,
          projectedBalance: calculateProjectedBalance(a.account_id, parseFloat(a.balance) || 0, transactions)
        })),
        checkingTotal: checkingTotal,
        savingsAccountsFound: savingsAccounts.map(a => ({
          name: a.name,
          subtype: a.subtype,
          liveBalance: a.balance,
          projectedBalance: calculateProjectedBalance(a.account_id, parseFloat(a.balance) || 0, transactions)
        })),
        savingsTotal: savingsTotal
      });

      setFinancialData({
        totalAvailable,  // Now uses PROJECTED balance
        checking: checkingTotal,  // Sum of all checking accounts
        savings: savingsTotal,    // Sum of all savings accounts
        billsBeforePayday: billsDueBeforePayday,
        totalBillsDue,
        safeToSpend,
        nextPayday,
        daysUntilPayday: finalDaysUntilPayday,
        weeklyEssentials: essentialsNeeded,
        safetyBuffer
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
    totalBillsDue: 0,
    safeToSpend: 0,
    nextPayday: 'Not set',
    daysUntilPayday: 0,
    weeklyEssentials: 0,
    safetyBuffer: 0
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
      setCanSpend(parseFloat(amount) <= financialData.safeToSpend);
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

  const handleMarkBillAsPaid = async (bill) => {
    // Check if bill has already been paid for current cycle
    if (RecurringBillManager.isBillPaidForCurrentCycle(bill)) {
      showNotification(`${bill.name} has already been paid for this billing cycle.`, 'warning');
      return;
    }

    if (!window.confirm(`Mark ${bill.name} bill ($${bill.amount ?? bill.cost}) as paid?`)) {
      return;
    }

    try {
      setPayingBill(bill.name);
      
      // Create transaction for the bill payment
      const transaction = {
        amount: -Math.abs(parseFloat(bill.amount ?? bill.cost)),
        description: `${bill.name} Payment`,
        category: 'Bills & Utilities',
        account: 'bofa', // Default to main account - could be made configurable
        date: formatDateForInput(getPacificTime()),
        timestamp: Date.now(),
        type: 'expense'
      };

      // Add transaction to Firebase
      const transactionsRef = collection(db, 'users', currentUser.uid, 'transactions');
      await addDoc(transactionsRef, transaction);

      // Update account balance
      await updateAccountBalance('bofa', transaction.amount);

      // Update bill status in Firebase and get updated bill data
      const updatedBill = await updateBillAsPaid(bill);

      // TODO: Known Issue - Bill doesn't visually disappear immediately after payment
      // Root cause: setRefreshTrigger() reloads all data but doesn't force immediate UI update
      // Will be fixed in comprehensive Spendability refactor
      // Workaround: User can reload page to see updated state
      // Trigger full refresh to update UI
      setRefreshTrigger(prev => prev + 1);

      // Show enhanced notification with next due date
      const nextDueDateStr = updatedBill && updatedBill.nextDueDate 
        ? formatDate(updatedBill.nextDueDate)
        : 'next billing cycle';
      
      showNotification(
        `${bill.name} bill marked as paid! Next due: ${nextDueDateStr}. Transaction added and balance updated.`, 
        'success'
      );
    } catch (error) {
      console.error('Error marking bill as paid:', error);
      showNotification('Error processing bill payment', 'error');
    } finally {
      setPayingBill(null);
    }
  };

  const updateAccountBalance = async (accountKey, amount) => {
    try {
      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      const bankAccounts = currentData.bankAccounts || {};
      const currentBalance = parseFloat(bankAccounts[accountKey]?.balance || 0);
      const newBalance = currentBalance + amount;
      
      const updatedAccounts = {
        ...bankAccounts,
        [accountKey]: {
          ...bankAccounts[accountKey],
          balance: newBalance.toString()
        }
      };
      
      await updateDoc(settingsDocRef, {
        ...currentData,
        bankAccounts: updatedAccounts
      });
    } catch (error) {
      console.error('Error updating account balance:', error);
      throw error;
    }
  };

  const updateBillAsPaid = async (bill) => {
    try {
      // Update bill in billInstances collection
      const billRef = doc(db, 'users', currentUser.uid, 'billInstances', bill.id);
      
      await updateDoc(billRef, {
        isPaid: true,
        status: 'paid',
        lastPaidDate: serverTimestamp(),
        updatedAt: serverTimestamp(),
        paymentHistory: arrayUnion({
          paidDate: new Date().toISOString(),
          amount: bill.amount,
          transactionId: null,
          paymentMethod: 'manual',
          source: 'manual'
        })
      });
      
      // Generate next month's bill if recurring or subscription
      if (bill.recurrence === 'monthly' || bill.isSubscription) {
        const currentDueDate = new Date(bill.dueDate);
        const nextDueDate = new Date(currentDueDate);
        nextDueDate.setMonth(nextDueDate.getMonth() + 1);
        
        const nextBillId = `bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const nextBillInstance = {
          id: nextBillId,
          name: bill.name,
          amount: bill.amount,
          dueDate: formatDateForInput(nextDueDate),
          originalDueDate: bill.originalDueDate || bill.dueDate,
          isPaid: false,
          status: 'pending',
          category: bill.category,
          recurrence: bill.recurrence,
          isSubscription: bill.isSubscription || false,
          subscriptionId: bill.subscriptionId,
          paymentHistory: [],
          linkedTransactionIds: [],
          merchantNames: bill.merchantNames || [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
        
        await setDoc(
          doc(db, 'users', currentUser.uid, 'billInstances', nextBillId),
          nextBillInstance
        );
        
        console.log(`✅ Generated next bill for ${bill.name} due ${formatDateForInput(nextDueDate)}`);
        
        return {
          ...bill,
          nextDueDate: formatDateForInput(nextDueDate)
        };
      }
      
      return bill;
    } catch (error) {
      console.error('Error updating bill status:', error);
      throw error;
    }
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
        <div className="tile payday-tile">
          <h3>Next Payday</h3>
          <div className="payday-date">
            {formatDate(financialData.nextPayday)}
          </div>
          <div className="payday-countdown">
            {financialData.daysUntilPayday > 0 
              ? `${financialData.daysUntilPayday} days`
              : 'Today!'
            }
            <button 
              onClick={forceRefreshPaydayCalculation}
              style={{
                marginLeft: '10px',
                padding: '2px 6px',
                fontSize: '12px',
                backgroundColor: '#333',
                color: '#00ff88',
                border: '1px solid #555',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
              title="Refresh payday calculation"
            >
              🔄
            </button>
          </div>
        </div>

        {/* Tile 2: Safe to Spend */}
        <div className="tile safe-spend-tile">
          <h3>Safe to Spend</h3>
          <div className={`safe-amount ${financialData.safeToSpend < 0 ? 'negative' : 'positive'}`}>
            {formatCurrency(financialData.safeToSpend)}
          </div>
          <small>Available until {formatDate(financialData.nextPayday)}</small>
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

        {/* Tile 5: Bills Due Before Payday */}
        <div className="tile bills-tile">
          <h3>Bills Due Before Payday</h3>
          <div className="bills-list">
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
                  <div className="bill-actions">
                    <button 
                      className="mark-paid-btn"
                      onClick={() => handleMarkBillAsPaid(bill)}
                      disabled={payingBill === bill.name || RecurringBillManager.isBillPaidForCurrentCycle(bill)}
                    >
                      {payingBill === bill.name 
                        ? 'Processing...' 
                        : RecurringBillManager.isBillPaidForCurrentCycle(bill) 
                        ? 'Already Paid' 
                        : 'Mark as Paid'
                      }
                    </button>
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
          </div>
        </div>

        {/* Tile 6: Calculation Breakdown */}
        <div className="tile calculation-tile">
          <h3>Calculation Breakdown</h3>
          <div className="calculation-list">
            <div className="calc-item">
              <span>- Total Available:</span>
              <span>{formatCurrency(financialData.totalAvailable)}</span>
            </div>
            <div className="calc-item">
              <span>- Upcoming Bills:</span>
              <span>-{formatCurrency(financialData.totalBillsDue)}</span>
            </div>
            <div className="calc-item">
              <span>- Weekly Essentials:</span>
              <span>-{formatCurrency(financialData.weeklyEssentials)}</span>
            </div>
            <div className="calc-item">
              <span>- Safety Buffer:</span>
              <span>-{formatCurrency(financialData.safetyBuffer)}</span>
            </div>
            <div className="calc-total">
              <span><strong>Safe to Spend:</strong></span>
              <span><strong>{formatCurrency(financialData.safeToSpend)}</strong></span>
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

export default Spendability;
 
