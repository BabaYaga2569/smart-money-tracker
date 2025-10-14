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

const Accounts = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
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

 // eslint-disable-next-line react-hooks/exhaustive-deps
 useEffect(() => {
  // Load immediately - don't wait for Plaid
  loadAccountsAndTransactions();
  
  // Check Plaid in background (non-blocking)
  checkPlaidConnection().catch(err => {
    console.error('Plaid check failed:', err);
  });
  
  // Check connection health on page load
  checkConnectionHealth().catch(err => {
    console.error('Health check failed:', err);
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
}, []);

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

  // Local calculateProjectedBalance with comprehensive logging
  // This overrides the imported function to provide debugging capabilities
  const calculateProjectedBalance = (accountId, liveBalance, transactionsList) => {
    console.log(`[ProjectedBalance] Calculating for account: ${accountId}`);
    
    if (!transactionsList || transactionsList.length === 0) {
      console.log(`[ProjectedBalance] No transactions, projected = live: $${liveBalance}`);
      return liveBalance;
    }

    // Filter for pending transactions for this specific account
    const pendingTxs = transactionsList.filter(tx => {
      const txAccountId = tx.account_id || tx.account;
      return tx.pending === true && txAccountId === accountId;
    });

    console.log(`[ProjectedBalance] Found ${pendingTxs.length} pending transactions for account ${accountId}`);

    if (pendingTxs.length === 0) {
      console.log(`[ProjectedBalance] No pending transactions, projected = live: $${liveBalance}`);
      return liveBalance;
    }

    // Calculate total pending amount
    const pendingTotal = pendingTxs.reduce((sum, tx) => {
      const amount = Math.abs(parseFloat(tx.amount) || 0);
      console.log(`[ProjectedBalance] Pending tx: ${tx.merchant_name || tx.name}, Amount: $${amount}`);
      return sum + amount;
    }, 0);

    const projected = liveBalance - pendingTotal;
    console.log(`[ProjectedBalance] Live: $${liveBalance}, Pending: $${pendingTotal}, Projected: $${projected}`);
    
    return projected;
  };

  // ✅ FIXED - Auto-sync effect with direct Firebase query
  // Real-time transactions listener
  useEffect(() => {
    if (!currentUser) return;
    
    console.log('📡 [Accounts] Setting up dual real-time listeners...');
    
    const transactionsRef = collection(db, 'users', currentUser.uid, 'transactions');
    
    // Query 1: Get most recent 100 transactions
    const recentQuery = query(
      transactionsRef, orderBy('timestamp', 'desc'), limit(100));
    
    // Query 2: Get ALL pending transactions (critical for projected balance accuracy)
    // This ensures we never miss pending transactions regardless of date
    const pendingQuery = query(
      transactionsRef, 
      where('pending', '==', true)
    );
    
    // Combined transaction map to merge results and deduplicate
    const transactionMap = new Map();
    
    // Subscribe to recent transactions
    const unsubscribeRecent = onSnapshot(
      recentQuery,
      (snapshot) => {
        snapshot.docs.forEach(doc => {
          transactionMap.set(doc.id, {
            id: doc.id,
            ...doc.data()
          });
        });
        
        // Update state with merged transactions
        const mergedTxs = Array.from(transactionMap.values());
        console.log('✅ [Accounts] Recent transactions update:', snapshot.docs.length, 'transactions');
        console.log('✅ [Accounts] Total unique transactions:', mergedTxs.length);
        setTransactions(mergedTxs);
      },
      (error) => {
        console.error('❌ [Accounts] Recent listener error:', error);
      }
    );
    
    // Subscribe to pending transactions
    const unsubscribePending = onSnapshot(
      pendingQuery,
      (snapshot) => {
        snapshot.docs.forEach(doc => {
          transactionMap.set(doc.id, {
            id: doc.id,
            ...doc.data()
          });
        });
        
        // Update state with merged transactions
        const mergedTxs = Array.from(transactionMap.values());
        console.log('✅ [Accounts] Pending transactions update:', snapshot.docs.length, 'pending');
        console.log('✅ [Accounts] Total unique transactions:', mergedTxs.length);
        setTransactions(mergedTxs);
      },
      (error) => {
        console.error('❌ [Accounts] Pending listener error:', error);
      }
    );

    return () => {
      console.log('🔌 [Accounts] Cleaning up listeners');
      unsubscribeRecent();
      unsubscribePending();
    };
  }, [currentUser]);

  // ✅ FIXED - Auto-sync effect with direct Firebase query
  useEffect(() => {
    const autoSyncOnStartup = async () => {
      if (!currentUser) return;
      
      try {
        // ✅ Query Firebase directly instead of checking React state
        const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
        const settingsDocSnap = await getDoc(settingsDocRef);
        
        if (settingsDocSnap.exists()) {
          const data = settingsDocSnap.data();
          const plaidAccountsList = data.plaidAccounts || [];
          
          if (plaidAccountsList.length === 0) {
            console.log('[AutoSync] No Plaid accounts in Firebase, skipping auto-sync');
            return;
          }
          
          console.log(`[AutoSync] Found ${plaidAccountsList.length} Plaid accounts in Firebase`);
          
          // Check last sync timestamp
          const lastSync = localStorage.getItem('lastPlaidSync');
          const now = Date.now();
          const FIVE_MINUTES = 5 * 60 * 1000;
          
          if (!lastSync || (now - parseInt(lastSync)) > FIVE_MINUTES) {
            console.log('[AutoSync] Data stale, triggering auto-sync...');
            setAutoSyncing(true);
            
            await syncPlaidTransactions();
            
            localStorage.setItem('lastPlaidSync', now.toString());
            console.log('[AutoSync] Complete');
          } else {
            const minutesAgo = Math.floor((now - parseInt(lastSync)) / (60 * 1000));
            console.log(`[AutoSync] Data fresh (synced ${minutesAgo} min ago), skipping sync`);
          }
        } else {
          console.log('[AutoSync] No settings document found in Firebase');
        }
      } catch (error) {
        console.error('[AutoSync] Error:', error);
      } finally {
        setAutoSyncing(false);
      }
    };
    
    if (currentUser) {
      autoSyncOnStartup();
    }
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

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
          : 'https://smart-money-tracker-e94f5c6a52ea.herokuapp.com');

      console.log('🔄 [Plaid Sync] Syncing transactions from backend:', backendUrl);
      
      const response = await fetch(`${backendUrl}/api/plaid/sync_transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: currentUser.uid
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to sync transactions');
      }

      const data = await response.json();
      console.log('✅ [Plaid Sync] Transactions synced:', data);

      // Update last sync timestamp
      localStorage.setItem('lastPlaidSync', Date.now().toString());

      // Success notification
      const added = data.added || 0;
      const modified = data.modified || 0;
      const removed = data.removed || 0;
      
      if (added > 0 || modified > 0 || removed > 0) {
        showNotification(
          `Synced: ${added} new, ${modified} updated, ${removed} removed`, 
          'success'
        );
      } else {
        showNotification('No new transactions found', 'success');
      }

      // Reload accounts to get fresh balances
      await loadAccountsAndTransactions();

    } catch (error) {
      console.error('❌ [Plaid Sync] Error:', error);
      showNotification(
        error.message || 'Failed to sync transactions. Please try again.', 
        'error'
      );
    } finally {
      setSyncingPlaid(false);
    }
  };

  const loadAccountsAndTransactions = async () => {
    if (!currentUser) return;
    
    try {
      setLoading(true);
      
      // Load accounts from Plaid API first
      await loadAccounts();
      
    } catch (error) {
      console.error('Error loading accounts and transactions:', error);
      showNotification('Error loading data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadAccounts = async () => {
    console.log('🔄 [loadAccounts] Starting account load...');
    
    try {
      // Always try API first with short timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
      
      const backendUrl = import.meta.env.VITE_API_URL || 
        (window.location.hostname === 'localhost' 
          ? 'http://localhost:5000' 
          : 'https://smart-money-tracker-e94f5c6a52ea.herokuapp.com');

      console.log('📡 [loadAccounts] Fetching from API:', `${backendUrl}/api/plaid/accounts`);
      
      const response = await fetch(`${backendUrl}/api/plaid/accounts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: currentUser.uid
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      console.log('📊 [loadAccounts] API response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ [loadAccounts] API data received:', data);
        
        // Check if API explicitly says no accounts
        if (data?.success === false) {
          console.log('ℹ️ [loadAccounts] API returned success=false, falling back to Firebase');
          await loadFirebaseAccounts();
          return;
        }
        
        // Parse accounts from API response
        const accountsMap = {};
        const accountsList = data?.accounts || data;
        
        if (Array.isArray(accountsList) && accountsList.length > 0) {
          accountsList.forEach(account => {
            if (!account) return;
            
            const accountId = account?.account_id || account?.id || account?._id;
            if (!accountId) {
              console.warn('Account missing ID, skipping:', account);
              return;
            }
            
            let balance = 0;
            if (account?.balances) {
              balance = account.balances?.current || account.balances?.available || 0;
            } else if (account?.current_balance !== undefined) {
              balance = account.current_balance;
            } else if (account?.balance !== undefined) {
              balance = account.balance;
            }
            
            accountsMap[accountId] = {
              name: account?.name,
              official_name: account?.official_name,
              type: account?.subtype || account?.type || 'checking',
              balance: balance.toString(),
              mask: account?.mask || '',
              institution_name: account?.institution_name || '',
              institution: account?.institution_name || ''
            };
          });
          
          setAccounts(accountsMap);
          console.log('✅ [loadAccounts] Set accounts from API:', Object.keys(accountsMap).length);
          
          // Convert to plaidAccounts format
          const plaidAccountsList = accountsList.map(acc => ({
            account_id: acc.account_id,
            name: acc.name,
            official_name: acc.official_name,
            mask: acc.mask,
            type: acc.type,
            subtype: acc.subtype,
            balance: acc.balances?.current || acc.balances?.available || 0,
            institution_name: acc.institution_name,
            item_id: acc.item_id
          }));
          
          setPlaidAccounts(plaidAccountsList);
          
          // Calculate total balance
          const total = plaidAccountsList.reduce((sum, acc) => {
            return sum + (parseFloat(acc.balance) || 0);
          }, 0);
          setTotalBalance(total);
          
        } else {
          console.log('⚠️ [loadAccounts] No accounts from API, falling back to Firebase');
          await loadFirebaseAccounts();
        }
      } else if (response.status === 404) {
        console.log('ℹ️ [loadAccounts] API endpoint not available (404), falling back to Firebase');
        await loadFirebaseAccounts();
      } else {
        console.warn(`⚠️ [loadAccounts] API returned ${response.status}, falling back to Firebase`);
        await loadFirebaseAccounts();
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.warn('⏰ [loadAccounts] API request timed out, using Firebase');
      } else if (error.name !== 'TypeError') {
        console.warn('⚠️ [loadAccounts] API unavailable, using Firebase:', error.message);
      }
      await loadFirebaseAccounts();
    }
  };

  const loadFirebaseAccounts = async () => {
    console.log('🔄 [loadFirebaseAccounts] Loading from Firebase...');
    try {
      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      const settingsDocSnap = await getDoc(settingsDocRef);
      
      if (settingsDocSnap.exists()) {
        const data = settingsDocSnap.data();
        const plaidAccountsList = data.plaidAccounts || [];
        const bankAccounts = data.bankAccounts || {};
        
        console.log('📊 [loadFirebaseAccounts] Firebase data:', {
          plaidAccounts: plaidAccountsList.length,
          bankAccounts: Object.keys(bankAccounts).length
        });
        
        PlaidConnectionManager.setPlaidAccounts(plaidAccountsList);
        
        if (plaidAccountsList.length > 0) {
          const accountsMap = {};
          plaidAccountsList.forEach(account => {
            accountsMap[account.account_id] = {
              name: account.official_name || account.name,
              type: account.type,
              balance: account.balance,
              mask: account.mask || '',
              institution_name: account.institution_name || '',
              institution: account.institution_name || ''
            };
          });
          
          setAccounts(accountsMap);
          setPlaidAccounts(plaidAccountsList);
          
          const total = plaidAccountsList.reduce((sum, acc) => {
            return sum + (parseFloat(acc.balance) || 0);
          }, 0);
          setTotalBalance(total);
          
        } else {
          setAccounts(bankAccounts);
          const total = Object.values(bankAccounts).reduce((sum, acc) => {
            return sum + (parseFloat(acc.balance) || 0);
          }, 0);
          setTotalBalance(total);
        }
      }
    } catch (error) {
      console.error('❌ [loadFirebaseAccounts] Error:', error);
    }
  };

  const checkPlaidConnection = async () => {
    try {
      await PlaidConnectionManager.checkConnectionStatus(currentUser.uid);
    } catch (error) {
      console.error('Error checking Plaid connection:', error);
    }
  };

  const checkConnectionHealth = async () => {
    try {
      const backendUrl = import.meta.env.VITE_API_URL || 
        (window.location.hostname === 'localhost' 
          ? 'http://localhost:5000' 
          : 'https://smart-money-tracker-e94f5c6a52ea.herokuapp.com');

      const response = await fetch(`${backendUrl}/api/health`);
      const data = await response.json();
      setHealthStatus(data);
    } catch (error) {
      console.error('Health check failed:', error);
      setHealthStatus({ status: 'unhealthy', error: error.message });
    }
  };

  const saveAccountsToFirebase = async (updatedAccounts) => {
    try {
      setSaving(true);
      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      await updateDoc(settingsDocRef, {
        ...currentData,
        bankAccounts: updatedAccounts,
        lastUpdated: new Date().toISOString()
      });
      
      setAccounts(updatedAccounts);
      
      const total = Object.values(updatedAccounts).reduce((sum, account) => {
        return sum + (parseFloat(account.balance) || 0);
      }, 0);
      setTotalBalance(total);
      
      showNotification('Account updated successfully!', 'success');
    } catch (error) {
      console.error('Error saving accounts:', error);
      showNotification('Firebase is offline - changes saved locally only', 'error');
      
      setAccounts(updatedAccounts);
      
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

      const accountToDelete = plaidAccounts.find(acc => acc.account_id === accountKey);
      
      if (accountToDelete) {
        const itemId = accountToDelete.item_id;

        if (!itemId) {
          console.error('Account does not have item_id');
          showNotification('Cannot delete account: missing item_id', 'error');
          setSaving(false);
          return;
        }

        console.log('[DELETE] Starting account deletion:', accountKey);

        const settingsDocRef = doc(db, 'users', userId, 'settings', 'personal');
        const currentDoc = await getDoc(settingsDocRef);
        const currentData = currentDoc.exists() ? currentDoc.data() : {};
        
        const updatedPlaidAccounts = (currentData.plaidAccounts || []).filter(
          acc => acc.account_id !== accountKey
        );
        
        const enrichedPlaidAccounts = updatedPlaidAccounts.map(firebaseAcc => {
          const localAcc = plaidAccounts.find(acc => acc.account_id === firebaseAcc.account_id);
          
          if (localAcc) {
            return {
              ...firebaseAcc,
              institution_name: localAcc.institution_name || firebaseAcc.institution_name || '',
              institution_id: localAcc.institution_id || firebaseAcc.institution_id || '',
              name: localAcc.name || firebaseAcc.name,
              official_name: localAcc.official_name || firebaseAcc.official_name,
              mask: localAcc.mask || firebaseAcc.mask,
              balance: firebaseAcc.balance || localAcc.balance,
            };
          }
          
          return firebaseAcc;
        });
        
        const remainingAccountsFromBank = enrichedPlaidAccounts.filter(
          acc => acc.item_id === itemId
        );
        
        if (remainingAccountsFromBank.length === 0) {
          const plaidItemsRef = collection(db, 'users', userId, 'plaid_items');
          const plaidItemsQuery = query(plaidItemsRef, where('itemId', '==', itemId));
          const plaidItemsSnapshot = await getDocs(plaidItemsQuery);
          
          const batch = writeBatch(db);
          plaidItemsSnapshot.forEach(doc => {
            batch.delete(doc.ref);
          });
          await batch.commit();
          
          console.log('[DELETE] Deleted plaid_items for', itemId);
        }

        await updateDoc(settingsDocRef, {
          ...currentData,
          plaidAccounts: enrichedPlaidAccounts,
          lastUpdated: new Date().toISOString()
        });
        
        setPlaidAccounts(enrichedPlaidAccounts);
        PlaidConnectionManager.setPlaidAccounts(enrichedPlaidAccounts);
        
        const transactionsRef = collection(db, 'users', userId, 'transactions');
        const transactionsQuery = query(transactionsRef, where('account_id', '==', accountKey));
        const transactionsSnapshot = await getDocs(transactionsQuery);
        
        const txBatch = writeBatch(db);
        transactionsSnapshot.forEach(doc => {
          txBatch.delete(doc.ref);
        });
        await txBatch.commit();
        
        console.log('[DELETE] Deleted', transactionsSnapshot.size, 'transactions');

        const newTotal = enrichedPlaidAccounts.reduce((sum, acc) => {
          return sum + (parseFloat(acc.balance) || 0);
        }, 0);
        setTotalBalance(newTotal);
        
        setShowDeleteModal(null);
        showNotification('Account deleted successfully', 'success');
        
        await loadAccountsAndTransactions();
        
      } else {
        const updatedAccounts = { ...accounts };
        delete updatedAccounts[accountKey];
        await saveAccountsToFirebase(updatedAccounts);
        setShowDeleteModal(null);
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      showNotification('Failed to delete account', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePlaidSuccess = async (publicToken, metadata) => {
    console.log('✅ Plaid Link Success:', metadata);
    
    try {
      const backendUrl = import.meta.env.VITE_API_URL || 
        (window.location.hostname === 'localhost' 
          ? 'http://localhost:5000' 
          : 'https://smart-money-tracker-e94f5c6a52ea.herokuapp.com');

      const response = await fetch(`${backendUrl}/api/plaid/exchange_public_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          publicToken: publicToken,
          userId: currentUser.uid,
          institutionName: metadata.institution.name,
          institutionId: metadata.institution.institution_id
        })
      });

      if (!response.ok) {
        throw new Error('Failed to exchange public token');
      }

      const data = await response.json();
      console.log('Token exchange response:', data);

      setShowSuccessBanner(true);
      
      await loadAccountsAndTransactions();
      
      showNotification('Bank account connected successfully!', 'success');
      
    } catch (error) {
      console.error('Error exchanging public token:', error);
      showNotification('Failed to connect bank account', 'error');
    }
  };

  const dismissBanner = () => {
    setBannerDismissed(true);
    localStorage.setItem('plaidBannerDismissed', 'true');
    setShowSuccessBanner(false);
  };

  const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getAccountIcon = (type) => {
    const typeMap = {
      checking: '💳',
      savings: '🏦',
      credit: '💰',
      investment: '📈',
      loan: '🏠'
    };
    return typeMap[type] || '🏦';
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadAccountsAndTransactions();
    setLastRefresh(Date.now());
    showNotification('Accounts refreshed', 'success');
  };

  if (loading) {
    return (
      <div className="accounts-container">
        <div className="loading-state">
          <h2>Loading accounts...</h2>
          <p>Please wait while we fetch your data</p>
        </div>
      </div>
    );
  }

  const totalAccounts = plaidAccounts.length > 0 ? plaidAccounts.length : Object.keys(accounts).length;
  const difference = getBalanceDifference(totalBalance, totalProjectedBalance);

  return (
    <div className="accounts-container">
      {notification.message && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}

      {showSuccessBanner && !bannerDismissed && (
        <div className="success-banner">
          <div className="banner-content">
            <span className="banner-icon">✅</span>
            <div className="banner-text">
              <h3>Bank Connected Successfully!</h3>
              <p>Your accounts have been synced and transactions are being imported.</p>
            </div>
            <button className="banner-close" onClick={dismissBanner}>×</button>
          </div>
        </div>
      )}

      <div className="page-header">
        <h2>Accounts</h2>
        <div className="header-actions">
          {showBalanceType !== 'projected' && (
            <div className="balance-display">
              <span className="balance-label">Live Balance</span>
              <span className="balance-amount">{formatCurrency(totalBalance)}</span>
            </div>
          )}
          
          {showBalanceType !== 'live' && (
            <div className="balance-display projected">
              <span className="balance-label">
                Projected Balance
                <button 
                  className="help-icon"
                  onClick={() => setShowHelp(!showHelp)}
                  title="What is projected balance?"
                >
                  ℹ️
                </button>
              </span>
              <span className="balance-amount">{formatCurrency(totalProjectedBalance)}</span>
              {difference.hasDifference && (
                <span className={`balance-difference ${difference.isPositive ? 'positive' : 'negative'}`}>
                  {formatBalanceDifference(difference)}
                </span>
              )}
            </div>
          )}

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

          <button 
            className="btn-refresh"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            🔄 {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          
          <PlaidLink onSuccess={handlePlaidSuccess} />
        </div>
      </div>

      {showHelp && (
        <div className="help-box">
          <h3>What is Projected Balance?</h3>
          <p>
            <strong>Projected Balance</strong> shows what your balance will be after all pending transactions clear.
            It subtracts pending charges from your current balance to give you a more accurate picture of available funds.
          </p>
          <ul>
            <li><strong>Live Balance:</strong> Your current balance as reported by your bank</li>
            <li><strong>Projected Balance:</strong> Live balance minus pending transactions</li>
          </ul>
          <button onClick={() => setShowHelp(false)}>Got it!</button>
        </div>
      )}

      {autoSyncing && (
        <div className="auto-sync-indicator">
          🔄 Auto-syncing transactions...
        </div>
      )}

      {syncingPlaid && (
        <div className="sync-indicator">
          🔄 Syncing with banks...
        </div>
      )}

      <div className="accounts-stats">
        <div className="stat-card">
          <span className="stat-label">Total Accounts</span>
          <span className="stat-value">{totalAccounts}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Active Transactions</span>
          <span className="stat-value">{transactions.length}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Pending Transactions</span>
          <span className="stat-value">
            {transactions.filter(t => t.pending).length}
          </span>
        </div>
      </div>

      <div className="accounts-list">
        {plaidAccounts.length > 0 ? (
          plaidAccounts.map((account) => {
            const projectedBalance = calculateProjectedBalance(
              account.account_id, 
              parseFloat(account.balance), 
              transactions
            );
            const accountDifference = getBalanceDifference(
              parseFloat(account.balance), 
              projectedBalance
            );

            return (
              <div key={account.account_id} className="account-card plaid-account">
                <div className="account-header">
                  <div className="account-info">
                    <span className="account-icon">{getAccountIcon(account.type)}</span>
                    <div className="account-details">
                      <h3>{account.official_name || account.name}</h3>
                      <p className="account-meta">
                        {account.institution_name} • {account.type}
                        {account.mask && ` • ••${account.mask}`}
                      </p>
                    </div>
                  </div>
                  <button
                    className="btn-delete"
                    onClick={() => setShowDeleteModal(account.account_id)}
                  >
                    🗑️
                  </button>
                </div>
                
                <div className="account-balance">
                  {(showBalanceType === 'live' || showBalanceType === 'both') && (
                    <div className="balance-item">
                      <span className="balance-label">Live Balance</span>
                      <span className="balance-value">
                        {formatCurrency(parseFloat(account.balance))}
                      </span>
                    </div>
                  )}
                  
                  {(showBalanceType === 'projected' || showBalanceType === 'both') && (
                    <div className="balance-item projected">
                      <span className="balance-label">Projected Balance</span>
                      <span className="balance-value">
                        {formatCurrency(projectedBalance)}
                        {accountDifference.hasDifference && (
                          <span className={`diff-badge ${accountDifference.isPositive ? 'positive' : 'negative'}`}>
                            {formatBalanceDifference(accountDifference)}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>

                <div className="account-actions">
                  <button
                    className="btn-view"
                    onClick={() => navigate(`/accounts/${account.account_id}`)}
                  >
                    View Details
                  </button>
                </div>
              </div>
            );
          })
        ) : Object.entries(accounts).length > 0 ? (
          Object.entries(accounts).map(([key, account]) => (
            <div key={key} className="account-card">
              <div className="account-header">
                <div className="account-info">
                  <span className="account-icon">{getAccountIcon(account.type)}</span>
                  <div className="account-details">
                    <h3>{account.name}</h3>
                    <p className="account-meta">{account.type}</p>
                  </div>
                </div>
                <button
                  className="btn-delete"
                  onClick={() => setShowDeleteModal(key)}
                >
                  🗑️
                </button>
              </div>
              
              <div className="account-balance">
                {editingAccount === key ? (
                  <div className="edit-balance">
                    <input
                      type="number"
                      step="0.01"
                      defaultValue={account.balance}
                      onBlur={(e) => updateAccountBalance(key, e.target.value)}
                      autoFocus
                    />
                    <button onClick={() => setEditingAccount(null)}>Cancel</button>
                  </div>
                ) : (
                  <>
                    <span className="balance-value">
                      {formatCurrency(parseFloat(account.balance))}
                    </span>
                    <button
                      className="btn-edit"
                      onClick={() => setEditingAccount(key)}
                    >
                      ✏️ Edit
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <p>No accounts found. Connect your bank to get started!</p>
          </div>
        )}
      </div>

      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Delete Account</h3>
            <p>Are you sure you want to delete this account? This action cannot be undone.</p>
            <div className="modal-actions">
              <button
                className="btn-cancel"
                onClick={() => setShowDeleteModal(null)}
              >
                Cancel
              </button>
              <button
                className="btn-delete"
                onClick={() => deleteAccount(showDeleteModal)}
                disabled={saving}
              >
                {saving ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showErrorModal && (
        <PlaidErrorModal
          error={plaidStatus.errorMessage}
          onClose={() => setShowErrorModal(false)}
          onReconnect={() => {
            setShowErrorModal(false);
          }}
        />
      )}
    </div>
  );
};

export default Accounts;
