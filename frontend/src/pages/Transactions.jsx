import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, addDoc, deleteDoc, query, orderBy, limit, getDocs, writeBatch } from 'firebase/firestore';
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
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [forceRefreshing, setForceRefreshing] = useState(false);
  const [accounts, setAccounts] = useState({});
  const [transactions, setTransactions] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showPendingForm, setShowPendingForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [editFormData, setEditFormData] = useState({});
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

  const [pendingCharge, setPendingCharge] = useState({
    amount: '',
    description: '',
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

  // Auto-sync effect - runs when user changes (login/logout)
  useEffect(() => {
    const autoSyncIfNeeded = async () => {
      if (!currentUser) return;
      
      try {
        // Check last sync timestamp from localStorage
        const lastSyncKey = `plaidLastSync_${currentUser.uid}`;
        const lastSyncTime = localStorage.getItem(lastSyncKey);
        const now = Date.now();
        const sixHours = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
        
        // Determine if we should auto-sync
        const shouldSync = !lastSyncTime || (now - parseInt(lastSyncTime)) > sixHours;
        
        if (shouldSync) {
          console.log('🔄 Auto-syncing Plaid transactions (data is stale)...');
          setAutoSyncing(true);
          
          // Call existing sync function
          await syncPlaidTransactions();
          
          console.log('✅ Auto-sync complete!');
        } else {
          const hoursAgo = Math.floor((now - parseInt(lastSyncTime)) / (60 * 60 * 1000));
          console.log(`ℹ️ Plaid data is fresh (synced ${hoursAgo}h ago), skipping auto-sync`);
        }
      } catch (error) {
        console.error('❌ Auto-sync failed:', error);
        // Don't block page load if sync fails
      } finally {
        setAutoSyncing(false);
      }
    };
    
    // Run auto-sync when user is authenticated and component mounts
    if (currentUser) {
      autoSyncIfNeeded();
    }
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

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
      
      // Add timeout to prevent slow API from blocking page load
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
      
      const response = await fetch(`${apiUrl}/api/accounts`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
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
          setHasPlaidAccounts(Object.keys(accountsMap).length > 0);
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
      // Network error, timeout, or API unavailable - fallback silently
      if (error.name === 'AbortError') {
        console.warn('API request timed out after 3s, using Firebase');
      } else if (error.name !== 'TypeError') {
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
              name: account.name,
              official_name: account.official_name,
              type: account.type,
              balance: account.balance,
              mask: account.mask || '',
              institution_name: account.institution_name || '',
              institution: account.institution_name || ''
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
      const q = query(transactionsRef, orderBy('timestamp', 'desc'), limit(1000));
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
      const backendUrl = import.meta.env.VITE_API_URL || 
        (window.location.hostname === 'localhost' 
          ? 'http://localhost:5000' 
          : 'https://smart-money-tracker-09ks.onrender.com');

      // Fetch last 30 days of transactions
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      // Call the new sync_transactions endpoint which saves directly to Firebase
      const apiUrl = `${backendUrl}/api/plaid/sync_transactions`;
      console.log('Syncing from:', apiUrl); // Debug log

      const response = await fetch(apiUrl, {
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
        throw new Error(`Failed to sync transactions: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to sync transactions');
      }

      // Reload transactions from Firebase
      await loadTransactions();
      
      // Update last sync timestamp
      const lastSyncKey = `plaidLastSync_${currentUser.uid}`;
      localStorage.setItem(lastSyncKey, Date.now().toString());
      
      const { added, pending, deduplicated } = data;
      const pendingText = pending > 0 ? ` (${pending} pending)` : '';
      const dedupeText = deduplicated > 0 ? `, ${deduplicated} merged` : '';
      
      showNotification(
        `Successfully synced ${added} new transaction${added !== 1 ? 's' : ''} from Plaid${pendingText}${dedupeText}.`,
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

  const forceRefresh = async () => {
    try {
      setForceRefreshing(true);
      setNotification({ message: '', type: '' });
      
      console.log('🔄 Telling Plaid to check bank RIGHT NOW...');
      
      // Determine backend URL
      const API_URL = import.meta.env.VITE_API_URL || 
        (window.location.hostname === 'localhost' 
          ? 'http://localhost:5000' 
          : 'https://smart-money-tracker-09ks.onrender.com');
      
      // Tell Plaid to refresh from bank
      const refreshResponse = await fetch(`${API_URL}/api/plaid/refresh_transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.uid })
      });
      
      const refreshData = await refreshResponse.json();
      
      if (!refreshResponse.ok) {
        throw new Error(refreshData.error || 'Failed to request bank refresh');
      }
      
      console.log('✅ Plaid is checking bank now!');
      showNotification('Plaid is checking your bank now. Waiting 3 seconds then syncing...', 'info');
      
      // Wait 3 seconds for Plaid to check the bank
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      console.log('🔄 Now syncing new transactions...');
      
      // Now sync to get the new data
      await syncPlaidTransactions();
      
      console.log('✅ Force refresh complete!');
      
    } catch (error) {
      console.error('❌ Force refresh failed:', error);
      showNotification(`Force refresh failed: ${error.message}`, 'error');
    } finally {
      setForceRefreshing(false);
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

  const addPendingCharge = async () => {
    if (!pendingCharge.amount || !pendingCharge.description || !pendingCharge.account) {
      showNotification('Please fill in all required fields', 'error');
      return;
    }

    const amount = parseFloat(pendingCharge.amount);
    if (isNaN(amount) || amount <= 0) {
      showNotification('Please enter a valid amount', 'error');
      return;
    }

    try {
      setSaving(true);
      
      // If expense: negative. If income: positive.
      const finalAmount = pendingCharge.type === 'expense' 
        ? -Math.abs(amount)   // Expense: -$32.50
        : Math.abs(amount);   // Income: +$100.00
      
      const transaction = {
        amount: finalAmount,
        name: pendingCharge.description.trim(),
        merchant_name: pendingCharge.description.trim(),
        description: pendingCharge.description.trim(),
        account_id: pendingCharge.account,
        account: pendingCharge.account,
        date: pendingCharge.date,
        pending: true,
        source: 'manual',
        timestamp: Date.now(),
        type: pendingCharge.type
      };

      // Add to Firebase
      const transactionsRef = collection(db, 'users', currentUser.uid, 'transactions');
      const docRef = await addDoc(transactionsRef, transaction);
      
      // Add to local state
      const newTransactionWithId = { id: docRef.id, ...transaction };
      setTransactions(prev => [newTransactionWithId, ...prev]);
      
      // Reset form
      setPendingCharge({
        amount: '',
        description: '',
        account: '',
        date: formatDateForInput(new Date()),
        type: 'expense'
      });
      setShowPendingForm(false);
      
      showNotification('Pending charge added! Will auto-deduplicate when Plaid syncs.', 'success');
    } catch (error) {
      console.error('Error adding pending charge:', error);
      showNotification('Error adding pending charge', 'error');
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

  const updateTransaction = async (transactionId, updates) => {
    try {
      setSaving(true);
      setNotification({ message: '', type: '' });
      
      const API_URL = import.meta.env.VITE_API_URL || 
        (window.location.hostname === 'localhost' 
          ? 'http://localhost:5000' 
          : 'https://smart-money-tracker-backend.onrender.com');
      
      const response = await fetch(`${API_URL}/api/transactions/${transactionId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${await currentUser.getIdToken()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: currentUser.uid,
          ...updates
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update transaction');
      }
      
      // Update local state
      setTransactions(prev => prev.map(t => 
        t.id === transactionId ? { ...t, ...updates } : t
      ));
      
      showNotification('✅ Transaction updated successfully!', 'success');
      setEditingTransaction(null);
      setEditFormData({});
      
    } catch (error) {
      console.error('Failed to update transaction:', error);
      showNotification(`❌ Update failed: ${error.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleEditTransaction = (transaction) => {
    if (transaction.source === 'plaid') {
      showNotification('❌ Cannot edit Plaid transactions. They sync from your bank.', 'error');
      return;
    }
    
    setEditingTransaction(transaction.id);
    setEditFormData({
      merchant_name: transaction.merchant_name || transaction.name || transaction.description || '',
      amount: Math.abs(transaction.amount || 0),
      date: transaction.date || '',
      category: transaction.category || '',
      notes: transaction.notes || ''
    });
  };

  const handleSaveEdit = async () => {
    if (!editingTransaction) return;
    
    // Find the transaction to determine its type
    const transaction = transactions.find(t => t.id === editingTransaction);
    if (!transaction) return;
    
    // Preserve the sign of the amount based on transaction type
    const finalAmount = transaction.amount < 0 
      ? -Math.abs(editFormData.amount)
      : Math.abs(editFormData.amount);
    
    await updateTransaction(editingTransaction, {
      merchant_name: editFormData.merchant_name,
      amount: finalAmount,
      date: editFormData.date,
      category: editFormData.category,
      notes: editFormData.notes
    });
  };

  const handleCancelEdit = () => {
    setEditingTransaction(null);
    setEditFormData({});
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
      Account: getAccountDisplayName(accounts[t.account] || {}),
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

  const handleDeleteAllTransactions = async () => {
    // First confirmation
    const confirmed = window.confirm(
      '⚠️ WARNING: This will delete ALL transactions permanently!\n\n' +
      'This action cannot be undone.\n\n' +
      'Are you absolutely sure you want to delete all transactions?'
    );
    
    if (!confirmed) {
      return;
    }

    // Second confirmation for safety
    const doubleConfirm = window.confirm(
      '🚨 FINAL WARNING: Are you REALLY sure?\n\n' +
      'All transaction history will be permanently deleted.'
    );
    
    if (!doubleConfirm) {
      return;
    }

    try {
      setSaving(true);
      let totalDeleted = 0;
      
      // Location 1: Root level transactions collection
      try {
        const rootTransactionsRef = collection(db, 'transactions');
        const rootSnapshot = await getDocs(rootTransactionsRef);
        
        if (rootSnapshot.size > 0) {
          const batch = writeBatch(db);
          rootSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
          });
          
          await batch.commit();
          totalDeleted += rootSnapshot.size;
          console.log(`Deleted ${rootSnapshot.size} transactions from root collection`);
        }
      } catch (e) {
        console.log('No transactions in root collection or error:', e.message);
      }
      
      // Location 2: User's transactions subcollection
      try {
        const userTransactionsRef = collection(db, 'users', currentUser.uid, 'transactions');
        const userSnapshot = await getDocs(userTransactionsRef);
        
        if (userSnapshot.size > 0) {
          const batch = writeBatch(db);
          userSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
          });
          
          await batch.commit();
          totalDeleted += userSnapshot.size;
          console.log(`Deleted ${userSnapshot.size} transactions from user subcollection`);
        }
      } catch (e) {
        console.log('No transactions in user subcollection or error:', e.message);
      }
      
      // Location 3: Manual transactions
      try {
        const manualTransactionsRef = collection(db, 'users', currentUser.uid, 'manual_transactions');
        const manualSnapshot = await getDocs(manualTransactionsRef);
        
        if (manualSnapshot.size > 0) {
          const batch = writeBatch(db);
          manualSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
          });
          
          await batch.commit();
          totalDeleted += manualSnapshot.size;
          console.log(`Deleted ${manualSnapshot.size} manual transactions`);
        }
      } catch (e) {
        console.log('No manual transactions or error:', e.message);
      }
      
      // Clear local state
      setTransactions([]);
      
      // Refresh from Firebase to ensure sync
      await loadTransactions();
      
      // Show success message
      alert(`✅ Success! Deleted ${totalDeleted} transaction(s).`);
      showNotification('All transactions have been deleted successfully!', 'success');
      
    } catch (error) {
      console.error('Error deleting transactions:', error);
      alert('❌ Failed to delete transactions. Please try again or check console for details.');
      showNotification('Error deleting transactions', 'error');
    } finally {
      setSaving(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...transactions];
    
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(t => {
        // Safe null checks with fallbacks
        const merchantName = (t.merchant_name || '').toLowerCase();
        const name = (t.name || '').toLowerCase();
        const description = (t.description || '').toLowerCase();
        const category = Array.isArray(t.category) 
          ? t.category.join(' ').toLowerCase() 
          : (t.category || '').toLowerCase();
        const amount = (t.amount || 0).toString();
        const accountName = getAccountDisplayName(accounts[t.account_id] || accounts[t.account] || {}).toLowerCase();
        const notes = (t.notes || '').toLowerCase();
        
        return (
          merchantName.includes(searchLower) ||
          name.includes(searchLower) ||
          description.includes(searchLower) ||
          category.includes(searchLower) ||
          amount.includes(filters.search) ||
          accountName.includes(searchLower) ||
          notes.includes(searchLower)
        );
      });
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
    
    // Sort by date in descending order (most recent first)
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
    
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

  // Helper function to get display name for account (same as Accounts.jsx)
  const getAccountDisplayName = (account) => {
    // Priority 1: official_name from Plaid (most reliable)
    if (account?.official_name && account.official_name.trim()) {
      return account.official_name;
    }
    
    // Priority 2: name from Plaid
    if (account?.name && account.name.trim()) {
      return account.name;
    }
    
    // Priority 3: Construct from institution_name (fallback only)
    const institutionName = account?.institution_name || account?.institution || '';
    const accountType = account?.type || 'Account';
    const mask = account?.mask ? `••${account.mask}` : '';
    
    return `${institutionName} ${accountType} ${mask}`.trim() || 'Unknown Account';
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
            <span>⚠️</span>
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
            Connect Bank →
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
            <span>❌</span>
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
            ✅ Plaid Connected - Auto-sync enabled
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
            onClick={() => {
              setShowAddForm(!showAddForm);
              if (showPendingForm) setShowPendingForm(false);
            }}
            disabled={saving || syncingPlaid || forceRefreshing}
          >
            {showAddForm ? '✕ Cancel' : '+ Add Transaction'}
          </button>

          <button 
            className="btn-primary"
            onClick={() => {
              setShowPendingForm(!showPendingForm);
              if (showAddForm) setShowAddForm(false);
            }}
            disabled={saving || syncingPlaid || forceRefreshing}
            style={{
              background: '#ff9800',
              border: 'none'
            }}
            title="Add a pending charge that hasn't shown up in your bank yet. Will auto-deduplicate when Plaid syncs."
          >
            {showPendingForm ? '✕ Cancel' : '⏳ Quick Add Pending Charge'}
          </button>
          
          <button 
            className="btn-secondary"
            onClick={syncPlaidTransactions}
            disabled={saving || syncingPlaid || autoSyncing || forceRefreshing || (!plaidStatus.isConnected && !hasPlaidAccounts)}
            title={
              autoSyncing
                ? 'Auto-sync in progress...'
                : plaidStatus.hasError 
                  ? 'Plaid connection error - see banner above' 
                  : (!plaidStatus.isConnected && !hasPlaidAccounts)
                    ? 'Please connect Plaid to use this feature' 
                    : 'Sync transactions from your bank accounts'
            }
            style={{
              background: (syncingPlaid || autoSyncing || forceRefreshing) ? '#999' : ((!plaidStatus.isConnected && !hasPlaidAccounts) ? '#6b7280' : '#007bff'),
              color: '#fff',
              border: 'none',
              cursor: ((!plaidStatus.isConnected && !hasPlaidAccounts) || syncingPlaid || autoSyncing || forceRefreshing || saving) ? 'not-allowed' : 'pointer',
              opacity: ((!plaidStatus.isConnected && !hasPlaidAccounts) || syncingPlaid || autoSyncing || forceRefreshing) ? 0.6 : 1
            }}
          >
            {autoSyncing ? '🔄 Auto-syncing...' : syncingPlaid ? '🔄 Syncing...' : ((!plaidStatus.isConnected && !hasPlaidAccounts) ? '🔒 Sync Plaid (Not Connected)' : '🔄 Sync Plaid Transactions')}
          </button>

          <button 
            onClick={forceRefresh} 
            disabled={syncingPlaid || autoSyncing || forceRefreshing || (!plaidStatus.isConnected && !hasPlaidAccounts)}
            className="force-refresh-button"
            style={{
              backgroundColor: forceRefreshing ? '#ccc' : ((!plaidStatus.isConnected && !hasPlaidAccounts) ? '#6b7280' : '#28a745'),
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '5px',
              cursor: (forceRefreshing || syncingPlaid || autoSyncing || (!plaidStatus.isConnected && !hasPlaidAccounts)) ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: 'bold',
              marginLeft: '10px',
              opacity: ((!plaidStatus.isConnected && !hasPlaidAccounts) || forceRefreshing || syncingPlaid || autoSyncing) ? 0.6 : 1
            }}
            title="Tell Plaid to check your bank RIGHT NOW for new transactions"
          >
            {forceRefreshing ? '⏳ Checking Bank...' : '🔄 Force Bank Check'}
          </button>
          
          <button 
            className="btn-secondary"
            onClick={() => setShowTemplates(!showTemplates)}
            disabled={saving || syncingPlaid || forceRefreshing}
          >
            📋 Templates
          </button>
          
          {transactions.length > 0 && (
            <button 
              className="btn-secondary"
              onClick={exportTransactions}
              disabled={saving || syncingPlaid || forceRefreshing}
            >
              📥 Export CSV
            </button>
          )}
          
          {transactions.length > 0 && (
            <button 
              className="delete-all-transactions-btn"
              onClick={handleDeleteAllTransactions}
              disabled={saving || syncingPlaid || forceRefreshing}
              aria-label="Delete all transactions"
              title="Delete all transactions permanently"
            >
              🗑️ Delete All Transactions
            </button>
          )}
        </div>
        
        {autoSyncing && (
          <div style={{
            background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
            color: '#fff',
            padding: '12px 20px',
            borderRadius: '8px',
            marginTop: '15px',
            marginBottom: '15px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            fontSize: '14px',
            fontWeight: '500'
          }}>
            <span style={{ fontSize: '18px' }}>⏳</span>
            <span>Auto-syncing transactions from your bank accounts...</span>
          </div>
        )}
        
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

        {showPendingForm && (
          <div className="add-transaction-form" style={{ background: '#fff8e1', borderLeft: '4px solid #ff9800' }}>
            <div style={{ marginBottom: '12px', color: '#e65100', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>⏳</span>
              <span>Quick Add Pending Charge</span>
            </div>
            <div style={{ fontSize: '13px', color: '#666', marginBottom: '16px' }}>
              Add a charge that hasn't shown up yet. It will auto-merge when Plaid syncs the matching transaction.
            </div>
            <div className="form-group transaction-type-group">
              <label>Transaction Type *</label>
              <div className="type-selector">
                <label className={`type-option expense ${pendingCharge.type === 'expense' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="transactionType"
                    value="expense"
                    checked={pendingCharge.type === 'expense'}
                    onChange={(e) => setPendingCharge({ ...pendingCharge, type: e.target.value })}
                  />
                  <span className="type-icon">💸</span>
                  <div className="type-text">
                    <span className="type-label">Expense</span>
                    <span className="type-hint">Charge, purchase, bill</span>
                  </div>
                </label>
                
                <label className={`type-option income ${pendingCharge.type === 'income' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="transactionType"
                    value="income"
                    checked={pendingCharge.type === 'income'}
                    onChange={(e) => setPendingCharge({ ...pendingCharge, type: e.target.value })}
                  />
                  <span className="type-icon">💰</span>
                  <div className="type-text">
                    <span className="type-label">Income</span>
                    <span className="type-hint">Deposit, Zelle, cash</span>
                  </div>
                </label>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  value={pendingCharge.amount}
                  onChange={(e) => setPendingCharge({ ...pendingCharge, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="form-group">
                <label>Merchant/Description *</label>
                <input
                  type="text"
                  value={pendingCharge.description}
                  onChange={(e) => setPendingCharge({ ...pendingCharge, description: e.target.value })}
                  placeholder="e.g., Amazon, Starbucks, Gas Station"
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Account *</label>
                <select
                  value={pendingCharge.account}
                  onChange={(e) => setPendingCharge({ ...pendingCharge, account: e.target.value })}
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
              <div className="form-group">
                <label>Date</label>
                <input
                  type="date"
                  value={pendingCharge.date}
                  onChange={(e) => setPendingCharge({ ...pendingCharge, date: e.target.value })}
                />
              </div>
            </div>
            <div className="form-actions">
              <button 
                className="btn-primary"
                onClick={addPendingCharge}
                disabled={saving}
                style={{ background: '#ff9800' }}
              >
                {saving ? 'Adding...' : 'Add Pending Charge'}
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
                {editingTransaction === transaction.id ? (
                  <div className="transaction-edit-mode">
                    <div className="transaction-edit-form">
                      <div className="edit-form-row">
                        <label>Merchant/Description:</label>
                        <input
                          type="text"
                          value={editFormData.merchant_name}
                          onChange={(e) => setEditFormData({...editFormData, merchant_name: e.target.value})}
                          onKeyPress={(e) => e.key === 'Enter' && handleSaveEdit()}
                          placeholder="Merchant name"
                          autoFocus
                        />
                      </div>
                      <div className="edit-form-row">
                        <label>Amount:</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editFormData.amount}
                          onChange={(e) => setEditFormData({...editFormData, amount: parseFloat(e.target.value)})}
                          onKeyPress={(e) => e.key === 'Enter' && handleSaveEdit()}
                        />
                      </div>
                      <div className="edit-form-row">
                        <label>Date:</label>
                        <input
                          type="date"
                          value={editFormData.date}
                          onChange={(e) => setEditFormData({...editFormData, date: e.target.value})}
                        />
                      </div>
                      <div className="edit-form-row">
                        <label>Category:</label>
                        <select
                          value={editFormData.category}
                          onChange={(e) => setEditFormData({...editFormData, category: e.target.value})}
                        >
                          <option value="">Select Category</option>
                          {Object.keys(categories).map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                        </select>
                      </div>
                      <div className="edit-form-row">
                        <label>Notes:</label>
                        <input
                          type="text"
                          value={editFormData.notes}
                          onChange={(e) => setEditFormData({...editFormData, notes: e.target.value})}
                          onKeyPress={(e) => e.key === 'Enter' && handleSaveEdit()}
                          placeholder="Optional notes"
                        />
                      </div>
                      <div className="edit-form-actions">
                        <button onClick={handleSaveEdit} className="save-button" disabled={saving}>
                          ✅ Save
                        </button>
                        <button onClick={handleCancelEdit} className="cancel-button" disabled={saving}>
                          ❌ Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="transaction-date-header">
                      {formatDateForDisplay(transaction.date)}
                    </div>
                    
                    <div className="transaction-main-content">
                      <div className="transaction-info">
                        <span 
                          className="transaction-merchant"
                          onClick={() => setEditingTransaction(transaction.id)}
                          title="Click to edit"
                        >
                          {transaction.merchant_name || transaction.name || transaction.description || 'Unknown'}
                        </span>
                        
                        {transaction.category && (
                          <span className="transaction-category-inline">
                            {transaction.category}
                          </span>
                        )}
                        
                        <span className="transaction-account-inline">
                          | {getAccountDisplayName(
                              accounts[transaction.account_id] || 
                              accounts[transaction.account] || 
                              {}
                            )}
                        </span>
                        
                        {transaction.pending && (
                          <span className="transaction-pending" title="Pending transaction - not yet cleared">
                            ⏳ Pending
                          </span>
                        )}
                      </div>
                      
                      <span className={`transaction-amount ${transaction.amount >= 0 ? 'income' : 'expense'}`}>
                        {formatCurrency(transaction.amount)}
                      </span>
                      
                      <div className="transaction-actions">
                        <button 
                          className="edit-btn"
                          onClick={() => handleEditTransaction(transaction)}
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
                  </>
                )}
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
