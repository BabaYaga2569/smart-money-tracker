import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { PayCycleCalculator } from '../utils/PayCycleCalculator';
import { RecurringBillManager } from '../utils/RecurringBillManager';
import { formatDateForDisplay, formatDateForInput } from '../utils/DateUtils';
import './Spendability.css';

const Spendability = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [spendAmount, setSpendAmount] = useState('');
  const [canSpend, setCanSpend] = useState(null);
  const [notification, setNotification] = useState({ message: '', type: '' });
  const [payingBill, setPayingBill] = useState(null);
  
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
  }, []);

  const fetchFinancialData = async () => {
    try {
      setLoading(true);
      setError(null);

      const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
      const settingsDocSnap = await getDoc(settingsDocRef);
      
      const payCycleDocRef = doc(db, 'users', 'steve-colburn', 'financial', 'payCycle');
      const payCycleDocSnap = await getDoc(payCycleDocRef);

      if (!settingsDocSnap.exists()) {
        throw new Error('No financial data found. Please set up your Settings first.');
      }

      const settingsData = settingsDocSnap.data();
      const payCycleData = payCycleDocSnap.exists() ? payCycleDocSnap.data() : null;

      const bankAccounts = settingsData.bankAccounts || {};
      const totalAvailable = Object.values(bankAccounts).reduce((sum, account) => {
        return sum + (parseFloat(account.balance) || 0);
      }, 0);

      let nextPayday = '2025-09-30';
      let daysUntilPayday = 0;
      
      // Check for manual override first
      if (settingsData.nextPaydayOverride) {
        nextPayday = settingsData.nextPaydayOverride;
        const today = new Date();
        const paydayDate = new Date(nextPayday);
        daysUntilPayday = Math.ceil((paydayDate - today) / (1000 * 60 * 60 * 24));
      } else if (payCycleData && payCycleData.date) {
        nextPayday = payCycleData.date;
        const today = new Date();
        const paydayDate = new Date(nextPayday);
        daysUntilPayday = Math.ceil((paydayDate - today) / (1000 * 60 * 60 * 24));
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

      setFinancialData({
        totalAvailable,
        checking: parseFloat(bankAccounts.bofa?.balance) || 0,
        savings: parseFloat(bankAccounts.sofi?.balance) || 0,
        billsBeforePayday: billsDueBeforePayday,
        totalBillsDue,
        safeToSpend,
        nextPayday,
        daysUntilPayday: Math.max(0, daysUntilPayday),
        weeklyEssentials: essentialsNeeded,
        safetyBuffer
      });

    } catch (err) {
      console.error('Error fetching data:', err);
      
      // Use demo data for testing when Firebase is unavailable
      const demoData = {
        totalAvailable: 1530.07,
        checking: 1230.07,
        savings: 300.00,
        billsBeforePayday: [
          {
            name: 'NV Energy',
            amount: 254.00,
            nextDueDate: '2025-01-30',
            recurrence: 'monthly'
          },
          {
            name: 'Southwest Gas',
            amount: 36.62,
            nextDueDate: '2025-01-28',
            recurrence: 'monthly'
          }
        ],
        totalBillsDue: 290.62,
        safeToSpend: 1047.50,
        nextPayday: '2025-02-01',
        daysUntilPayday: 5,
        weeklyEssentials: 150.00,
        safetyBuffer: 42.00
      };
      
      setFinancialData(demoData);
      setError(null); // Clear error to show demo data
    } finally {
      setLoading(false);
    }
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
        date: formatDateForInput(new Date()),
        timestamp: Date.now(),
        type: 'expense'
      };

      // Add transaction to Firebase
      const transactionsRef = collection(db, 'users', 'steve-colburn', 'transactions');
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
      const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
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
      const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal'); 
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      const bills = currentData.bills || [];
      let updatedBill = null;
      
      const updatedBills = bills.map(b => {
        if (b.name === bill.name && b.amount === bill.amount) {
          // Mark as paid and update last payment date
          updatedBill = RecurringBillManager.markBillAsPaid(b, new Date());
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
                      disabled={payingBill === bill.name}
                    >
                      {payingBill === bill.name ? 'Processing...' : 'Mark as Paid'}
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