import { useState, useEffect, useRef } from 'react';

/**
 * Smart Background Balance Sync Hook
 * 
 * Automatically syncs Plaid account balances in the background using:
 * - Firebase Firestore for last sync timestamp tracking
 * - Visibility API to sync when user returns to the page
 * - Network status detection to avoid syncing when offline
 * - Rate limiting with MIN_REFRESH_INTERVAL (2 min) and AUTO_REFRESH_INTERVAL (5 min)
 * - Silent error handling for production reliability
 * 
 * @param {string} userId - Current user's ID
 * @returns {{ isSyncing: boolean }} - Sync status
 */
export function useSmartBalanceSync(userId) {
  const [isSyncing, setIsSyncing] = useState(false);
  const lastSyncAttemptRef = useRef(0);
  const autoRefreshTimerRef = useRef(null);
  
  // Constants
  const MIN_REFRESH_INTERVAL = 2 * 60 * 1000; // 2 minutes - minimum time between any syncs
  const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes - automatic background refresh
  const QUOTA_BACKOFF_MS = 30 * 60 * 1000;
  const QUOTA_BACKOFF_KEY = 'smt_firestore_quota_backoff_until';
  const BALANCE_SYNC_KEY = `smt_last_balance_sync_${userId || 'anonymous'}`;
  const API_URL = import.meta.env.VITE_API_URL || 'https://smart-money-tracker-09ks.onrender.com';

  // Background-refresh timing is a browser concern, not canonical financial
  // state. Keep it in localStorage so every five-minute check does not burn a
  // Firestore read and write just to decide whether to refresh.
  const getLastSyncTime = async () => {
    const value = Number(localStorage.getItem(BALANCE_SYNC_KEY) || 0);
    return Number.isFinite(value) ? value : 0;
  };

  const updateLastSyncTime = async (timestamp) => {
    localStorage.setItem(BALANCE_SYNC_KEY, String(timestamp));
  };

  const quotaBackoffActive = () => {
    const until = Number(localStorage.getItem(QUOTA_BACKOFF_KEY) || 0);
    return Number.isFinite(until) && Date.now() < until;
  };

  const startQuotaBackoff = () => {
    localStorage.setItem(
      QUOTA_BACKOFF_KEY,
      String(Date.now() + QUOTA_BACKOFF_MS)
    );
  };

  /**
   * Check if page is visible (not in background)
   */
  const isPageVisible = () => {
    return document.visibilityState === 'visible';
  };

  /**
   * Check if browser is online
   */
  const isOnline = () => {
    return navigator.onLine;
  };

  /**
   * Perform the actual balance sync
   */
  const syncBalances = async (reason = 'unknown') => {
    if (!userId) {
      console.log('[BalanceSync] No userId, skipping sync');
      return;
    }

    // Check network status
    if (!isOnline()) {
      console.log('[BalanceSync] Offline, skipping sync');
      return;
    }

    if (quotaBackoffActive()) {
      console.log('[BalanceSync] Firestore quota backoff active, skipping background refresh');
      return;
    }

    // Check rate limiting
    const now = Date.now();
    const timeSinceLastAttempt = now - lastSyncAttemptRef.current;
    
    if (timeSinceLastAttempt < MIN_REFRESH_INTERVAL) {
      const waitTime = Math.ceil((MIN_REFRESH_INTERVAL - timeSinceLastAttempt) / 1000);
      console.log(`[BalanceSync] Rate limited, wait ${waitTime}s before next sync`);
      return;
    }

    // Check if we need to sync based on Firestore timestamp
    const lastSync = await getLastSyncTime();
    const timeSinceLastSync = now - lastSync;
    
    if (timeSinceLastSync < MIN_REFRESH_INTERVAL) {
      console.log(`[BalanceSync] Data is fresh (synced ${Math.floor(timeSinceLastSync / 1000)}s ago), skipping`);
      return;
    }

    console.log(`[BalanceSync] Starting sync... (reason: ${reason}, last sync: ${Math.floor(timeSinceLastSync / 1000)}s ago)`);
    
    setIsSyncing(true);
    lastSyncAttemptRef.current = now;

    try {
      const response = await fetch(`${API_URL}/api/plaid/get_balances`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData.code === 'FIRESTORE_QUOTA_EXCEEDED') {
          startQuotaBackoff();
          console.warn('[BalanceSync] Firestore quota reached; background refresh paused temporarily');
          return;
        }
        console.error('[BalanceSync] Sync failed:', response.status, errorData);
        return;
      }

      const data = await response.json();
      localStorage.removeItem(QUOTA_BACKOFF_KEY);
      console.log(`[BalanceSync] ✅ Sync successful - ${data.accounts?.length || 0} accounts updated`);
      
      await updateLastSyncTime(now);
      
    } catch (error) {
      // Silent error handling - log but don't throw
      console.error('[BalanceSync] Error during sync:', error.message);
    } finally {
      setIsSyncing(false);
    }
  };

  /**
   * Handle visibility change (user returns to tab)
   */
  const handleVisibilityChange = () => {
    if (isPageVisible()) {
      console.log('[BalanceSync] Page became visible, checking if sync needed');
      syncBalances('visibility-change');
    } else {
      console.log('[BalanceSync] Page hidden, pausing auto-refresh');
    }
  };

  /**
   * Handle online/offline status changes
   */
  const handleOnlineStatus = () => {
    if (isOnline()) {
      console.log('[BalanceSync] Network restored, checking if sync needed');
      syncBalances('network-restored');
    } else {
      console.log('[BalanceSync] Network lost, pausing sync');
    }
  };

  /**
   * Setup auto-refresh interval
   */
  useEffect(() => {
    if (!userId) return;

    console.log('[BalanceSync] Hook initialized for user:', userId);

    // Initial sync on mount (if page is visible and online)
    if (isPageVisible() && isOnline()) {
      syncBalances('initial-mount');
    }

    // Setup auto-refresh interval (runs every 5 minutes)
    const setupAutoRefresh = () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
      }

      autoRefreshTimerRef.current = setInterval(() => {
        if (isPageVisible() && isOnline()) {
          console.log('[BalanceSync] Auto-refresh timer triggered');
          syncBalances('auto-refresh-interval');
        }
      }, AUTO_REFRESH_INTERVAL);

      console.log('[BalanceSync] Auto-refresh enabled (every 5 minutes)');
    };

    setupAutoRefresh();

    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Listen for online/offline events
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOnlineStatus);

    // Cleanup
    return () => {
      console.log('[BalanceSync] Hook cleanup');
      
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
      }
      
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnlineStatus);
      window.removeEventListener('offline', handleOnlineStatus);
    };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { isSyncing };
}
