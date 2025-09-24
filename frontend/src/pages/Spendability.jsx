import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { PayCycleCalculator } from '../utils/PayCycleCalculator';
import { RecurringBillManager } from '../utils/RecurringBillManager';
import './Spendability.css';

const Spendability = () => {
  const [financialData, setFinancialData] = useState(null);
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
  try {
    setLoading(true);
    setError(null);

    // Fetch financial data from Firestore
    const financialDocRef = doc(db, 'financialData', 'main');
    const financialDocSnap = await getDoc(financialDocRef);
    
    if (!financialDocSnap.exists()) {
      throw new Error('No financial data found. Please set up your finances in Settings first.');
    }

    const data = financialDocSnap.data();
    setFinancialData(data);

    // Fetch bills from Firestore
    const billsCollectionRef = collection(db, 'bills');
    const billsQuerySnapshot = await getDocs(billsCollectionRef);
    
    if (!billsQuerySnapshot.empty) {
      const billsArray = [];
      billsQuerySnapshot.forEach((doc) => {
        billsArray.push({
          id: doc.id,
          ...doc.data(),
          // Set default recurrence if not specified
          recurrence: doc.data().recurrence || 'monthly'
        });
      });
      setBills(billsArray);
    } else {
      setBills([]);
    }
  } catch (err) {
    console.error('Error fetching data:', err);
    setError(err.message);
  } finally {
    setLoading(false);
  }
};

    fetchData();
  }, []);

  // Helper function to format dates for display without timezone issues
  const formatDateForDisplay = (dateString) => {
    if (!dateString) return 'No date';
    
    try {
      // Handle both Date objects and date strings
      let date;
      if (dateString instanceof Date) {
        date = dateString;
      } else {
        // Parse date string as local date to avoid timezone shifts
        const [year, month, day] = dateString.split('-');
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
    if (!financialData || !bills) {
      return {
        totalAvailable: 0,
        billsDue: 0,
        safeToSpend: 0,
        nextPayday: 'Not set',
        billsBeforePayday: [],
        processedBills: []
      };
    }

    try {
      // Calculate next payday using PayCycleCalculator
      const nextPayday = PayCycleCalculator.getNextPayday(
        financialData.lastPayDate,
        financialData.wifePayAmount || 0
      );

      // Process bills with RecurringBillManager to get calculated due dates
      const processedBills = RecurringBillManager.processBills(bills);

      // Filter bills that are due BEFORE the next payday (excluding bills due ON payday)
      const billsBeforePayday = RecurringBillManager.getBillsDueBefore(processedBills, nextPayday);

      // Calculate total amount
      const totalBillAmount = billsBeforePayday.reduce((sum, bill) => {
        return sum + parseFloat(bill.amount || 0);
      }, 0);

      // Calculate total available funds
      const totalAvailable = 
        parseFloat(financialData.bankOfAmericaChecking || 0) +
        parseFloat(financialData.bankOfAmericaSavings || 0) +
        parseFloat(financialData.sofiChecking || 0) +
        parseFloat(financialData.sofiSavings || 0);

      // Calculate safe to spend amount
      const safeToSpend = totalAvailable - totalBillAmount;

      return {
        totalAvailable: totalAvailable.toFixed(2),
        billsDue: totalBillAmount.toFixed(2),
        safeToSpend: safeToSpend.toFixed(2),
        nextPayday: formatDateForDisplay(nextPayday),
        billsBeforePayday,
        processedBills
      };
    } catch (error) {
      console.error('Calculation error:', error);
      return {
        totalAvailable: 0,
        billsDue: 0,
        safeToSpend: 0,
        nextPayday: 'Error calculating',
        billsBeforePayday: [],
        processedBills: []
      };
    }
  };

  if (loading) return <div className="loading">Loading spendability data...</div>;
  if (error) return <div className="error">Error: {error}</div>;

  const calculation = calculateSpendability();

  return (
    <div className="spendability-container">
      <div className="page-header">
        <h2>💰 Spendability Calculator</h2>
        <p>See how much you can safely spend before your next payday</p>
      </div>

      {/* Summary Cards */}
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
          <small>Your next income date</small>
        </div>
      </div>

      {/* Bills Breakdown */}
      {calculation.billsBeforePayday.length > 0 && (
        <div className="bills-section">
          <h3>📋 Bills Due Before Next Payday ({calculation.nextPayday})</h3>
          <div className="bills-list">
            {calculation.billsBeforePayday.map((bill) => (
              <div key={bill.id || bill.name} className="bill-item">
                <div className="bill-info">
                  <span className="bill-name">{bill.name}</span>
                  <small className="due-date">
                    Next Due: {formatDateForDisplay(bill.nextDueDate)}
                    {bill.recurrence && bill.recurrence !== 'one-time' && (
                      <span className="recurrence-badge">({bill.recurrence})</span>
                    )}
                  </small>
                </div>
                <span className="bill-amount">${parseFloat(bill.amount || 0).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Bills Preview */}
      {calculation.processedBills.length > 0 && (
        <div className="bills-section">
          <h3>📅 All Bills (Next Due Dates)</h3>
          <div className="bills-list">
            {calculation.processedBills
              .sort((a, b) => new Date(a.nextDueDate) - new Date(b.nextDueDate))
              .map((bill) => (
                <div key={bill.id || bill.name} className="bill-item">
                  <div className="bill-info">
                    <span className="bill-name">{bill.name}</span>
                    <small className="due-date">
                      Next Due: {formatDateForDisplay(bill.nextDueDate)}
                      {bill.recurrence && bill.recurrence !== 'one-time' && (
                        <span className="recurrence-badge">({bill.recurrence})</span>
                      )}
                    </small>
                  </div>
                  <span className="bill-amount">${parseFloat(bill.amount || 0).toFixed(2)}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Account Balances */}
      {financialData && (
        <div className="accounts-section">
          <h3>🏦 Current Account Balances</h3>
          <div className="accounts-grid">
            {financialData.bankOfAmericaChecking && (
              <div className="account-item">
                <span>BofA Checking</span>
                <span>${parseFloat(financialData.bankOfAmericaChecking).toFixed(2)}</span>
              </div>
            )}
            {financialData.bankOfAmericaSavings && (
              <div className="account-item">
                <span>BofA Savings</span>
                <span>${parseFloat(financialData.bankOfAmericaSavings).toFixed(2)}</span>
              </div>
            )}
            {financialData.sofiChecking && (
              <div className="account-item">
                <span>SoFi Checking</span>
                <span>${parseFloat(financialData.sofiChecking).toFixed(2)}</span>
              </div>
            )}
            {financialData.sofiSavings && (
              <div className="account-item">
                <span>SoFi Savings</span>
                <span>${parseFloat(financialData.sofiSavings).toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Helpful Tips */}
      <div className="tips-section">
        <h3>💡 Financial Tips</h3>
        <div className="tips-grid">
          {parseFloat(calculation.safeToSpend) < 0 ? (
            <div className="tip negative">
              <strong>⚠️ Negative Balance Warning</strong>
              <p>You have more bills due before payday than available funds. Consider:</p>
              <ul>
                <li>Moving some bills to after payday</li>
                <li>Using emergency funds if available</li>
                <li>Contacting creditors to adjust payment dates</li>
              </ul>
            </div>
          ) : (
            <div className="tip positive">
              <strong>✅ Good Financial Position</strong>
              <p>You can safely spend ${calculation.safeToSpend} before your next payday while covering all bills due.</p>
            </div>
          )}
          
          <div className="tip general">
            <strong>📊 Smart Spending</strong>
            <p>Consider keeping 10-20% of your safe-to-spend amount as a buffer for unexpected expenses.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Spendability;