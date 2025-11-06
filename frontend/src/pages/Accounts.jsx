import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, collection, query, orderBy, limit, getDocs, deleteDoc, where, writeBatch, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import PlaidLink from '../components/PlaidLink';
import PlaidErrorModal from '../components/PlaidErrorModal';
import { calculateTotalProjectedBalance, getBalanceDifference, formatBalanceDifference } from '../utils/BalanceCalculator';
import PlaidConnectionManager from '../utils/PlaidConnectionManager';
import './Accounts.css';
import { useAuth } from '../contexts/AuthContext';
import { useSmartBalanceSync } from '../hooks/useSmartBalanceSync';

const Accounts = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  
  // Smart background balance sync (runs automatically)
  useSmartBalanceSync(currentUser?.uid);
  
  const [loading, setLoading] = useState(true);

  // Helper function to extract balance data from account object
  // Prefers top-level fields from backend, falls back to balances object
  const extractBalances = (account) => {
    const balances = account.balances || {};
    const currentBalance = parseFloat(account.current_balance ?? balances.current ?? 0);
    const availableBalance = parseFloat(account.available_balance ?? balances.available ?? currentBalance);
    const liveBalance = availableBalance; // available includes pending
    const pendingAdjustment = availableBalance - currentBalance;
    
    return { currentBalance, availableBalance, liveBalance, pendingAdjustment };
  };
  const [accounts, setAccounts] = useState({});
  const [totalBalance, setTotalBalance] = useState(0);
  const [totalProjectedBalance, setTotalProjectedBalance] = useState(0);
  const [saving, setSaving] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(null);
  const [notification, setNotification] = useState({ message: '', type: '' });
  const [plaidAccounts, setPlaidAccounts] = useState([]);
  const [plaidStatus, setPlaidStatus] = useState({
    isConnected: false,
    hasError: false,
    errorMessage: null
  });
  const [transactions, setTransactions] = useState([]);
  const [showBalanceType, setShowBalanceType] = useState('both'); // 'live', 'projected', or 'both'
  const [showHelp, setShowHelp] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(() => {
    // Check if user has dismissed the banner before
    return localStorage.getItem('plaidBannerDismissed') === 'true';
  });
  
  // Auto-refresh state
  const [lastRefresh, setLastRefresh] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [syncingPlaid, setSyncingPlaid] = useState(false);
  const [autoSyncing, setAutoSyncing] = useState(false);
  
  // Health check state
  const [healthStatus, setHealthStatus] = useState(null);
  
  // Reconnect state
  const [reconnectingItemId, setReconnectingItemId] = useState(null);

 // eslint-disable-next-line react-hooks/exhaustive-deps
 useEffect(() => {
  // ✅ FIX: Force fresh balances on page load
  const loadWithFreshBalances = async () => {
      // Clear session sync flag to force fresh balance check
      sessionStorage.removeItem(`autoSync_${currentUser?.uid}`);
      
      // Check if we need to refresh (only if data is >10 minutes old)
      const lastRefreshTime = localStorage.getItem(`lastPlaidRefresh_${currentUser?.uid}`);
      const now = Date.now();
      const TEN_MINUTES = 10 * 60 * 1000;
      const needsRefresh = !lastRefreshTime || (now - parseInt(lastRefreshTime)) > TEN_MINUTES;
      
      if (needsRefresh && currentUser) {
        console.log('[REFRESH] Data is stale (>10 min), refreshing BOTH balances and transactions...');
        
        const apiUrl = import.meta.env.VITE_API_URL || 'https://smart-money-tracker-09ks.onrender.com';
        
        // Fire BOTH refresh requests in parallel (don't wait for them)
        Promise.all([
          // Refresh balances
          fetch(`${apiUrl}/api/accounts?userId=${currentUser.uid}&refresh=true&_t=${Date.now()}`)
            .then(() => console.log('[REFRESH] ✅ Balance refresh sent'))
            .catch(err => console.log('[REFRESH] ❌ Balance refresh failed:', err)),
          
          // Refresh transactions
          fetch(`${apiUrl}/api/plaid/sync_transactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.uid })
          })
            .then(() => console.log('[REFRESH] ✅ Transaction refresh sent'))
            .catch(err => console.log('[REFRESH] ❌ Transaction refresh failed:', err))
        ]).then(() => {
          // Mark as refreshed AFTER both complete
          localStorage.setItem(`lastPlaidRefresh_${currentUser.uid}`, now.toString());
        });
        
        // Load cached data immediately, fresh data will come via real-time listener
        await loadAccountsAndTransactions();
      } else {
        console.log('[REFRESH] Data is fresh (<10 min old), loading from cache');
        await loadAccountsAndTransactions();
      }
    };
  
  loadWithFreshBalances();
  
  // Check Plaid in background (non-blocking)
  checkPlaidConnection().catch(err => {
    console.error('Plaid check failed:', err);
  });
  
  const unsubscribe = PlaidConnectionManager.subscribe((status) => {
    setPlaidStatus({
      isConnected: status.hasToken && status.isApiWorking === true && status.hasAccounts,
      hasError: status.error !== null,
      errorMessage: status.error
    });
  });
  
  // Auto-refresh removed - webhooks now handle real-time updates
  // Users can manually refresh via button if needed
  // This saves ~1,400 API calls per day and ~$400/month in Plaid costs
  
  return () => {
    unsubscribe();
  };
}, [currentUser]);

  // Recalculate projected balance when transactions change
  useEffect(() => {
    if (plaidAccounts.length > 0) {
      const projectedTotal = calculateTotalProjectedBalance(plaidAccounts, transactions);
      setTotalProjectedBalance(projectedTotal);
    } else if (Object.keys(accounts).length > 0) {
      const projectedTotal = calculateTotalProjectedBalance(accounts, transactions);
      setTotalProjectedBalance(projectedTotal);
    }
  }, [transactions, plaidAccounts, accounts]);

  // Real-time transactions listener
  useEffect(() => {
    if (!currentUser) return;
    
    console.log('📡 [Accounts] Setting up real-time listener...');
    
    const transactionsRef = collection(db, 'users', currentUser.uid, 'transactions');
    const q = query(transactionsRef, orderBy('timestamp', 'desc'), limit(100));
    
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const txs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        console.log('✅ [Accounts] Real-time update:', txs.length, 'transactions');
        setTransactions(txs);
      },
      (error) => {
        console.error('❌ [Accounts] Listener error:', error);
        setTransactions([]);
      }
    );

    return () => {
      console.log('🔌 [Accounts] Cleaning up listener');
      unsubscribe();
    };
  }, [currentUser]);

  // Auto-sync effect - runs when user changes (login/logout)
  useEffect(() => {
    const autoSyncOnStartup = async () => {
      if (!currentUser) return;
      
      try {
        // ✅ Query Firebase directly instead of checking React state
        const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
        const settingsDocSnap = await getDoc(settingsDocRef);
        
        if (!settingsDocSnap.exists()) {
          console.log('[AutoSync] No settings document found');
          return;
        }
        
        const data = settingsDocSnap.data();
        const plaidAccountsList = data.plaidAccounts || [];
        
        if (plaidAccountsList.length === 0) {
          console.log('[AutoSync] No Plaid accounts in Firebase, skipping auto-sync');
          return;
        }
        
        console.log(`[AutoSync] Found ${plaidAccountsList.length} Plaid accounts in Firebase`);
      } catch (error) {
        console.error('[AutoSync] Error checking accounts:', error);
        return;
      }
     // Check Firebase for last sync time (not localStorage)
    try {
      // Check if we already synced this session
      const sessionSync = sessionStorage.getItem(`autoSync_${currentUser.uid}`);
      if (sessionSync) {
        console.log('[AutoSync] Already synced this session, skipping');
        return;
      }

      // Get the REAL last sync time from Firebase
      const syncDocRef = doc(db, `users/${currentUser.uid}/metadata/sync`);
      const syncDoc = await getDoc(syncDocRef);
      
      const lastSync = syncDoc.exists() 
        ? syncDoc.data()?.lastPlaidSync?.toMillis() 
        : 0;
      
      const now = Date.now();
      const ONE_HOUR = 60 * 60 * 1000;
      const timeSinceSync = now - lastSync;

      console.log('[AutoSync] Last sync was', Math.round(timeSinceSync / 1000 / 60), 'minutes ago');

      // Sync if data is older than 1 hour
      if (timeSinceSync > ONE_HOUR) {
        console.log('[AutoSync] Data is stale, syncing now...');
        setAutoSyncing(true);
        
        await syncPlaidTransactions();
        
        // Mark this session as synced
        sessionStorage.setItem(`autoSync_${currentUser.uid}`, Date.now().toString());
        
        console.log('[AutoSync] ✅ Sync complete!');
      } else {
        console.log('[AutoSync] Data is fresh, no sync needed');
      }

    } catch (error) {
      console.error('[AutoSync] Error:', error);
    } finally {
      setAutoSyncing(false);
    } 
     
    };
    
    // Run auto-sync when user is authenticated and component mounts
    // Delay slightly to ensure plaidAccounts state is loaded first
    if (currentUser) {
      const timer = setTimeout(() => {
        autoSyncOnStartup();
      }, 1000); // 1 second delay to let accounts load
      
      return () => clearTimeout(timer);
    }
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // Local calculateProjectedBalance with comprehensive logging
  // This overrides the imported function to provide debugging capabilities
  const calculateProjectedBalance = (accountId, liveBalance, transactionsList, currentAccount) => {
    console.log(`[ProjectedBalance] Calculating for account: ${accountId}`);
    console.log(`[ProjectedBalance] Live balance: ${liveBalance}`);
    
    if (!transactionsList || transactionsList.length === 0) {
      console.log(`[ProjectedBalance] No transactions, returning live balance`);
      return liveBalance;
    }

    // ✅ BULLETPROOF FIX: Multiple matching strategies
    const pendingTxs = transactionsList.filter(tx => {
      const isPending = tx.pending === true || tx.pending === 'true';
      
      if (!isPending) return false;
      
      const txAccountId = tx.account_id || tx.account;
      
      // Strategy 1: Exact account_id match (fastest)
      if (txAccountId === accountId) {
        console.log(`[ProjectedBalance] ✅ Matched by account_id:`, {
          merchant: tx.merchant_name || tx.name,
          strategy: 'exact_id',
          amount: tx.amount
        });
        return true;
      }
      
      // Strategy 2: Match by mask (last 4 digits) - most reliable fallback
      if (currentAccount?.mask && tx.mask) {
        const masksMatch = currentAccount.mask === tx.mask;
        
        // Also verify institution name to avoid false positives
        const institutionMatch = !currentAccount.institution_name || 
                                !tx.institution_name || 
                                currentAccount.institution_name === tx.institution_name;
        
        if (masksMatch && institutionMatch) {
          console.log(`[ProjectedBalance] ✅ Matched by mask + institution:`, {
            merchant: tx.merchant_name || tx.name,
            strategy: 'mask_match',
            mask: currentAccount.mask,
            amount: tx.amount
          });
          return true;
        }
      }
      
      // Strategy 3: Match by institution (only if account is the sole one from this bank)
      if (currentAccount?.institution_name && tx.institution_name) {
        const institutionMatch = currentAccount.institution_name === tx.institution_name;
        
        // Count how many accounts share this institution
        const accountsFromBank = plaidAccounts.filter(acc => 
          acc.institution_name === currentAccount.institution_name
        );
        
        // Only use institution matching if it's the ONLY account from this bank
        if (institutionMatch && accountsFromBank.length === 1) {
          console.log(`[ProjectedBalance] ✅ Matched by institution (single account):`, {
            merchant: tx.merchant_name || tx.name,
            strategy: 'institution_only',
            institution: currentAccount.institution_name,
            amount: tx.amount
          });
          return true;
        }
      }
      
      // No match found
      console.log(`[ProjectedBalance] ❌ No match for transaction:`, {
        merchant: tx.merchant_name || tx.name,
        tx_account_id: txAccountId,
        tx_mask: tx.mask,
        tx_institution: tx.institution_name,
        looking_for_id: accountId,
        account_mask: currentAccount?.mask,
        account_institution: currentAccount?.institution_name
      });
      
      return false;
    });

    console.log(`[ProjectedBalance] Found ${pendingTxs.length} pending transactions for ${accountId}`);

    if (pendingTxs.length === 0) {
      return liveBalance;
    }

    // Calculate total pending amount
    const pendingTotal = pendingTxs.reduce((sum, tx) => {
      const amount = Math.abs(parseFloat(tx.amount) || 0);
      console.log(`[ProjectedBalance] Pending: ${tx.merchant_name || tx.name}, Amount: -${amount}`);
      return sum + amount;
    }, 0);

    const projected = liveBalance - pendingTotal;
    console.log(`[ProjectedBalance] Live: ${liveBalance}, Pending: -${pendingTotal}, Projected: ${projected}`);
    
    return projected;
  };

  const syncPlaidTransactions = async () => {
    try {
      setSyncingPlaid(true);
      
      // Check if user has Plaid accounts configured
      if (plaidAccounts.length === 0) {
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

      // Call the sync_transactions endpoint which saves directly to Firebase
      const apiUrl = `${backendUrl}/api/plaid/sync_transactions`;
      console.log('[Accounts] Syncing from:', apiUrl);

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

      // Real-time listener will auto-update, no manual reload needed
      
      // Update last sync timestamp
      localStorage.setItem('lastPlaidSync', Date.now().toString());
      
      const { added, pending, deduplicated } = data;
      const pendingText = pending > 0 ? ` (${pending} pending)` : '';
      const dedupeText = deduplicated > 0 ? `, ${deduplicated} merged` : '';
      
      showNotification(
        `Successfully synced ${added} new transaction${added !== 1 ? 's' : ''} from Plaid${pendingText}${dedupeText}.`,
        'success'
      );
    } catch (error) {
      console.error('[Accounts] Error syncing Plaid transactions:', error);
      showNotification(
        `Error syncing transactions: ${error.message}`,
        'error'
      );
    } finally {
      setSyncingPlaid(false);
    }
  };

  const checkPlaidConnection = async () => {
    try {
      const status = await PlaidConnectionManager.checkConnection();
      const hasError = status.error !== null;
      setPlaidStatus({
        isConnected: status.hasToken && status.isApiWorking === true && status.hasAccounts,
        hasError: hasError,
        errorMessage: status.error
      });
      
      // Show error modal for critical errors
      if (hasError && status.errorType !== 'config') {
        setShowErrorModal(true);
      }
    } catch (error) {
      console.error('Error checking Plaid connection:', error);
    }
  };

  const checkConnectionHealth = async () => {
    if (!currentUser) return;
    
    try {
      console.log('🏥 [Accounts] Checking Plaid connection health...');
      const apiUrl = import.meta.env.VITE_API_URL || 'https://smart-money-tracker-09ks.onrender.com';
      const response = await fetch(`${apiUrl}/api/plaid/health_check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: currentUser.uid }),
      });

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ [Accounts] Health check result:', data);
      
      setHealthStatus(data);
    } catch (error) {
      console.error('❌ [Accounts] Error checking connection health:', error);
    }
  };

  const loadAccountsAndTransactions = async () => {
    // Real-time listener handles transactions, just load accounts
    await loadAccounts();
    
    // Check connection health after accounts are loaded
    if (currentUser) {
      checkConnectionHealth().catch(err => {
        console.error('Health check failed:', err);
      });
    }
  };

  const loadAccounts = async () => {
    // Prevent concurrent requests
    if (isRefreshing) {
      console.log('Already refreshing, skipping...');
      return;
    }
    
    try {
      setIsRefreshing(true);
      
      // Call backend API to get FRESH balances (uses transactionsSync from PR #130)
      const apiUrl = import.meta.env.VITE_API_URL || 'https://smart-money-tracker-09ks.onrender.com';
      const response = await fetch(`${apiUrl}/api/accounts?userId=${currentUser.uid}&_t=${Date.now()}`);
      const data = await response.json();

      if (data.success && data.accounts && data.accounts.length > 0) {
        // Format backend accounts for frontend display
       // ✅ Improved mapping logic – reflects pending (uses available first) and safely handles null balances
const formattedPlaidAccounts = data.accounts.map(account => {
  const { currentBalance, availableBalance, liveBalance, pendingAdjustment } = extractBalances(account);

  // Check if balance changed compared to existing account
  const existingAccount = plaidAccounts.find(acc => acc.account_id === account.account_id);
  const balanceChanged = !existingAccount || existingAccount.balance !== liveBalance.toFixed(2);

  return {
    account_id: account.account_id ?? '',
    name: account.name ?? 'Unknown Account',
    official_name: account.official_name ?? account.name ?? 'Unknown Account',
    type: account.subtype || account.type || 'checking',
    balance: liveBalance.toFixed(2), // ✅ main displayed balance
    available: availableBalance.toFixed(2),
    current: currentBalance.toFixed(2),
    pending_adjustment: pendingAdjustment.toFixed(2),
    mask: account.mask ?? '',
    isPlaid: true,
    item_id: account.item_id ?? '',
    institution_name: account.institution_name ?? data?.institution_name ?? '',
    institution_id: account.institution_id ?? '',
    lastBalanceUpdate: balanceChanged ? Date.now() : (existingAccount?.lastBalanceUpdate || Date.now()),
    previousBalance: existingAccount?.balance
  };
});


        
        setPlaidAccounts(formattedPlaidAccounts);
        
        // Update PlaidConnectionManager with account info
        PlaidConnectionManager.setPlaidAccounts(formattedPlaidAccounts);
        
        // Calculate fresh total from backend data
        const plaidTotal = formattedPlaidAccounts.reduce((sum, account) => {
          return sum + (parseFloat(account.balance) || 0);
        }, 0);
        setTotalBalance(plaidTotal);
        
        // Calculate projected balance
        const projectedTotal = calculateTotalProjectedBalance(formattedPlaidAccounts, transactions);
        setTotalProjectedBalance(projectedTotal);
        
        console.log('✅ Loaded fresh balances from backend API:', formattedPlaidAccounts.length, 'accounts');
        
        // Persist accounts with lastBalanceUpdate to Firebase
        try {
          const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
          const currentDoc = await getDoc(settingsDocRef);
          const currentData = currentDoc.exists() ? currentDoc.data() : {};
          
          await updateDoc(settingsDocRef, {
            ...currentData,
            plaidAccounts: formattedPlaidAccounts,
            lastUpdated: new Date().toISOString()
          });
          
          console.log('✅ Persisted accounts with lastBalanceUpdate to Firebase');
        } catch (fbError) {
          console.warn('Failed to persist accounts to Firebase:', fbError);
          // Not critical - continue with cached data
        }
      } else {
        // Fallback to Firebase if API fails or returns no accounts
        console.warn('⚠️ Backend returned no accounts, falling back to Firebase');
        const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
        const settingsDocSnap = await getDoc(settingsDocRef);
        
        if (settingsDocSnap.exists()) {
          const firebaseData = settingsDocSnap.data();
          const bankAccounts = firebaseData.bankAccounts || {};
          const plaidAccountsList = firebaseData.plaidAccounts || [];
          
          setAccounts(bankAccounts);
          setPlaidAccounts(plaidAccountsList);
          
          // Update PlaidConnectionManager with account info
          PlaidConnectionManager.setPlaidAccounts(plaidAccountsList);
          
          // If Plaid accounts exist, only use their balances (fully automated flow)
          // Otherwise, use manual account balances
          if (plaidAccountsList.length > 0) {
            const plaidTotal = plaidAccountsList.reduce((sum, account) => {
              return sum + (parseFloat(account.balance) || 0);
            }, 0);
            setTotalBalance(plaidTotal);
            
            // Calculate projected balance
            const projectedTotal = calculateTotalProjectedBalance(plaidAccountsList, transactions);
            setTotalProjectedBalance(projectedTotal);
          } else {
            const manualTotal = Object.values(bankAccounts).reduce((sum, account) => {
              if (!account.isPlaid) {
                return sum + (parseFloat(account.balance) || 0);
              }
              return sum;
            }, 0);
            setTotalBalance(manualTotal);
            
            // Calculate projected balance for manual accounts
            const projectedTotal = calculateTotalProjectedBalance(bankAccounts, transactions);
            setTotalProjectedBalance(projectedTotal);
          }
        }
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
      
      // Fallback to Firebase on error
      try {
        const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
        const settingsDocSnap = await getDoc(settingsDocRef);
        
        if (settingsDocSnap.exists()) {
          const data = settingsDocSnap.data();
          const bankAccounts = data.bankAccounts || {};
          const plaidAccountsList = data.plaidAccounts || [];
          
          setAccounts(bankAccounts);
          setPlaidAccounts(plaidAccountsList);
          
          // Update PlaidConnectionManager with account info
          PlaidConnectionManager.setPlaidAccounts(plaidAccountsList);
          
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
        } else {
          // Use demo data when both API and Firebase fail
          showNotification('Unable to load accounts, using demo data', 'error');
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
          setTotalProjectedBalance(total); // Same as live when no transactions
        }
      } catch (fallbackError) {
        console.error('Fallback to Firebase also failed:', fallbackError);
        showNotification('Unable to load accounts', 'error');
      }
    } finally {
      setLoading(false);
      setIsRefreshing(false);
      setLastRefresh(Date.now());
    }
  };

  const saveAccountsToFirebase = async (updatedAccounts) => {
    try {
      setSaving(true);
      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      
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
    try {
      setSaving(true);
      const userId = currentUser.uid;

      // Check if this is a Plaid account
      const accountToDelete = plaidAccounts.find(acc => acc.account_id === accountKey);
      
      if (accountToDelete) {
        // For Plaid accounts, delete ONLY this specific account
        const itemId = accountToDelete.item_id;

        if (!itemId) {
          console.error('Account does not have item_id');
          showNotification('Cannot delete account: missing item_id', 'error');
          setSaving(false);
          return;
        }

        console.log('[DELETE] Starting account deletion:', accountKey);
        console.log('[DELETE] Account to delete:', accountToDelete);

        // 1. Load current settings from Firebase
        const settingsDocRef = doc(db, 'users', userId, 'settings', 'personal');
        const currentDoc = await getDoc(settingsDocRef);
        const currentData = currentDoc.exists() ? currentDoc.data() : {};
        
        console.log('[DELETE] Current Firebase plaidAccounts:', currentData.plaidAccounts);
        
        // 2. Remove ONLY this specific account from plaidAccounts array
        const updatedPlaidAccounts = (currentData.plaidAccounts || []).filter(
          acc => acc.account_id !== accountKey
        );
        
        // 3. Ensure all remaining accounts have complete data by enriching from local state
        // This prevents losing fields like institution_name if Firebase data is stale
        const enrichedPlaidAccounts = updatedPlaidAccounts.map(firebaseAcc => {
          // Find corresponding account in local state which has fresh data from backend API
          const localAcc = plaidAccounts.find(acc => acc.account_id === firebaseAcc.account_id);
          
          if (localAcc) {
            // Merge Firebase data with local state, preferring local state for display fields
            return {
              ...firebaseAcc,
              // Preserve critical display fields from local state
              institution_name: localAcc.institution_name || firebaseAcc.institution_name || '',
              institution_id: localAcc.institution_id || firebaseAcc.institution_id || '',
              name: localAcc.name || firebaseAcc.name,
              official_name: localAcc.official_name || firebaseAcc.official_name,
              mask: localAcc.mask || firebaseAcc.mask,
              balance: firebaseAcc.balance || localAcc.balance, // Prefer Firebase for consistency
            };
          }
          
          // If not found in local state, use Firebase data as-is
          return firebaseAcc;
        });
        
        console.log('[DELETE] Enriched plaidAccounts:', enrichedPlaidAccounts);
        
        // 4. Validate that institution_name is preserved
        enrichedPlaidAccounts.forEach(acc => {
          if (!acc.institution_name) {
            console.warn('[DELETE] WARNING: Account missing institution_name after enrichment!', acc);
          } else {
            console.log('[DELETE] ✓ Account has institution_name:', acc.account_id, acc.institution_name);
          }
        });
        
        // 5. Check if any OTHER accounts from this bank still exist
        const remainingAccountsFromBank = enrichedPlaidAccounts.filter(
          acc => acc.item_id === itemId
        );
        
        console.log('[DELETE] Remaining accounts from bank:', remainingAccountsFromBank.length);

        // 6. Only delete plaid_items if NO accounts remain from this bank
        if (remainingAccountsFromBank.length === 0) {
          // All accounts from this bank deleted - remove plaid_items
          const plaidItemsRef = collection(db, 'users', userId, 'plaid_items');
          const plaidItemsQuery = query(plaidItemsRef, where('itemId', '==', itemId));
          const plaidItemsSnapshot = await getDocs(plaidItemsQuery);
          
          const batch = writeBatch(db);
          plaidItemsSnapshot.forEach(doc => {
            batch.delete(doc.ref);
          });
          await batch.commit();
          
          console.log('[DELETE] Deleted plaid_items for', itemId, '(no accounts remaining)');
        } else {
          console.log('[DELETE] Kept plaid_items for', itemId, `(${remainingAccountsFromBank.length} accounts remaining)`);
        }

        // 7. Update plaidAccounts array in settings/personal with enriched data
        await updateDoc(settingsDocRef, {
          ...currentData,
          plaidAccounts: enrichedPlaidAccounts,
          lastUpdated: new Date().toISOString()
        });
        
        console.log('[DELETE] Updated Firebase settings/personal with enriched accounts');
        
        // 8. Update local state with enriched data
        setPlaidAccounts(enrichedPlaidAccounts);
        PlaidConnectionManager.setPlaidAccounts(enrichedPlaidAccounts);
        
        // 9. Recalculate total balance
        const plaidTotal = enrichedPlaidAccounts.reduce((sum, acc) => sum + parseFloat(acc.balance || 0), 0);
        setTotalBalance(plaidTotal);
        
        console.log('[DELETE] Account deletion completed successfully');
        showNotification('Account deleted successfully', 'success');
      } else {
        // For manual accounts, remove from bankAccounts object in settings
        const updatedAccounts = { ...accounts };
        delete updatedAccounts[accountKey];
        
        await saveAccountsToFirebase(updatedAccounts);
      }

      // Try deleting from multiple possible Firebase locations (for old/stale data)
      // Location 1: Root level accounts collection
      try {
        const rootAccountRef = doc(db, 'accounts', accountKey);
        await deleteDoc(rootAccountRef);
        console.log('Deleted from root accounts collection');
      } catch (e) {
        // Not in root accounts collection or doesn't exist
        console.log('Not in root accounts collection:', e.message);
      }

      // Location 2: User's financial subcollection
      try {
        const financialRef = doc(db, 'users', userId, 'financial', accountKey);
        await deleteDoc(financialRef);
        console.log('Deleted from financial subcollection');
      } catch (e) {
        // Not in financial subcollection or doesn't exist
        console.log('Not in financial subcollection:', e.message);
      }

      // Location 3: User's accounts subcollection (if exists)
      try {
        const userAccountRef = doc(db, 'users', userId, 'accounts', accountKey);
        await deleteDoc(userAccountRef);
        console.log('Deleted from accounts subcollection');
      } catch (e) {
        // Not in accounts subcollection or doesn't exist
        console.log('Not in accounts subcollection:', e.message);
      }

      setShowDeleteModal(null);
    } catch (error) {
      console.error('Error deleting account:', error);
      showNotification('Failed to delete account. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePlaidSuccess = async (publicToken) => {
    try {
      setSaving(true);
      showNotification('Connecting your bank account...', 'success');
      
      // Show success banner temporarily when connection succeeds
      setShowSuccessBanner(true);
      setBannerDismissed(false);

      // Validate and construct API URL
      const apiUrl = import.meta.env.VITE_API_URL || 'https://smart-money-tracker-09ks.onrender.com';
      if (!apiUrl) {
        throw new Error('API URL is not configured');
      }

      // Exchange public token for access token and get accounts
      const response = await fetch(`${apiUrl}/api/plaid/exchange_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          public_token: publicToken,
          userId: currentUser.uid 
        }),
      });

      const data = await response.json();

      if (data?.success && data?.accounts) {
        // Format Plaid accounts for display with null checks
        // IMPORTANT: Do NOT store access_token - it's now stored securely server-side
        // ✅ Improved mapping logic – reflects pending (uses available first) and safely handles null balances
const formattedPlaidAccounts = data.accounts.map(account => {
  const { currentBalance, availableBalance, liveBalance, pendingAdjustment } = extractBalances(account);

  return {
    account_id: account.account_id ?? '',
    name: account.name ?? 'Unknown Account',
    official_name: account.official_name ?? account.name ?? 'Unknown Account',
    type: account.subtype || account.type || 'checking',
    balance: liveBalance.toFixed(2), // ✅ main displayed balance
    available: availableBalance.toFixed(2),
    current: currentBalance.toFixed(2),
    pending_adjustment: pendingAdjustment.toFixed(2),
    mask: account.mask ?? '',
    isPlaid: true,
    item_id: account.item_id ?? '',
    institution_name: account.institution_name ?? data?.institution_name ?? '',
    institution_id: account.institution_id ?? '',
  };
});



        // Save to Firebase
        const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
        const currentDoc = await getDoc(settingsDocRef);
        const currentData = currentDoc.exists() ? currentDoc.data() : {};

        // Remove any existing accounts for this item_id to avoid duplicates (backend also does this, but this ensures consistency)
        const existingAccounts = currentData.plaidAccounts || [];
        const filteredAccounts = existingAccounts.filter(acc => acc.item_id !== data.item_id);

        await updateDoc(settingsDocRef, {
          ...currentData,
          plaidAccounts: [...filteredAccounts, ...formattedPlaidAccounts],
          lastUpdated: new Date().toISOString(),
        });

        // Update state (use filteredAccounts to avoid duplicates in state as well)
        const updatedPlaidAccounts = [...filteredAccounts, ...formattedPlaidAccounts];
        setPlaidAccounts(updatedPlaidAccounts);
        PlaidConnectionManager.setPlaidAccounts(updatedPlaidAccounts);

        // Recalculate total balance (only Plaid accounts when they exist)
        const plaidTotal = updatedPlaidAccounts.reduce((sum, acc) => sum + parseFloat(acc.balance), 0);
        setTotalBalance(plaidTotal);

        showNotification(`Successfully connected ${formattedPlaidAccounts.length} account(s)!`, 'success');
        
        // Auto-hide success banner after 5 seconds
        setTimeout(() => {
          setShowSuccessBanner(false);
        }, 5000);
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
      setShowErrorModal(true);
    }
  };

  const handleReconnectAccount = (itemId) => {
    console.log('🔄 [Accounts] Starting reconnect for item:', itemId);
    showNotification('Opening reconnection flow...', 'info');
    setReconnectingItemId(itemId);
  };

  const handleReconnectSuccess = async (publicToken, metadata) => {
    try {
      console.log('✅ [Accounts] Reconnection successful for:', metadata.institution?.name);
      showNotification('Reconnection successful! Refreshing balances...', 'success');
      
      const apiUrl = import.meta.env.VITE_API_URL || 'https://smart-money-tracker-09ks.onrender.com';
      
      // Exchange the public token (Plaid requires this even for update mode)
      const response = await fetch(`${apiUrl}/api/plaid/exchange_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          public_token: publicToken,
          userId: currentUser.uid 
        }),
      });

      const data = await response.json();

      if (data?.success) {
        // Refresh balances after reconnection
        await loadAccounts();
        
        // Refresh health check to remove the warning badge
        await checkConnectionHealth();
        
        showNotification('Bank connection updated successfully!', 'success');
      } else {
        showNotification('Reconnection completed but balance update failed', 'error');
      }
      
      setReconnectingItemId(null);
    } catch (error) {
      console.error('❌ [Accounts] Error completing reconnection:', error);
      showNotification('Reconnection failed. Please try again.', 'error');
      setReconnectingItemId(null);
    }
  };

  const handleReconnectExit = () => {
    console.log('🔄 [Accounts] Reconnection cancelled');
    setReconnectingItemId(null);
  };

  const getAccountTypeIcon = (type) => {
  switch ((type || 'checking').toLowerCase()) {
    case 'checking': return '🦁';
    case 'savings': return '💰';
    case 'credit': return '💳';
    case 'investment': return '📈';
    default: return '🛍️';
  }
};

  // Helper function to get account display name with fallback priority
  const getAccountDisplayName = (account) => {
    // Priority 1: official_name from Plaid (most reliable)
    if (account.official_name && account.official_name.trim()) {
      return account.official_name;
    }
    
    // Priority 2: name from Plaid
    if (account.name && account.name.trim()) {
      return account.name;
    }
    
    // Priority 3: Construct from institution_name (fallback only)
    const institutionName = account.institution_name || '';
    const accountType = account.type || 'Account';
    const mask = account.mask ? `••${account.mask}` : '';
    
    return `${institutionName} ${accountType} ${mask}`.trim() || 'Account';
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };
  
  // Helper function to calculate time since last refresh
  const getTimeSince = (timestamp) => {
    if (!timestamp) return 'never';
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  };
  
  // Helper function to check if data is stale (>10 minutes old)
  const isDataStale = (timestamp) => {
    if (!timestamp) return false;
    const minutes = Math.floor((Date.now() - timestamp) / 1000 / 60);
    return minutes > 10;
  };
  
  // Helper function to check if balance data is stale (>24 hours without update)
  const isBalanceStale = (lastBalanceUpdate) => {
    if (!lastBalanceUpdate) return false;
    const hoursSinceUpdate = (Date.now() - lastBalanceUpdate) / (1000 * 60 * 60);
    return hoursSinceUpdate > 24;
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
          <button 
            className="help-btn"
            onClick={() => setShowHelp(!showHelp)}
            title="Learn about balance types"
          >
            ❓ Help
          </button>
          {plaidAccounts.length === 0 ? (
            <PlaidLink
              onSuccess={handlePlaidSuccess}
              onExit={handlePlaidExit}
              userId={currentUser.uid}  // ✅ Correct
              buttonText="🔗 Connect Bank"
            />
          ) : (
            <>
              <PlaidLink
                onSuccess={handlePlaidSuccess}
                onExit={handlePlaidExit}
                userId={currentUser.uid}  // Add { } around every instance
                buttonText="➕ Add Another Bank"
              />
            </>
          )}
        </div>
      </div>

      {/* Plaid Connection Status Banner - Compact Version */}
      {plaidAccounts.length === 0 && !plaidStatus.hasError && (
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
              <strong>No Bank Connected</strong> - Connect your bank to automatically sync balances and transactions
            </span>
          </div>
          <PlaidLink
            onSuccess={handlePlaidSuccess}
            onExit={handlePlaidExit}
            userId={currentUser.uid}  // Add { } around every instance
            buttonText="🔗 Connect Now"
          />
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

      {plaidAccounts.length > 0 && !plaidStatus.hasError && showSuccessBanner && !bannerDismissed && (
        <div style={{
          background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
          color: '#fff',
          padding: '8px 16px',
          borderRadius: '6px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          fontSize: '13px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>✅</span>
            <span style={{ fontWeight: '500' }}>
              Bank Connected - Live balance syncing enabled
            </span>
          </div>
          <button 
            onClick={() => {
              setShowSuccessBanner(false);
              setBannerDismissed(true);
              localStorage.setItem('plaidBannerDismissed', 'true');
            }}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: '1px solid rgba(255,255,255,0.4)',
              color: '#fff',
              padding: '4px 8px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '500',
              whiteSpace: 'nowrap'
            }}
            title="Dismiss this message"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Help Section */}
      {showHelp && (
        <div className="help-section">
          <h3>💡 Understanding Balance Types</h3>
          <div className="help-content">
            <div className="help-item">
              <h4>🔗 Live Balance</h4>
              <p>
                Your <strong>Live Balance</strong> is the current balance from your bank, synced through Plaid. 
                This is read-only and reflects what your bank reports in real-time.
              </p>
            </div>
            <div className="help-item">
              <h4>📊 Projected Balance</h4>
              <p>
                Your <strong>Projected Balance</strong> includes your Live Balance plus any manual transactions 
                you've tracked in the app. This helps you plan ahead by accounting for:
              </p>
              <ul>
                <li>✅ Pending expenses you've logged</li>
                <li>✅ Expected income not yet deposited</li>
                <li>✅ Planned purchases and payments</li>
              </ul>
            </div>
            <div className="help-item">
              <h4>🔍 Why the difference?</h4>
              <p>
                Plaid provides read-only access to your bank data for security. Manual transactions you track 
                in the app adjust your Projected Balance to give you a better picture of your actual available funds.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="accounts-summary">
        <div className="summary-card">
          <div className="summary-header">
            <h3>Total Balances</h3>
            <div className="balance-toggle">
              <button
                className={showBalanceType === 'live' ? 'active' : ''}
                onClick={() => setShowBalanceType('live')}
              >
                Live Only
              </button>
              <button
                className={showBalanceType === 'both' ? 'active' : ''}
                onClick={() => setShowBalanceType('both')}
              >
                Both
              </button>
              <button
                className={showBalanceType === 'projected' ? 'active' : ''}
                onClick={() => setShowBalanceType('projected')}
              >
                Projected Only
              </button>
            </div>
          </div>
          <div className="balance-display">
            {(showBalanceType === 'live' || showBalanceType === 'both') && (
              <div className="balance-item">
                <span className="balance-label">🔗 Live Balance</span>
                <div className="balance-value">{formatCurrency(totalBalance)}</div>
              </div>
            )}
            {(showBalanceType === 'projected' || showBalanceType === 'both') && (
              <div className="balance-item">
                <span className="balance-label">📊 Projected Balance</span>
                <div className="balance-value projected">{formatCurrency(totalProjectedBalance)}</div>
              </div>
            )}
            {showBalanceType === 'both' && totalProjectedBalance !== totalBalance && (
              <div className="balance-difference">
                <span className="difference-label">Difference:</span>
                <span className={`difference-value ${totalProjectedBalance > totalBalance ? 'positive' : 'negative'}`}>
                  {formatBalanceDifference(getBalanceDifference(totalProjectedBalance, totalBalance))}
                </span>
              </div>
            )}
          </div>
          <small>Across {plaidAccounts.length > 0 ? plaidAccounts.length : Object.keys(accounts).filter(k => !accounts[k].isPlaid).length} accounts</small>
        </div>
      </div>

      {/* Auto-refresh Status */}
      <div className="refresh-status">
        {autoSyncing && (
          <span className="refresh-spinner" title="Auto-syncing transactions...">
            🔄 Auto-syncing transactions...
          </span>
        )}
        {syncingPlaid && !autoSyncing && (
          <span className="refresh-spinner" title="Syncing transactions...">
            🔄 Syncing transactions...
          </span>
        )}
        {isRefreshing && !autoSyncing && !syncingPlaid && (
          <span className="refresh-spinner" title="Refreshing balances...">
            🔄 Refreshing balances...
          </span>
        )}
        {lastRefresh && !autoSyncing && !syncingPlaid && !isRefreshing && (
          <span className="last-updated">
            Last updated: {getTimeSince(lastRefresh)}
          </span>
        )}
        {isDataStale(lastRefresh) && !autoSyncing && !syncingPlaid && !isRefreshing && (
          <span className="stale-warning" title="Data may be outdated - click refresh button to update">
            ⚠️ Data may be outdated
          </span>
        )}
      </div>

      <div className="accounts-grid">
        {/* Plaid-linked accounts */}
        {plaidAccounts.map((account) => {
          const liveBalance = parseFloat(account.balance) || 0;
          const projectedBalance = calculateProjectedBalance(
            account.account_id, 
            liveBalance, 
            transactions,
            account  // ✅ Pass full account object for mask/institution matching
          );
          const hasDifference = projectedBalance !== liveBalance;
          
          return (
            <div 
              key={account.account_id} 
              className="account-card plaid-account clickable-card"
              onClick={() => navigate(`/bank/${account.account_id}`)}
              style={{ cursor: 'pointer' }}
            >
              <div className="account-header">
                <div className="account-title">
                  <span className="account-icon">{getAccountTypeIcon(account.type)}</span>
                  <h3>{getAccountDisplayName(account)}</h3>
                  {/* Show "Reconnection Required" badge if this account's item needs reauth */}
                  {healthStatus?.items?.find(item => 
                    item.itemId === account.item_id && item.needsReauth
                  ) && (
                    <span style={{
                      background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
                      color: '#fff',
                      fontSize: '11px',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      marginLeft: '8px',
                      fontWeight: '600',
                      display: 'inline-block'
                    }}>
                      ⚠️ Reconnection Required
                    </span>
                  )}
                  {/* Show "Stale Data" badge if balance hasn't updated in >24 hours */}
                  {isBalanceStale(account.lastBalanceUpdate) && (
                    <span className="stale-badge" title="Balance hasn't updated in over 24 hours">
                      ⚠️ Stale Data
                    </span>
                  )}
                </div>
                <span className="account-type">{account.type} {account.mask ? `••${account.mask}` : ''}</span>
              </div>
              
              <div className="account-balances">
                {(showBalanceType === 'live' || showBalanceType === 'both') && (
  <>
    <div className="balance-row">
      <span className="balance-label" title="What you can spend (includes pending)">
        💳 Available Balance
      </span>
      <span className="balance-amount">{formatCurrency(parseFloat(account.available || liveBalance))}</span>
    </div>
    <div className="balance-row" style={{ fontSize: '0.9em', opacity: 0.8 }}>
      <span className="balance-label" title="Ledger balance (before pending)">
        📖 Current Balance
      </span>
      <span className="balance-amount">{formatCurrency(parseFloat(account.current || liveBalance))}</span>
    </div>
    {account.pending_adjustment && parseFloat(account.pending_adjustment) !== 0 && (
      <div className="balance-row" style={{ fontSize: '0.85em', opacity: 0.7 }}>
        <span className="balance-label" title="Total pending charges">
          ⏳ Pending
        </span>
        <span className="balance-amount" style={{ color: parseFloat(account.pending_adjustment) > 0 ? '#10b981' : '#f59e0b' }}>
          {formatCurrency(parseFloat(account.pending_adjustment))}
        </span>
      </div>
    )}
  </>
)}
              </div>
              
              <div className="account-actions">
                <button 
                  className={`action-btn reconnect-btn ${isBalanceStale(account.lastBalanceUpdate) ? 'stale' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReconnectAccount(account.item_id);
                  }}
                  disabled={saving}
                  title={isBalanceStale(account.lastBalanceUpdate) 
                    ? "⚠️ Balance is stale - click to refresh connection" 
                    : "Refresh bank connection and update balance"}
                >
                  🔄 Reconnect
                </button>
                <button 
                  className="action-btn delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteModal(account.account_id);
                  }}
                  disabled={saving}
                  title="Remove this account from the app"
                >
                  🗑️ Delete
                </button>
              </div>
            </div>
          );
        })}

        {/* Manual accounts (hidden if Plaid accounts exist for fully automated flow) */}
        {plaidAccounts.length === 0 && Object.entries(accounts)
          .filter(([, account]) => !account.isPlaid)
          .map(([key, account]) => {
            const liveBalance = parseFloat(account.balance) || 0;
            const projectedBalance = calculateProjectedBalance(
              key, 
              liveBalance, 
              transactions,
              account  // ✅ Pass full account object for mask/institution matching
            );
            const hasDifference = projectedBalance !== liveBalance;
            
            return (
              <div key={key} className="account-card">
                <div className="account-header">
                  <div className="account-title">
                    <span className="account-icon">{getAccountTypeIcon(account.type)}</span>
                    <h3>{getAccountDisplayName(account)}</h3>
                  </div>
                  <span className="account-type">{account.type}</span>
                </div>
                
                <div className="account-balances">
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
                    <>
                      {(showBalanceType === 'live' || showBalanceType === 'both') && (
                        <div className="balance-row">
                          <span className="balance-label" title="Your manually tracked balance">
                            🔗 Live Balance
                          </span>
                          <span className="balance-amount">{formatCurrency(liveBalance)}</span>
                        </div>
                      )}
                      {(showBalanceType === 'projected' || showBalanceType === 'both') && (
                        <div className="balance-row projected">
                          <span className="balance-label" title="Live balance adjusted for manual transactions">
                            📊 Projected Balance
                          </span>
                          <span className="balance-amount">{formatCurrency(projectedBalance)}</span>
                        </div>
                      )}
                      {showBalanceType === 'both' && hasDifference && (
                        <div className="balance-row difference">
                          <small className="difference-text">
                            {formatBalanceDifference(getBalanceDifference(projectedBalance, liveBalance))}
                          </small>
                        </div>
                      )}
                    </>
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
            );
          })}
        
        {Object.keys(accounts).filter(k => !accounts[k].isPlaid).length === 0 && plaidAccounts.length === 0 && !loading && (
          <div className="no-accounts">
            <h3>No Accounts Yet</h3>
            <p>Connect your bank account to get started with live balances!</p>
            <PlaidLink
              onSuccess={handlePlaidSuccess}
              onExit={handlePlaidExit}
              userId={currentUser.uid}  // Add { } around every instance
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
              <p>Are you sure you want to delete <strong>
                {showDeleteModal ? 
                  getAccountDisplayName(
                    accounts[showDeleteModal] || 
                    plaidAccounts.find(acc => acc.account_id === showDeleteModal) || 
                    {}
                  ) : 
                  'this account'}
              </strong>?</p>
              <p className="warning">This action cannot be undone.</p>
              {plaidAccounts.find(acc => acc.account_id === showDeleteModal) && (
                <p style={{ color: '#ccc', fontSize: '0.9rem', marginTop: '10px' }}>
                  Note: This will remove the account from your app but won't close your actual bank account.
                </p>
              )}
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

      {/* Plaid Error Modal */}
      <PlaidErrorModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        onRetry={() => {
          setShowErrorModal(false);
          checkPlaidConnection();
        }}
      />

      {/* PlaidLink for reconnection flow - renders nothing but auto-opens dialog */}
      {reconnectingItemId && (
        <PlaidLink
          onSuccess={handleReconnectSuccess}
          onExit={handleReconnectExit}
          userId={currentUser.uid}
          mode="update"
          itemId={reconnectingItemId}
          buttonText="Reconnect"
          autoOpen={true}
        />
      )}
    </div>
  );
};

export default Accounts;
