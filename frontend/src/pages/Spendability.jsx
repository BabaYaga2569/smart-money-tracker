import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { PayCycleCalculator } from '../utils/PayCycleCalculator';
import { RecurringBillManager } from '../utils/RecurringBillManager';
import './Spendability.css';

const Spendability = () => {
  const [settingsData, setSettingsData] = useState(null);
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch settings from the same path Settings component uses
        const settingsRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
        const settingsSnap = await getDoc(settingsRef);
        
        // Fetch bills from root bills collection
        const billsCollectionRef = collection(db, 'bills');
        const billsSnapshot = await getDocs(billsCollectionRef);

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
            recurring: true, // Most bills are recurring monthly
            recurrence: 'monthly'
          });
        });
        setBills(billsArray);
        
      } catch (err) {
        console.error('Error fetching data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

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
    if (!settingsData || !bills.length) {
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
      // Use SAME payday calculation logic as Settings (the working version)
      let nextPayday;
      let paydaySource = 'calculated';
      
      if (settingsData.paySchedules) {
        const payCycleInfo = PayCycleCalculator.calculateNextPayday(
          settingsData.paySchedules.yours,
          settingsData.paySchedules.spouse
        );
        nextPayday = new Date(payCycleInfo.date);
        paydaySource = payCycleInfo.source;
      } else {
        // Fallback to wife's 30th (same as your Settings shows)
        const today = new Date();
        nextPayday = new Date(today.getFullYear(), today.getMonth(), 30);
        if (nextPayday <= today) {
          nextPayday.setMonth(nextPayday.getMonth() + 1);
        }
      }

      // Apply RecurringBillManager to calculate dynamic dates
      const billsWithCalculatedDates = RecurringBillManager.processBills(bills);

      // Use SAME bill filtering logic as working Settings component
      // Bills due BEFORE next payday (not including payday itself)
      const billsBeforePayday = billsWithCalculatedDates.filter(bill => {
        const dueDate = new Date(bill.nextDueDate);
        return dueDate < nextPayday;
      });

      // Calculate total bills (SAME as Settings calculation)
      const totalBillAmount = billsBeforePayday.reduce((sum, bill) => {
        return sum + (bill.amount || 0);
      }, 0);

      // Use SAME account balance logic as Settings
      const totalAvailable = Object.values(settingsData.bankAccounts || {}).reduce((sum, account) => 
        sum + (parseFloat(account.balance) || 0), 0
      );

      // Calculate safe spending (SAME as Settings)
      const safeToSpend = totalAvailable - totalBillAmount;

      return {
        totalAvailable: totalAvailable.toFixed(2),
        billsDue: totalBillAmount.toFixed(2),
        safeToSpend: safeToSpend.toFixed(2),
        nextPayday: formatDateForDisplay(nextPayday),
        billsBeforePayday: billsBeforePayday,
        allBillsWithDates: billsWithCalculatedDates.sort((a, b) => 
          new Date(a.nextDueDate) - new Date(b.nextDueDate)
        ),
        paydaySource: paydaySource
      };
      
    } catch (error) {
      console.error('Calculation error:', error);
      return {
        totalAvailable: 0,
        billsDue: 0,
        safeToSpend: 0,
        nextPayday: 'Error',
        billsBeforePayday: [],
        allBillsWithDates: []
      };
    }
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  const calculation = calculateSpendability();

  return (
    <div className="spendability-container">
      <div className="page-header">
  <h2>💰 Spendability Calculator</h2>
  <p>See how much you can safely spend before your next payday</p>
</div>

<div style={{background: 'red', padding: '10px', color: 'white'}}>
  DEBUG: Version {new Date().toISOString()} - If you see this, the component updated
</div>

      {/* Summary Cards - SAME as Settings layout */}
      <div className="summary-grid">
        <div className="summary-card total-available">
          <h3>Total Available</h3>
          <div className="amount">${calculation.totalAvailable}</div>
          <small>Current account balances</small>
        </div>

        <div className="summary-card bills-due">
          <h3>Bills Due Before Payday</h3>
          <div className="amount">${calculation.billsDue}</div>
          <small>Must be paid before {calculation.nextPayday}</small>
        </div>

        <div className={`summary-card safe-to-spend ${parseFloat(calculation.safeToSpend) < 0 ? 'negative' : ''}`}>
          <h3>Safe to Spend</h3>
          <div className="amount">${calculation.safeToSpend}</div>
          <small>After covering bills due before payday</small>
        </div>

        <div className="summary-card next-payday">
          <h3>Next Payday</h3>
          <div className="amount">{calculation.nextPayday}</div>
          <small>
            {calculation.paydaySource === 'yours' ? 'Your paycheck' : 
             calculation.paydaySource === 'spouse' ? 'Wife\'s paycheck' : 'Next payday'}
          </small>
        </div>
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
                    <span className="recurrence-badge">(monthly)</span>
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
          <h3>📅 All Bills (Next Due Dates)</h3>
          <div className="bills-list">
            {calculation.allBillsWithDates.map((bill) => (
              <div key={bill.id} className="bill-item">
                <div className="bill-info">
                  <span className="bill-name">{bill.name}</span>
                  <small className="due-date">
                    Next Due: {formatDateForDisplay(bill.nextDueDate)}
                    <span className="recurrence-badge">(monthly)</span>
                  </small>
                </div>
                <span className="bill-amount">${bill.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Account Balances */}
      {settingsData && settingsData.bankAccounts && (
        <div className="accounts-section">
          <h3>🏦 Current Account Balances</h3>
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

      {/* Financial Tips */}
      <div className="tips-section">
        <h3>💡 Financial Tips</h3>
        <div className="tips-grid">
          {parseFloat(calculation.safeToSpend) < 0 ? (
            <div className="tip negative">
              <strong>⚠️ Negative Balance Warning</strong>
              <p>You have more bills due before payday than available funds. Consider moving some bills to after payday if possible.</p>
            </div>
          ) : (
            <div className="tip positive">
              <strong>✅ Good Financial Position</strong>
              <p>You can safely spend ${calculation.safeToSpend} before your next payday while covering all bills due.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Spendability;