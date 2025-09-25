import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { RecurringBillManager } from '../utils/RecurringBillManager';
import { formatDateForDisplay } from '../utils/dateUtils';
import './Bills.css';

const Bills = () => {
  const [loading, setLoading] = useState(true);
  const [bills, setBills] = useState([]);
  const [upcomingBills, setUpcomingBills] = useState([]);

  useEffect(() => {
    loadBills();
  }, []);

  const loadBills = async () => {
    try {
      const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
      const settingsDocSnap = await getDoc(settingsDocRef);
      
      if (settingsDocSnap.exists()) {
        const data = settingsDocSnap.data();
        const billsData = data.bills || [];
        setBills(billsData);
        
        const processedBills = RecurringBillManager.processBills(billsData);
        const nextMonth = new Date();
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const upcoming = RecurringBillManager.getBillsDueBefore(processedBills, nextMonth);
        setUpcomingBills(upcoming);
      }
    } catch (error) {
      console.error('Error loading bills:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateStr) => {
    return formatDateForDisplay(dateStr, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="bills-container">
        <div className="page-header">
          <h2>🧾 Bills Management</h2>
          <p>Loading your bills...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bills-container">
      <div className="page-header">
        <h2>🧾 Bills Management</h2>
        <p>Track and manage your upcoming bills</p>
      </div>

      <div className="bills-summary">
        <div className="summary-grid">
          <div className="summary-card">
            <h3>Total Bills</h3>
            <div className="summary-value">{bills.length}</div>
          </div>
          <div className="summary-card">
            <h3>Due This Month</h3>
            <div className="summary-value">{upcomingBills.length}</div>
          </div>
          <div className="summary-card">
            <h3>Monthly Total</h3>
            <div className="summary-value">
              {formatCurrency(upcomingBills.reduce((sum, bill) => sum + (parseFloat(bill.amount) || 0), 0))}
            </div>
          </div>
        </div>
      </div>

      <div className="upcoming-bills">
        <h3>Upcoming Bills</h3>
        <div className="bills-list">
          {upcomingBills.map((bill, index) => (
            <div key={index} className="bill-item">
              <div className="bill-info">
                <h4>{bill.name}</h4>
                <p>Due: {formatDate(bill.nextDueDate)}</p>
                <span className="bill-recurrence">{bill.recurrence}</span>
              </div>
              <div className="bill-amount">
                {formatCurrency(bill.amount)}
              </div>
              <div className="bill-actions">
                <button className="action-btn">Mark Paid</button>
                <button className="action-btn secondary">Edit</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Bills;