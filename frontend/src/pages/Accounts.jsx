import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import './Accounts.css';

const Accounts = () => {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState({});
  const [totalBalance, setTotalBalance] = useState(0);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
      const settingsDocSnap = await getDoc(settingsDocRef);
      
      if (settingsDocSnap.exists()) {
        const data = settingsDocSnap.data();
        const bankAccounts = data.bankAccounts || {};
        setAccounts(bankAccounts);
        
        const total = Object.values(bankAccounts).reduce((sum, account) => {
          return sum + (parseFloat(account.balance) || 0);
        }, 0);
        setTotalBalance(total);
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
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

  if (loading) {
    return (
      <div className="accounts-container">
        <div className="page-header">
          <h2>💳 Bank Accounts</h2>
          <p>Loading your accounts...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="accounts-container">
      <div className="page-header">
        <h2>💳 Bank Accounts</h2>
        <p>View and manage your bank accounts</p>
      </div>

      <div className="accounts-summary">
        <div className="summary-card">
          <h3>Total Balance</h3>
          <div className="total-amount">{formatCurrency(totalBalance)}</div>
          <small>Across {Object.keys(accounts).length} accounts</small>
        </div>
      </div>

      <div className="accounts-grid">
        {Object.entries(accounts).map(([key, account]) => (
          <div key={key} className="account-card">
            <div className="account-header">
              <h3>{account.name}</h3>
              <span className="account-type">{account.type}</span>
            </div>
            <div className="account-balance">
              {formatCurrency(parseFloat(account.balance) || 0)}
            </div>
            <div className="account-actions">
              <button className="action-btn">View Details</button>
              <button className="action-btn secondary">Update Balance</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Accounts;