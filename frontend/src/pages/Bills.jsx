import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, collection, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { RecurringBillManager } from '../utils/RecurringBillManager';
import { BillSortingManager } from '../utils/BillSortingManager';
import { NotificationManager } from '../utils/NotificationManager';
import { BillAnimationManager } from '../utils/BillAnimationManager';
import { PlaidIntegrationManager } from '../utils/PlaidIntegrationManager';
import { formatDateForDisplay, formatDateForInput, getPacificTime } from '../utils/DateUtils';
import { TRANSACTION_CATEGORIES, CATEGORY_ICONS, getCategoryIcon, migrateLegacyCategory } from '../constants/categories';
import NotificationSystem from '../components/NotificationSystem';
import './Bills.css';

const Bills = () => {
  const [loading, setLoading] = useState(true);
  const [bills, setBills] = useState([]); // eslint-disable-line no-unused-vars
  const [processedBills, setProcessedBills] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingBill, setEditingBill] = useState(null);
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [payingBill, setPayingBill] = useState(null);

  // Use shared categories for consistency with Transactions page
  const BILL_CATEGORIES = CATEGORY_ICONS;

  useEffect(() => {
    loadBills();
    initializePlaidIntegration();
  }, []);

  // Sync visuals when bills are processed
  useEffect(() => {
    if (processedBills.length > 0) {
      // Use setTimeout to ensure DOM elements are rendered
      setTimeout(() => {
        syncBillVisuals();
      }, 100);
    }
  }, [processedBills]);

  const initializePlaidIntegration = async () => {
    // Initialize Plaid integration manager
    await PlaidIntegrationManager.initialize({
      enabled: false, // Set to true when Plaid is actually integrated
      transactionTolerance: 0.05,
      autoMarkPaid: true
    });

    // Set up callbacks for bill operations
    PlaidIntegrationManager.setBillPaymentProcessor(async (billId, paymentData) => {
      // Find the bill by ID or name
      const bill = processedBills.find(b => 
        b.id === billId || b.name === billId
      );
      
      if (bill) {
        await processBillPaymentInternal(bill, paymentData);
      }
    });

    PlaidIntegrationManager.setBillsProvider(async () => {
      return processedBills.filter(bill => bill.status !== 'paid');
    });
  };

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
          category: migrateLegacyCategory(bill.category || 'Bills & Utilities')
        }));
        setProcessedBills(processed);
      }
    } catch (error) {
      console.error('Error loading bills:', error);
      
      // Use mock data for demonstration when Firebase is unavailable  
      // Mock data updated to show UPCOMING bills as mentioned in the problem statement
      const mockBills = [
        {
          name: 'PiercePrime',
          amount: 125.50,
          category: 'Bills & Utilities',
          recurrence: 'monthly',
          dueDate: '2025-10-24',
          nextDueDate: '2025-10-24',
          status: 'pending',
          account: 'bofa',
          autopay: false
        },
        {
          name: 'Southwest Gas',
          amount: 89.99,
          category: 'Bills & Utilities', 
          recurrence: 'monthly',
          dueDate: '2025-10-24',
          nextDueDate: '2025-10-24',
          status: 'pending',
          account: 'bofa',
          autopay: false
        },
        {
          name: 'Credit Card Payment',
          amount: 450.00,
          category: 'Bills & Utilities',
          recurrence: 'monthly', 
          dueDate: '2025-11-15',
          nextDueDate: '2025-11-15',
          status: 'pending',
          account: 'bofa',
          autopay: false
        },
        {
          name: 'Rent Payment',
          amount: 1850.00,
          category: 'Bills & Utilities',
          recurrence: 'monthly',
          dueDate: '2025-12-01',
          nextDueDate: '2025-12-01', 
          status: 'pending',
          account: 'bofa',
          autopay: false
        },
        {
          name: 'Phone Bill',
          amount: 65.00,
          category: 'Bills & Utilities',
          recurrence: 'monthly',
          dueDate: '2025-11-01',
          nextDueDate: '2025-11-01',
          status: 'pending',
          account: 'bofa',
          autopay: false
        }
      ];
      
      setBills(mockBills);
      setProcessedBills(mockBills.map(bill => ({
        ...bill,
        category: migrateLegacyCategory(bill.category || 'Bills & Utilities')
      })));
    } finally {
      setLoading(false);
    }
  };

  const determineBillStatus = (bill) => {
    // Use the centralized logic from RecurringBillManager
    if (RecurringBillManager.isBillPaidForCurrentCycle(bill)) {
      return 'paid';
    }
    
    const now = new Date();
    const dueDate = new Date(bill.nextDueDate || bill.dueDate);
    const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
    
    // Status based on urgency relative to due date
    if (daysUntilDue < 0) {
      return 'overdue';
    } else if (daysUntilDue === 0) {
      return 'due-today';
    } else if (daysUntilDue <= 3) {
      return 'urgent';
    } else if (daysUntilDue <= 7) {
      return 'this-week';
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
        // Check payment history instead of bill status
        const lastPaidDate = bill.lastPaidDate ? new Date(bill.lastPaidDate) : null;
        return lastPaidDate && lastPaidDate >= currentMonth && lastPaidDate <= nextMonth;
      })
      .reduce((sum, bill) => sum + (parseFloat(bill.amount) || 0), 0);
    
    const upcomingBills = processedBills.filter(bill => {
      const dueDate = new Date(bill.nextDueDate || bill.dueDate);
      const status = determineBillStatus(bill);
      return ['pending', 'this-week', 'urgent'].includes(status) && dueDate <= nextMonth;
    });
    
    const overdueBills = processedBills.filter(bill => determineBillStatus(bill) === 'overdue');
    
    const nextBillDue = processedBills
      .filter(bill => {
        const status = determineBillStatus(bill);
        return ['pending', 'this-week', 'urgent', 'due-today'].includes(status);
      })
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

  // Filter bills based on search and filters, then apply smart sorting
  const filteredBills = (() => {
    const filtered = processedBills.filter(bill => {
      const matchesSearch = bill.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategory === 'all' || bill.category === filterCategory;
      const matchesStatus = filterStatus === 'all' || bill.status === filterStatus;
      return matchesSearch && matchesCategory && matchesStatus;
    });

    // Apply smart sorting with urgency information
    return BillSortingManager.processBillsWithUrgency(filtered, 'dueDate');
  })();

  const handleMarkAsPaid = async (bill) => {
    if (payingBill) return;
    
    // Check if bill has already been paid for current cycle
    if (RecurringBillManager.isBillPaidForCurrentCycle(bill)) {
      NotificationManager.showWarning(`${bill.name} has already been paid for this billing cycle.`);
      return;
    }
    
    setPayingBill(bill.name);

    // Show loading notification
    const loadingNotificationId = NotificationManager.showLoading(
      `Processing payment for ${bill.name}...`
    );

    try {
      // Animate payment processing
      BillAnimationManager.animateBillPayment(
        `${bill.name}-${bill.amount}`, 
        async () => {
          // This callback runs when animation completes
          await loadBills(); // Reload bills to show updated state
          BillAnimationManager.addStaggerAnimation(); // Re-animate the list
        }
      );

      await processBillPaymentInternal(bill);

      // Sync visuals immediately after payment processing
      setTimeout(() => {
        syncBillVisuals();
      }, 500);

      // Remove loading notification and show success
      NotificationManager.removeNotification(loadingNotificationId);
      NotificationManager.showPaymentSuccess(bill);

    } catch (error) {
      console.error('Error marking bill as paid:', error);
      NotificationManager.removeNotification(loadingNotificationId);
      NotificationManager.showError('Error processing payment', error);
    } finally {
      setPayingBill(null);
    }
  };

  const processBillPaymentInternal = async (bill, paymentData = {}) => {
    // Create transaction
    const transaction = {
      amount: -Math.abs(parseFloat(bill.amount)),
      description: `${bill.name} Payment`,
      category: 'Bills & Utilities',
      account: 'bofa', // Default to main account
      date: formatDateForInput(paymentData.paidDate || getPacificTime()),
      timestamp: Date.now(),
      type: 'expense',
      ...paymentData
    };

    // Add transaction to Firebase
    const transactionsRef = collection(db, 'users', 'steve-colburn', 'transactions');
    await addDoc(transactionsRef, transaction);

    // Update account balance
    await updateAccountBalance('bofa', transaction.amount);

    // Mark bill as paid with next due date calculation
    await updateBillAsPaid(bill, paymentData.paidDate);
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

  const updateBillAsPaid = async (bill, paidDate = null) => {
    try {
      const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal'); 
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      const bills = currentData.bills || [];
      
      const updatedBills = bills.map(b => {
        if (b.name === bill.name && b.amount === bill.amount) {
          // Use RecurringBillManager to properly calculate next due date and update status
          return RecurringBillManager.markBillAsPaid(b, paidDate || getPacificTime());
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

  const testPlaidAutoPayment = async () => {
    // Find an unpaid bill to simulate auto-payment for
    const unpaidBills = processedBills.filter(bill => bill.status !== 'paid');
    
    if (unpaidBills.length === 0) {
      NotificationManager.showNotification({
        type: 'warning',
        message: 'No unpaid bills available for auto-payment simulation',
        duration: 3000
      });
      return;
    }

    const testBill = unpaidBills[0];
    
    // Simulate a Plaid transaction
    await PlaidIntegrationManager.simulateTransaction({
      amount: parseFloat(testBill.amount),
      merchantName: testBill.name,
      date: new Date().toISOString().split('T')[0]
    });
  };

  const showNotification = (message, type) => {
    // Use the new NotificationManager instead of console.log
    NotificationManager.showNotification({
      type,
      message,
      duration: 3000
    });
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
      
      // Sync visuals after loading
      setTimeout(() => {
        syncBillVisuals();
      }, 200);
      
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
      case 'overdue': return 'status-badge status-overdue';
      case 'due-today': return 'status-badge status-due-today';
      case 'urgent': return 'status-badge status-urgent';
      case 'this-week': return 'status-badge status-this-week';
      case 'pending': return 'status-badge status-pending';
      case 'paid': return 'status-badge status-paid';
      default: return 'status-badge';
    }
  };

  const getStatusDisplayText = (bill) => {
    const now = new Date();
    const dueDate = new Date(bill.nextDueDate || bill.dueDate);
    const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
    const status = determineBillStatus(bill);
    
    switch (status) {
      case 'overdue':
        return `OVERDUE by ${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) !== 1 ? 's' : ''}`;
      case 'due-today':
        return 'DUE TODAY';
      case 'urgent':
        return `Due in ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''}`;
      case 'this-week':
        return `Due in ${daysUntilDue} days`;
      case 'pending':
        return 'UPCOMING';
      case 'paid':
        return 'PAID';
      default:
        return status.toUpperCase();
    }
  };

  // Visual sync function to ensure bill styling matches status
  const syncBillVisuals = () => {
    processedBills.forEach(bill => {
      const billElement = document.getElementById(`bill-${bill.name}-${bill.amount}`);
      if (!billElement) return;
      
      // Calculate current status
      const currentStatus = determineBillStatus(bill);
      
      // Update data-status attribute
      billElement.setAttribute('data-status', currentStatus);
      
      // Remove old status classes
      const statusClasses = ['overdue', 'urgent', 'due-today', 'this-week', 'pending', 'paid'];
      billElement.classList.remove(...statusClasses);
      
      // Add current status class
      billElement.classList.add(currentStatus);
      
      // Update border color based on status
      const statusColors = {
        'overdue': '#ff073a',
        'urgent': '#ffdd00', 
        'due-today': '#ff6b00',
        'this-week': '#00b4ff',
        'pending': '#00ff88',
        'paid': '#00ff88'
      };
      
      const borderColor = statusColors[currentStatus] || '#00ff88';
      billElement.style.borderColor = borderColor;
      
      // Update box shadow
      const shadowColors = {
        'overdue': 'rgba(255, 7, 58, 0.3)',
        'urgent': 'rgba(255, 221, 0, 0.3)', 
        'due-today': 'rgba(255, 107, 0, 0.3)',
        'this-week': 'rgba(0, 180, 255, 0.2)',
        'pending': 'rgba(0, 255, 136, 0.2)',
        'paid': 'rgba(0, 255, 136, 0.2)'
      };
      
      const shadowColor = shadowColors[currentStatus] || 'rgba(0, 255, 136, 0.2)';
      const shadowSize = currentStatus === 'overdue' ? '16px' : currentStatus === 'urgent' || currentStatus === 'due-today' ? '12px' : '8px';
      billElement.style.boxShadow = `0 0 ${shadowSize} ${shadowColor}`;
    });
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
      {/* Notification System */}
      <NotificationSystem />
      
      {/* Header with Add Bill Button */}
      <div className="page-header">
        <div className="header-content">
          <div>
            <h2>🧾 Bills Management</h2>
            <p>Complete bill lifecycle management and automation</p>
          </div>
          <div>
            <button 
              className="add-bill-btn-header"
              onClick={() => {
                setEditingBill(null);
                setShowModal(true);
              }}
            >
              + Add New Bill
            </button>
            
            {/* Development: Test Plaid Auto-Payment Detection */}
            {typeof window !== 'undefined' && window.location.hostname === 'localhost' && (
              <button 
                className="test-plaid-btn"
                onClick={() => testPlaidAutoPayment()}
                style={{ 
                  marginLeft: '10px', 
                  background: '#ff6b00', 
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '12px 16px',
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                🧪 Test Auto-Payment
              </button>
            )}
          </div>
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
            {TRANSACTION_CATEGORIES.map(category => (
              <option key={category} value={category}>
                {getCategoryIcon(category)} {category}
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
              <div 
                key={`${bill.name}-${bill.amount}-${index}`} 
                id={`bill-${bill.name}-${bill.amount}`}
                data-bill-id={`${bill.name}-${bill.amount}`}
                data-status={bill.status}
                className={`bill-item ${bill.urgencyInfo?.className || ''} ${bill.status} ${payingBill === bill.name ? 'bill-processing' : ''}`}
              >
                <div className="bill-main-info">
                  <div className="bill-icon">
                    {getCategoryIcon(bill.category)}
                  </div>
                  <div className="bill-details">
                    <h4>{bill.name}</h4>
                    <div className="bill-meta">
                      <span className="bill-category">{bill.category}</span>
                      <span className="bill-frequency">{bill.recurrence}</span>
                      {bill.urgencyInfo && (
                        <span className="urgency-indicator">{bill.urgencyInfo.indicator} {bill.urgencyInfo.label}</span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="bill-amount-section">
                  <div className="bill-amount">{formatCurrency(bill.amount)}</div>
                  <div className="bill-due-date">
                    {bill.formattedDueDate || `Due: ${formatDate(bill.nextDueDate || bill.dueDate)}`}
                  </div>
                </div>
                
                <div className="bill-status-section">
                  <span className={getStatusBadgeClass(bill.status)}>
                    {getStatusDisplayText(bill)}
                  </span>
                </div>
                
                <div className="bill-actions">
                  <button 
                    className="action-btn mark-paid"
                    onClick={() => handleMarkAsPaid(bill)}
                    disabled={payingBill === bill.name || RecurringBillManager.isBillPaidForCurrentCycle(bill)}
                  >
                    {payingBill === bill.name ? 'Processing...' : 
                     RecurringBillManager.isBillPaidForCurrentCycle(bill) ? 'Already Paid' : 'Mark Paid'}
                  </button>
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
          categories={TRANSACTION_CATEGORIES}
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
    category: migrateLegacyCategory(bill?.category || 'Bills & Utilities'),
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