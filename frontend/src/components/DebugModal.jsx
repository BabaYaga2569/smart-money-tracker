import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import './DebugButton.css';

const DebugModal = ({ onClose }) => {
  const location = useLocation();
  const [pageState, setPageState] = useState(null);
  const [testResults, setTestResults] = useState('');

  useEffect(() => {
    // Read page state from window.__DEBUG_STATE__
    if (window.__DEBUG_STATE__) {
      setPageState(window.__DEBUG_STATE__);
    }
  }, []);

  const getCurrentPage = () => {
    const path = location.pathname;
    return path === '/' ? 'Dashboard' : path.slice(1).charAt(0).toUpperCase() + path.slice(2);
  };

  const getPageStats = () => {
    if (!pageState) return 'No state available';
    
    const stats = {};
    if (pageState.transactions) stats.transactions = pageState.transactions.length;
    if (pageState.filteredTransactions) stats.filteredTransactions = pageState.filteredTransactions.length;
    if (pageState.accounts) stats.accounts = Object.keys(pageState.accounts).length;
    if (pageState.bills) stats.bills = Array.isArray(pageState.bills) ? pageState.bills.length : 0;
    
    return Object.keys(stats).length > 0 ? JSON.stringify(stats, null, 2) : 'No stats available';
  };

  const handleShowFullState = () => {
    console.log('🔍 [DEBUG MODAL] Full Page State:', pageState);
    console.log('🔍 [DEBUG MODAL] Current Location:', location);
    setTestResults('✅ Full state logged to console. Press F12 to view.');
  };

  const handleTestAccountLookup = () => {
    if (location.pathname !== '/transactions') {
      setTestResults('⚠️ This test only works on the Transactions page.');
      return;
    }

    if (!pageState || !pageState.transactions || !pageState.accounts) {
      setTestResults('❌ No transaction or account data available.');
      return;
    }

    console.log('🧪 [DEBUG MODAL] Testing Account Lookup...');
    
    const transactions = pageState.transactions;
    const accounts = pageState.accounts;
    
    // Test first 5 transactions
    const testCount = Math.min(5, transactions.length);
    const results = [];
    
    for (let i = 0; i < testCount; i++) {
      const t = transactions[i];
      const accountMatch = accounts[t.account_id] || accounts[t.account];
      
      const result = {
        transactionId: t.id,
        description: t.description,
        account_id: t.account_id,
        account_field: t.account,
        availableAccountKeys: Object.keys(accounts),
        foundAccount: accountMatch ? accountMatch.name || accountMatch.official_name : null,
        displayName: accountMatch ? (accountMatch.name || accountMatch.official_name || 'Account').toLowerCase() : 'Account'
      };
      
      results.push(result);
      console.log(`🧪 Transaction ${i + 1}:`, result);
    }
    
    const failedLookups = results.filter(r => !r.foundAccount).length;
    const successfulLookups = results.length - failedLookups;
    
    const summary = `
✅ Tested ${results.length} transactions
✅ Successful lookups: ${successfulLookups}
❌ Failed lookups: ${failedLookups}

Account IDs in accounts object: ${Object.keys(accounts).length}
${Object.keys(accounts).map(id => `  - ${id.substring(0, 20)}...`).join('\n')}

See console (F12) for detailed results.
    `.trim();
    
    setTestResults(summary);
  };

  const handleExportPageData = () => {
    if (!pageState) {
      setTestResults('❌ No page data available to export.');
      return;
    }

    const dataStr = JSON.stringify(pageState, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `debug-${getCurrentPage().toLowerCase()}-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    setTestResults('✅ Page data exported as JSON file.');
  };

  const handleCopyToClipboard = () => {
    if (!pageState) {
      setTestResults('❌ No page data available to copy.');
      return;
    }

    const dataStr = JSON.stringify(pageState, null, 2);
    navigator.clipboard.writeText(dataStr).then(() => {
      setTestResults('✅ Page data copied to clipboard.');
    }).catch(err => {
      console.error('Failed to copy:', err);
      setTestResults('❌ Failed to copy to clipboard.');
    });
  };

  const handleOverlayClick = (e) => {
    if (e.target.classList.contains('debug-modal-overlay')) {
      onClose();
    }
  };

  return (
    <div className="debug-modal-overlay" onClick={handleOverlayClick}>
      <div className="debug-modal">
        <div className="debug-modal-header">
          <h2>🛠️ Debug Mode</h2>
          <button className="debug-modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="debug-page-info">
          <h3>📍 Current Page: {getCurrentPage()}</h3>
          <p><strong>Path:</strong> {location.pathname}</p>
          <p><strong>State Available:</strong> {pageState ? 'Yes' : 'No'}</p>
        </div>
        
        <div className="debug-info">
          <h3 style={{ color: '#00ff88', marginBottom: '12px' }}>📊 Page Stats</h3>
          <pre style={{ 
            background: 'rgba(0, 0, 0, 0.3)', 
            padding: '12px', 
            borderRadius: '6px',
            fontSize: '12px',
            color: '#ffffff',
            margin: 0
          }}>
            {getPageStats()}
          </pre>
        </div>
        
        <div className="debug-actions">
          <button className="debug-action-btn info" onClick={handleShowFullState}>
            <span className="icon">🔍</span>
            <span>Show Full State (Console)</span>
          </button>
          
          {location.pathname === '/transactions' && (
            <button className="debug-action-btn warning" onClick={handleTestAccountLookup}>
              <span className="icon">🧪</span>
              <span>Test Account Lookup</span>
            </button>
          )}
          
          <button className="debug-action-btn success" onClick={handleExportPageData}>
            <span className="icon">💾</span>
            <span>Export Page Data (JSON)</span>
          </button>
          
          <button className="debug-action-btn" onClick={handleCopyToClipboard}>
            <span className="icon">📋</span>
            <span>Copy to Clipboard</span>
          </button>
        </div>
        
        {testResults && (
          <div className="debug-test-results">
            <pre>{testResults}</pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default DebugModal;
