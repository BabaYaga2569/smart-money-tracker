import React, { useState } from 'react';
import { collection, addDoc, getDocs, query, where, updateDoc, doc } from 'firebase/firestore';
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
  const [detected, setDetected] = useState([]);
  const [matches, setMatches] = useState([]);
  const [newPatterns, setNewPatterns] = useState([]);
  const [existingBills, setExistingBills] = useState([]);
  const [scannedCount, setScannedCount] = useState(0);
  const [error, setError] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editedData, setEditedData] = useState({});

  // Calculate similarity between two strings (simple version)
  const calculateSimilarity = (str1, str2) => {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    
    // Exact match
    if (s1 === s2) return 1.0;
    
    // One contains the other
    if (s1.includes(s2) || s2.includes(s1)) return 0.8;
    
    // Calculate simple Jaccard similarity
    const set1 = new Set(s1.split(' '));
    const set2 = new Set(s2.split(' '));
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  };

  // Categorize detections into matches and new patterns
  const categorizeDetections = (detectedList, existingList) => {
    const matchesList = [];
    const newList = [];
    
    for (const pattern of detectedList) {
      const similar = existingList.filter(bill => {
        // Name similarity (fuzzy match)
        const nameSimilarity = calculateSimilarity(
          pattern.merchantName,
          bill.name
        );
        
        // Amount match (within $5)
        const amountMatch = Math.abs(pattern.amount - bill.cost) < 5;
        
        // Consider it a match if name is 70%+ similar OR amounts match exactly with 40%+ name similarity
        return nameSimilarity > 0.7 || (amountMatch && nameSimilarity > 0.4);
      });
      
      if (similar.length > 0) {
        matchesList.push({
          detected: pattern,
          possibleMatches: similar,
          confidence: Math.round(calculateSimilarity(pattern.merchantName, similar[0].name) * 100)
        });
      } else {
        newList.push(pattern);
      }
    }
    
    return { matches: matchesList, newPatterns: newList };
  };

  const detectSubscriptions = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch existing bills
      const subscriptionsRef = collection(db, 'users', currentUser.uid, 'subscriptions');
      const existingSnap = await getDocs(subscriptionsRef);
      const existing = existingSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setExistingBills(existing);
      
      // Detect patterns from transactions
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
      const detectedList = data.detected || [];
      setDetected(detectedList);
      setScannedCount(data.scannedTransactions || 0);
      
      // Categorize into matches and new patterns
      const { matches: matchesList, newPatterns: newList } = categorizeDetections(detectedList, existing);
      setMatches(matchesList);
      setNewPatterns(newList);
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

  const handleEdit = (index) => {
    setEditingIndex(index);
    setEditedData({
      category: detected[index].category,
      essential: false
    });
  };

  const handleCategoryChange = (value) => {
    setEditedData(prev => ({ ...prev, category: value }));
  };

  const handleEssentialChange = (value) => {
    setEditedData(prev => ({ ...prev, essential: value }));
  };

  const handleAddSubscription = async (detectedSub, index) => {
    try {
      const category = editingIndex === index ? editedData.category : detectedSub.category;
      const essential = editingIndex === index ? editedData.essential : false;

      // Determine type based on category
      const type = getTypeFromCategory(category);

      const subscriptionData = {
        name: detectedSub.merchantName,
        cost: detectedSub.amount,
        billingCycle: detectedSub.billingCycle,
        category: category,
        essential: essential,
        type: type, // Add type field
        nextRenewal: detectedSub.nextRenewal,
        status: 'active',
        autoRenew: true,
        notes: `Auto-detected from ${detectedSub.occurrences} transactions (${detectedSub.confidence}% confidence)`,
        linkedTransactionIds: detectedSub.transactionIds || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const subscriptionsRef = collection(db, 'users', currentUser.uid, 'subscriptions');
      await addDoc(subscriptionsRef, subscriptionData);

      // Remove from detected list
      setDetected(prev => prev.filter((_, i) => i !== index));
      setEditingIndex(null);

      // Remove from storage if it has an ID
      if (detectedSub.detectionId) {
        removeDetection(detectedSub.detectionId);
      }
      
      if (onSubscriptionAdded) {
        onSubscriptionAdded();
      }
    } catch (err) {
      console.error('Error adding subscription:', err);
      alert('Failed to add subscription. Please try again.');
    }
  };

  const handleIgnore = (index) => {
    setDetected(prev => prev.filter((_, i) => i !== index));
  };

  // Link detected pattern to existing bill
  const handleLinkBill = async (match) => {
    try {
      const billId = match.possibleMatches[0].id;
      const pattern = match.detected;
      const billRef = doc(db, 'users', currentUser.uid, 'subscriptions', billId);
      
      await updateDoc(billRef, {
        // Link to transaction pattern
        linkedTransactionPattern: pattern.merchantName,
        linkedTransactionIds: pattern.transactionIds || [],
        
        // Auto-detected metadata
        autoDetected: true,
        detectionConfidence: pattern.confidence,
        
        // Update from pattern if more accurate
        cost: pattern.amount,
        nextRenewal: pattern.nextRenewal,
        
        // Payment tracking
        lastPaymentDate: pattern.recentCharges && pattern.recentCharges[0] ? pattern.recentCharges[0].date : null,
        lastPaymentAmount: pattern.recentCharges && pattern.recentCharges[0] ? pattern.recentCharges[0].amount : null,
        
        // Metadata
        linkedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      
      // Remove from matches list
      setMatches(prev => prev.filter(m => m !== match));
      
      if (onSubscriptionAdded) {
        onSubscriptionAdded();
      }
    } catch (err) {
      console.error('Error linking bill:', err);
      alert('Failed to link bill. Please try again.');
    }
  };

  // Add detected pattern as separate bill
  const handleAddSeparate = async (detectedPattern) => {
    try {
      const category = detectedPattern.category;
      const type = getTypeFromCategory(category);

      const subscriptionData = {
        name: detectedPattern.merchantName,
        cost: detectedPattern.amount,
        billingCycle: detectedPattern.billingCycle,
        category: category,
        essential: RECURRING_BILL_CATEGORIES.includes(category),
        type: type,
        nextRenewal: detectedPattern.nextRenewal,
        status: 'active',
        autoRenew: true,
        notes: `Auto-detected from ${detectedPattern.occurrences} transactions (${detectedPattern.confidence}% confidence)`,
        linkedTransactionPattern: detectedPattern.merchantName,
        linkedTransactionIds: detectedPattern.transactionIds || [],
        autoDetected: true,
        detectionConfidence: detectedPattern.confidence,
        lastPaymentDate: detectedPattern.recentCharges && detectedPattern.recentCharges[0] ? detectedPattern.recentCharges[0].date : null,
        lastPaymentAmount: detectedPattern.recentCharges && detectedPattern.recentCharges[0] ? detectedPattern.recentCharges[0].amount : null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const subscriptionsRef = collection(db, 'users', currentUser.uid, 'subscriptions');
      await addDoc(subscriptionsRef, subscriptionData);

      // Remove from matches list (if it's a match being added separately)
      setMatches(prev => prev.filter(m => m.detected !== detectedPattern));
      
      if (onSubscriptionAdded) {
        onSubscriptionAdded();
      }
    } catch (err) {
      console.error('Error adding bill:', err);
      alert('Failed to add bill. Please try again.');
    }
  };

  // Ignore a match suggestion
  const handleIgnoreMatch = (match) => {
    setMatches(prev => prev.filter(m => m !== match));
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
      'Housing': '🏠',
      'Auto & Transportation': '🚗',
      'Credit Cards & Loans': '💳',
      'Utilities & Home Services': '💡',
      'Phone & Internet': '📱',
      'Insurance & Healthcare': '🏥',
      'Subscriptions & Entertainment': '🎬',
      'Software & Technology': '💻',
      'Fitness & Gym': '💪',
      'Personal Care': '💅',
      'Financial Services': '💰',
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
      'Memberships': '🎫'
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
              <p>🎉 All patterns matched!</p>
              <p className="detector-empty-sub">
                We analyzed {scannedCount} transactions and found {detected.length} patterns - all already linked to your bills!
              </p>
            </div>
          )}

          {!loading && !error && (matches.length > 0 || newPatterns.length > 0) && (
            <>
              <p className="detector-summary">
                Analyzed <strong>{scannedCount} transactions</strong>, found <strong>{detected.length}</strong> pattern{detected.length !== 1 ? 's' : ''}
              </p>

              {/* Section 1: Possible Matches */}
              {matches.length > 0 && (
                <section className="matches-section">
                  <h3 className="section-title">🔗 Possible Matches ({matches.length})</h3>
                  <p className="section-description">These patterns might match bills you're already tracking:</p>
                  
                  {matches.map((match, index) => (
                    <div key={index} className="match-card">
                      <div className="detected-info">
                        <h4>🔍 Detected: {match.detected.merchantName}</h4>
                        <p>{formatCurrency(match.detected.amount)}/{match.detected.billingCycle.toLowerCase()} • {match.detected.occurrences} occurrences</p>
                        <p className="confidence">{match.confidence}% match confidence</p>
                      </div>
                      
                      <div className="existing-match">
                        <h5>Matches existing bill:</h5>
                        <p>📋 "{match.possibleMatches[0].name}" ({formatCurrency(match.possibleMatches[0].cost)}/{match.possibleMatches[0].billingCycle?.toLowerCase() || 'month'})</p>
                      </div>
                      
                      <div className="match-actions">
                        <button onClick={() => handleLinkBill(match)} className="btn-link">
                          ✅ Yes, link them
                        </button>
                        <button onClick={() => handleAddSeparate(match.detected)} className="btn-add">
                          ➕ No, add separate
                        </button>
                        <button onClick={() => handleIgnoreMatch(match)} className="btn-ignore">
                          ❌ Ignore
                        </button>
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {/* Section 2: New Patterns */}
              {newPatterns.length > 0 && (
                <section className="new-patterns-section">
                  <h3 className="section-title">🆕 New Patterns ({newPatterns.length})</h3>
                  <p className="section-description">These don't match any existing bills:</p>
                  
                  {newPatterns.map((sub, index) => (
                    <div key={index} className="detected-card">
                      <div className="detected-header">
                        <div className="detected-title">
                          <span className="detected-emoji">{getCategoryEmoji(sub.category)}</span>
                          <span className="detected-name">{sub.merchantName}</span>
                          <span className="confidence-badge">{sub.confidence}% confident</span>
                        </div>
                        <div className="detected-meta">
                          {sub.isVariableBill && sub.displayAmount 
                            ? `${sub.displayAmount}/${sub.billingCycle.toLowerCase()} (varies)` 
                            : `${formatCurrency(sub.amount)}/${sub.billingCycle.toLowerCase()}`} • {sub.occurrences} occurrences
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
                            value={editingIndex === index ? editedData.category : sub.category}
                            onChange={(e) => {
                              if (editingIndex !== index) handleEdit(index);
                              handleCategoryChange(e.target.value);
                            }}
                          >
                          <optgroup label="Recurring Bills">
                            <option value="Housing">🏠 Housing</option>
                            <option value="Auto & Transportation">🚗 Auto & Transportation</option>
                            <option value="Credit Cards & Loans">💳 Credit Cards & Loans</option>
                            <option value="Utilities & Home Services">💡 Utilities & Home Services</option>
                            <option value="Phone & Internet">📱 Phone & Internet</option>
                            <option value="Insurance & Healthcare">🏥 Insurance & Healthcare</option>
                            <option value="Personal Care">💅 Personal Care</option>
                            <option value="Financial Services">💰 Financial Services</option>
                          </optgroup>
                          <optgroup label="Subscriptions">
                            <option value="Subscriptions & Entertainment">🎬 Subscriptions & Entertainment</option>
                            <option value="Software & Technology">💻 Software & Technology</option>
                            <option value="Fitness & Gym">💪 Fitness & Gym</option>
                          </optgroup>
                          <optgroup label="Other">
                            <option value="Food">🍔 Food</option>
                            <option value="Other">📦 Other</option>
                          </optgroup>
                        </select>
                      </div>

                      <div className="form-row">
                        <label>
                          <input 
                            type="checkbox"
                            checked={editingIndex === index ? editedData.essential : false}
                            onChange={(e) => {
                              if (editingIndex !== index) handleEdit(index);
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
                        onClick={() => handleAddSubscription(sub, index)}
                      >
                        ✅ Add as Recurring Bill
                      </button>
                      <button 
                        className="btn-ignore"
                        onClick={() => setNewPatterns(prev => prev.filter((_, i) => i !== index))}
                      >
                        ❌ Ignore
                      </button>
                    </div>
                  </div>
                ))}
              </section>
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
