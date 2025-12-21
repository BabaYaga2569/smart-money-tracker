import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import './PaymentRulesManager.css';

/**
 * PaymentRulesManager Page
 * 
 * Manage user-defined payment rules for transaction-to-bill matching
 * Features:
 * - View all payment rules
 * - Enable/disable rules
 * - Edit rule criteria
 * - View match history
 * - Delete rules
 */
export default function PaymentRulesManager() {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState([]);
  const [expandedRule, setExpandedRule] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (currentUser) {
      loadRules();
    }
  }, [currentUser]);

  const loadRules = async () => {
    try {
      setLoading(true);
      setError(null);

      const rulesRef = collection(db, 'users', currentUser.uid, 'paymentRules');
      const q = query(rulesRef, orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);

      const rulesList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      setRules(rulesList);
    } catch (err) {
      console.error('Error loading rules:', err);
      setError('Failed to load payment rules. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleRule = async (ruleId, currentlyEnabled) => {
    try {
      const ruleRef = doc(db, 'users', currentUser.uid, 'paymentRules', ruleId);
      await updateDoc(ruleRef, {
        enabled: !currentlyEnabled
      });

      setRules(rules.map(rule =>
        rule.id === ruleId ? { ...rule, enabled: !currentlyEnabled } : rule
      ));
    } catch (err) {
      console.error('Error toggling rule:', err);
      setError('Failed to update rule. Please try again.');
    }
  };

  const deleteRule = async (ruleId) => {
    if (!confirm('Are you sure you want to delete this rule?')) {
      return;
    }

    try {
      const ruleRef = doc(db, 'users', currentUser.uid, 'paymentRules', ruleId);
      await deleteDoc(ruleRef);

      setRules(rules.filter(rule => rule.id !== ruleId));
    } catch (err) {
      console.error('Error deleting rule:', err);
      setError('Failed to delete rule. Please try again.');
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    
    if (timestamp.toDate) {
      return timestamp.toDate().toLocaleDateString();
    }
    
    if (timestamp._seconds) {
      return new Date(timestamp._seconds * 1000).toLocaleDateString();
    }
    
    return new Date(timestamp).toLocaleDateString();
  };

  const toggleExpanded = (ruleId) => {
    setExpandedRule(expandedRule === ruleId ? null : ruleId);
  };

  if (loading) {
    return (
      <div className="payment-rules-manager">
        <div className="page-header">
          <h1>⚙️ Payment Rules Manager</h1>
        </div>
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading rules...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="payment-rules-manager">
      <div className="page-header">
        <h1>⚙️ Payment Rules Manager</h1>
        <p className="subtitle">
          Manage automatic transaction-to-bill matching rules
        </p>
      </div>

      {error && (
        <div className="error-banner">
          ⚠️ {error}
        </div>
      )}

      <div className="rules-stats">
        <div className="stat-card">
          <div className="stat-value">{rules.length}</div>
          <div className="stat-label">Total Rules</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{rules.filter(r => r.enabled).length}</div>
          <div className="stat-label">Active Rules</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {rules.reduce((sum, r) => sum + (r.matchCount || 0), 0)}
          </div>
          <div className="stat-label">Total Matches</div>
        </div>
      </div>

      {rules.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <h2>No Payment Rules Yet</h2>
          <p>Create rules to automatically match transactions to bills.</p>
          <div className="empty-actions">
            <p><strong>To create a rule:</strong></p>
            <ul>
              <li>Use the "Link Transaction" button on the Bills page</li>
              <li>Run the CLI wizard: <code>node scripts/10-setup-payment-rules.js</code></li>
              <li>Manual links will auto-create rules when enabled</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="rules-list">
          {rules.map(rule => (
            <div key={rule.id} className={`rule-card ${!rule.enabled ? 'disabled' : ''}`}>
              <div className="rule-header" onClick={() => toggleExpanded(rule.id)}>
                <div className="rule-main">
                  <div className="rule-status">
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(e) => {
                          e.stopPropagation();
                          toggleRule(rule.id, rule.enabled);
                        }}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="rule-info">
                    <h3>{rule.billName}</h3>
                    <div className="rule-meta">
                      <span className="rule-badge">
                        {rule.matchCount || 0} matches
                      </span>
                      <span className="rule-badge">
                        {Math.round((rule.confidence || 0) * 100)}% confidence
                      </span>
                      <span className="rule-source">
                        {rule.source || 'manual'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="rule-actions">
                  <button
                    className="expand-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpanded(rule.id);
                    }}
                  >
                    {expandedRule === rule.id ? '▲' : '▼'}
                  </button>
                </div>
              </div>

              {expandedRule === rule.id && (
                <div className="rule-details">
                  <div className="details-section">
                    <h4>Match Criteria</h4>
                    <div className="criteria-grid">
                      {rule.matchCriteria?.amountExact && (
                        <div className="criteria-item">
                          <span className="criteria-label">Amount:</span>
                          <span className="criteria-value">
                            ${rule.matchCriteria.amountExact.toFixed(2)} 
                            (±${(rule.matchCriteria.amountTolerance || 0.50).toFixed(2)})
                          </span>
                        </div>
                      )}
                      {rule.matchCriteria?.requiredKeywords && rule.matchCriteria.requiredKeywords.length > 0 && (
                        <div className="criteria-item">
                          <span className="criteria-label">Required Keywords:</span>
                          <span className="criteria-value">
                            {rule.matchCriteria.requiredKeywords.join(', ')}
                          </span>
                        </div>
                      )}
                      {rule.matchCriteria?.optionalKeywords && rule.matchCriteria.optionalKeywords.length > 0 && (
                        <div className="criteria-item">
                          <span className="criteria-label">Optional Keywords:</span>
                          <span className="criteria-value">
                            {rule.matchCriteria.optionalKeywords.join(', ')}
                          </span>
                        </div>
                      )}
                      {rule.matchCriteria?.transactionTypes && rule.matchCriteria.transactionTypes.length > 0 && (
                        <div className="criteria-item">
                          <span className="criteria-label">Payment Types:</span>
                          <span className="criteria-value">
                            {rule.matchCriteria.transactionTypes.join(', ')}
                          </span>
                        </div>
                      )}
                      {rule.matchCriteria?.dateWindow && (
                        <div className="criteria-item">
                          <span className="criteria-label">Date Window:</span>
                          <span className="criteria-value">
                            -{rule.matchCriteria.dateWindow.daysBefore || 3} to 
                            +{rule.matchCriteria.dateWindow.daysAfter || 5} days
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {rule.examples && rule.examples.length > 0 && (
                    <div className="details-section">
                      <h4>Example Matches</h4>
                      {rule.examples.map((example, idx) => (
                        <div key={idx} className="example-item">
                          <div>{example.transactionName}</div>
                          <div className="example-meta">
                            ${Math.abs(example.amount).toFixed(2)} on {example.date}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="details-section">
                    <h4>Rule Info</h4>
                    <div className="info-grid">
                      <div className="info-item">
                        <span className="info-label">Created:</span>
                        <span className="info-value">{formatDate(rule.createdAt)}</span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Created By:</span>
                        <span className="info-value">{rule.createdBy || 'manual'}</span>
                      </div>
                      <div className="info-item">
                        <span className="info-label">Bill ID:</span>
                        <span className="info-value mono">{rule.billId}</span>
                      </div>
                    </div>
                  </div>

                  <div className="details-actions">
                    <button
                      className="btn-delete"
                      onClick={() => deleteRule(rule.id)}
                    >
                      🗑️ Delete Rule
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
