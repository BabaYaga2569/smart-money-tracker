import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, addDoc, updateDoc, deleteDoc, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { formatDateForDisplay, formatDateForInput } from '../utils/DateUtils';
import { CATEGORY_KEYWORDS } from '../constants/categories';
import PlaidConnectionManager from '../utils/PlaidConnectionManager';
import PlaidErrorModal from '../components/PlaidErrorModal';
import './Transactions.css';
import { useAuth } from '../contexts/AuthContext';

const Transactions = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncingPlaid, setSyncingPlaid] = useState(false);
  const [accounts, setAccounts] = useState({});
  const [transactions, setTransactions] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [notification, setNotification] = useState({ message: '', type: '' });
  const [plaidStatus, setPlaidStatus] = useState({
    isConnected: false,
    hasError: false,
    errorMessage: null
  });
  const [hasPlaidAccounts, setHasPlaidAccounts] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  
  // Analytics state
  const [analytics, setAnalytics] = useState({
    totalIncome: 0,
    totalExpenses: 0,
    netFlow: 0,
    categoryBreakdown: {},
    topCategories: []
  });

  // Form and filter state
  const [newTransaction, setNewTransaction] = useState({
    amount: '',
    description: '',
    category: '',
    account: '',
    date: formatDateForInput(new Date()),
    type: 'expense'
  });

  const [categoryManuallySelected, setCategoryManuallySelected] = useState(false);

  const [filters, setFilters] = useState({
    search: '',
    category: '',
    account: '',
    dateFrom: '',
    dateTo: '',
    type: ''
  });

  const [showTemplates, setShowTemplates] = useState(false);
  const [templates] = useState([
    { name: 'Coffee', amount: '4.50', category: 'Food & Dining', type: 'expense' },
    { name: 'Gas Station', amount: '35.00', category: 'Gas & Fuel', type: 'expense' },
    { name: 'Grocery Store', amount: '75.00', category: 'Groceries', type: 'expense' },
    { name: 'Monthly Salary', amount: '2500.00', category: 'Income', type: 'income' }
  ]);

  // Use shared categories for consistency with Bills page
  const categories = CATEGORY_KEYWORDS;

  useEffect(() => {
    loadInitialData();
    checkPlaidConnection();
    
    // Subscribe to Plaid connection changes
    const unsubscribe = PlaidConnectionManager.subscribe((status) => {
      setPlaidStatus({
        isConnected: status.hasToken && status.isApiWorking === true && status.hasAccounts,
        hasError: status.error !== null,
        errorMessage: status.error
      });
    });
    
    return () => unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const checkPlaidConnection = async () => {
    try {
      const status = await PlaidConnectionManager.checkConnection();
      setPlaidStatus({
        isConnected: status.hasToken && status.isApiWorking === true && status.hasAccounts,
        hasError: status.error !== null,
        errorMessage: status.error
      });
    } catch (error) {
      console.error('Error checking Plaid connection:', error);
    }
  };

  useEffect(() => {
    applyFilters();
  }, [transactions, filters]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    calculateAnalytics();
  }, [transactions]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadInitialData = async () => {
    try {
      setLoading(true);
      await Promise.all([loadAccounts(), loadTransactions()]);
    } catch (error) {
      console.error('Error loading initial data:', error);
      showNotification('Error loading data', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Updated loadAccounts function to fetch from Plaid API
  const loadAccounts = async () => {
    try {
      const token = localStorage.getItem('token');
      const apiUrl = import.meta.env.VITE_API_URL || 'https://smart-money-tracker-09ks.onrender.com';
      
      const response = await fetch(`${apiUrl}/api/accounts`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        let data;
        try {
          data = await response.json();
        } catch (parseError) {
          console.warn('Failed to parse API response, falling back to Firebase:', parseError);
          await loadFirebaseAccounts();
          return;
        }
        
        // Check if API returned success flag
        if (data?.success === false) {
          // Expected behavior when Plaid not configured - use Firebase
          await loadFirebaseAccounts();
          return;
        }
        
        // Convert Plaid accounts to the format the component expects
        const accountsMap = {};
        
        // Handle different possible response structures
        const accountsList = data?.accounts || data;
        
        if (Array.isArray(accountsList) && accountsList.length > 0) {
          accountsList.forEach(account => {
            if (!account) return; // Skip null/undefined accounts
            
            // Use account_id or id as the key
            const accountId = account?.account_id || account?.id || account?._id;
            
            if (!accountId) {
              console.warn('Account missing ID, skipping:', account);
              return;
            }
            
            // Extract balance - handle different possible structures
            let balance = 0;
            if (account?.balances) {
              balance = account.balances?.current || account.balances?.available || 0;
            } else if (account?.current_balance !== undefined) {
              balance = account.current_balance;
            } else if (account?.balance !== undefined) {
              balance = account.balance;
            }
            
            accountsMap[accountId] = {
              name: account?.name || account?.official_name || 'Unknown Account',
              type: account?.subtype || account?.type || 'checking',
              balance: balance.toString(),
              mask: account?.mask || '',
              institution: account?.institution_name || ''
            };
          });
          
          setAccounts(accountsMap);
        } else {
          // No accounts from API, try Firebase
          await loadFirebaseAccounts();
        }
      } else if (response.status === 404) {
        // Expected when API endpoint not available - use Firebase
        await loadFirebaseAccounts();
      } else {
        // Unexpected error - log and fallback
        console.warn(`API returned ${response.status}, falling back to Firebase`);
        await loadFirebaseAccounts();
      }
    } catch (error) {
      // Network error or API unavailable - fallback silently
      if (error.name !== 'TypeError') {
        console.warn('API unavailable, using Firebase:', error.message);
      }
      await loadFirebaseAccounts();
    }
  };

  // Fallback function to load from Firebase
  const loadFirebaseAccounts = async () => {
    try {
      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      const settingsDocSnap = await getDoc(settingsDocRef);
      
      if (settingsDocSnap.exists()) {
        const data = settingsDocSnap.data();
        const plaidAccountsList = data.plaidAccounts || [];
        const bankAccounts = data.bankAccounts || {};
        
        // Update PlaidConnectionManager with account info
        PlaidConnectionManager.setPlaidAccounts(plaidAccountsList);
        setHasPlaidAccounts(plaidAccountsList.length > 0);
        
        // Prioritize Plaid accounts if they exist (fully automated flow)
        if (plaidAccountsList.length > 0) {
          // Convert Plaid accounts to the format the component expects
          const accountsMap = {};
          plaidAccountsList.forEach(account => {
            const accountId = account.account_id;
            accountsMap[accountId] = {
              name: account.official_name || account.name,
              type: account.type,
              balance: account.balance,
              mask: account.mask || '',
              institution: ''
            };
          });
          setAccounts(accountsMap);
        } else {
          // Fall back to manual accounts
          setAccounts(bankAccounts);
        }
      } else {
        setDefaultDemoAccounts();
      }
    } catch (error) {
      console.error('Error loading Firebase accounts:', error);
      setDefaultDemoAccounts();
    }
  };

  // Set default demo accounts
  const setDefaultDemoAccounts = () => {
    const demoAccounts = {
      bofa: { name: "Bank of America", type: "checking", balance: "1361.97" },
      capone: { name: "Capital One", type: "checking", balance: "24.74" },
      usaa: { name: "USAA", type: "checking", balance: "143.36" }
    };
    setAccounts(demoAccounts);
  };

  const loadTransactions = async () => {
    try {
      const transactionsRef = collection(db, 'users', currentUser.uid, 'transactions');
      const q = query(transactionsRef, orderBy('timestamp', 'desc'), limit(100));
      const querySnapshot = await getDocs(q);
      
      const transactionsList = [];
      querySnapshot.forEach((doc) => {
        transactionsList.push({ id: doc.id, ...doc.data() });
      });
      
      setTransactions(transactionsList);
    } catch (error) {
      console.error('Error loading transactions:', error);
      // For demo purposes, set some sample transactions
      const sampleTransactions = [
        {
          id: 'sample1',
          amount: -45.67,
          description: 'Grocery Shopping at Walmart',
          category: 'Food & Dining',
          account: Object.keys(accounts)[0] || 'bofa',
          date: formatDateForInput(new Date()),
          timestamp: Date.now(),
          type: 'expense'
        },
        {
          id: 'sample2',
          amount: 2500.00,
          description: 'Salary Deposit',
          category: 'Income',
          account: Object.keys(accounts)[0] || 'bofa',
          date: formatDateForInput(new Date(Date.now() - 86400000)),
          timestamp: Date.now() - 86400000,
          type: 'income'
        }
      ];
      setTransactions(sampleTransactions);
    }
  };

  const syncPlaidTransactions = async () => {
    try {
      setSyncingPlaid(true);
      
      // Check if user has Plaid accounts configured
      if (!hasPlaidAccounts) {
        showNotification('Plaid not connected. Please connect your bank account first.', 'warning');
        return;
      }

      // Determine backend URL
      const backendUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:5000' 
        : 'https://smart-money-tracker-09ks.onrender.com';

      // Fetch last 30 days of transactions
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Pass userId instead of access_token - tokens are retrieved server-side
      const response = await fetch(`${backendUrl}/api/plaid/get_transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: currentUser.uid,
          start_date: startDate,
          end_date: endDate
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch transactions: ${response.statusText}`);
      }

      const data = await response.json();
      const plaidTransactions = data.transactions || [];

      if (plaidTransactions.length === 0) {
        showNotification('No new transactions found in the last 30 days.', 'info');
        return;
      }

      // Add Plaid transactions to Firebase (avoid duplicates)
      let addedCount = 0;
      const transactionsRef = collection(db, 'users', currentUser.uid, 'transactions');
      
      for (const plaidTx of plaidTransactions) {
        // Check if transaction already exists by transaction_id
        const existingTx = transactions.find(tx => tx.plaidTransactionId === plaidTx.transaction_id);
        if (existingTx) {
          continue; // Skip duplicates
        }

        // Convert Plaid transaction to our format
        const transaction = {
          amount: plaidTx.amount,
          description: plaidTx.merchant_name || plaidTx.name,
          category: autoCategorizTransaction(plaidTx.merchant_name || plaidTx.name),
          account: plaidTx.account_id,
          date: plaidTx.date,
          timestamp: new Date(plaidTx.date).getTime(),
          type: plaidTx.amount > 0 ? 'expense' : 'income',
          source: 'plaid',
          plaidTransactionId: plaidTx.transaction_id
        };

        await addDoc(transactionsRef, transaction);
        addedCount++;
      }

      // Reload transactions
      await loadTransactions();
      
      showNotification(
        `Successfully synced ${addedCount} new transaction${addedCount !== 1 ? 's' : ''} from Plaid.`,
        'success'
      );
    } catch (error) {
      console.error('Error syncing Plaid transactions:', error);
      showNotification(
        `Error syncing transactions: ${error.message}`,
        'error'
      );
    } finally {
      setSyncingPlaid(false);
    }
  };

  const autoCategorizTransaction = (description) => {
    if (!description) return '';
    
    const desc = description.toLowerCase().trim();
    
    // First, try exact matches for better accuracy
    for (const [category, keywords] of Object.entries(categories)) {
      // Check for exact word matches first (more accurate)
      for (const keyword of keywords) {
        const lowerKeyword = keyword.toLowerCase();
        // Handle variations with punctuation and word boundaries
        if (desc === lowerKeyword || 
            desc.includes(` ${lowerKeyword} `) ||
            desc.startsWith(lowerKeyword + ' ') ||
            desc.endsWith(' ' + lowerKeyword) ||
            desc.includes(lowerKeyword)) {
          return category;
        }
      }
    }
    
    return '';
  };

  const addTransaction = async () => {
    if (!newTransaction.amount || !newTransaction.description || !newTransaction.account) {
      showNotification('Please fill in all required fields', 'error');
      return;
    }

    const amount = parseFloat(newTransaction.amount);
    if (isNaN(amount)) {
      showNotification('Please enter a valid amount', 'error');
      return;
    }

    try {
      setSaving(true);
      
      const finalAmount = newTransaction.type === 'expense' ? -Math.abs(amount) : Math.abs(amount);
      const category = newTransaction.category || autoCategorizTransaction(newTransaction.description);
      
      const transaction = {
        amount: finalAmount,
        description: newTransaction.description.trim(),
        category: category,
        account: newTransaction.account,
        date: newTransaction.date,
        timestamp: Date.now(),
        type: newTransaction.type
      };

      // Add to Firebase
      const transactionsRef = collection(db, 'users', currentUser.uid, 'transactions');
      const docRef = await addDoc(transactionsRef, transaction);
      
      // Add to local state
      const newTransactionWithId = { id: docRef.id, ...transaction };
      setTransactions(prev => [newTransactionWithId, ...prev]);
      
      // Update account balance
      await updateAccountBalance(newTransaction.account, finalAmount);
      
      // Reset form
      setNewTransaction({
        amount: '',
        description: '',
        category: '',
        account: '',
        date: formatDateForInput(new Date()),
        type: 'expense'
      });
      setCategoryManuallySelected(false);
      setShowAddForm(false);
      
      showNotification('Transaction added successfully!', 'success');
    } catch (error) {
      console.error('Error adding transaction:', error);
      showNotification('Error adding transaction', 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateAccountBalance = async (accountKey, amount) => {
    try {
      const currentBalance = parseFloat(accounts[accountKey]?.balance || 0);
      const newBalance = currentBalance + amount;
      
      const updatedAccounts = {
        ...accounts,
        [accountKey]: {
          ...accounts[accountKey],
          balance: newBalance.toString()
        }
      };
      
      // Update local state immediately
      setAccounts(updatedAccounts);
      
      // Note: With Plaid accounts, the balance will be updated on next sync
      // This local update is temporary until next Plaid sync
      console.log('Account balance updated locally. Will sync with Plaid on next refresh.');
      
    } catch (error) {
      console.error('Error updating account balance:', error);
    }
  };

  const updateTransaction = async (transactionId, updatedFields) => {
    try {
      setSaving(true);
      
      // Update Firebase
      await updateDoc(doc(db, 'users', currentUser.uid, 'transactions', transactionId), updatedFields);
      
      // Update local state
      setTransactions(prev => prev.map(t => 
        t.id === transactionId ? { ...t, ...updatedFields } : t
      ));
      
      setEditingTransaction(null);
      showNotification('Transaction updated successfully!', 'success');
    } catch (error) {
      console.error('Error updating transaction:', error);
      showNotification('Error updating transaction', 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteTransaction = async (transactionId, transaction) => {
    if (!window.confirm('Are you sure you want to delete this transaction?')) {
      return;
    }

    try {
      setSaving(true);
      
      // Delete from Firebase
      await deleteDoc(doc(db, 'users', currentUser.uid, 'transactions', transactionId));
      
      // Reverse the account balance change
      await updateAccountBalance(transaction.account, -transaction.amount);
      
      // Remove from local state
      setTransactions(prev => prev.filter(t => t.id !== transactionId));
      
      showNotification('Transaction deleted successfully!', 'success');
    } catch (error) {
      console.error('Error deleting transaction:', error);
      showNotification('Error deleting transaction', 'error');
    } finally {
      setSaving(false);
    }
  };

  const applyTemplate = (template) => {
    setNewTransaction({
      ...newTransaction,
      amount: template.amount,
      description: template.name,
      category: template.category,
      type: template.type
    });
    setShowTemplates(false);
    setShowAddForm(true); // Show the transaction form
  };

  const exportTransactions = () => {
    const csvData = transactions.map(t => ({
      Date: t.date,
      Description: t.description,
      Category: t.category,
      Account: accounts[t.account]?.name || t.account,
      Amount: t.amount,
      Type: t.type
    }));
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + "Date,Description,Category,Account,Amount,Type\n"
      + csvData.map(row => Object.values(row).map(val => `"${val}"`).join(",")).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `transactions_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showNotification('Transactions exported successfully!', 'success');
  };

  const applyFilters = () => {
    let filtered = [...transactions];
    
    if (filters.search) {
      filtered = filtered.filter(t => 
        t.description.toLowerCase().includes(filters.search.toLowerCase())
      );
    }
    
    if (filters.category) {
      filtered = filtered.filter(t => t.category === filters.category);
    }
    
    if (filters.account) {
      filtered = filtered.filter(t => t.account === filters.account);
    }
    
    if (filters.type) {
      filtered = filtered.filter(t => t.type === filters.type);
    }
    
    if (filters.dateFrom) {
      filtered = filtered.filter(t => t.date >= filters.dateFrom);
    }
    
    if (filters.dateTo) {
      filtered = filtered.filter(t => t.date <= filters.dateTo);
    }
    
    setFilteredTransactions(filtered);
  };

  const calculateAnalytics = () => {
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    
    const monthlyTransactions = transactions.filter(t => {
      const transactionDate = new Date(t.date);
      return transactionDate.getMonth() === currentMonth && 
             transactionDate.getFullYear() === currentYear;
    });
    
    let totalIncome = 0;
    let totalExpenses = 0;
    const categoryBreakdown = {};
    
    monthlyTransactions.forEach(t => {
      if (t.amount > 0) {
        totalIncome += t.amount;
      } else {
        totalExpenses += Math.abs(t.amount);
      }
      
      if (t.category) {
        categoryBreakdown[t.category] = (categoryBreakdown[t.category] || 0) + Math.abs(t.amount);
      }
    });
    
    const topCategories = Object.entries(categoryBreakdown)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);
    
    setAnalytics({
      totalIncome,
      totalExpenses,
      netFlow: totalIncome - totalExpenses,
      categoryBreakdown,
      topCategories
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification({ message: '', type: '' }), 3000);
  };

  if (loading) {
    return (
      <div className="transactions-container">
        <div className="page-header">
          <h2>ðŸ’° Transactions</h2>
          <p>Loading your transactions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="transactions-container">
      <div className="page-header">
        <h2>ðŸ’° Transactions</h2>
        <p>Complete transaction management and financial analytics</p>
      </div>

      {/* Plaid Connection Status Banner - Compact Version */}
      {!plaidStatus.isConnected && !hasPlaidAccounts && !plaidStatus.hasError && (
        <div style={{
          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: '8px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          fontSize: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>âš ï¸</span>
            <span>
              <strong>Plaid Not Connected</strong> - Connect to automatically sync transactions
            </span>
          </div>
          <button
            onClick={() => window.location.href = '/accounts'}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: '1px solid rgba(255,255,255,0.4)',
              color: '#fff',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
              whiteSpace: 'nowrap'
            }}
          >
            Connect Bank â†’
          </button>
        </div>
      )}

      {plaidStatus.hasError && (
        <div style={{
          background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: '8px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          fontSize: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>âŒ</span>
            <span>
              <strong>Connection Error</strong> - {PlaidConnectionManager.getErrorMessage()}
            </span>
          </div>
          <button 
            onClick={() => setShowErrorModal(true)}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: '1px solid rgba(255,255,255,0.4)',
              color: '#fff',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
              whiteSpace: 'nowrap'
            }}
          >
            View Details
          </button>
        </div>
      )}

      {(hasPlaidAccounts || plaidStatus.isConnected) && !plaidStatus.hasError && (
        <div style={{
          background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
          color: '#fff',
          padding: '12px 24px',
          borderRadius: '8px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '16px', fontWeight: '600' }}>
            âœ… Plaid Connected - Auto-sync enabled
          </div>
        </div>
      )}

      {/* Notification */}
      {notification.message && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}

      {/* Analytics Summary */}
      <div className="transactions-summary">
        <div className="summary-card">
          <h3>Monthly Income</h3>
          <div className="total-amount positive">{formatCurrency(analytics.totalIncome)}</div>
          <small>This month</small>
        </div>
        <div className="summary-card">
          <h3>Monthly Expenses</h3>
          <div className="total-amount expense">{formatCurrency(analytics.totalExpenses)}</div>
          <small>This month</small>
        </div>
        <div className="summary-card">
          <h3>Net Flow</h3>
          <div className={`total-amount ${analytics.netFlow >= 0 ? 'positive' : 'expense'}`}>
            {formatCurrency(analytics.netFlow)}
          </div>
          <small>This month</small>
        </div>
        <div className="summary-card">
          <h3>Total Transactions</h3>
          <div className="total-amount">{transactions.length}</div>
          <small>All time</small>
        </div>
      </div>

      {/* Quick Add Transaction */}
      <div className="quick-add-section">
        <div className="add-transaction-actions">
          <button 
            className="btn-primary add-transaction-btn"
            onClick={() => setShowAddForm(!showAddForm)}
            disabled={saving || syncingPlaid}
          >
            {showAddForm ? 'âœ• Cancel' : '+ Add Transaction'}
          </button>
          
          <button 
            className="btn-secondary"
            onClick={syncPlaidTransactions}
            disabled={saving || syncingPlaid || (!plaidStatus.isConnected && !hasPlaidAccounts)}
            title={
              plaidStatus.hasError 
                ? 'Plaid connection error - see banner above' 
                : (!plaidStatus.isConnected && !hasPlaidAccounts)
                  ? 'Please connect Plaid to use this feature' 
                  : 'Sync transactions from your bank accounts'
            }
            style={{
              background: syncingPlaid ? '#999' : ((!plaidStatus.isConnected && !hasPlaidAccounts) ? '#6b7280' : '#007bff'),
              color: '#fff',
              border: 'none',
              cursor: ((!plaidStatus.isConnected && !hasPlaidAccounts) || syncingPlaid || saving) ? 'not-allowed' : 'pointer',
              opacity: ((!plaidStatus.isConnected && !hasPlaidAccounts) || syncingPlaid) ? 0.6 : 1
            }}
          >
            {syncingPlaid ? 'ðŸ”„ Syncing...' : ((!plaidStatus.isConnected && !hasPlaidAccounts) ? 'ðŸ”’ Sync Plaid (Not Connected)' : 'ðŸ”„ Sync Plaid Transactions')}
          </button>
          
          <button 
            className="btn-secondary"
            onClick={() => setShowTemplates(!showTemplates)}
            disabled={saving || syncingPlaid}
          >
            ðŸ“‹ Templates
          </button>
          
          {transactions.length > 0 && (
            <button 
              className="btn-secondary"
              onClick={exportTransactions}
              disabled={saving || syncingPlaid}
            >
              ðŸ“¥ Export CSV
            </button>
          )}
        </div>
        
        {showTemplates && (
          <div className="templates-section">
            <h4>Quick Templates</h4>
            <div className="templates-grid">
              {templates.map((template, index) => (
                <div key={index} className="template-item" onClick={() => applyTemplate(template)}>
                  <div className="template-name">{template.name}</div>
                  <div className="template-details">
                    <span className={`template-amount ${template.type}`}>
                      {template.type === 'expense' ? '-' : '+'}${template.amount}
                    </span>
                    <span className="template-category">{template.category}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {showAddForm && (
          <div className="add-transaction-form">
            <div className="form-row">
              <div className="form-group">
                <label>Type</label>
                <select
                  value={newTransaction.type}
                  onChange={(e) => setNewTransaction({ ...newTransaction, type: e.target.value })}
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>
              <div className="form-group">
                <label>Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  value={newTransaction.amount}
                  onChange={(e) => setNewTransaction({ ...newTransaction, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="form-group">
                <label>Account *</label>
                <select
                  value={newTransaction.account}
                  onChange={(e) => setNewTransaction({ ...newTransaction, account: e.target.value })}
                >
                  <option value="">Select Account</option>
                  {Object.entries(accounts).map(([key, account]) => (
                    <option key={key} value={key}>
                      {account.name}
                      {account.mask ? ` (...${account.mask})` : ''}
                      {account.balance ? ` - $${parseFloat(account.balance).toFixed(2)}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Description *</label>
                <input
                  type="text"
                  value={newTransaction.description}
                  onChange={(e) => {
                    const desc = e.target.value;
                    const updatedTransaction = { 
                      ...newTransaction, 
                      description: desc
                    };
                    
                    // Only auto-categorize if category wasn't manually selected
                    if (!categoryManuallySelected) {
                      updatedTransaction.category = autoCategorizTransaction(desc);
                    }
                    
                    setNewTransaction(updatedTransaction);
                  }}
                  placeholder="What was this transaction for?"
                />
              </div>
              <div className="form-group">
                <label>Category</label>
                <select
                  value={newTransaction.category}
                  onChange={(e) => {
                    const selectedCategory = e.target.value;
                    setNewTransaction({ ...newTransaction, category: selectedCategory });
                    // Set manual selection flag (except for empty/auto-detect)
                    setCategoryManuallySelected(selectedCategory !== '');
                  }}
                >
                  <option value="">Auto-detect</option>
                  {Object.keys(categories).map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  value={newTransaction.date}
                  onChange={(e) => setNewTransaction({ ...newTransaction, date: e.target.value })}
                />
              </div>
            </div>
            <div className="form-actions">
              <button 
                className="btn-primary"
                onClick={addTransaction}
                disabled={saving}
              >
                {saving ? 'Adding...' : 'Add Transaction'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="filters-section">
        <div className="filters-row">
          <input
            type="text"
            placeholder="Search transactions..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="search-input"
          />
          <select
            value={filters.category}
            onChange={(e) => setFilters({ ...filters, category: e.target.value })}
          >
            <option value="">All Categories</option>
            {Object.keys(categories).map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
          <select
            value={filters.account}
            onChange={(e) => setFilters({ ...filters, account: e.target.value })}
          >
            <option value="">All Accounts</option>
            {Object.entries(accounts).map(([key, account]) => (
              <option key={key} value={key}>{account.name}</option>
            ))}
          </select>
          <select
            value={filters.type}
            onChange={(e) => setFilters({ ...filters, type: e.target.value })}
          >
            <option value="">All Types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
        </div>
        <div className="date-filters">
          <div className="date-filter-group">
            <label>From:</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
            />
          </div>
          <div className="date-filter-group">
            <label>To:</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
            />
          </div>
          {(filters.dateFrom || filters.dateTo || filters.search || filters.category || filters.account || filters.type) && (
            <button 
              className="clear-filters-btn"
              onClick={() => setFilters({
                search: '',
                category: '',
                account: '',
                dateFrom: '',
                dateTo: '',
                type: ''
              })}
            >
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Transactions List */}
      <div className="transactions-list">
        <div className="transactions-header">
          <h3>Recent Transactions</h3>
          <p>Showing {filteredTransactions.length} of {transactions.length} transactions</p>
        </div>
        
        {filteredTransactions.length === 0 ? (
          <div className="no-transactions">
            {transactions.length === 0 ? (
              <>
                <h3>No Transactions Yet</h3>
                <p>Add your first transaction to get started!</p>
              </>
            ) : (
              <>
                <h3>No Matching Transactions</h3>
                <p>Try adjusting your filters</p>
              </>
            )}
          </div>
        ) : (
          <div className="transactions-grid">
            {filteredTransactions.map((transaction) => (
              <div key={transaction.id} className="transaction-item">
                <div className="transaction-info">
                  {editingTransaction === transaction.id ? (
                    <div className="transaction-edit-form">
                      <input
                        type="text"
                        defaultValue={transaction.description}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            updateTransaction(transaction.id, { description: e.target.value });
                          }
                          if (e.key === 'Escape') {
                            setEditingTransaction(null);
                          }
                        }}
                        onBlur={(e) => updateTransaction(transaction.id, { description: e.target.value })}
                        autoFocus
                        className="edit-description"
                      />
                    </div>
                  ) : (
                    <div 
                      className="transaction-description"
                      onClick={() => setEditingTransaction(transaction.id)}
                      title="Click to edit"
                    >
                      {transaction.description}
                    </div>
                  )}
                  <div className="transaction-meta">
                    <span className="transaction-date">
                      {formatDateForDisplay(transaction.date)}
                    </span>
                    <span className="transaction-account">
                      {accounts[transaction.account]?.name || transaction.account}
                    </span>
                    {transaction.source && (
                      <span className={`transaction-source ${transaction.source}`} title={`Source: ${transaction.source === 'plaid' ? 'Auto-detected (Plaid)' : 'Manual entry'}`}>
                        {transaction.source === 'plaid' ? 'ðŸ”„' : 'âœ‹'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="transaction-details">
                  <div className={`transaction-amount ${transaction.amount >= 0 ? 'income' : 'expense'}`}>
                    {formatCurrency(transaction.amount)}
                  </div>
                  {transaction.category && (
                    <div className="transaction-category">{transaction.category}</div>
                  )}
                  <div className="transaction-actions">
                    <button 
                      className="edit-btn"
                      onClick={() => setEditingTransaction(editingTransaction === transaction.id ? null : transaction.id)}
                      disabled={saving}
                      title="Edit transaction"
                    >
                      âœï¸
                    </button>
                    <button 
                      className="delete-btn"
                      onClick={() => deleteTransaction(transaction.id, transaction)}
                      disabled={saving}
                      title="Delete transaction"
                    >
                      ðŸ—‘ï¸
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top Categories */}
      {analytics.topCategories.length > 0 && (
        <div className="top-categories">
          <h3>Top Spending Categories This Month</h3>
          <div className="categories-list">
            {analytics.topCategories.map(([category, amount]) => (
              <div key={category} className="category-item">
                <span className="category-name">{category}</span>
                <span className="category-amount">{formatCurrency(amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plaid Error Modal */}
      <PlaidErrorModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        onRetry={() => {
          setShowErrorModal(false);
          checkPlaidConnection();
        }}
      />
    </div>
  );
};

export default Transactions;

