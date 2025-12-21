import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { TRANSACTION_CATEGORIES, getCategoryIcon } from '../constants/categories';
import PaidBillDetailsModal from '../components/PaidBillDetailsModal';
import './PaymentHistory.css';

export default function PaymentHistory() {
  const { currentUser } = useAuth();
  const [payments, setPayments] = useState([]);
  const [filteredPayments, setFilteredPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBill, setSelectedBill] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

  // Load all payments
  useEffect(() => {
    if (!currentUser) return;
    
    const loadPayments = async () => {
      try {
        setLoading(true);
        
        // Load from financialEvents collection (paid bills)
        const eventsRef = collection(db, 'users', currentUser.uid, 'financialEvents');
        const q = query(
          eventsRef,
          where('type', '==', 'bill'),
          where('isPaid', '==', true)
        );
        const snapshot = await getDocs(q);
        
        const paymentsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc. data()
        }));
        
        // Sort by paidDate descending
        paymentsData.sort((a, b) => {
          const dateA = a.paidDate ? new Date(a.paidDate) : new Date(0);
          const dateB = b.paidDate ?  new Date(b.paidDate) : new Date(0);
          return dateB - dateA;
        });
        
        setPayments(paymentsData);
        setFilteredPayments(paymentsData);
        console.log(`✅ Loaded ${paymentsData.length} paid bills from financialEvents`);
      } catch (error) {
        console.error('Error loading payments:', error);
        setPayments([]);
        setFilteredPayments([]);
      } finally {
        setLoading(false);
      }
    };
    
    loadPayments();
  }, [currentUser]);

  // Auto-reload when page becomes visible (user switches tabs back)
  useEffect(() => {
    if (!currentUser) return;
    
    const handleVisibilityChange = () => {
      if (!document. hidden) {
        // Page became visible - reload payments
        const loadPayments = async () => {
          try {
            const eventsRef = collection(db, 'users', currentUser.uid, 'financialEvents');
            const q = query(
              eventsRef,
              where('type', '==', 'bill'),
              where('isPaid', '==', true)
            );
            const snapshot = await getDocs(q);
            
            const paymentsData = snapshot.docs.map(doc => ({
              id:  doc.id,
              ... doc.data()
            }));
            
            // Sort by paidDate descending
            paymentsData.sort((a, b) => {
              const dateA = a.paidDate ? new Date(a.paidDate) : new Date(0);
              const dateB = b.paidDate ? new Date(b.paidDate) : new Date(0);
              return dateB - dateA;
            });
            
            setPayments(paymentsData);
            setFilteredPayments(paymentsData);
            console.log(`🔄 Auto-reloaded ${paymentsData.length} payments`);
          } catch (error) {
            console.error('Error reloading payments:', error);
          }
        };
        
        loadPayments();
      }
    };
    
    document. addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentUser]);

  // Apply filters
  useEffect(() => {
    let filtered = [... payments];
    
    // Search filter
    if (searchTerm) {
      filtered = filtered. filter(payment => 
        payment.billName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Date range filter
    if (startDate) {
      filtered = filtered.filter(payment => payment.paidDate >= startDate);
    }
    if (endDate) {
      filtered = filtered.filter(payment => payment.paidDate <= endDate);
    }
    
    // Category filter
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(payment => payment. category === categoryFilter);
    }
    
    // Amount range filter
    if (minAmount) {
      filtered = filtered.filter(payment => payment.amount >= parseFloat(minAmount));
    }
    if (maxAmount) {
      filtered = filtered.filter(payment => payment.amount <= parseFloat(maxAmount));
    }
    
    setFilteredPayments(filtered);
  }, [payments, searchTerm, startDate, endDate, categoryFilter, minAmount, maxAmount]);

  // Calculate stats
  const stats = {
    totalSpent: filteredPayments.reduce((sum, p) => {
      const amount = parseFloat(p.amount || p.paidAmount || 0);
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0),
    paymentCount: filteredPayments. length,
    averagePayment: filteredPayments.length > 0 
      ? filteredPayments.reduce((sum, p) => {
          const amount = parseFloat(p.amount || p.paidAmount || 0);
          return sum + (isNaN(amount) ? 0 : amount);
        }, 0) / filteredPayments.length 
      : 0
  };

  const handleBillClick = (bill) => {
    setSelectedBill(bill);
    setShowDetailsModal(true);
  };

  const handleUnmark = async (bill) => {
    // Reload payments after unmarking
    setShowDetailsModal(false);
    setSelectedBill(null);
    
    // Reload data using the existing loadPayments logic
    if (currentUser) {
      try {
        const eventsRef = collection(db, 'users', currentUser.uid, 'financialEvents');
        const q = query(
          eventsRef,
          where('type', '==', 'bill'),
          where('isPaid', '==', true)
        );
        const snapshot = await getDocs(q);
        
        const paymentsData = snapshot.docs.map(doc => ({
          id: doc. id,
          ...doc.data()
        }));
        
        // Sort by paidDate descending
        paymentsData.sort((a, b) => {
          const dateA = a.paidDate ? new Date(a.paidDate) : new Date(0);
          const dateB = b.paidDate ? new Date(b.paidDate) : new Date(0);
          return dateB - dateA;
        });
        
        setPayments(paymentsData);
        setFilteredPayments(paymentsData);
      } catch (error) {
        console.error('Error reloading payments:', error);
      }
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredPayments.length === 0) {
      alert('No payments to export');
      return;
    }
    
    const csvData = filteredPayments.map(payment => ({
      'Bill Name': payment.billName || '',
      'Amount': payment.amount || '',
      'Category': payment.category || '',
      'Due Date': payment.dueDate || '',
      'Paid Date':  payment.paidDate || '',
      'Payment Month': payment.paymentMonth || '',
      'Year': payment.year || '',
      'Quarter': payment.quarter || '',
      'Payment Method': payment.paymentMethod || '',
      'Overdue':  payment.isOverdue ?  'Yes' : 'No',
      'Days Past Due': payment.daysPastDue || 0
    }));
    
    const headers = Object.keys(csvData[0]).join(',');
    const rows = csvData.map(row => 
      Object.values(row).map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    
    const csv = headers + '\n' + rows;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window. URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payment-history-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style:  'currency',
      currency:  'USD'
    }).format(amount);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '--';
    
    try {
      let date;
      
      // Handle Firestore Timestamp objects
      if (dateStr && typeof dateStr. toDate === 'function') {
        date = dateStr.toDate();
      }
      // Handle Date objects
      else if (dateStr instanceof Date) {
        date = dateStr;
      }
      // Handle YYYY-MM-DD string format (most common from Firebase)
      else if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        const [year, month, day] = dateStr.split('-');
        date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      }
      // Handle ISO 8601 strings or other formats
      else if (typeof dateStr === 'string') {
        date = new Date(dateStr);
      }
      // Fallback
      else {
        date = new Date(dateStr);
      }
      
      // Validate the date is valid
      if (isNaN(date.getTime())) {
        console.warn('Invalid date:', dateStr);
        return '--';
      }
      
      return date.toLocaleDateString('en-US', {
        year:  'numeric',
        month:  'short',
        day:  'numeric'
      });
    } catch (error) {
      console.error('Error formatting date:', error, dateStr);
      return '--';
    }
  };

  if (loading) {
    return (
      <div className="payment-history-container">
        <div className="page-header">
          <h2>💳 Payment History</h2>
          <p>Loading your payment history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="payment-history-container">
      <div className="page-header">
        <div className="header-content">
          <div>
            <h2>💳 Payment History</h2>
            <p>Complete record of all bill payments</p>
          </div>
          <button 
            onClick={handleExportCSV}
            disabled={filteredPayments.length === 0}
            className="export-btn"
          >
            📊 Export to CSV
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <h3>Total Spent</h3>
          <div className="stat-value">{formatCurrency(stats.totalSpent)}</div>
          <div className="stat-label">Across {stats.paymentCount} payments</div>
        </div>
        <div className="stat-card">
          <h3>Payment Count</h3>
          <div className="stat-value">{stats.paymentCount}</div>
          <div className="stat-label">Total payments made</div>
        </div>
        <div className="stat-card">
          <h3>Average Payment</h3>
          <div className="stat-value">{formatCurrency(stats.averagePayment)}</div>
          <div className="stat-label">Per payment</div>
        </div>
      </div>

      {/* Filters */}
      <div className="filters-section">
        <div className="filter-row">
          <input
            type="text"
            placeholder="Search bill name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e. target.value)}
            className="filter-input"
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Categories</option>
            {TRANSACTION_CATEGORIES.map(category => (
              <option key={category} value={category}>
                {getCategoryIcon(category)} {category}
              </option>
            ))}
          </select>
        </div>
        
        <div className="filter-row">
          <div className="date-filter">
            <label>From:</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="filter-input"
            />
          </div>
          <div className="date-filter">
            <label>To:</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target. value)}
              className="filter-input"
            />
          </div>
          <div className="amount-filter">
            <label>Min Amount:</label>
            <input
              type="number"
              placeholder="$0"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target. value)}
              className="filter-input"
            />
          </div>
          <div className="amount-filter">
            <label>Max Amount:</label>
            <input
              type="number"
              placeholder="$999,999"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              className="filter-input"
            />
          </div>
        </div>
        
        {(searchTerm || startDate || endDate || categoryFilter !== 'all' || minAmount || maxAmount) && (
          <button 
            onClick={() => {
              setSearchTerm('');
              setStartDate('');
              setEndDate('');
              setCategoryFilter('all');
              setMinAmount('');
              setMaxAmount('');
            }}
            className="clear-filters-btn"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Payments Table */}
      <div className="payments-table-container">
        <table className="payments-table">
          <thead>
            <tr>
              <th>Bill Name</th>
              <th>Amount</th>
              <th>Category</th>
              <th>Paid Date</th>
              <th>Due Date</th>
              <th>Payment Method</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredPayments.length > 0 ? (
              filteredPayments.map((payment) => (
                <tr 
                  key={payment.id}
                  onClick={() => handleBillClick(payment)}
                  style={{ cursor: 'pointer' }}
                  className="clickable-row"
                  title="Click to view details"
                >
                  <td>{payment. name || payment.billName}</td>
                  <td className="amount-cell">{formatCurrency(payment.amount || payment.paidAmount)}</td>
                  <td>
                    <span className="category-badge">
                      {getCategoryIcon(payment.category)} {payment.category}
                    </span>
                  </td>
                  <td>{formatDate(payment.paidDate)}</td>
                  <td>{formatDate(payment.dueDate || payment.nextDueDate)}</td>
                  <td>
                    {payment.markedBy === 'auto-bill-clearing' ? '🤖 Auto (Plaid)' :
                     payment.markedBy === 'manual-link' ? '🔗 Linked' :
                     payment.paymentMethod || '👤 Manual'}
                  </td>
                  <td>
                    {payment.isOverdue ? (
                      <span className="status-badge overdue">
                        ⚠️ {payment.daysPastDue} day{payment.daysPastDue !== 1 ? 's' :  ''} late
                      </span>
                    ) : (
                      <span className="status-badge on-time">✅ Paid</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" className="no-data">
                  {payments.length === 0 
                    ? 'No payment history yet.  Pay some bills to see them here!' 
                    : 'No payments match your filters'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paid Bill Details Modal */}
      {showDetailsModal && selectedBill && (
        <PaidBillDetailsModal
          bill={selectedBill}
          onClose={() => {
            setShowDetailsModal(false);
            setSelectedBill(null);
          }}
          onUnmark={handleUnmark}
        />
      )}
    </div>
  );
}
