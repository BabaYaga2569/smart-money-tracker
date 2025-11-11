import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { TRANSACTION_CATEGORIES, getCategoryIcon } from '../constants/categories';
import './PaymentHistory.css';

export default function PaymentHistory() {
  const { currentUser } = useAuth();
  const [payments, setPayments] = useState([]);
  const [filteredPayments, setFilteredPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  
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
        const paymentsRef = collection(db, 'users', currentUser.uid, 'bill_payments');
        const q = query(paymentsRef, orderBy('paidDate', 'desc'));
        const snapshot = await getDocs(q);
        
        const paymentsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        setPayments(paymentsData);
        setFilteredPayments(paymentsData);
        console.log(`✅ Loaded ${paymentsData.length} payments`);
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

  // Apply filters
  useEffect(() => {
    let filtered = [...payments];
    
    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(payment => 
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
      filtered = filtered.filter(payment => payment.category === categoryFilter);
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
    totalSpent: filteredPayments.reduce((sum, p) => sum + (p.amount || 0), 0),
    paymentCount: filteredPayments.length,
    averagePayment: filteredPayments.length > 0 
      ? filteredPayments.reduce((sum, p) => sum + (p.amount || 0), 0) / filteredPayments.length 
      : 0
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
      'Paid Date': payment.paidDate || '',
      'Payment Month': payment.paymentMonth || '',
      'Year': payment.year || '',
      'Quarter': payment.quarter || '',
      'Payment Method': payment.paymentMethod || '',
      'Overdue': payment.isOverdue ? 'Yes' : 'No',
      'Days Past Due': payment.daysPastDue || 0
    }));
    
    const headers = Object.keys(csvData[0]).join(',');
    const rows = csvData.map(row => 
      Object.values(row).map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    
    const csv = headers + '\n' + rows;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payment-history-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '--';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
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
            onChange={(e) => setSearchTerm(e.target.value)}
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
              onChange={(e) => setEndDate(e.target.value)}
              className="filter-input"
            />
          </div>
          <div className="amount-filter">
            <label>Min Amount:</label>
            <input
              type="number"
              placeholder="$0"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
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
                <tr key={payment.id}>
                  <td>{payment.billName}</td>
                  <td className="amount-cell">{formatCurrency(payment.amount)}</td>
                  <td>
                    <span className="category-badge">
                      {getCategoryIcon(payment.category)} {payment.category}
                    </span>
                  </td>
                  <td>{formatDate(payment.paidDate)}</td>
                  <td>{formatDate(payment.dueDate)}</td>
                  <td>{payment.paymentMethod}</td>
                  <td>
                    {payment.isOverdue ? (
                      <span className="status-badge overdue">
                        ⚠️ {payment.daysPastDue} day{payment.daysPastDue !== 1 ? 's' : ''} late
                      </span>
                    ) : (
                      <span className="status-badge on-time">✅ On Time</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" className="no-data">
                  {payments.length === 0 
                    ? 'No payment history yet. Pay some bills to see them here!' 
                    : 'No payments match your filters'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
