import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import './Accounts.css';

const Accounts = () => {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState({});
  const [totalBalance, setTotalBalance] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const [notification, setNotification] = useState({ message: '', type: '' });
  const [newAccount, setNewAccount] = useState({
    name: '',
    type: 'checking',
    balance: ''
  });

  useEffect(() => {
    loadAccounts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      showNotification('Firebase is offline, using demo data', 'error');
      
      // Use demo data when Firebase is offline
      const demoAccounts = {
        bofa: { name: "Bank of America", type: "checking", balance: "1127.68" },
        sofi: { name: "SoFi", type: "savings", balance: "234.29" },
        capone: { name: "Capital One", type: "checking", balance: "24.74" },
        usaa: { name: "USAA", type: "checking", balance: "143.36" }
      };
      
      setAccounts(demoAccounts);
      const total = Object.values(demoAccounts).reduce((sum, account) => {
        return sum + (parseFloat(account.balance) || 0);
      }, 0);
      setTotalBalance(total);
    } finally {
      setLoading(false);
    }
  };

  const saveAccountsToFirebase = async (updatedAccounts) => {
    try {
      setSaving(true);
      const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
      
      // Get current settings to preserve other data
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      await updateDoc(settingsDocRef, {
        ...currentData,
        bankAccounts: updatedAccounts,
        lastUpdated: new Date().toISOString()
      });
      
      setAccounts(updatedAccounts);
      
      // Recalculate total balance
      const total = Object.values(updatedAccounts).reduce((sum, account) => {
        return sum + (parseFloat(account.balance) || 0);
      }, 0);
      setTotalBalance(total);
      
      showNotification('Account updated successfully!', 'success');
    } catch (error) {
      console.error('Error saving accounts:', error);
      showNotification('Firebase is offline - changes saved locally only', 'error');
      
      // Still update local state even if Firebase fails
      setAccounts(updatedAccounts);
      
      // Recalculate total balance
      const total = Object.values(updatedAccounts).reduce((sum, account) => {
        return sum + (parseFloat(account.balance) || 0);
      }, 0);
      setTotalBalance(total);
    } finally {
      setSaving(false);
    }
  };

  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification({ message: '', type: '' }), 3000);
  };

  const addAccount = async () => {
    if (!newAccount.name.trim() || !newAccount.balance.trim()) {
      showNotification('Please fill in all required fields', 'error');
      return;
    }

    const balance = parseFloat(newAccount.balance);
    if (isNaN(balance)) {
      showNotification('Please enter a valid balance amount', 'error');
      return;
    }

    const accountKey = newAccount.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    if (accounts[accountKey]) {
      showNotification('An account with this name already exists', 'error');
      return;
    }

    const updatedAccounts = {
      ...accounts,
      [accountKey]: {
        name: newAccount.name.trim(),
        type: newAccount.type,
        balance: balance.toString()
      }
    };

    await saveAccountsToFirebase(updatedAccounts);
    setShowAddModal(false);
    setNewAccount({ name: '', type: 'checking', balance: '' });
  };

  const updateAccountBalance = async (accountKey, newBalance) => {
    const balance = parseFloat(newBalance);
    if (isNaN(balance)) {
      showNotification('Please enter a valid balance amount', 'error');
      return;
    }

    const updatedAccounts = {
      ...accounts,
      [accountKey]: {
        ...accounts[accountKey],
        balance: balance.toString()
      }
    };

    await saveAccountsToFirebase(updatedAccounts);
    setEditingAccount(null);
  };

  const deleteAccount = async (accountKey) => {
    const updatedAccounts = { ...accounts };
    delete updatedAccounts[accountKey];
    
    await saveAccountsToFirebase(updatedAccounts);
    setShowDeleteModal(null);
  };

  const accountTypes = [
    { value: 'checking', label: 'Checking' },
    { value: 'savings', label: 'Savings' },
    { value: 'credit', label: 'Credit Card' },
    { value: 'investment', label: 'Investment' }
  ];

  const getAccountTypeIcon = (type) => {
    switch (type.toLowerCase()) {
      case 'checking': return '🏦';
      case 'savings': return '💰';
      case 'credit': return '💳';
      case 'investment': return '📈';
      default: return '🏛️';
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
      {/* Notification */}
      {notification.message && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}

      <div className="page-header">
        <h2>💳 Bank Accounts</h2>
        <p>View and manage your bank accounts</p>
        <button 
          className="btn-primary add-account-btn"
          onClick={() => setShowAddModal(true)}
          disabled={saving}
        >
          ➕ Add Account
        </button>
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
              <div className="account-title">
                <span className="account-icon">{getAccountTypeIcon(account.type)}</span>
                <h3>{account.name}</h3>
              </div>
              <span className="account-type">{account.type}</span>
            </div>
            
            <div className="account-balance">
              {editingAccount === key ? (
                <div className="edit-balance">
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={account.balance}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        updateAccountBalance(key, e.target.value);
                      }
                      if (e.key === 'Escape') {
                        setEditingAccount(null);
                      }
                    }}
                    onBlur={(e) => updateAccountBalance(key, e.target.value)}
                    autoFocus
                    className="balance-input"
                  />
                </div>
              ) : (
                formatCurrency(parseFloat(account.balance) || 0)
              )}
            </div>
            
            <div className="account-actions">
              <button 
                className="action-btn"
                onClick={() => setEditingAccount(key)}
                disabled={saving || editingAccount === key}
              >
                ✏️ Edit Balance
              </button>
              <button 
                className="action-btn delete-btn"
                onClick={() => setShowDeleteModal(key)}
                disabled={saving}
              >
                🗑️ Delete
              </button>
            </div>
          </div>
        ))}
        
        {Object.keys(accounts).length === 0 && !loading && (
          <div className="no-accounts">
            <h3>No Accounts Yet</h3>
            <p>Add your first bank account to get started!</p>
            <button 
              className="btn-primary"
              onClick={() => setShowAddModal(true)}
            >
              ➕ Add Your First Account
            </button>
          </div>
        )}
      </div>

      {/* Add Account Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add New Account</h3>
              <button 
                className="close-btn"
                onClick={() => setShowAddModal(false)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Account Name *</label>
                <input
                  type="text"
                  value={newAccount.name}
                  onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })}
                  placeholder="e.g., Bank of America Checking"
                  maxLength={50}
                />
              </div>
              <div className="form-group">
                <label>Account Type *</label>
                <select
                  value={newAccount.type}
                  onChange={(e) => setNewAccount({ ...newAccount, type: e.target.value })}
                >
                  {accountTypes.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Initial Balance *</label>
                <input
                  type="number"
                  step="0.01"
                  value={newAccount.balance}
                  onChange={(e) => setNewAccount({ ...newAccount, balance: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn-secondary"
                onClick={() => setShowAddModal(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button 
                className="btn-primary"
                onClick={addAccount}
                disabled={saving}
              >
                {saving ? 'Adding...' : 'Add Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Delete Account</h3>
              <button 
                className="close-btn"
                onClick={() => setShowDeleteModal(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete <strong>{accounts[showDeleteModal]?.name}</strong>?</p>
              <p className="warning">This action cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button 
                className="btn-secondary"
                onClick={() => setShowDeleteModal(null)}
                disabled={saving}
              >
                Cancel
              </button>
              <button 
                className="btn-primary delete-btn"
                onClick={() => deleteAccount(showDeleteModal)}
                disabled={saving}
              >
                {saving ? 'Deleting...' : 'Delete Account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Accounts;