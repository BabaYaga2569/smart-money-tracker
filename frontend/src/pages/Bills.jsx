import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { RecurringBillManager } from '../utils/RecurringBillManager';
import { formatDateForDisplay, formatDateForInput, getPacificTime } from '../utils/DateUtils';
import './Bills.css';

const Bills = () => {
  const [loading, setLoading] = useState(true);
  const [bills, setBills] = useState([]);
  const [processedBills, setProcessedBills] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingBill, setEditingBill] = useState(null);
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [payingBill, setPayingBill] = useState(null);

  // Bill categories with icons
  const BILL_CATEGORIES = {
    'Housing': '🏠',
    'Utilities': '⚡',
    'Transportation': '🚗',
    'Credit Cards': '💳',
    'Insurance': '🏥',
    'Subscriptions': '📺',
    'Education': '🎓',
    'Other': '💰'
  };

  useEffect(() => {
    loadBills();
  }, []);

  const loadBills = async () => {
    try {
      const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
      const settingsDocSnap = await getDoc(settingsDocRef);
      
      if (settingsDocSnap.exists()) {
        const data = settingsDocSnap.data();
        const billsData = data.bills || [];
        setBills(billsData);
        
        // Process bills with next due dates and status
        const processed = RecurringBillManager.processBills(billsData).map(bill => ({
          ...bill,
          status: determineBillStatus(bill),
          category: bill.category || 'Other'
        }));
        setProcessedBills(processed);
      }
    } catch (error) {
      console.error('Error loading bills:', error);
      
      // Use sample data when Firebase is offline for demonstration
      const sampleBills = [
        {
          name: 'NV Energy',
          amount: '254.50',
          dueDate: '2025-10-15',
          recurrence: 'monthly',
          category: 'Utilities',
          account: 'bofa',
          status: 'pending'
        },
        {
          name: 'Southwest Gas',
          amount: '36.62',
          dueDate: '2025-10-08',
          recurrence: 'monthly',
          category: 'Utilities',
          account: 'bofa',
          status: 'overdue'
        },
        {
          name: 'Netflix',
          amount: '15.99',
          dueDate: '2025-10-20',
          recurrence: 'monthly',
          category: 'Subscriptions',
          account: 'chase',
          status: 'pending'
        },
        {
          name: 'Car Insurance',
          amount: '89.00',
          dueDate: '2025-09-15',
          lastPaidDate: '2025-09-15',
          recurrence: 'monthly',
          category: 'Insurance',
          account: 'bofa',
          status: 'paid'
        },
        {
          name: 'Mortgage',
          amount: '1850.00',
          dueDate: '2025-10-01',
          recurrence: 'monthly',
          category: 'Housing',
          account: 'bofa',
          status: 'pending'
        }
      ];
      
      setBills(sampleBills);
      
      // Process sample bills
      const processed = RecurringBillManager.processBills(sampleBills).map(bill => ({
        ...bill,
        status: determineBillStatus(bill),
        category: bill.category || 'Other'
      }));
      setProcessedBills(processed);
    } finally {
      setLoading(false);
    }
  };

  const determineBillStatus = (bill) => {
    const now = new Date();
    const dueDate = new Date(bill.nextDueDate || bill.dueDate);
    
    if (bill.status === 'paid' || bill.isPaid) {
      return 'paid';
    } else if (dueDate < now) {
      return 'overdue';
    } else {
      return 'pending';
    }
  };

  // Calculate dashboard metrics
  const calculateMetrics = () => {
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    const totalMonthlyBills = processedBills.reduce((sum, bill) => sum + (parseFloat(bill.amount) || 0), 0);
    
    const paidThisMonth = processedBills
      .filter(bill => {
        if (bill.status !== 'paid') return false;
        const lastPaidDate = new Date(bill.lastPaidDate);
        return lastPaidDate >= currentMonth && lastPaidDate <= nextMonth;
      })
      .reduce((sum, bill) => sum + (parseFloat(bill.amount) || 0), 0);
    
    const upcomingBills = processedBills.filter(bill => {
      const dueDate = new Date(bill.nextDueDate || bill.dueDate);
      return bill.status === 'pending' && dueDate <= nextMonth;
    });
    
    const overdueBills = processedBills.filter(bill => bill.status === 'overdue');
    
    const nextBillDue = processedBills
      .filter(bill => bill.status === 'pending')
      .sort((a, b) => new Date(a.nextDueDate || a.dueDate) - new Date(b.nextDueDate || b.dueDate))[0];
    
    return {
      totalMonthlyBills,
      paidThisMonth,
      upcomingBills: upcomingBills.reduce((sum, bill) => sum + (parseFloat(bill.amount) || 0), 0),
      upcomingCount: upcomingBills.length,
      overdueBills: overdueBills.reduce((sum, bill) => sum + (parseFloat(bill.amount) || 0), 0),
      overdueCount: overdueBills.length,
      nextBillDue
    };
  };

  const metrics = calculateMetrics();

  // Filter bills based on search and filters
  const filteredBills = processedBills.filter(bill => {
    const matchesSearch = bill.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || bill.category === filterCategory;
    const matchesStatus = filterStatus === 'all' || bill.status === filterStatus;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const handleMarkAsPaid = async (bill) => {
    if (payingBill) return;
    setPayingBill(bill.name);

    try {
      // Create transaction
      const transaction = {
        amount: -Math.abs(parseFloat(bill.amount)),
        description: `${bill.name} Payment`,
        category: 'Bills & Utilities',
        account: 'bofa', // Default to main account
        date: formatDateForInput(getPacificTime()),
        timestamp: Date.now(),
        type: 'expense'
      };

      // Add transaction to Firebase
      const transactionsRef = collection(db, 'users', 'steve-colburn', 'transactions');
      await addDoc(transactionsRef, transaction);

      // Update account balance
      await updateAccountBalance('bofa', transaction.amount);

      // Update bill status
      await updateBillAsPaid(bill);

      // Reload bills to refresh the data
      await loadBills();

      showNotification(`${bill.name} marked as paid!`, 'success');
    } catch (error) {
      console.error('Error marking bill as paid:', error);
      showNotification('Error processing payment', 'error');
    } finally {
      setPayingBill(null);
    }
  };

  const updateAccountBalance = async (accountKey, amount) => {
    try {
      const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      const bankAccounts = currentData.bankAccounts || {};
      const currentBalance = parseFloat(bankAccounts[accountKey]?.balance || 0);
      const newBalance = currentBalance + amount;
      
      const updatedAccounts = {
        ...bankAccounts,
        [accountKey]: {
          ...bankAccounts[accountKey],
          balance: newBalance.toString()
        }
      };
      
      await updateDoc(settingsDocRef, {
        ...currentData,
        bankAccounts: updatedAccounts
      });
    } catch (error) {
      console.error('Error updating account balance:', error);
      throw error;
    }
  };

  const updateBillAsPaid = async (bill) => {
    try {
      const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal'); 
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      const bills = currentData.bills || [];
      
      const updatedBills = bills.map(b => {
        if (b.name === bill.name && b.amount === bill.amount) {
          return RecurringBillManager.markBillAsPaid(b, getPacificTime());
        }
        return b;
      });
      
      await updateDoc(settingsDocRef, {
        ...currentData,
        bills: updatedBills
      });
    } catch (error) {
      console.error('Error updating bill status:', error);
      throw error;
    }
  };

  const showNotification = (message, type) => {
    // Simple notification - can be enhanced with a proper notification system
    console.log(`${type.toUpperCase()}: ${message}`);
  };

  const handleSaveBill = async (billData) => {
    try {
      const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      const bills = currentData.bills || [];
      
      if (editingBill) {
        // Update existing bill
        const updatedBills = bills.map(bill => {
          if (bill.name === editingBill.name && bill.amount === editingBill.amount) {
            return { ...billData, originalDueDate: billData.dueDate };
          }
          return bill;
        });
        
        await updateDoc(settingsDocRef, {
          ...currentData,
          bills: updatedBills
        });
        
        showNotification('Bill updated successfully!', 'success');
      } else {
        // Add new bill
        const newBill = {
          ...billData,
          originalDueDate: billData.dueDate,
          status: 'pending'
        };
        
        await updateDoc(settingsDocRef, {
          ...currentData,
          bills: [...bills, newBill]
        });
        
        showNotification('Bill added successfully!', 'success');
      }
      
      // Reload bills and close modal
      await loadBills();
      setShowModal(false);
      setEditingBill(null);
    } catch (error) {
      console.error('Error saving bill:', error);
      showNotification('Error saving bill', 'error');
    }
  };

  const handleDeleteBill = async (billToDelete) => {
    if (!confirm(`Are you sure you want to delete ${billToDelete.name}?`)) {
      return;
    }

    try {
      const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      const bills = currentData.bills || [];
      const updatedBills = bills.filter(bill => 
        !(bill.name === billToDelete.name && bill.amount === billToDelete.amount)
      );
      
      await updateDoc(settingsDocRef, {
        ...currentData,
        bills: updatedBills
      });
      
      await loadBills();
      showNotification('Bill deleted successfully!', 'success');
    } catch (error) {
      console.error('Error deleting bill:', error);
      showNotification('Error deleting bill', 'error');
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateStr) => {
    return formatDateForDisplay(dateStr, 'short');
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'paid': return 'status-badge status-paid';
      case 'overdue': return 'status-badge status-overdue';
      case 'pending': return 'status-badge status-pending';
      default: return 'status-badge';
    }
  };

  if (loading) {
    return (
      <div className="bills-container">
        <div className="page-header">
          <h2>🧾 Bills Management</h2>
          <p>Loading your bills...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bills-container">
      {/* Header with Add Bill Button */}
      <div className="page-header">
        <div className="header-content">
          <div>
            <h2>🧾 Bills Management</h2>
            <p>Complete bill lifecycle management and automation</p>
          </div>
          <button 
            className="add-bill-btn-header"
            onClick={() => {
              setEditingBill(null);
              setShowModal(true);
            }}
          >
            + Add New Bill
          </button>
        </div>
      </div>

      {/* Enhanced Overview Dashboard */}
      <div className="bills-overview">
        <div className="overview-grid">
          <div className="overview-card">
            <h3>Total Monthly Bills</h3>
            <div className="overview-value">{formatCurrency(metrics.totalMonthlyBills)}</div>
            <div className="overview-label">{processedBills.length} bills</div>
          </div>
          <div className="overview-card">
            <h3>Paid This Month</h3>
            <div className="overview-value paid">{formatCurrency(metrics.paidThisMonth)}</div>
            <div className="overview-label">Successfully paid</div>
          </div>
          <div className="overview-card">
            <h3>Upcoming Bills</h3>
            <div className="overview-value upcoming">{formatCurrency(metrics.upcomingBills)}</div>
            <div className="overview-label">{metrics.upcomingCount} bills due</div>
          </div>
          <div className="overview-card">
            <h3>Overdue Bills</h3>
            <div className="overview-value overdue">{formatCurrency(metrics.overdueBills)}</div>
            <div className="overview-label">{metrics.overdueCount} bills overdue</div>
          </div>
          <div className="overview-card">
            <h3>Next Bill Due</h3>
            <div className="overview-value">
              {metrics.nextBillDue ? formatCurrency(metrics.nextBillDue.amount) : '--'}
            </div>
            <div className="overview-label">
              {metrics.nextBillDue ? `${metrics.nextBillDue.name} on ${formatDate(metrics.nextBillDue.nextDueDate)}` : 'No upcoming bills'}
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filter Controls */}
      <div className="bills-controls">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search bills..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="filter-controls">
          <select 
            value={filterCategory} 
            onChange={(e) => setFilterCategory(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Categories</option>
            {Object.keys(BILL_CATEGORIES).map(category => (
              <option key={category} value={category}>
                {BILL_CATEGORIES[category]} {category}
              </option>
            ))}
          </select>
          <select 
            value={filterStatus} 
            onChange={(e) => setFilterStatus(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>
      </div>

      {/* Enhanced Bills List */}
      <div className="bills-list-section">
        <h3>Bills ({filteredBills.length})</h3>
        <div className="bills-list">
          {filteredBills.length > 0 ? (
            filteredBills.map((bill, index) => (
              <div key={index} className="bill-item">
                <div className="bill-main-info">
                  <div className="bill-icon">
                    {BILL_CATEGORIES[bill.category] || '💰'}
                  </div>
                  <div className="bill-details">
                    <h4>{bill.name}</h4>
                    <div className="bill-meta">
                      <span className="bill-category">{bill.category}</span>
                      <span className="bill-frequency">{bill.recurrence}</span>
                    </div>
                  </div>
                </div>
                
                <div className="bill-amount-section">
                  <div className="bill-amount">{formatCurrency(bill.amount)}</div>
                  <div className="bill-due-date">Due: {formatDate(bill.nextDueDate || bill.dueDate)}</div>
                </div>
                
                <div className="bill-status-section">
                  <span className={getStatusBadgeClass(bill.status)}>
                    {bill.status}
                  </span>
                </div>
                
                <div className="bill-actions">
                  {bill.status !== 'paid' && (
                    <button 
                      className="action-btn mark-paid"
                      onClick={() => handleMarkAsPaid(bill)}
                      disabled={payingBill === bill.name}
                    >
                      {payingBill === bill.name ? 'Processing...' : 'Mark Paid'}
                    </button>
                  )}
                  <button 
                    className="action-btn secondary"
                    onClick={() => {
                      setEditingBill(bill);
                      setShowModal(true);
                    }}
                  >
                    Edit
                  </button>
                  <button 
                    className="action-btn danger"
                    onClick={() => handleDeleteBill(bill)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="no-bills">
              <p>No bills found matching your criteria.</p>
              <button 
                className="add-first-bill-btn"
                onClick={() => {
                  setEditingBill(null);
                  setShowModal(true);
                }}
              >
                Add Your First Bill
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Bill Modal */}
      {showModal && (
        <BillModal
          bill={editingBill}
          categories={Object.keys(BILL_CATEGORIES)}
          onSave={handleSaveBill}
          onCancel={() => {
            setShowModal(false);
            setEditingBill(null);
          }}
        />
      )}
    </div>
  );
};

// Bill Modal Component
const BillModal = ({ bill, categories, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    name: bill?.name || '',
    amount: bill?.amount || '',
    dueDate: bill?.dueDate || '',
    recurrence: bill?.recurrence || 'monthly',
    category: bill?.category || 'Other',
    account: bill?.account || 'bofa',
    notes: bill?.notes || ''
  });

  const [errors, setErrors] = useState({});

  const accounts = [
    { key: 'bofa', name: 'Bank of America' },
    { key: 'chase', name: 'Chase' },
    { key: 'wells', name: 'Wells Fargo' },
    { key: 'capital_one', name: 'Capital One' }
  ];

  const frequencies = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'bi-weekly', label: 'Bi-weekly' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'annually', label: 'Annually' },
    { value: 'one-time', label: 'One-time' }
  ];

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Bill name is required';
    }
    
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      newErrors.amount = 'Valid amount is required';
    }
    
    if (!formData.dueDate) {
      newErrors.dueDate = 'Due date is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (validateForm()) {
      onSave({
        ...formData,
        amount: parseFloat(formData.amount).toString() // Ensure amount is stored as string for consistency
      });
    }
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{bill ? 'Edit Bill' : 'Add New Bill'}</h3>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>
        
        <form className="modal-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Bill Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="e.g., NV Energy, Southwest Gas"
                className={errors.name ? 'error' : ''}
              />
              {errors.name && <span className="error-text">{errors.name}</span>}
            </div>
            
            <div className="form-group">
              <label>Amount *</label>
              <input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => handleInputChange('amount', e.target.value)}
                placeholder="0.00"
                className={errors.amount ? 'error' : ''}
              />
              {errors.amount && <span className="error-text">{errors.amount}</span>}
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Due Date *</label>
              <input
                type="date"
                value={formData.dueDate}
                onChange={(e) => handleInputChange('dueDate', e.target.value)}
                className={errors.dueDate ? 'error' : ''}
              />
              {errors.dueDate && <span className="error-text">{errors.dueDate}</span>}
            </div>
            
            <div className="form-group">
              <label>Frequency</label>
              <select
                value={formData.recurrence}
                onChange={(e) => handleInputChange('recurrence', e.target.value)}
              >
                {frequencies.map(freq => (
                  <option key={freq.value} value={freq.value}>
                    {freq.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Category</label>
              <select
                value={formData.category}
                onChange={(e) => handleInputChange('category', e.target.value)}
              >
                {categories.map(category => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label>Account to Debit</label>
              <select
                value={formData.account}
                onChange={(e) => handleInputChange('account', e.target.value)}
              >
                {accounts.map(account => (
                  <option key={account.key} value={account.key}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="form-group">
            <label>Notes (Optional)</label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleInputChange('notes', e.target.value)}
              placeholder="Additional notes about this bill..."
              rows={3}
            />
          </div>
          
          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn-save">
              {bill ? 'Update Bill' : 'Add Bill'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Bills;