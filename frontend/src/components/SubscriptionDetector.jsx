import React, { useState } from 'react';
import { collection, addDoc, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { removeDetection, getAllDetections, getDismissedIds } from '../utils/detectionStorage';
import { analyzeTransactionsForRecurring, getTypeFromCategory, RECURRING_BILL_CATEGORIES } from '../utils/recurringDetection';
import './SubscriptionDetector.css';

/**
 * Auto-detect and auto-add recurring bills from transactions
 * @param {string} userId - User ID
 * @param {object} db - Firebase database instance
 * @returns {object} - Result with added bills count
 */
export const detectAndAutoAddRecurringBills = async (userId, db) => {
  try {
    // Get all transactions from Firebase
    const transactionsRef = collection(db, 'users', userId, 'transactions');
    const transactionsSnap = await getDocs(transactionsRef);
    const transactions = transactionsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Analyze transactions for recurring patterns
    const detectedBills = analyzeTransactionsForRecurring(transactions);
    
    // Filter for recurring bills only (not subscriptions)
    const recurringBills = detectedBills.filter(bill => bill.type === 'recurring_bill');
    
    // Get existing subscriptions to avoid duplicates
    const subscriptionsRef = collection(db, 'users', userId, 'subscriptions');
    const existingSnap = await getDocs(subscriptionsRef);
    const existingNames = new Set(
      existingSnap.docs.map(doc => doc.data().name?.toLowerCase())
    );
    
    // Auto-add recurring bills that don't already exist
    let addedCount = 0;
    for (const bill of recurringBills) {
      if (!existingNames.has(bill.name?.toLowerCase())) {
        await addDoc(subscriptionsRef, {
          ...bill,
          autoDetected: true
        });
        addedCount++;
      }
    }
    
    return {
      success: true,
      addedCount,
      totalDetected: recurringBills.length
    };
  } catch (error) {
    console.error('Error in auto-detection:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

const SubscriptionDetector = ({ onClose, onSubscriptionAdded }) => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState([]);
  const [newPatterns, setNewPatterns] = useState([]);
  const [scannedCount, setScannedCount] = useState(0);
  const [error, setError] = useState(null);
  const [editingKey, setEditingKey] = useState(null);
  const [editedData, setEditedData] = useState({});

  const detectSubscriptions = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'https://smart-money-tracker-09ks.onrender.com'}/api/subscriptions/detect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId: currentUser.uid }),
      });

      if (!response.ok) {
        throw new Error('Failed to detect subscriptions');
      }

      const data = await response.json();
      setMatches(data.matches || []);
      setNewPatterns(data.newPatterns || data.detected || []);
      setScannedCount(data.scannedTransactions || 0);
    } catch (err) {
      console.error('Detection error:', err);
      setError('Failed to analyze transactions. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [currentUser.uid]);

  // Run detection when component mounts
  React.useEffect(() => {
    detectSubscriptions();
  }, [detectSubscriptions]);

  const handleEdit = (key) => {
    setEditingKey(key);
    // Extract item from either matches or newPatterns
    const item = key.startsWith('match-') 
      ? matches[parseInt(key.split('-')[1])]
      : newPatterns[parseInt(key.split('-')[1])];
    setEditedData({
      category: item.category,
      essential: false
    });
  };

  const handleCategoryChange = (value) => {
    setEditedData(prev => ({ ...prev, category: value }));
  };

  const handleEssentialChange = (value) => {
    setEditedData(prev => ({ ...prev, essential: value }));
  };

  // Link a detected pattern to an existing subscription
  const handleLinkToExisting = async (detectedPattern, listKey) => {
    try {
      if (!detectedPattern.matchedSubscription) return;
      
      const subscriptionRef = doc(db, 'users', currentUser.uid, 'subscriptions', detectedPattern.matchedSubscription.id);
      
      // Update existing subscription with linked transaction data
      await updateDoc(subscriptionRef, {
        linkedToTransactions: true,
        linkedPattern: {
          merchantName: detectedPattern.merchantName,
          expectedAmount: detectedPattern.amount,
          expectedInterval: detectedPattern.billingCycle === 'Monthly' ? 30 : 
                           detectedPattern.billingCycle === 'Bi-Monthly' ? 60 :
                           detectedPattern.billingCycle === 'Quarterly' ? 90 : 365,
          transactionIds: detectedPattern.transactionIds || [],
          lastDetected: new Date().toISOString(),
          confidence: detectedPattern.confidence
        },
        autoDetect: {
          autoMarkPaid: true,
          autoUpdateAmount: true,
          autoCalculateDueDate: true
        },
        linkedTransactionIds: detectedPattern.transactionIds || [],
        updatedAt: new Date().toISOString()
      });

      // Remove from matches list
      setMatches(prev => prev.filter((_, i) => listKey !== `match-${i}`));
      
      if (onSubscriptionAdded) {
        onSubscriptionAdded();
      }
    } catch (err) {
      console.error('Error linking to existing subscription:', err);
      alert('Failed to link subscription. Please try again.');
    }
  };

  // Add a detected pattern as a separate new subscription
  const handleAddAsSeparate = async (detectedSub, listKey) => {
    try {
      const isMatch = listKey.startsWith('match-');
      const category = editingKey === listKey ? editedData.category : detectedSub.category;
      const essential = editingKey === listKey ? editedData.essential : false;

      // Determine type based on category
      const type = getTypeFromCategory(category);

      const subscriptionData = {
        name: detectedSub.merchantName,
        cost: detectedSub.amount,
        billingCycle: detectedSub.billingCycle,
        category: category,
        essential: essential,
        type: type,
        nextRenewal: detectedSub.nextRenewal,
        status: 'active',
        autoRenew: true,
        notes: `Auto-detected from ${detectedSub.occurrences} transactions (${detectedSub.confidence}% confidence)`,
        linkedTransactionIds: detectedSub.transactionIds || [],
        linkedToTransactions: true,
        linkedPattern: {
          merchantName: detectedSub.merchantName,
          expectedAmount: detectedSub.amount,
          expectedInterval: detectedSub.billingCycle === 'Monthly' ? 30 : 
                           detectedSub.billingCycle === 'Bi-Monthly' ? 60 :
                           detectedSub.billingCycle === 'Quarterly' ? 90 : 365,
          transactionIds: detectedSub.transactionIds || [],
          lastDetected: new Date().toISOString(),
          confidence: detectedSub.confidence
        },
        autoDetect: {
          autoMarkPaid: true,
          autoUpdateAmount: true,
          autoCalculateDueDate: true
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const subscriptionsRef = collection(db, 'users', currentUser.uid, 'subscriptions');
      await addDoc(subscriptionsRef, subscriptionData);

      // Remove from appropriate list
      if (isMatch) {
        setMatches(prev => prev.filter((_, i) => listKey !== `match-${i}`));
      } else {
        setNewPatterns(prev => prev.filter((_, i) => listKey !== `new-${i}`));
      }
      setEditingKey(null);
      
      if (onSubscriptionAdded) {
        onSubscriptionAdded();
      }
    } catch (err) {
      console.error('Error adding subscription:', err);
      alert('Failed to add subscription. Please try again.');
    }
  };

  const handleIgnore = (listKey) => {
    if (listKey.startsWith('match-')) {
      setMatches(prev => prev.filter((_, i) => listKey !== `match-${i}`));
    } else {
      setNewPatterns(prev => prev.filter((_, i) => listKey !== `new-${i}`));
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getCategoryEmoji = (category) => {
    const emojiMap = {
      'Entertainment': '🎬',
      'Fitness': '🏋️',
      'Software': '💻',
      'Utilities': '⚡',
      'Food': '🍔',
      'Other': '📦',
      'Streaming': '📺',
      'Rent': '🏠',
      'Insurance': '🛡️',
      'Phone': '📱',
      'Internet': '🌐',
      'Mortgage': '🏡',
      'Gaming': '🎮',
      'Memberships': '🎫',
      'Housing': '🏠',
      'Auto & Transportation': '🚗',
      'Credit Cards & Loans': '💳',
      'Utilities & Home Services': '💡',
      'Phone & Internet': '📱',
      'Insurance & Healthcare': '🏥',
      'Subscriptions & Entertainment': '🎬',
      'Personal Care': '💅'
    };
    return emojiMap[category] || '📦';
  };

  return (
    <div className="subscription-detector-overlay" onClick={onClose}>
      <div className="subscription-detector-modal" onClick={(e) => e.stopPropagation()}>
        <div className="detector-header">
          <h2>🤖 Detected Recurring Charges</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="detector-body">
          {loading && (
            <div className="detector-loading">
              <div className="spinner"></div>
              <p>Analyzing {scannedCount > 0 ? scannedCount : '...'} transactions...</p>
            </div>
          )}

          {error && (
            <div className="detector-error">
              <p>{error}</p>
              <button onClick={detectSubscriptions}>Try Again</button>
            </div>
          )}

          {!loading && !error && matches.length === 0 && newPatterns.length === 0 && (
            <div className="detector-empty">
              <p>🎉 No new recurring bills detected!</p>
              <p className="detector-empty-sub">
                We analyzed {scannedCount} transactions but didn't find any new patterns.
              </p>
            </div>
          )}

          {!loading && !error && (matches.length > 0 || newPatterns.length > 0) && (
            <>
              <p className="detector-summary">
                We analyzed <strong>{scannedCount} transactions</strong> and found <strong>{matches.length + newPatterns.length}</strong> recurring pattern{(matches.length + newPatterns.length) > 1 ? 's' : ''}:
              </p>

              {/* Possible Matches Section */}
              {matches.length > 0 && (
                <>
                  <div className="section-divider">
                    <h3>🔗 Possible Matches ({matches.length})</h3>
                    <p className="section-description">
                      We found patterns that might match bills you're already tracking:
                    </p>
                  </div>

                  <div className="detected-list">
                    {matches.map((sub, index) => {
                      const listKey = `match-${index}`;
                      return (
                        <div key={listKey} className="detected-card match-card">
                          <div className="detected-header">
                            <div className="detected-title">
                              <span className="detected-emoji">{getCategoryEmoji(sub.category)}</span>
                              <span className="detected-name">{sub.merchantName}</span>
                              <span className="confidence-badge">{sub.confidence}% confident</span>
                            </div>
                            <div className="detected-meta">
                              {formatCurrency(sub.amount)}/{sub.billingCycle.toLowerCase()} • {sub.occurrences} occurrences
                            </div>
                          </div>

                          {sub.matchedSubscription && (
                            <div className="match-info">
                              <strong>Matches existing bill:</strong>
                              <div className="existing-bill-info">
                                📋 "{sub.matchedSubscription.name}" ({formatCurrency(sub.matchedSubscription.amount)}/{sub.billingCycle.toLowerCase()})
                              </div>
                              <p className="match-question">Are these the same?</p>
                            </div>
                          )}

                          <div className="detected-charges">
                            <strong>Recent charges:</strong>
                            <ul>
                              {sub.recentCharges.map((charge, i) => (
                                <li key={i}>
                                  {formatDate(charge.date)} - {formatCurrency(charge.amount)}
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="detected-form">
                            <div className="form-row">
                              <label>Category:</label>
                              <select 
                                value={editingKey === listKey ? editedData.category : sub.category}
                                onChange={(e) => {
                                  if (editingKey !== listKey) handleEdit(listKey);
                                  handleCategoryChange(e.target.value);
                                }}
                              >
                                <optgroup label="Bills">
                                  <option value="Housing">Housing</option>
                                  <option value="Auto & Transportation">Auto & Transportation</option>
                                  <option value="Credit Cards & Loans">Credit Cards & Loans</option>
                                  <option value="Utilities & Home Services">Utilities & Home Services</option>
                                  <option value="Phone & Internet">Phone & Internet</option>
                                  <option value="Insurance & Healthcare">Insurance & Healthcare</option>
                                  <option value="Personal Care">Personal Care</option>
                                </optgroup>
                                <optgroup label="Subscriptions">
                                  <option value="Subscriptions & Entertainment">Subscriptions & Entertainment</option>
                                  <option value="Software">Software</option>
                                  <option value="Food">Food</option>
                                </optgroup>
                                <option value="Other">Other</option>
                              </select>
                            </div>

                            <div className="form-row">
                              <label>
                                <input 
                                  type="checkbox"
                                  checked={editingKey === listKey ? editedData.essential : false}
                                  onChange={(e) => {
                                    if (editingKey !== listKey) handleEdit(listKey);
                                    handleEssentialChange(e.target.checked);
                                  }}
                                />
                                Mark as Essential
                              </label>
                            </div>
                          </div>

                          <div className="detected-actions">
                            <button 
                              className="btn-link"
                              onClick={() => handleLinkToExisting(sub, listKey)}
                              title="Link to existing bill"
                            >
                              ✅ Yes, Link Them
                            </button>
                            <button 
                              className="btn-add-separate"
                              onClick={() => handleAddAsSeparate(sub, listKey)}
                              title="Add as separate bill"
                            >
                              ➕ No, Add Separate
                            </button>
                            <button 
                              className="btn-ignore"
                              onClick={() => handleIgnore(listKey)}
                            >
                              ❌ Ignore
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* New Patterns Section */}
              {newPatterns.length > 0 && (
                <>
                  <div className="section-divider">
                    <h3>🆕 New Patterns ({newPatterns.length})</h3>
                    <p className="section-description">
                      These patterns don't match any existing bills:
                    </p>
                  </div>

                  <div className="detected-list">
                    {newPatterns.map((sub, index) => {
                      const listKey = `new-${index}`;
                      return (
                        <div key={listKey} className="detected-card new-card">
                          <div className="detected-header">
                            <div className="detected-title">
                              <span className="detected-emoji">{getCategoryEmoji(sub.category)}</span>
                              <span className="detected-name">{sub.merchantName}</span>
                              <span className="confidence-badge">{sub.confidence}% confident</span>
                            </div>
                            <div className="detected-meta">
                              {formatCurrency(sub.amount)}/{sub.billingCycle.toLowerCase()} • {sub.occurrences} occurrences
                            </div>
                          </div>

                          <div className="detected-charges">
                            <strong>Recent charges:</strong>
                            <ul>
                              {sub.recentCharges.map((charge, i) => (
                                <li key={i}>
                                  {formatDate(charge.date)} - {formatCurrency(charge.amount)}
                                </li>
                              ))}
                            </ul>
                            <p className="next-renewal">Next renewal: <strong>{formatDate(sub.nextRenewal)}</strong></p>
                          </div>

                          <div className="detected-form">
                            <div className="form-row">
                              <label>Category:</label>
                              <select 
                                value={editingKey === listKey ? editedData.category : sub.category}
                                onChange={(e) => {
                                  if (editingKey !== listKey) handleEdit(listKey);
                                  handleCategoryChange(e.target.value);
                                }}
                              >
                                <optgroup label="Bills">
                                  <option value="Housing">Housing</option>
                                  <option value="Auto & Transportation">Auto & Transportation</option>
                                  <option value="Credit Cards & Loans">Credit Cards & Loans</option>
                                  <option value="Utilities & Home Services">Utilities & Home Services</option>
                                  <option value="Phone & Internet">Phone & Internet</option>
                                  <option value="Insurance & Healthcare">Insurance & Healthcare</option>
                                  <option value="Personal Care">Personal Care</option>
                                </optgroup>
                                <optgroup label="Subscriptions">
                                  <option value="Subscriptions & Entertainment">Subscriptions & Entertainment</option>
                                  <option value="Software">Software</option>
                                  <option value="Food">Food</option>
                                </optgroup>
                                <option value="Other">Other</option>
                              </select>
                            </div>

                            <div className="form-row">
                              <label>
                                <input 
                                  type="checkbox"
                                  checked={editingKey === listKey ? editedData.essential : false}
                                  onChange={(e) => {
                                    if (editingKey !== listKey) handleEdit(listKey);
                                    handleEssentialChange(e.target.checked);
                                  }}
                                />
                                Mark as Essential
                              </label>
                            </div>
                          </div>

                          <div className="detected-actions">
                            <button 
                              className="btn-add"
                              onClick={() => handleAddAsSeparate(sub, listKey)}
                            >
                              ✅ Add as Recurring Bill
                            </button>
                            <button 
                              className="btn-ignore"
                              onClick={() => handleIgnore(listKey)}
                            >
                              ❌ Ignore
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="detector-footer">
          <button className="btn-close" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionDetector;
