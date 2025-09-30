import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, addDoc, updateDoc, deleteDoc, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { formatDateForDisplay, formatDateForInput } from '../utils/DateUtils';
import { CATEGORY_KEYWORDS } from '../constants/categories';
import './Transactions.css';

const Transactions = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [accounts, setAccounts] = useState({});
  const [transactions, setTransactions] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [notification, setNotification] = useState({ message: '', type: '' });
  
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
  const [templates, setTemplates] = useState([
    { name: 'Coffee', amount: '4.50', category: 'Food & Dining', type: 'expense' },
    { name: 'Gas Station', amount: '35.00', category: 'Gas & Fuel', type: 'expense' },
    { name: 'Grocery Store', amount: '75.00', category: 'Groceries', type: 'expense' },
    { name: 'Monthly Salary', amount: '2500.00', category: 'Income', type: 'income' }
  ]);

  // Use shared categories for consistency with Bills page
  const categories = CATEGORY_KEYWORDS;

  useEffect(() => {
    loadInitialData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      const response = await fetch('https://smart-money-tracker-09ks.onrender.com/api/plaid/accounts', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Fetched Plaid accounts:', data);
        
        // Convert Plaid accounts to the format the component expects
        const accountsMap = {};
        
        // Handle different possible response structures
        const accountsList = data.accounts || data;
        
        if (Array.isArray(accountsList)) {
          accountsList.forEach(account => {
            // Use account_id or id as the key
            const accountId = account.account_id || account.id || account._id;
            
            // Extract balance - handle different possible structures
            let balance = 0;
            if (account.balances) {
              balance = account.balances.current || account.balances.available || 0;
            } else if (account.current_balance !== undefined) {
              balance = account.current_balance;
            } else if (account.balance !== undefined) {
              balance = account.balance;
            }
            
            accountsMap[accountId] = {
              name: account.name || account.official_name || 'Unknown Account',
              type: account.subtype || account.type || 'checking',
              balance: balance.toString(),
              mask: account.mask || '',
              institution: account.institution_name || ''
            };
          });
        }
        
        // If we got Plaid accounts, use them; otherwise fall back to demo
        if (Object.keys(accountsMap).length > 0) {
          setAccounts(accountsMap);
        } else {
          // Try Firebase as backup
          const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
          const settingsDocSnap = await getDoc(settingsDocRef);
          
          if (settingsDocSnap.exists()) {
            const data = settingsDocSnap.data();
            setAccounts(data.bankAccounts || {});
          } else {
            // Final fallback to demo accounts
            setDefaultDemoAccounts();
          }
        }
      } else {
        console.error('Failed to fetch Plaid accounts, status:', response.status);
        // Try Firebase as backup
        await loadFirebaseAccounts();
      }
    } catch (error) {
      console.error('Error loading Plaid accounts:', error);
      // Try Firebase as backup
      await loadFirebaseAccounts();
    }
  };

  // Fallback function to load from Firebase
  const loadFirebaseAccounts = async () => {
    try {
      const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
      const settingsDocSnap = await getDoc(settingsDocRef);
      
      if (settingsDocSnap.exists()) {
        const data = settingsDocSnap.data();
        setAccounts(data.bankAccounts || {});
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
      const transactionsRef = collection(db, 'users', 'steve-colburn', 'transactions');
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
      const transactionsRef = collection(db, 'users', 'steve-colburn', 'transactions');
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
      await updateDoc(doc(db, 'users', 'steve-colburn', 'transactions', transactionId), updatedFields);
      
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
      await deleteDoc(doc(db, 'users', 'steve-colburn', 'transactions', transactionId));
      
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
          <h2>💰 Transactions</h2>
          <p>Loading your transactions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="transactions-container">
      <div className="page-header">
        <h2>💰 Transactions</h2>
        <p>Complete transaction management and financial analytics</p>
      </div>

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
            disabled={saving}
          >
            {showAddForm ? '✕ Cancel' : '+ Add Transaction'}
          </button>
          
          <button 
            className="btn-secondary"
            onClick={() => setShowTemplates(!showTemplates)}
            disabled={saving}
          >
            📋 Templates
          </button>
          
          {transactions.length > 0 && (
            <button 
              className="btn-secondary"
              onClick={exportTransactions}
              disabled={saving}
            >
              📥 Export CSV
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
                      ✏️
                    </button>
                    <button 
                      className="delete-btn"
                      onClick={() => deleteTransaction(transaction.id, transaction)}
                      disabled={saving}
                      title="Delete transaction"
                    >
                      🗑️
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
    </div>
  );
};

export default Transactions;
