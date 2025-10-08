import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, collection, addDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { PayCycleCalculator } from '../utils/PayCycleCalculator';
import { RecurringBillManager } from '../utils/RecurringBillManager';
import { formatDateForDisplay, formatDateForInput, getDaysUntilDateInPacific, getPacificTime, getManualPacificDaysUntilPayday } from '../utils/DateUtils';
import { calculateProjectedBalance, calculateTotalProjectedBalance } from '../utils/BalanceCalculator';
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

  const plaidAccounts = settingsData.plaidAccounts || [];

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
      const totalAvailable = calculateTotalProjectedBalance(plaidAccounts, transactions);

      console.log('Spendability: Balance calculation', {
        liveBalance: plaidAccounts.reduce((sum, a) => sum + parseFloat(a.balance || 0), 0),
        projectedBalance: totalAvailable,
        difference: totalAvailable - plaidAccounts.reduce((sum, a) => sum + parseFloat(a.balance || 0), 0)
      });

      // 🔍 COMPREHENSIVE DEBUG LOGGING
      console.log('🔍 SPENDABILITY DEBUG:', {
        timestamp: new Date().toISOString(),
        plaidAccountsCount: plaidAccounts.length,
        plaidAccounts: plaidAccounts.map(a => ({
          name: a.name,
          subtype: a.subtype,
          type: a.type,
          account_id: a.account_id,
          liveBalance: a.balance,
          projectedBalance: calculateProjectedBalance(a.account_id, parseFloat(a.balance) || 0, transactions)
        })),
        transactionsCount: transactions.length,
        pendingTransactionsCount: transactions.filter(t => t.pending).length,
        totalLiveBalance: plaidAccounts.reduce((sum, a) => sum + parseFloat(a.balance || 0), 0),
        totalProjectedBalance: totalAvailable
      }); 
     // Get pay cycle data
let nextPayday, daysUntilPayday;

if (settingsData.nextPaydayOverride) {
  nextPayday = settingsData.nextPaydayOverride;
  daysUntilPayday = getDaysUntilDateInPacific(nextPayday);
} else if (payCycleData && payCycleData.date) {
  nextPayday = payCycleData.date;
  daysUntilPayday = payCycleData.daysUntil || getDaysUntilDateInPacific(nextPayday);
} else {
  console.log('Spendability: Calculating payday from schedules', {
    yoursAmount: settingsData.paySchedules?.yours?.amount,
    spouseAmount: settingsData.paySchedules?.spouse?.amount,
    lastPaydate: settingsData.paySchedules?.yours?.lastPaydate
  });
  
  const result = PayCycleCalculator.calculateNextPayday(
    { 
      lastPaydate: settingsData.paySchedules?.yours?.lastPaydate, 
      amount: settingsData.paySchedules?.yours?.amount || 0 
    },
    { 
      type: settingsData.paySchedules?.spouse?.type,
      amount: settingsData.paySchedules?.spouse?.amount || 0 
    }
  );
  
  console.log('Spendability: Payday calculation result', result);
  nextPayday = result.date;
  daysUntilPayday = result.daysUntil;

  // 📅 PAYDAY CALCULATION DEBUG
  console.log('📅 PAYDAY CALCULATION DEBUG:', {
    yourSchedule: {
      lastPaydate: settingsData.paySchedules?.yours?.lastPaydate,
      amount: settingsData.paySchedules?.yours?.amount
    },
    spouseSchedule: {
      type: settingsData.paySchedules?.spouse?.type,
      amount: settingsData.paySchedules?.spouse?.amount
    },
    nextPayday: nextPayday,
    daysUntilPayday: daysUntilPayday,
    source: result.source || 'Check what PayCycleCalculator returned'
  });
}      
 
      const bills = settingsData.bills || [];
      const billsWithRecurrence = bills.map(bill => ({
        ...bill,
        recurrence: bill.recurrence || 'monthly'
      }));

      const processedBills = RecurringBillManager.processBills(billsWithRecurrence);
      const billsDueBeforePayday = RecurringBillManager.getBillsDueBefore(processedBills, new Date(nextPayday));
      
      const totalBillsDue = billsDueBeforePayday.reduce((sum, bill) => {
        return sum + (parseFloat(bill.amount) || 0);
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
        willDisplayAs: finalDaysUntilPayday > 0 ? `${finalDaysUntilPayday} days` : 'Today!'
      });

      // Sum ALL checking accounts with projected balances
      const checkingAccounts = plaidAccounts.filter(a => {
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

      // Sum ALL savings accounts with projected balances
      const savingsAccounts = plaidAccounts.filter(a => 
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

    if (!window.confirm(`Mark ${bill.name} bill ($${bill.amount}) as paid?`)) {
      return;
    }

    try {
      setPayingBill(bill.name);
      
      // Create transaction for the bill payment
      const transaction = {
        amount: -Math.abs(parseFloat(bill.amount)),
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

      // Refresh the financial data
      await fetchFinancialData();

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
      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal'); 
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      const bills = currentData.bills || [];
      let updatedBill = null;
      
      const updatedBills = bills.map(b => {
        if (b.name === bill.name && b.amount === bill.amount) {
          // Mark as paid and update last payment date using Pacific Time  
          updatedBill = RecurringBillManager.markBillAsPaid(b, getPacificTime());
          return updatedBill;
        }
        return b;
      });
      
      await updateDoc(settingsDocRef, {
        ...currentData,
        bills: updatedBills
      });
      
      return updatedBill;
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
        
        {/* Tile 1: Can I Spend This Amount? */}
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

        {/* Tile 4: Bills Due Before Payday */}
        <div className="tile bills-tile">
          <h3>Bills Due Before Payday</h3>
          <div className="bills-list">
            {financialData.billsBeforePayday.length > 0 ? (
              financialData.billsBeforePayday.map((bill, index) => (
                <div key={index} className="bill-item">
                  <div className="bill-info">
                    <span className="bill-name">{bill.name}</span>
                    <span className="bill-due-date">Due: {formatDate(bill.nextDueDate)}</span>
                    <span className="bill-amount">{formatCurrency(bill.amount)}</span>
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

        {/* Tile 5: Calculation Breakdown */}
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

        {/* Tile 6: Next Payday */}
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
