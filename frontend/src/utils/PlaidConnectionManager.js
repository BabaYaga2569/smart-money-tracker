// PlaidConnectionManager.js - Centralized Plaid connection status and error handling

/**
 * Manages Plaid connection state and provides unified status checking
 * across all pages to prevent conflicting status indicators.
 */
class PlaidConnectionManager {
  constructor() {
    this.connectionState = {
      hasToken: false,
      hasAccounts: false,
      isApiWorking: null, // null = unknown, true = working, false = error
      lastChecked: null,
      error: null,
      errorType: null // 'cors', 'network', 'api', 'auth', 'config'
    };
    this.listeners = [];
    
    // Enable diagnostic logging
    this.enableDiagnostics = true;
  }

  /**
   * Log diagnostic information
   * @private
   */
  _log(level, message, data = {}) {
    if (!this.enableDiagnostics) return;
    
    const timestamp = new Date().toISOString();
    const prefix = `[PlaidConnectionManager] [${timestamp}]`;
    
    if (level === 'error') {
      console.error(`${prefix} ${message}`, data);
    } else if (level === 'warn') {
      console.warn(`${prefix} ${message}`, data);
    } else {
      console.log(`${prefix} ${message}`, data);
    }
  }

  /**
   * Get current connection status
   * @returns {Object} Connection state
   */
  getStatus() {
    return { ...this.connectionState };
  }

  /**
   * Check if Plaid is truly connected and working
   * @returns {boolean} True only if token exists AND API is working AND has accounts
   */
  isFullyConnected() {
    return this.connectionState.hasToken && 
           this.connectionState.isApiWorking === true && 
           this.connectionState.hasAccounts;
  }

  /**
   * Check if token exists (basic check)
   * @returns {boolean}
   */
  hasAccessToken() {
    return this.connectionState.hasToken;
  }

  /**
   * Check Plaid connection comprehensively
   * Note: Access tokens are now stored securely server-side in Firestore.
   * This method checks if user has plaidAccounts configured.
   * @param {boolean} forceRefresh - Force a fresh check even if recently checked
   * @returns {Promise<Object>} Connection status with details
   */
  async checkConnection(forceRefresh = false) {
    this._log('info', 'Checking Plaid connection', { forceRefresh });
    
    // Use cached result if checked within last 30 seconds
    if (!forceRefresh && this.connectionState.lastChecked) {
      const timeSinceCheck = Date.now() - this.connectionState.lastChecked;
      if (timeSinceCheck < 30000) {
        this._log('info', 'Using cached connection status', { 
          timeSinceCheck: `${Math.round(timeSinceCheck / 1000)}s ago`,
          status: this.connectionState
        });
        return this.getStatus();
      }
    }

    // Connection status is now based on plaidAccounts in Firestore
    // hasToken is set to true if hasAccounts is true (implies credentials exist server-side)
    this.connectionState.lastChecked = Date.now();
    
    // If we have accounts, assume credentials exist and API is working
    if (this.connectionState.hasAccounts) {
      this.connectionState.hasToken = true;
      this.connectionState.isApiWorking = true;
      this.connectionState.error = null;
      this.connectionState.errorType = null;
      this._log('info', 'User has Plaid accounts configured');
    } else {
      this.connectionState.hasToken = false;
      this.connectionState.isApiWorking = null;
      this.connectionState.error = null;
      this.connectionState.errorType = null;
      this._log('info', 'No Plaid accounts found');
    }

    this.notifyListeners();
    return this.getStatus();
  }

  /**
   * Set Plaid accounts from Firebase (for pages that load accounts independently)
   * @param {Array} accounts - Array of Plaid accounts
   */
  setPlaidAccounts(accounts) {
    const hasAccounts = Array.isArray(accounts) && accounts.length > 0;
    
    // Only update if there's a change
    if (this.connectionState.hasAccounts !== hasAccounts) {
      this.connectionState.hasAccounts = hasAccounts;
      
      // If we have accounts in Firebase, assume API was working when they were synced
      if (hasAccounts && this.connectionState.hasToken) {
        this.connectionState.isApiWorking = true;
        this.connectionState.error = null;
        this.connectionState.errorType = null;
      }
      
      this.notifyListeners();
    }
  }

  /**
   * Clear Plaid connection (e.g., when user disconnects)
   * Note: Access tokens are now stored server-side only
   */
  clearConnection() {
    this.connectionState = {
      hasToken: false,
      hasAccounts: false,
      isApiWorking: null,
      lastChecked: Date.now(),
      error: null,
      errorType: null
    };
    this.notifyListeners();
  }

  /**
   * Set access token (when user connects Plaid)
   * Note: This method is now deprecated as tokens are stored server-side only.
   * Use setPlaidAccounts() instead.
   * @deprecated
   * @param {string} token - Plaid access token (no longer used)
   */
  setAccessToken(token) {
    // Legacy method - tokens are now stored server-side only
    console.warn('[PlaidConnectionManager] setAccessToken is deprecated. Tokens are stored server-side.');
    this.connectionState.hasToken = true;
    this.connectionState.lastChecked = null; // Force recheck
    this.notifyListeners();
  }

  /**
   * Get user-friendly error message
   * @returns {string|null}
   */
  getErrorMessage() {
    if (!this.connectionState.error) {
      return null;
    }

    const { errorType, error } = this.connectionState;

    switch (errorType) {
      case 'cors':
        return 'Unable to connect to Plaid API. This may be a CORS configuration issue. Please contact support.';
      case 'network':
        return 'Network connection issue. Please check your internet connection and try again.';
      case 'api':
        return 'Plaid API is currently unavailable. Please try again later.';
      case 'auth':
        return 'Your bank connection has expired. Please reconnect your account.';
      case 'config':
        return error || 'Plaid is not fully configured. Please connect your bank account.';
      default:
        return error || 'Unknown error connecting to Plaid';
    }
  }

  /**
   * Get actionable troubleshooting steps
   * @returns {Array<string>}
   */
  getTroubleshootingSteps() {
    const { errorType } = this.connectionState;

    switch (errorType) {
      case 'cors':
        return [
          'This is typically a server configuration issue',
          'Contact support for assistance',
          'You can still use manual account management in the meantime'
        ];
      case 'network':
        return [
          'Check your internet connection',
          'Try refreshing the page',
          'If the problem persists, the Plaid API may be down'
        ];
      case 'api':
        return [
          'The Plaid API service may be experiencing issues',
          'Try again in a few minutes',
          'Check Plaid status page for updates'
        ];
      case 'auth':
        return [
          'Your bank connection needs to be refreshed',
          'Go to Accounts page and click "Reconnect Bank"',
          'Follow the Plaid prompts to reauthorize access'
        ];
      case 'config':
        return [
          'Go to the Accounts page',
          'Click "Connect Bank" to link your bank account',
          'Follow the Plaid setup process'
        ];
      default:
        return [
          'Try refreshing the page',
          'If the problem persists, contact support'
        ];
    }
  }

  /**
   * Subscribe to connection state changes
   * @param {Function} callback - Called when state changes
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  /**
   * Notify all listeners of state change
   * @private
   */
  notifyListeners() {
    this.listeners.forEach(callback => {
      try {
        callback(this.getStatus());
      } catch (error) {
        console.error('Error in PlaidConnectionManager listener:', error);
      }
    });
  }
}

// Export singleton instance
export default new PlaidConnectionManager();

