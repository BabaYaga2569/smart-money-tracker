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

    // Check if access token exists
    const token = localStorage.getItem('plaid_access_token');
    this.connectionState.hasToken = !!token;
    this.connectionState.lastChecked = Date.now();
    
    this._log('info', 'Access token check', { hasToken: !!token });

    if (!token) {
      this.connectionState.isApiWorking = null;
      this.connectionState.hasAccounts = false;
      this.connectionState.error = null;
      this.connectionState.errorType = null;
      this.notifyListeners();
      return this.getStatus();
    }

    // Try to fetch accounts from API to verify connection
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'https://smart-money-tracker-09ks.onrender.com';
      
      // Validate URL before attempting to use it
      if (!apiUrl || typeof apiUrl !== 'string') {
        throw new Error('Invalid API URL configuration');
      }
      
      this._log('info', 'Testing API connectivity', { apiUrl });
      
      // Add timeout for network issues
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${apiUrl}/api/accounts`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      
      this._log('info', 'API response received', { status: response.status, ok: response.ok });

      if (response.ok) {
        let data;
        try {
          data = await response.json();
        } catch (parseError) {
          this._log('error', 'Failed to parse API response', { error: parseError.message });
          throw new Error('Invalid response from API');
        }
        
        if (data?.success === false) {
          // API responded but no accounts available
          this.connectionState.isApiWorking = true;
          this.connectionState.hasAccounts = false;
          this.connectionState.error = data?.message || 'No accounts available';
          this.connectionState.errorType = 'config';
          this._log('warn', 'API working but no accounts', { message: data?.message });
        } else {
          // Successfully got accounts
          const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
          this.connectionState.isApiWorking = true;
          this.connectionState.hasAccounts = accounts.length > 0;
          this.connectionState.error = null;
          this.connectionState.errorType = null;
          this._log('info', 'Successfully retrieved accounts', { accountCount: accounts.length });
        }
      } else if (response.status === 401) {
        // Authentication failed
        this.connectionState.isApiWorking = true;
        this.connectionState.hasAccounts = false;
        this.connectionState.error = 'Access token expired or invalid';
        this.connectionState.errorType = 'auth';
        this._log('error', 'Authentication failed', { status: 401 });
      } else {
        // Other API error
        this.connectionState.isApiWorking = false;
        this.connectionState.hasAccounts = false;
        this.connectionState.error = `API error: ${response.status}`;
        this.connectionState.errorType = 'api';
        this._log('error', 'API error', { status: response.status });
      }
    } catch (error) {
      // Network or CORS error
      if (error.name === 'AbortError') {
        this.connectionState.isApiWorking = false;
        this.connectionState.hasAccounts = false;
        this.connectionState.error = 'Connection timeout - API may be down';
        this.connectionState.errorType = 'network';
        this._log('error', 'Connection timeout', { error: error.message });
      } else if (error.message.includes('CORS') || error.message.includes('Failed to fetch')) {
        this.connectionState.isApiWorking = false;
        this.connectionState.hasAccounts = false;
        this.connectionState.error = 'Unable to connect to Plaid API (CORS or network issue)';
        this.connectionState.errorType = 'cors';
        this._log('error', 'CORS or network error', { error: error.message });
      } else {
        this.connectionState.isApiWorking = false;
        this.connectionState.hasAccounts = false;
        this.connectionState.error = error.message;
        this.connectionState.errorType = 'network';
        this._log('error', 'Network error', { error: error.message });
      }
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
   */
  clearConnection() {
    localStorage.removeItem('plaid_access_token');
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
   * @param {string} token - Plaid access token
   */
  setAccessToken(token) {
    localStorage.setItem('plaid_access_token', token);
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
