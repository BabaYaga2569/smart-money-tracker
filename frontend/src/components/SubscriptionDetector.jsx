import React, { useState } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import './SubscriptionDetector.css';

const SubscriptionDetector = ({ onClose, onSubscriptionAdded, accounts }) => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [detected, setDetected] = useState([]);
  const [scannedCount, setScannedCount] = useState(0);
  const [error, setError] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editedData, setEditedData] = useState({});

  // Run detection when component mounts
  React.useEffect(() => {
    detectSubscriptions();
  }, []);

  const detectSubscriptions = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/subscriptions/detect`, {
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
      setDetected(data.detected || []);
      setScannedCount(data.scannedTransactions || 0);
    } catch (err) {
      console.error('Detection error:', err);
      setError('Failed to analyze transactions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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

      const subscriptionData = {
        name: detectedSub.merchantName,
        cost: detectedSub.amount,
        billingCycle: detectedSub.billingCycle,
        category: category,
        essential: essential,
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
      'Other': '📦'
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

          {!loading && !error && detected.length === 0 && (
            <div className="detector-empty">
              <p>🎉 No new recurring subscriptions detected!</p>
              <p className="detector-empty-sub">
                We analyzed {scannedCount} transactions but didn't find any new patterns.
              </p>
            </div>
          )}

          {!loading && !error && detected.length > 0 && (
            <>
              <p className="detector-summary">
                We analyzed <strong>{scannedCount} transactions</strong> and found <strong>{detected.length}</strong> possible subscription{detected.length > 1 ? 's' : ''}:
              </p>

              <div className="detected-list">
                {detected.map((sub, index) => (
                  <div key={index} className="detected-card">
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
                          value={editingIndex === index ? editedData.category : sub.category}
                          onChange={(e) => {
                            if (editingIndex !== index) handleEdit(index);
                            handleCategoryChange(e.target.value);
                          }}
                        >
                          <option value="Entertainment">Entertainment</option>
                          <option value="Fitness">Fitness</option>
                          <option value="Software">Software</option>
                          <option value="Utilities">Utilities</option>
                          <option value="Food">Food</option>
                          <option value="Other">Other</option>
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
                        ✅ Add as Subscription
                      </button>
                      <button 
                        className="btn-ignore"
                        onClick={() => handleIgnore(index)}
                      >
                        ❌ Ignore
                      </button>
                    </div>
                  </div>
                ))}
              </div>
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
