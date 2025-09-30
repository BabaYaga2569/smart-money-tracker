import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import PlaidLink from '../components/PlaidLink';
import './Accounts.css';

const Accounts = () => {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState({});
  const [totalBalance, setTotalBalance] = useState(0);
  const [saving, setSaving] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const [notification, setNotification] = useState({ message: '', type: '' });
  const [plaidAccounts, setPlaidAccounts] = useState([]);
  const [hasPlaidAccounts, setHasPlaidAccounts] = useState(false);

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
        const plaidAccountsList = data.plaidAccounts || [];
        
        setAccounts(bankAccounts);
        setPlaidAccounts(plaidAccountsList);
        setHasPlaidAccounts(plaidAccountsList.length > 0);
        
        // If Plaid accounts exist, only use their balances (fully automated flow)
        // Otherwise, use manual account balances
        if (plaidAccountsList.length > 0) {
          const plaidTotal = plaidAccountsList.reduce((sum, account) => {
            return sum + (parseFloat(account.balance) || 0);
          }, 0);
          setTotalBalance(plaidTotal);
        } else {
          const manualTotal = Object.values(bankAccounts).reduce((sum, account) => {
            if (!account.isPlaid) {
              return sum + (parseFloat(account.balance) || 0);
            }
            return sum;
          }, 0);
          setTotalBalance(manualTotal);
        }
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

  const handlePlaidSuccess = async (publicToken) => {
    try {
      setSaving(true);
      showNotification('Connecting your bank account...', 'success');

      // Exchange public token for access token and get accounts
      const response = await fetch('http://localhost:5000/api/plaid/exchange_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ public_token: publicToken }),
      });

      const data = await response.json();

      if (data.success) {
        // Format Plaid accounts for display
        const formattedPlaidAccounts = data.accounts.map((account) => ({
          account_id: account.account_id,
          name: account.name,
          official_name: account.official_name || account.name,
          type: account.subtype || account.type,
          balance: account.balances.current?.toString() || '0',
          available: account.balances.available?.toString() || '0',
          mask: account.mask,
          isPlaid: true,
          access_token: data.access_token,
          item_id: data.item_id,
        }));

        // Save to Firebase
        const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
        const currentDoc = await getDoc(settingsDocRef);
        const currentData = currentDoc.exists() ? currentDoc.data() : {};

        await updateDoc(settingsDocRef, {
          ...currentData,
          plaidAccounts: [...(currentData.plaidAccounts || []), ...formattedPlaidAccounts],
          lastUpdated: new Date().toISOString(),
        });

        // Update state
        const updatedPlaidAccounts = [...plaidAccounts, ...formattedPlaidAccounts];
        setPlaidAccounts(updatedPlaidAccounts);
        setHasPlaidAccounts(true);

        // Recalculate total balance (only Plaid accounts when they exist)
        const plaidTotal = updatedPlaidAccounts.reduce((sum, acc) => sum + parseFloat(acc.balance), 0);
        setTotalBalance(plaidTotal);

        showNotification(`Successfully connected ${formattedPlaidAccounts.length} account(s)!`, 'success');
      } else {
        showNotification('Failed to connect bank account', 'error');
      }
    } catch (error) {
      console.error('Error connecting Plaid account:', error);
      showNotification('Failed to connect bank account', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePlaidExit = (err) => {
    if (err) {
      console.error('Plaid Link error:', err);
      showNotification('Bank connection cancelled or failed', 'error');
    }
  };

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
        <div className="header-actions">
          {!hasPlaidAccounts ? (
            <PlaidLink
              onSuccess={handlePlaidSuccess}
              onExit={handlePlaidExit}
              userId="steve-colburn"
              buttonText="🔗 Connect Bank"
            />
          ) : (
            <>
              <PlaidLink
                onSuccess={handlePlaidSuccess}
                onExit={handlePlaidExit}
                userId="steve-colburn"
                buttonText="➕ Add Another Bank"
              />
            </>
          )}
        </div>
      </div>

      <div className="accounts-summary">
        <div className="summary-card">
          <h3>Total Balance</h3>
          <div className="total-amount">{formatCurrency(totalBalance)}</div>
          <small>Across {hasPlaidAccounts ? plaidAccounts.length : Object.keys(accounts).filter(k => !accounts[k].isPlaid).length} accounts</small>
        </div>
      </div>

      <div className="accounts-grid">
        {/* Plaid-linked accounts */}
        {plaidAccounts.map((account) => (
          <div key={account.account_id} className="account-card plaid-account">
            <div className="account-header">
              <div className="account-title">
                <span className="account-icon">{getAccountTypeIcon(account.type)}</span>
                <h3>{account.official_name}</h3>
                <span className="plaid-badge">🔗 Live</span>
              </div>
              <span className="account-type">{account.type} {account.mask ? `••${account.mask}` : ''}</span>
            </div>
            
            <div className="account-balance">
              {formatCurrency(parseFloat(account.balance) || 0)}
            </div>
            
            <div className="account-actions">
              <button 
                className="action-btn"
                disabled
                title="Balance is synced automatically"
              >
                🔄 Auto-synced
              </button>
            </div>
          </div>
        ))}

        {/* Manual accounts (hidden if Plaid accounts exist for fully automated flow) */}
        {!hasPlaidAccounts && Object.entries(accounts)
          .filter(([, account]) => !account.isPlaid)
          .map(([key, account]) => (
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
        
        {Object.keys(accounts).filter(k => !accounts[k].isPlaid).length === 0 && plaidAccounts.length === 0 && !loading && (
          <div className="no-accounts">
            <h3>No Accounts Yet</h3>
            <p>Connect your bank account to get started with live balances!</p>
            <PlaidLink
              onSuccess={handlePlaidSuccess}
              onExit={handlePlaidExit}
              userId="steve-colburn"
              buttonText="🔗 Connect Your First Bank"
            />
          </div>
        )}
      </div>

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