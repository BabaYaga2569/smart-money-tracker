import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { PayCycleCalculator } from '../utils/PayCycleCalculator';
import { RecurringBillManager } from '../utils/RecurringBillManager';
import './Spendability.css';

const Spendability = () => {
  const [settingsData, setSettingsData] = useState(null);
  const [payCycleData, setPayCycleData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const userId = "steve-colburn";

        // Fetch settings data (same path Settings component uses)
        const settingsRef = doc(db, 'users', userId, 'settings', 'personal');
        const settingsSnap = await getDoc(settingsRef);
        
        // Fetch calculated pay cycle data
        const payCycleRef = doc(db, 'users', userId, 'financial', 'payCycle');
        const payCycleSnap = await getDoc(payCycleRef);
        
        if (!settingsSnap.exists()) {
          throw new Error('No settings found. Please configure your finances in Settings first.');
        }

        const settings = settingsSnap.data();
        setSettingsData(settings);
        
        // If no saved pay cycle data, calculate it fresh
        let payCycle = null;
        if (payCycleSnap.exists()) {
          payCycle = payCycleSnap.data();
        } else if (settings.paySchedules) {
          // Calculate fresh using same logic as Settings
          payCycle = PayCycleCalculator.calculateNextPayday(
            settings.paySchedules.yours,
            settings.paySchedules.spouse
          );
        }
        
        setPayCycleData(payCycle);
        
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

  const calculateUnifiedSpendability = () => {
    if (!settingsData || !payCycleData) {
      return {
        totalAvailable: 0,
        billsDue: 0,
        safeToSpend: 0,
        nextPayday: 'Not calculated',
        billsBeforePayday: [],
        allBillsWithDates: [],
        paydaySource: 'Unknown'
      };
    }

    try {
      // Use the calculated payday from Settings (same source of truth)
      const nextPaydayDate = new Date(payCycleData.date);

      // Get bills from Settings with enhanced recurrence info
      const bills = (settingsData.bills || []).map((bill, index) => ({
        id: `bill-${index}`,
        name: bill.name,
        amount: parseFloat(bill.amount) || 0,
        dueDate: bill.dueDate,
        recurrence: bill.recurring ? 'monthly' : 'one-time',
        recurring: bill.recurring
      }));

      // Apply RecurringBillManager to calculate dynamic due dates
      const billsWithCalculatedDates = RecurringBillManager.processBills(bills);

      // Filter bills due BEFORE next payday (enhanced logic)
      const billsBeforePayday = RecurringBillManager.getBillsDueBefore(billsWithCalculatedDates, nextPaydayDate);

      // Calculate total bills amount
      const totalBillAmount = billsBeforePayday.reduce((sum, bill) => {
        return sum + (bill.amount || 0);
      }, 0);

      // Calculate total available from bank accounts (same as Settings)
      const bankAccounts = settingsData.bankAccounts || {};
      const totalAvailable = Object.values(bankAccounts).reduce((sum, account) => 
        sum + (parseFloat(account.balance) || 0), 0
      );

      // Calculate safe spending amount
      const safeToSpend = totalAvailable - totalBillAmount;

      return {
        totalAvailable: totalAvailable.toFixed(2),
        billsDue: totalBillAmount.toFixed(2),
        safeToSpend: safeToSpend.toFixed(2),
        nextPayday: formatDateForDisplay(payCycleData.date),
        billsBeforePayday: billsBeforePayday,
        allBillsWithDates: billsWithCalculatedDates.sort((a, b) => 
          new Date(a.nextDueDate) - new Date(b.nextDueDate)
        ),
        paydaySource: payCycleData.source || 'Unknown',
        daysUntilPay: payCycleData.daysUntil || 0,
        paydayAmount: payCycleData.amount || 0
      };
      
    } catch (error) {
      console.error('Unified calculation error:', error);
      return {
        totalAvailable: 0,
        billsDue: 0,
        safeToSpend: 0,
        nextPayday: 'Error calculating',
        billsBeforePayday: [],
        allBillsWithDates: [],
        paydaySource: 'Error'
      };
    }
  };

  if (loading) return <div className="loading">Loading your financial data...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  const calculation = calculateUnifiedSpendability();

  return (
    <div className="spendability-container">
      <div className="page-header">
        <h2>💰 Smart Spendability Calculator</h2>
        <p>See exactly how much you can safely spend with dynamic bill tracking</p>
      </div>

      {/* Enhanced Summary Cards */}
      <div className="summary-grid">
        <div className="summary-card total-available">
          <h3>Total Available</h3>
          <div className="amount">${calculation.totalAvailable}</div>
          <small>Combined account balances</small>
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
          <small>
            {calculation.paydaySource === 'yours' ? 'Your paycheck' : 'Wife\'s paycheck'} 
            ({calculation.daysUntilPay} days)
          </small>
        </div>
      </div>

      {/* Enhanced Payday Information */}
      <div className="payday-info-section">
        <h3>📅 Payday Intelligence</h3>
        <div className="payday-details">
          <div className="payday-item">
            <strong>Next Income:</strong> ${calculation.paydayAmount?.toLocaleString()} in {calculation.daysUntilPay} days
          </div>
          <div className="payday-item">
            <strong>Source:</strong> {calculation.paydaySource === 'yours' ? 'Your bi-weekly paycheck' : 'Wife\'s 15th/30th paycheck'}
          </div>
          <div className="payday-item">
            <strong>Logic:</strong> System automatically chose the earliest upcoming payday
          </div>
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
                    {bill.recurrence && bill.recurrence !== 'one-time' && (
                      <span className="recurrence-badge">({bill.recurrence})</span>
                    )}
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
                    {bill.recurrence && bill.recurrence !== 'one-time' && (
                      <span className="recurrence-badge">({bill.recurrence})</span>
                    )}
                  </small>
                </div>
                <span className="bill-amount">${bill.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Current Account Balances */}
      {settingsData.bankAccounts && (
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

      {/* Smart Financial Tips */}
      <div className="tips-section">
        <h3>💡 Smart Financial Insights</h3>
        <div className="tips-grid">
          {parseFloat(calculation.safeToSpend) < 0 ? (
            <div className="tip negative">
              <strong>⚠️ Cashflow Warning</strong>
              <p>You have ${Math.abs(parseFloat(calculation.safeToSpend)).toFixed(2)} more in bills than available funds before your next payday.</p>
              <ul>
                <li>Consider moving some bills to after payday if possible</li>
                <li>Check if any bills can be paid from the upcoming paycheck instead</li>
                <li>Review if any bills might auto-advance to next month</li>
              </ul>
            </div>
          ) : parseFloat(calculation.safeToSpend) < 100 ? (
            <div className="tip warning">
              <strong>💛 Tight Budget</strong>
              <p>You can safely spend ${calculation.safeToSpend} before your next payday, but you're cutting it close.</p>
              <p>Consider keeping emergency expenses minimal until payday.</p>
            </div>
          ) : (
            <div className="tip positive">
              <strong>✅ Healthy Financial Position</strong>
              <p>You can safely spend ${calculation.safeToSpend} before your next payday while covering all due bills.</p>
              <p>Your dynamic bill tracking ensures this calculation stays accurate as due dates advance.</p>
            </div>
          )}
          
          <div className="tip general">
            <strong>📊 Dynamic Bill Intelligence</strong>
            <p>Your bills automatically update their due dates. Monthly bills advance from Sept 30th → Oct 30th → Nov 30th without manual updates.</p>
            <p>The system excludes bills due ON payday since your income arrives the same day.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Spendability;