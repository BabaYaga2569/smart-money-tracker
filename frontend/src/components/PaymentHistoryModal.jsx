import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import './PaymentHistoryModal.css';

const PaymentHistoryModal = ({ isOpen, onClose }) => {
  const { currentUser } = useAuth();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    if (isOpen && currentUser) {
      loadPayments();
    }
  }, [isOpen, currentUser, currentMonth]);

  const loadPayments = async () => {
    setLoading(true);
    try {
      const paymentsRef = collection(db, 'users', currentUser.uid, 'bill_payments');
      const q = query(
        paymentsRef,
        where('paymentMonth', '==', currentMonth),
        orderBy('paidDate', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      const paymentsData = [];
      
      querySnapshot.forEach((doc) => {
        paymentsData.push({ id: doc.id, ...doc.data() });
      });
      
      setPayments(paymentsData);
    } catch (error) {
      console.error('Error loading payment history:', error);
      setPayments([]);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const getTotalPaid = () => {
    return payments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
  };

  const exportToCSV = () => {
    if (payments.length === 0) return;

    const headers = ['Bill Name', 'Amount', 'Due Date', 'Paid Date', 'Payment Method', 'Category', 'Status'];
    const rows = payments.map(payment => [
      payment.billName,
      payment.amount,
      payment.dueDate,
      payment.paidDate,
      payment.paymentMethod,
      payment.category,
      payment.isOverdue ? `Overdue (${payment.daysPastDue} days)` : 'On Time'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bill-payments-${currentMonth}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="payment-history-modal-overlay" onClick={onClose}>
      <div className="payment-history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>💵 Payment History</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="modal-filters">
          <label>
            Month:
            <input
              type="month"
              value={currentMonth}
              onChange={(e) => setCurrentMonth(e.target.value)}
              max={new Date().toISOString().slice(0, 7)}
            />
          </label>
          
          {payments.length > 0 && (
            <button className="export-button" onClick={exportToCSV}>
              📊 Export to CSV
            </button>
          )}
        </div>

        <div className="modal-summary">
          <div className="summary-stat">
            <span className="stat-label">Total Paid:</span>
            <span className="stat-value">{formatCurrency(getTotalPaid())}</span>
          </div>
          <div className="summary-stat">
            <span className="stat-label">Bills Paid:</span>
            <span className="stat-value">{payments.length}</span>
          </div>
          <div className="summary-stat">
            <span className="stat-label">On Time:</span>
            <span className="stat-value">
              {payments.filter(p => !p.isOverdue).length}
            </span>
          </div>
          <div className="summary-stat">
            <span className="stat-label">Late:</span>
            <span className="stat-value late">
              {payments.filter(p => p.isOverdue).length}
            </span>
          </div>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="loading-state">Loading payment history...</div>
          ) : payments.length === 0 ? (
            <div className="empty-state">
              <p>No payments recorded for {new Date(currentMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
            </div>
          ) : (
            <div className="payments-list">
              {payments.map((payment) => (
                <div 
                  key={payment.id} 
                  className={`payment-item ${payment.isOverdue ? 'overdue' : ''}`}
                >
                  <div className="payment-main">
                    <div className="payment-icon">
                      {payment.isOverdue ? '⚠️' : '✅'}
                    </div>
                    <div className="payment-details">
                      <h4>{payment.billName}</h4>
                      <div className="payment-meta">
                        <span className="payment-category">{payment.category}</span>
                        <span className="payment-method">{payment.paymentMethod}</span>
                        {payment.isOverdue && (
                          <span className="overdue-badge">
                            Late by {payment.daysPastDue} day{payment.daysPastDue !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="payment-dates">
                    <div className="date-info">
                      <span className="date-label">Due:</span>
                      <span className="date-value">{formatDate(payment.dueDate)}</span>
                    </div>
                    <div className="date-info">
                      <span className="date-label">Paid:</span>
                      <span className="date-value">{formatDate(payment.paidDate)}</span>
                    </div>
                  </div>
                  
                  <div className="payment-amount">
                    {formatCurrency(payment.amount)}
                  </div>

                  {payment.linkedTransactionId && (
                    <div className="linked-transaction">
                      <span className="transaction-badge">
                        🔗 Auto-matched
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentHistoryModal;
