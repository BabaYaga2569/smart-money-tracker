import { useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getCategoryIcon } from '../constants/categories';
import './PaidBillDetailsModal.css';

/**
 * PaidBillDetailsModal Component
 * 
 * Shows detailed information about a paid bill including:
 * - Full bill information
 * - Linked transaction details (with clickable link)
 * - Payment method
 * - Payment history timeline
 * - Audit trail information
 * - "Unmark as Paid" functionality
 */
export default function PaidBillDetailsModal({ bill, onClose, onUnmark }) {
  const { currentUser } = useAuth();
  const [unmarking, setUnmarking] = useState(false);
  const [error, setError] = useState(null);

  if (!bill) return null;

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '--';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '--';
    // Handle Firestore Timestamp objects
    const date = dateStr.toDate ? dateStr.toDate() : new Date(dateStr);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getMarkedByLabel = (markedBy) => {
    switch (markedBy) {
      case 'auto-bill-clearing':
        return '🤖 Auto-Matched (Plaid)';
      case 'manual-link':
        return '🔗 Manually Linked';
      case 'user':
      default:
        return '👤 User (Manual)';
    }
  };

  const handleUnmark = async () => {
    if (!bill.canBeUnmarked) {
      setError('This bill cannot be unmarked. It may be locked or past the undo window.');
      return;
    }

    const confirmed = window.confirm(
      `⚠️ Unmark Bill as Paid?\n\n` +
      `This will restore "${bill.name}" to unpaid status.\n\n` +
      `The bill will reappear on the Bills page and disappear from Payment History.\n\n` +
      `Continue?`
    );

    if (!confirmed) return;

    try {
      setUnmarking(true);
      setError(null);

      const billRef = doc(db, 'users', currentUser.uid, 'financialEvents', bill.id);
      
      // Restore bill to unpaid status
      await updateDoc(billRef, {
        isPaid: false,
        status: 'pending',
        paidDate: null,
        paidAmount: null,
        linkedTransactionId: null,
        markedBy: null,
        markedAt: null,
        markedVia: null,
        canBeUnmarked: false,
        updatedAt: serverTimestamp(),
        // Track undo action
        lastUnmarkedAt: serverTimestamp(),
        lastUnmarkedBy: 'user'
      });

      // Callback to parent component
      if (onUnmark) {
        onUnmark(bill);
      }

      // Close modal
      onClose();
    } catch (err) {
      console.error('Error unmarking bill:', err);
      setError('Failed to unmark bill. Please try again.');
    } finally {
      setUnmarking(false);
    }
  };

  const handleViewTransaction = () => {
    if (bill.linkedTransactionId) {
      // Close modal first
      onClose();
      // Use window.location to navigate (React Router not available in this context)
      // Note: In a full React Router setup, this would use useNavigate() instead
      setTimeout(() => {
        window.location.href = `/transactions?highlight=${bill.linkedTransactionId}`;
      }, 100);
    }
  };

  return (
    <div className="paid-bill-details-overlay" onClick={onClose}>
      <div className="paid-bill-details-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>💳 Paid Bill Details</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          {/* Bill Information */}
          <div className="details-section">
            <h3>Bill Information</h3>
            <div className="detail-row">
              <span className="detail-icon">{getCategoryIcon(bill.category)}</span>
              <div className="detail-content">
                <div className="detail-label">Bill Name</div>
                <div className="detail-value">{bill.name}</div>
              </div>
            </div>
            
            <div className="detail-row">
              <span className="detail-icon">💰</span>
              <div className="detail-content">
                <div className="detail-label">Amount</div>
                <div className="detail-value">{formatCurrency(bill.amount)}</div>
              </div>
            </div>

            <div className="detail-row">
              <span className="detail-icon">📁</span>
              <div className="detail-content">
                <div className="detail-label">Category</div>
                <div className="detail-value">{bill.category || 'Uncategorized'}</div>
              </div>
            </div>

            <div className="detail-row">
              <span className="detail-icon">📅</span>
              <div className="detail-content">
                <div className="detail-label">Due Date</div>
                <div className="detail-value">{formatDate(bill.dueDate || bill.nextDueDate)}</div>
              </div>
            </div>

            <div className="detail-row">
              <span className="detail-icon">✅</span>
              <div className="detail-content">
                <div className="detail-label">Paid Date</div>
                <div className="detail-value">{formatDate(bill.paidDate)}</div>
              </div>
            </div>

            {bill.recurrence && (
              <div className="detail-row">
                <span className="detail-icon">🔄</span>
                <div className="detail-content">
                  <div className="detail-label">Recurrence</div>
                  <div className="detail-value">{bill.recurrence}</div>
                </div>
              </div>
            )}
          </div>

          {/* Payment Information */}
          <div className="details-section">
            <h3>Payment Information</h3>
            
            <div className="detail-row">
              <span className="detail-icon">💳</span>
              <div className="detail-content">
                <div className="detail-label">Amount Paid</div>
                <div className="detail-value">{formatCurrency(bill.paidAmount || bill.amount)}</div>
              </div>
            </div>

            <div className="detail-row">
              <span className="detail-icon">📍</span>
              <div className="detail-content">
                <div className="detail-label">Payment Method</div>
                <div className="detail-value">{getMarkedByLabel(bill.markedBy)}</div>
              </div>
            </div>

            {bill.markedAt && (
              <div className="detail-row">
                <span className="detail-icon">🕐</span>
                <div className="detail-content">
                  <div className="detail-label">Marked At</div>
                  <div className="detail-value">{formatDateTime(bill.markedAt)}</div>
                </div>
              </div>
            )}

            {bill.markedVia && (
              <div className="detail-row">
                <span className="detail-icon">🔧</span>
                <div className="detail-content">
                  <div className="detail-label">Marked Via</div>
                  <div className="detail-value">
                    {bill.markedVia === 'mark-as-paid-button' ? '💳 Mark as Paid Button' :
                     bill.markedVia === 'link-transaction' ? '🔗 Link Transaction' :
                     bill.markedVia === 'auto-plaid-match' ? '🤖 Auto Plaid Match' :
                     bill.markedVia}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Linked Transaction */}
          {bill.linkedTransactionId && (
            <div className="details-section">
              <h3>Linked Transaction</h3>
              
              <div className="linked-transaction-card">
                <div className="transaction-header">
                  <span className="transaction-icon">🔗</span>
                  <span className="transaction-label">Connected Transaction</span>
                </div>
                <div className="transaction-id">
                  ID: {bill.linkedTransactionId.substring(0, 20)}...
                </div>
                <button 
                  className="view-transaction-btn"
                  onClick={handleViewTransaction}
                >
                  📊 View in Transactions →
                </button>
              </div>
            </div>
          )}

          {/* Payment History */}
          {bill.paymentHistory && bill.paymentHistory.length > 0 && (
            <div className="details-section">
              <h3>Payment History</h3>
              <div className="payment-timeline">
                {bill.paymentHistory.map((payment, index) => (
                  <div key={index} className="timeline-item">
                    <div className="timeline-marker">✅</div>
                    <div className="timeline-content">
                      <div className="timeline-date">{formatDate(payment.paidDate)}</div>
                      <div className="timeline-amount">{formatCurrency(payment.amount)}</div>
                      <div className="timeline-method">via {payment.paymentMethod || payment.source}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="error-message">
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* Footer with Unmark Button */}
        <div className="modal-footer">
          <button 
            className="btn-secondary" 
            onClick={onClose}
            disabled={unmarking}
          >
            Close
          </button>
          
          {bill.canBeUnmarked && (
            <button 
              className="btn-unmark"
              onClick={handleUnmark}
              disabled={unmarking}
            >
              {unmarking ? '⏳ Unmarking...' : '↩️ Unmark as Paid'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
