import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { PayCycleCalculator } from '../utils/PayCycleCalculator';
import { RecurringBillManager } from '../utils/RecurringBillManager';
import './Spendability.css';

const Spendability = () => {
  const [settingsData, setSettingsData] = useState(null);
  const [bills, setBills] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch settings from users/steve-colburn/settings/personal
        const settingsRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
        const settingsSnap = await getDoc(settingsRef);
        
        // Fetch bills from root bills collection
        const billsCollectionRef = collection(db, 'bills');
        const billsSnapshot = await getDocs(billsCollectionRef);
        
        // Fetch accounts from root accounts collection  
        const accountsCollectionRef = collection(db, 'accounts');
        const accountsSnapshot = await getDocs(accountsCollectionRef);

        // Process settings data
        let settings = null;
        if (settingsSnap.exists()) {
          settings = settingsSnap.data();
        }
        setSettingsData(settings);

        // Process bills data
        const billsArray = [];
        billsSnapshot.forEach((doc) => {
          const billData = doc.data();
          billsArray.push({
            id: doc.id,
            name: billData.name,
            amount: parseFloat(billData.amount) || 0,
            dueDate: billData.dueDate,
            frequency: billData.frequency || 'Monthly',
            recurrence: billData.frequency === 'Monthly' ? 'monthly' : 'one-time'
          });
        });
        setBills(billsArray);

        // Process accounts data
        const accountsArray = [];
        accountsSnapshot.forEach((doc) => {
          const accountData = doc.data();
          accountsArray.push({
            id: doc.id,
            name: accountData.name || 'Unknown Account',
            balance: parseFloat(accountData.balance) || 0
          });
        });
        setAccounts(accountsArray);
        
      } catch (err) {
        console.error('Error fetching data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Helper function to format dates consistently
  const formatDateForDisplay = (dateString) => {
    if (!dateString) return 'No date';
    
    try {
      let date;
      if (dateString instanceof Date) {
        date = dateString;
      } else {
        const [year, month, day] = dateString.toString().split('-');
        date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      }
      
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    } catch (error) {
      console.error('Date formatting error:', error);
      return 'Invalid date';
    }
  };

  const calculateSpendability = () => {
    if (!bills.length && !accounts.length) {
      return {
        totalAvailable: 0,
        billsDue: 0,
        safeToSpend: 0,
        nextPayday: 'No data',
        billsBeforePayday: [],
        allBillsWithDates: []
      };
    }

    try {
      // Calculate next payday (simplified logic for now)
      let nextPayday;
      if (settingsData && settingsData.paySchedules) {
        const payCycleInfo = PayCycleCalculator.calculateNextPayday(
          settingsData.paySchedules.yours,
          settingsData.paySchedules.spouse
        );
        nextPayday = new Date(payCycleInfo.date);
      } else {
        // Fallback: assume next payday is wife's 30th (Sept 30th)
        const today = new Date();
        nextPayday = new Date(today.getFullYear(), today.getMonth(), 30);
        if (nextPayday <= today) {
          nextPayday.setMonth(nextPayday.getMonth() + 1);
        }
      }

      // Apply RecurringBillManager to calculate dynamic due dates
      const billsWithCalculatedDates = RecurringBillManager.processBills(bills);

      // Filter bills due BEFORE next payday
      const billsBeforePayday = RecurringBillManager.getBillsDueBefore(billsWithCalculatedDates, nextPayday);

      // Calculate total bills amount
      const totalBillAmount = billsBeforePayday.reduce((sum, bill) => {
        return sum + (bill.amount || 0);
      }, 0);

      // Calculate total available from accounts
      const totalAvailable = accounts.reduce((sum, account) => 
        sum + (account.balance || 0), 0
      );

      // If no accounts, try to get total from settings
      let finalTotalAvailable = totalAvailable;
      if (totalAvailable === 0 && settingsData && settingsData.bankAccounts) {
        finalTotalAvailable = Object.values(settingsData.bankAccounts).reduce((sum, account) => 
          sum + (parseFloat(account.balance) || 0), 0
        );
      }

      // Calculate safe spending amount
      const safeToSpend = finalTotalAvailable - totalBillAmount;

      return {
        totalAvailable: finalTotalAvailable.toFixed(2),
        billsDue: totalBillAmount.toFixed(2),
        safeToSpend: safeToSpend.toFixed(2),
        nextPayday: formatDateForDisplay(nextPayday),
        billsBeforePayday: billsBeforePayday,
        allBillsWithDates: billsWithCalculatedDates.sort((a, b) => 
          new Date(a.nextDueDate) - new Date(b.nextDueDate)
        )
      };
      
    } catch (error) {
      console.error('Calculation error:', error);
      return {
        totalAvailable: 0,
        billsDue: 0,
        safeToSpend: 0,
        nextPayday: 'Error calculating',
        billsBeforePayday: [],
        allBillsWithDates: []
      };
    }
  };

  if (loading) return <div className="loading">Loading your financial data...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  const calculation = calculateSpendability();

  return (
    <div className="spendability-container">
      <div className="page-header">
        <h2>💰 Smart Spendability Calculator</h2>
        <p>Reading from your actual Firebase data structure</p>
      </div>

      {/* Summary Cards */}
      <div className="summary-grid">
        <div className="summary-card total-available">
          <h3>Total Available</h3>
          <div className="amount">${calculation.totalAvailable}</div>
          <small>From {accounts.length} accounts + settings data</small>
        </div>

        <div className="summary-card bills-due">
          <h3>Bills Due Before Payday</h3>
          <div className="amount">${calculation.billsDue}</div>
          <small>Must be paid before {calculation.nextPayday}</small>
        </div>

        <div className={`summary-card safe-to-spend ${parseFloat(calculation.safeToSpend) < 0 ? 'negative' : ''}`}>
          <h3>Safe to Spend</h3>
          <div className="amount">${calculation.safeToSpend}</div>
          <small>After covering upcoming bills</small>
        </div>

        <div className="summary-card next-payday">
          <h3>Next Payday</h3>
          <div className="amount">{calculation.nextPayday}</div>
          <small>Calculated payday</small>
        </div>
      </div>

      {/* Data Sources Debug Info */}
      <div className="debug-info" style={{ background: '#1a1a1b', padding: '1rem', borderRadius: '8px', margin: '1rem 0' }}>
        <h4>📊 Data Sources</h4>
        <p>Bills found: {bills.length} from root bills collection</p>
        <p>Accounts found: {accounts.length} from root accounts collection</p>
        <p>Settings found: {settingsData ? 'Yes' : 'No'} from users/steve-colburn/settings/personal</p>
      </div>

      {/* Bills Due Before Payday */}
      {calculation.billsBeforePayday.length > 0 && (
        <div className="bills-section">
          <h3>📋 Bills Due Before Next Payday ({calculation.nextPayday})</h3>
          <div className="bills-list">
            {calculation.billsBeforePayday.map((bill) => (
              <div key={bill.id} className="bill-item">
                <div className="bill-info">
                  <span className="bill-name">{bill.name}</span>
                  <small className="due-date">
                    Next Due: {formatDateForDisplay(bill.nextDueDate)}
                    <span className="recurrence-badge">({bill.frequency || bill.recurrence})</span>
                  </small>
                </div>
                <span className="bill-amount">${bill.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Bills With Dynamic Dates */}
      {calculation.allBillsWithDates.length > 0 && (
        <div className="bills-section">
          <h3>📅 All Bills (Dynamic Due Dates)</h3>
          <div className="bills-list">
            {calculation.allBillsWithDates.map((bill) => (
              <div key={bill.id} className="bill-item">
                <div className="bill-info">
                  <span className="bill-name">{bill.name}</span>
                  <small className="due-date">
                    Next Due: {formatDateForDisplay(bill.nextDueDate)}
                    {bill.originalDueDate !== bill.nextDueDate && (
                      <span className="date-change">
                        (was {formatDateForDisplay(bill.originalDueDate)})
                      </span>
                    )}
                    <span className="recurrence-badge">({bill.frequency || bill.recurrence})</span>
                  </small>
                </div>
                <span className="bill-amount">${bill.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Account Balances */}
      {accounts.length > 0 && (
        <div className="accounts-section">
          <h3>🏦 Account Balances (from accounts collection)</h3>
          <div className="accounts-grid">
            {accounts.map((account) => (
              <div key={account.id} className="account-item">
                <span>{account.name}</span>
                <span className="account-balance">${account.balance.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settings Bank Accounts (if accounts collection is empty) */}
      {accounts.length === 0 && settingsData && settingsData.bankAccounts && (
        <div className="accounts-section">
          <h3>🏦 Bank Accounts (from settings)</h3>
          <div className="accounts-grid">
            {Object.entries(settingsData.bankAccounts).map(([key, account]) => (
              <div key={key} className="account-item">
                <span>{account.name}</span>
                <span className="account-type">({account.type})</span>
                <span className="account-balance">${parseFloat(account.balance || 0).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Spendability;