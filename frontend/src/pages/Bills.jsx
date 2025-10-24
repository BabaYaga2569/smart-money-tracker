import React, { useMemo, useState, useEffect } from "react";
import { collection, doc, onSnapshot, orderBy, query, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { findMatchingTransactionForBill } from "../utils/billMatcher";
import "./Bills.css";

export default function Bills() {


const generateBillId = () => {
  return `bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const Bills = () => {
  const { currentUser } = useAuth();
  const [bills, setBills] = useState([]);
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    if (!currentUser) return;
    const billsRef = collection(db, "users", currentUser.uid, "bills");
    const q = query(billsRef, orderBy("dueDate", "asc"));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setBills(data);
    });
    return () => unsub();
  }, [currentUser]);

  // If you already load transactions elsewhere, remove this listener and pass them in
  useEffect(() => {
    if (!currentUser) return;
    const txRef = collection(db, "users", currentUser.uid, "transactions");
    const unsub = onSnapshot(txRef, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTransactions(data);
    });
    return () => unsub();
  }, [currentUser]);

  const now = new Date();

  const { overdue, upcoming, paid } = useMemo(() => {
    const o = [], u = [], p = [];
    for (const b of bills) {
      const isPaid = !!b.paid;
      const due = b.dueDate ? new Date(b.dueDate) : null;
      const pastDue = due && due < new Date(now.toDateString()) && !isPaid;
      if (isPaid) p.push(b); else if (pastDue) o.push(b); else u.push(b);
    }
    o.sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate));
    u.sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate));
    p.sort((a,b)=>new Date(b.paidDate||0)-new Date(a.paidDate||0));
    return { overdue:o, upcoming:u, paid:p };
  }, [bills]);

  async function markPaid(bill) {
    if (!currentUser) return;
    const ref = doc(db, "users", currentUser.uid, "bills", bill.id);
    await updateDoc(ref, { paid:true, paidDate:Timestamp.now(), paidVia:"Manual" });
  }

  // Local auto-match pass using transactions (non-destructive; only marks when certain)
  useEffect(() => {
    (async () => {
      if (!currentUser || !transactions.length || !bills.length) return;
      const updates = [];
      for (const b of bills) {
        if (b.paid) continue;
        const m = findMatchingTransactionForBill(b, transactions);
        if (!m) continue;
        const ref = doc(db, "users", currentUser.uid, "bills", b.id);
        updates.push(updateDoc(ref, {
          paid: true,
          paidDate: Timestamp.now(),
          paidVia: "Auto (Plaid)",
          lastMatchedTxnId: m.id || null,
        }));
      }
      await Promise.allSettled(updates);
    })();
  }, [currentUser, transactions, bills]);

  const Section = ({ title, items, emptyText }) => (
    <section className="bills-section">
      <h3 className="bills-section-title">{title} ({items.length})</h3>
      {items.length===0 ? <div className="bills-empty">{emptyText}</div> : (
        <div className="bills-list">
          {items.map(b => {
            const isOverdue = new Date(b.dueDate) < now && !b.paid;
            return (
              <div key={b.id} className={`bill-card ${b.paid?"paid":""} ${isOverdue?"overdue":""}`}>
                <div className="bill-title-row">
                  <span className="bill-name">{b.name}</span>
                  <span className="bill-amount">${Number(b.amount).toFixed(2)}</span>
        setProcessedBills(processed);
      }
    } catch (error) {
  console.error('Error loading bills:', error);
}

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
  }
];

setBills(mockBills);
setProcessedBills(
  mockBills.map(bill => ({
    ...bill,
    category: migrateLegacyCategory(bill.category || 'Bills & Utilities'),
  }))
);

} finally {
  setLoading(false);
}


  const loadAccounts = async () => {
    // ... rest of your loadAccounts function stays exactly the same
    try {
      const token = localStorage.getItem('token');
      
      if (token) {
        try {
          const apiUrl = import.meta.env.VITE_API_URL || 'https://smart-money-tracker-09ks.onrender.com';
          
          const response = await fetch(`${apiUrl}/api/accounts`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (response.ok) {
            let data;
            try {
              data = await response.json();
            } catch (parseError) {
              console.warn('Failed to parse API response, falling back to Firebase:', parseError);
            }
            
            if (data?.success === false) {
            } else if (data) {
              const accountsList = data?.accounts || data;
              
              if (Array.isArray(accountsList) && accountsList.length > 0) {
                const accountsMap = {};
                accountsList.forEach(account => {
                  if (!account) return;
                  
                  const accountId = account?.account_id || account?.id || account?._id;
                  
                  if (!accountId) {
                    console.warn('Account missing ID, skipping:', account);
                    return;
                  }
                  
                  let balance = 0;
                  if (account?.balances) {
                    balance = account.balances?.current || account.balances?.available || 0;
                  } else if (account?.current_balance !== undefined) {
                    balance = account.current_balance;
                  } else if (account?.balance !== undefined) {
                    balance = account.balance;
                  }
                  
                  accountsMap[accountId] = {
                    name: account?.name || account?.official_name || 'Unknown Account',
                    type: account?.subtype || account?.type || 'checking',
                    balance: balance.toString(),
                    mask: account?.mask || '',
                    institution: account?.institution_name || ''
                  };
                });
                setAccounts(accountsMap);
                return;
              }
            }
          }
        } catch {
        }
      }
      
      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      const settingsDocSnap = await getDoc(settingsDocRef);
      
      if (settingsDocSnap.exists()) {
        const data = settingsDocSnap.data();
        const plaidAccountsList = data.plaidAccounts || [];
        const bankAccounts = data.bankAccounts || {};
        
        setHasPlaidAccounts(plaidAccountsList.length > 0);
        
        if (plaidAccountsList.length > 0) {
          const accountsMap = {};
          plaidAccountsList.forEach(account => {
            const accountId = account.account_id;
            accountsMap[accountId] = {
              name: account.official_name || account.name,
              type: account.type,
              balance: account.balance,
              mask: account.mask || '',
              institution: ''
            };
          });
          setAccounts(accountsMap);
        } else {
          setAccounts(bankAccounts);
        }
      }
    } catch (error) {
      if (error.name !== 'TypeError') {
        console.warn('Error loading accounts, using defaults:', error.message);
      }
      setAccounts({
        bofa: { name: 'Bank of America', type: 'Checking', balance: '0' },
        chase: { name: 'Chase', type: 'Checking', balance: '0' },
        wells: { name: 'Wells Fargo', type: 'Savings', balance: '0' },
        capital_one: { name: 'Capital One', type: 'Credit', balance: '0' }
      });
    }
  };

  const determineBillStatus = (bill) => {
    if (bill.status === 'skipped') {
      return 'skipped';
    }
    
    if (RecurringBillManager.isBillPaidForCurrentCycle(bill)) {
      return 'paid';
    }
    
    const now = new Date();
    const dueDate = new Date(bill.nextDueDate || bill.dueDate);
    const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
    
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

  const calculateMetrics = () => {
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    const totalMonthlyBills = processedBills.reduce((sum, bill) => sum + (parseFloat(bill.amount) || 0), 0);
    
    const upcomingBills = processedBills.filter(bill => {
      if (bill.status === 'skipped') return false;
      const dueDate = new Date(bill.nextDueDate || bill.dueDate);
      const status = determineBillStatus(bill);
      return ['pending', 'this-week', 'urgent'].includes(status) && dueDate <= nextMonth;
    });
    
    const overdueBills = processedBills.filter(bill => {
      if (bill.status === 'skipped') return false;
      return determineBillStatus(bill) === 'overdue';
    });
    
    const nextBillDue = processedBills
      .filter(bill => {
        if (bill.status === 'skipped') return false;
        const status = determineBillStatus(bill);
        return ['pending', 'this-week', 'urgent', 'due-today'].includes(status);
      })
      .sort((a, b) => new Date(a.nextDueDate || a.dueDate) - new Date(b.nextDueDate || b.dueDate))[0];
    
    return {
      totalMonthlyBills,
      paidThisMonth,
      paidBillsCount,
      upcomingBills: upcomingBills.reduce((sum, bill) => sum + (parseFloat(bill.amount) || 0), 0),
      upcomingCount: upcomingBills.length,
      overdueBills: overdueBills.reduce((sum, bill) => sum + (parseFloat(bill.amount) || 0), 0),
      overdueCount: overdueBills.length,
      nextBillDue
    };
  };

  const metrics = calculateMetrics();

  const filteredBills = (() => {
    const filtered = processedBills.filter(bill => {
      const matchesSearch = bill.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategory === 'all' || bill.category === filterCategory;
      
      let matchesStatus = false;
      if (filterStatus === 'all') {
        matchesStatus = true;
      } else if (filterStatus === 'upcoming') {
        matchesStatus = ['pending', 'urgent', 'due-today', 'this-week'].includes(bill.status);
      } else {
        matchesStatus = bill.status === filterStatus;
      }
      
      const matchesRecurring = filterRecurring === 'all' || 
                              (filterRecurring === 'recurring' && bill.recurringTemplateId) ||
                              (filterRecurring === 'manual' && !bill.recurringTemplateId);
      return matchesSearch && matchesCategory && matchesStatus && matchesRecurring;
    });

    return BillSortingManager.processBillsWithUrgency(filtered, 'dueDate');
  })();

  const handleMarkAsPaid = async (bill) => {
    if (payingBill) return;
    
    const paymentCheck = RecurringBillManager.canPayBill(bill);
    if (!paymentCheck.canPay) {
      NotificationManager.showWarning(paymentCheck.reason);
      return;
    }
    
    setPayingBill(bill.name);

    const loadingNotificationId = NotificationManager.showLoading(
      `Processing payment for ${bill.name}...`
    );

    try {
      BillAnimationManager.animateBillPayment(
        `${bill.name}-${bill.amount}`, 
        async () => {
          await loadBills();
          BillAnimationManager.addStaggerAnimation();
        }
      );

      await processBillPaymentInternal(bill);

      setTimeout(() => {
        syncBillVisuals();
      }, 500);

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

  const handleUnmarkAsPaid = async (bill) => {
    try {
      const loadingNotificationId = NotificationManager.showLoading(
        `Unmarking ${bill.name} as paid...`
      );

      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      const currentDoc = await getDoc(settingsDocRef);
      
      if (!currentDoc.exists()) {
        NotificationManager.removeNotification(loadingNotificationId);
        throw new Error('Settings document not found');
      }
      
      const currentData = currentDoc.data();
      const bills = currentData.bills || [];
      
      let billFound = false;
      
      const updatedBills = bills.map(b => {
        if (b.id === bill.id) {
          billFound = true;
          const updatedBill = { ...b };
          
          // CRITICAL FIX: Restore to the cycle that was actually paid
          // lastPayment.dueDate contains the original cycle, not the advanced one
          if (updatedBill.lastPayment && updatedBill.lastPayment.dueDate) {
            updatedBill.nextDueDate = updatedBill.lastPayment.dueDate;
            updatedBill.dueDate = updatedBill.lastPayment.dueDate;
          }
          
          // Remove payment data
          delete updatedBill.lastPaidDate;
          delete updatedBill.lastPayment;
          delete updatedBill.isPaid;
          delete updatedBill.status;
          
          if (updatedBill.paymentHistory && updatedBill.paymentHistory.length > 0) {
            updatedBill.paymentHistory = updatedBill.paymentHistory.slice(0, -1);
          }
          
          return updatedBill;
        }
        return b;
      });
      
      if (!billFound) {
        NotificationManager.removeNotification(loadingNotificationId);
        throw new Error(`Bill "${bill.name}" not found in database`);
      }
      
      await updateDoc(settingsDocRef, {
        ...currentData,
        bills: updatedBills
      });
      
      NotificationManager.removeNotification(loadingNotificationId);
      
      await loadBills();
      
      NotificationManager.showSuccess(`${bill.name} unmarked as paid`);
    } catch (error) {
      console.error('Error unmarking bill as paid:', error);
      NotificationManager.showError(
        'Error unmarking bill',
        error.message || 'An unexpected error occurred. Please try again.'
      );
    }
  };
  const processBillPaymentInternal = async (bill, paymentData = {}) => {
    const paidDate = paymentData.paidDate || getPacificTime();
    const paidDateStr = formatDateForInput(paidDate);
    
    const transaction = {
      amount: -Math.abs(parseFloat(bill.amount)),
      description: `${bill.name} Payment`,
      category: 'Bills & Utilities',
      account: 'bofa',
      date: paidDateStr,
      timestamp: Date.now(),
      type: 'expense',
      source: paymentData.source || 'manual',
      ...paymentData
    };

    const transactionsRef = collection(db, 'users', currentUser.uid, 'transactions');
    await addDoc(transactionsRef, transaction);

    await updateAccountBalance('bofa', transaction.amount);

    // Calculate if payment is overdue
    const now = new Date(paidDate);
    const dueDate = new Date(bill.nextDueDate || bill.dueDate);
    const daysPastDue = Math.max(0, Math.floor((now - dueDate) / (1000 * 60 * 60 * 24)));
    
    // Record payment in bill_payments collection
    const paymentsRef = collection(db, 'users', currentUser.uid, 'bill_payments');
    await addDoc(paymentsRef, {
      billId: bill.id,
      billName: bill.name,
      amount: Math.abs(parseFloat(bill.amount)),
      dueDate: bill.nextDueDate || bill.dueDate,
      paidDate: paidDateStr,
      paymentMonth: paidDateStr.slice(0, 7),
      paymentMethod: paymentData.method || paymentData.source || 'Manual',
      category: bill.category || 'Bills & Utilities',
      linkedTransactionId: paymentData.transactionId || null,
      isOverdue: daysPastDue > 0,
      daysPastDue: daysPastDue,
      createdAt: new Date()
    });

    await updateBillAsPaid(bill, paidDate, {
      method: paymentData.method || 'manual',
      source: paymentData.source || 'manual',
      transactionId: paymentData.transactionId,
      accountId: paymentData.accountId,
      merchantName: paymentData.merchantName || bill.name,
      amount: Math.abs(parseFloat(bill.amount))
    });
    
    // Reload paid this month after recording payment
    await loadPaidThisMonth();
  };

  const updateAccountBalance = async (accountKey, amount) => {
    try {
      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
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

  const updateBillAsPaid = async (bill, paidDate = null, paymentOptions = {}) => {
    try {
      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal'); 
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      const bills = currentData.bills || [];
      
      const updatedBills = bills.map(b => {
        if (b.id === bill.id) {
          return RecurringBillManager.markBillAsPaid(
            b, 
            paidDate || getPacificTime(),
            paymentOptions
          );
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
    
    await PlaidIntegrationManager.simulateTransaction({
      amount: parseFloat(testBill.amount),
      merchantName: testBill.name,
      date: new Date().toISOString().split('T')[0]
    });
  };

  const showNotification = (message, type) => {
    NotificationManager.showNotification({
      type,
      message,
      duration: 3000
    });
  };

  const handleSaveBill = async (billData) => {
    try {
      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      const bills = currentData.bills || [];
      
      if (editingBill) {
        const updatedBills = bills.map(bill => {
          if (bill.id === editingBill.id) {
            return { ...billData, id: editingBill.id, originalDueDate: billData.dueDate };
          }
          return bill;
        });
        
        await updateDoc(settingsDocRef, {
          ...currentData,
          bills: updatedBills
        });
        
        showNotification('Bill updated successfully!', 'success');
      } else {
        const isDuplicate = bills.some(bill => {
          const exactMatch = bill.name.toLowerCase() === billData.name.toLowerCase() && 
                             parseFloat(bill.amount) === parseFloat(billData.amount) &&
                             bill.dueDate === billData.dueDate &&
                             bill.recurrence === billData.recurrence;
          
          return exactMatch;
        });
        
        if (isDuplicate) {
          showNotification('A bill with the same name, amount, due date, and frequency already exists!', 'error');
          return;
        }
        
        const similarBill = bills.find(bill => 
          bill.name.toLowerCase() === billData.name.toLowerCase() && 
          parseFloat(bill.amount) === parseFloat(billData.amount) &&
          (bill.dueDate !== billData.dueDate || bill.recurrence !== billData.recurrence)
        );
        
        if (similarBill) {
          const proceed = window.confirm(
            `A bill named "${similarBill.name}" with amount $${similarBill.amount} already exists.\n\n` +
            `Existing: ${similarBill.recurrence} on ${similarBill.dueDate}\n` +
            `New: ${billData.recurrence} on ${billData.dueDate}\n\n` +
            `This might be legitimate (e.g., twice-monthly rent). Do you want to proceed?`
          );
          
          if (!proceed) {
            return;
          }
        }
        
        const newBill = {
          ...billData,
          id: generateBillId(),
          originalDueDate: billData.dueDate,
          status: 'pending'
        };
        
        await updateDoc(settingsDocRef, {
          ...currentData,
          bills: [...bills, newBill]
        });
        
        showNotification('Bill added successfully!', 'success');
      }
      
      await loadBills();
      
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
      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      const bills = currentData.bills || [];
      const updatedBills = bills.filter(bill => bill.id !== billToDelete.id);
      
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

  const handleToggleSkipBill = async (bill) => {
    try {
      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      const bills = currentData.bills || [];
      const newStatus = bill.status === 'skipped' ? 'pending' : 'skipped';
      
      const updatedBills = bills.map(b => 
        b.id === bill.id 
          ? { ...b, status: newStatus, skippedAt: newStatus === 'skipped' ? new Date().toISOString() : null }
          : b
      );
      
      await updateDoc(settingsDocRef, {
        ...currentData,
        bills: updatedBills
      });
      
      await loadBills();
      showNotification(
        newStatus === 'skipped' ? 'Bill skipped for this month' : 'Bill unskipped', 
        'success'
      );
    } catch (error) {
      console.error('Error toggling skip status:', error);
      showNotification('Error updating bill', 'error');
    }
  };

  const handleBulkDelete = async () => {
    setShowBulkDeleteModal(false);
    
    try {
      setLoading(true);
      
      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      const billsToDelete = currentData.bills || [];
      setDeletedBills(billsToDelete);
      
      await updateDoc(settingsDocRef, {
        ...currentData,
        bills: []
      });
      
      await loadBills();
      showNotification(
        `Deleted ${billsToDelete.length} bills. Click Undo to restore.`, 
        'success'
      );
    } catch (error) {
      console.error('Error bulk deleting bills:', error);
      showNotification('Error deleting bills', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUndoBulkDelete = async () => {
    if (deletedBills.length === 0) return;
    
    try {
      setLoading(true);
      
      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      await updateDoc(settingsDocRef, {
        ...currentData,
        bills: deletedBills
      });
      
      await loadBills();
      setDeletedBills([]);
      showNotification('Bills restored successfully!', 'success');
    } catch (error) {
      console.error('Error undoing bulk delete:', error);
      showNotification('Error restoring bills', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeduplicateBills = async () => {
    if (!confirm('This will scan all bills and remove duplicates based on name, amount, due date, and frequency. The first occurrence of each bill will be kept. Continue?')) {
      return;
    }

    try {
      setDeduplicating(true);
      
      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      const existingBills = currentData.bills || [];
      
      const report = BillDeduplicationManager.generateDuplicateReport(existingBills);
      
      if (report.duplicateCount === 0) {
        showNotification('No duplicate bills found. All bills are unique.', 'info');
        setDeduplicating(false);
        return;
      }
      
      const result = BillDeduplicationManager.removeDuplicates(existingBills);
      
      BillDeduplicationManager.logDeduplication(result, 'manual');
      
      await updateDoc(settingsDocRef, {
        ...currentData,
        bills: result.cleanedBills
      });
      
      await loadBills();
      
      const message = BillDeduplicationManager.getSummaryMessage(result.stats);
      showNotification(message, 'success');
      
      if (result.removedBills.length > 0) {
        console.log('[Manual Deduplication] Removed bills:', result.removedBills.map(b => ({
          name: b.name,
          amount: b.amount,
          dueDate: b.dueDate,
          recurrence: b.recurrence
        })));
      }
      
    } catch (error) {
      console.error('Error deduplicating bills:', error);
      showNotification('Error deduplicating bills', 'error');
    } finally {
      setDeduplicating(false);
    }
  };

  const handleCSVImport = async (importedBills) => {
    try {
      setLoading(true);
      
      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      const existingBills = currentData.bills || [];
      
      const cleanedBills = importedBills.map(bill => {
        const { dateError, dateWarning, rowNumber, isDuplicate, ...cleanBill } = bill;
        return cleanBill;
      });
      
      const updatedBills = [...existingBills, ...cleanedBills];
      
      const errorsCount = importedBills.filter(b => b.dateError).length;
      const warningsCount = importedBills.filter(b => b.dateWarning && !b.dateError).length;
      
      const importEntry = {
        id: `import_${Date.now()}`,
        timestamp: new Date().toISOString(),
        billCount: importedBills.length,
        errorsCount: errorsCount,
        warningsCount: warningsCount,
        bills: importedBills.map(b => ({ 
          id: b.id, 
          name: b.name, 
          amount: b.amount, 
          dueDate: b.dueDate,
          institutionName: b.institutionName || '',
          dateError: b.dateError || null,
          dateWarning: b.dateWarning || null
        }))
      };
      
      const newHistory = [importEntry, ...importHistory].slice(0, 10);
      setImportHistory(newHistory);
      
      await updateDoc(settingsDocRef, {
        ...currentData,
        bills: updatedBills,
        importHistory: newHistory
      });
      
      await loadBills();
      setShowCSVImport(false);
      
      let message = `Successfully imported ${importedBills.length} bills`;
      if (errorsCount > 0) message += ` (${errorsCount} with errors)`;
      if (warningsCount > 0) message += ` (${warningsCount} with warnings)`;
      showNotification(message, errorsCount > 0 ? 'warning' : 'success');
    } catch (error) {
      console.error('Error importing bills:', error);
      showNotification('Error importing bills', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUndoLastImport = async () => {
    if (importHistory.length === 0) return;
    
    try {
      setLoading(true);
      const lastImport = importHistory[0];
      
      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      const existingBills = currentData.bills || [];
      const importedBillIds = new Set(lastImport.bills.map(b => b.id));
      const updatedBills = existingBills.filter(bill => !importedBillIds.has(bill.id));
      
      const newHistory = importHistory.slice(1);
      setImportHistory(newHistory);
      
      await updateDoc(settingsDocRef, {
        ...currentData,
        bills: updatedBills,
        importHistory: newHistory
      });
      
      await loadBills();
      showNotification(`Undid import of ${lastImport.billCount} bills`, 'success');
    } catch (error) {
      console.error('Error undoing import:', error);
      showNotification('Error undoing import', 'error');
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
    if (bill.status === 'skipped') {
      return '⏭️ SKIPPED';
    }
    
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

  const syncBillVisuals = () => {
    processedBills.forEach(bill => {
      const billElement = document.getElementById(`bill-${bill.name}-${bill.amount}`);
      if (!billElement) return;
      
      const currentStatus = determineBillStatus(bill);
      
      billElement.setAttribute('data-status', currentStatus);
      
      const statusClasses = ['overdue', 'urgent', 'due-today', 'this-week', 'pending', 'paid', 'skipped'];
      billElement.classList.remove(...statusClasses);
      
      billElement.classList.add(currentStatus);
      
      const statusColors = {
        'overdue': '#ff073a',
        'urgent': '#ffdd00', 
        'due-today': '#ff6b00',
        'this-week': '#00b4ff',
        'pending': '#00ff88',
        'paid': '#00ff88',
        'skipped': '#9c27b0'
      };
      
      const borderColor = statusColors[currentStatus] || '#00ff88';
      billElement.style.borderColor = borderColor;
      
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
      <NotificationSystem />
      
      {!plaidStatus.isConnected && !hasPlaidAccounts && !plaidStatus.hasError && (
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: '8px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          fontSize: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>🔗</span>
            <span>
              <strong>Connect Your Bank</strong> - Automate bill tracking and never miss a payment
            </span>
          </div>
          <button 
            onClick={() => window.location.href = '/accounts'}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: '1px solid rgba(255,255,255,0.4)',
              color: '#fff',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
              whiteSpace: 'nowrap'
            }}
          >
            Connect Bank →
          </button>
        </div>
      )}

      {plaidStatus.hasError && (
        <div style={{
          background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: '8px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          fontSize: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>❌</span>
            <span>
              <strong>Connection Error</strong> - {PlaidConnectionManager.getErrorMessage()}
            </span>
          </div>
          <button 
            onClick={() => setShowErrorModal(true)}
            style={{
              background: 'rgba(255,255,255,0.2)',
              border: '1px solid rgba(255,255,255,0.4)',
              color: '#fff',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
              whiteSpace: 'nowrap'
            }}
          >
            View Details
          </button>
        </div>
      )}
      
      {(plaidStatus.isConnected || hasPlaidAccounts) && !plaidStatus.hasError && (
        <div style={{
          background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
          color: '#fff',
          padding: '12px 24px',
          borderRadius: '8px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
        }}>
          <div style={{ fontSize: '16px', fontWeight: '600' }}>
            ✅ Plaid Connected - Automated bill matching enabled
          </div>
        </div>
      )}
      
      <div className="page-header">
        <div className="header-content">
          <div>
            <h2>🧾 Bills Management</h2>
            <p>Complete bill lifecycle management and automation</p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button 
              onClick={() => setShowHelpModal(true)}
              style={{
                background: '#6c757d',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '12px 20px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              title="Show help and documentation"
            >
              ❓ Help
            </button>
            <button 
              className="add-bill-btn-header"
              onClick={() => {
                setEditingBill(null);
                setShowModal(true);
              }}
            >
              + Add New Bill
            </button>
            
            <button 
              className="refresh-transactions-btn"
              onClick={refreshPlaidTransactions}
              disabled={refreshingTransactions || (!plaidStatus.isConnected && !hasPlaidAccounts)}
              title={
                plaidStatus.hasError 
                  ? 'Plaid connection error - click banner above to see details' 
                  : (!plaidStatus.isConnected && !hasPlaidAccounts)
                    ? 'Connect your bank account with Plaid from the Accounts page to automatically match bills with your transactions' 
                    : 'Automatically match bills with recent bank transactions from Plaid. This will mark bills as paid when matching transactions are found.'
              }
              style={{ 
                marginLeft: '10px', 
                background: plaidStatus.hasError 
                  ? '#dc2626' 
                  : (refreshingTransactions || (!plaidStatus.isConnected && !hasPlaidAccounts))
                    ? '#999' 
                    : '#007bff', 
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                padding: '12px 16px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: (refreshingTransactions || (!plaidStatus.isConnected && !hasPlaidAccounts)) ? 'not-allowed' : 'pointer',
                opacity: (refreshingTransactions || (!plaidStatus.isConnected && !hasPlaidAccounts)) ? 0.6 : 1,
                boxShadow: (refreshingTransactions || (!plaidStatus.isConnected && !hasPlaidAccounts)) ? 'none' : '0 2px 4px rgba(0,123,255,0.3)'
              }}
            >
              {refreshingTransactions 
                ? '🔄 Matching...' 
                : plaidStatus.hasError 
                  ? '❌ Plaid Error' 
                  : (!plaidStatus.isConnected && !hasPlaidAccounts)
                    ? '🔒 Connect Plaid' 
                    : '🔄 Match Transactions'}
            </button>
            
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

      <div className="bills-overview">
        <div className="overview-grid">
          <div className="overview-card">
            <h3>Total Monthly Bills</h3>
            <div className="overview-value">{formatCurrency(metrics.totalMonthlyBills)}</div>
            <div className="overview-label">{processedBills.length} bills</div>
          </div>
          <div 
            className="overview-card clickable" 
            onClick={() => setShowPaymentHistory(true)}
            style={{ cursor: 'pointer' }}
            title="Click to view payment history"
          >
            <h3>💵 Paid This Month</h3>
            <div className="overview-value paid">{formatCurrency(metrics.paidThisMonth)}</div>
            <div className="overview-label">
              {metrics.paidBillsCount} bill{metrics.paidBillsCount !== 1 ? 's' : ''} successfully paid
            </div>
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#00ff88' }}>
              📊 Click to view history →
            </div>
          </div>
          <div className="overview-card">
            <h3>Upcoming Bills</h3>
            <div className="overview-value upcoming">{formatCurrency(metrics.upcomingBills)}</div>
            <div className="overview-label">{metrics.upcomingCount} bills due</div>
          </div>
          <div 
            className="overview-card"
            style={{
              border: metrics.overdueCount > 0 ? '2px solid #ff073a' : '1px solid #333',
              background: metrics.overdueCount > 0 ? 'rgba(255, 7, 58, 0.1)' : '#1a1a1a'
            }}
          >
            <h3>🚨 Overdue Bills</h3>
            <div className="overview-value overdue">{formatCurrency(metrics.overdueBills)}</div>
            <div className="overview-label">
              {metrics.overdueCount} bill{metrics.overdueCount !== 1 ? 's' : ''} overdue
            </div>
            {metrics.overdueCount > 0 && (
              <div style={{ 
                marginTop: '8px', 
                fontSize: '12px', 
                color: '#ff073a',
                fontWeight: 'bold',
                animation: 'pulse 2s infinite'
              }}>
                ⚠️ Pay now to avoid late fees!
              </div>
            )}
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
            <option value="all">📋 All Status</option>
            <option value="upcoming">⏳ Show Upcoming</option>
            <option value="paid">✅ Paid</option>
            <option value="overdue">🚨 Overdue</option>
            <option value="due-today">📅 Due Today</option>
            <option value="urgent">⚠️ Urgent (≤3 days)</option>
            <option value="this-week">📆 This Week</option>
            <option value="pending">🔵 Pending</option>
            <option value="skipped">⏭️ Skipped</option>
          </select>
          <select 
            value={filterRecurring} 
            onChange={(e) => setFilterRecurring(e.target.value)}
            className="filter-select"
            title="Filter by bill source"
          >
            <option value="all">All Bills</option>
            <option value="recurring">🔄 Auto-Generated</option>
            <option value="manual">✋ Manual Bills</option>
          </select>
        </div>
        
        <div className="action-buttons">
          {deletedBills.length > 0 && (
            <button 
              className="undo-button"
              onClick={handleUndoBulkDelete}
              disabled={loading}
              title="Restore deleted bills"
            >
              ↩️ Undo Delete
            </button>
          )}
          {processedBills.length > 0 && (
            <button 
              className="delete-all-button"
              onClick={() => setShowBulkDeleteModal(true)}
              disabled={loading}
              title="Delete all bills"
            >
              🗑️ Delete All Bills
            </button>
          )}
          {processedBills.length > 0 && (
            <button 
              className="deduplicate-button"
              onClick={handleDeduplicateBills}
              disabled={loading || deduplicating}
              title="Remove duplicate bills (keeps first occurrence)"
              style={{
                background: '#17a2b8',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '12px 20px',
                fontWeight: '600',
                cursor: (loading || deduplicating) ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                whiteSpace: 'nowrap',
                opacity: (loading || deduplicating) ? 0.6 : 1
              }}
            >
              {deduplicating ? '🔄 Deduplicating...' : '🧹 Deduplicate Bills'}
            </button>
          )}
          <button 
            className="import-button"
            onClick={() => setShowCSVImport(true)}
            disabled={loading}
            title="Import bills from CSV"
            style={{
              background: '#007bff',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '12px 20px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap',
              opacity: loading ? 0.6 : 1
            }}
          >
            📊 Import from CSV
          </button>
          {importHistory.length > 0 && (
            <>
              <button 
                className="import-history-button"
                onClick={() => setShowImportHistory(true)}
                disabled={loading}
                title="View import history"
                style={{
                  background: '#6c757d',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '12px 20px',
                  fontWeight: '600',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap',
                  opacity: loading ? 0.6 : 1
                }}
              >
                📜 Import History ({importHistory.length})
              </button>
              <button 
                className="undo-import-button"
                onClick={handleUndoLastImport}
                disabled={loading}
                title="Undo last import"
                style={{
                  background: '#ff9800',
                  color: '#000',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '12px 20px',
                  fontWeight: '600',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap',
                  opacity: loading ? 0.6 : 1,
                  animation: 'pulse 2s ease-in-out infinite'
                }}
              >
                ↩️ Undo Last Import
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bills-list-section">
        <h3>Bills ({filteredBills.length === processedBills.length ? filteredBills.length : `${filteredBills.length} of ${processedBills.length}`})</h3>
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
                    <h4>
                      {bill.name}
                      {bill.recurringTemplateId && (
                        <span 
                          className="recurring-badge" 
                          title="Generated from recurring template"
                          style={{
                            marginLeft: '8px',
                            padding: '2px 8px',
                            fontSize: '11px',
                            background: 'rgba(138, 43, 226, 0.2)',
                            color: '#ba68c8',
                            borderRadius: '4px',
                            fontWeight: 'normal'
                          }}
                        >
                          🔄 Auto
                        </span>
                      )}
                    </h4>
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
                  
                  {bill.status === 'overdue' && (
                    <div className="overdue-warning" style={{
                      marginTop: '8px',
                      padding: '6px 10px',
                      background: 'rgba(255, 7, 58, 0.2)',
                      borderRadius: '6px',
                      border: '1px solid #ff073a',
                      fontSize: '11px',
                      color: '#ff073a',
                      fontWeight: 'bold',
                      textAlign: 'center'
                    }}>
                      ⚠️ LATE FEES MAY APPLY!
                    </div>
                  )}
                  
                  {bill.lastPayment && bill.lastPayment.source === 'plaid' && bill.lastPayment.transactionId && (
                    <div className="matched-transaction-info" style={{
                      marginTop: '8px',
                      padding: '6px 8px',
                      background: 'rgba(0, 212, 255, 0.1)',
                      borderRadius: '4px',
                      fontSize: '11px',
                      color: '#00d4ff'
                    }}>
                      <div style={{ fontWeight: '600', marginBottom: '2px' }}>
                        ✓ Auto-matched Transaction
                      </div>
                      <div style={{ opacity: 0.9 }}>
                        {bill.lastPayment.merchantName || 'Transaction'} • {formatCurrency(bill.lastPayment.amount)}
                      </div>
                      <div style={{ opacity: 0.7, fontSize: '10px' }}>
                        {formatDate(bill.lastPayment.paidDate)}
                      </div>
                    </div>
                  )}
                  
                  {bill.status === 'paid' && bill.lastPaidDate && (
                    <div className="paid-info" style={{
                      marginTop: '8px',
                      padding: '6px 10px',
                      background: 'rgba(0, 255, 136, 0.1)',
                      borderRadius: '6px',
                      border: '1px solid #00ff88',
                      fontSize: '11px',
                      color: '#00ff88',
                      fontWeight: 'bold',
                      textAlign: 'center'
                    }}>
                      ✅ PAID {formatDate(bill.lastPaidDate)}
                    </div>
                  )}
                </div>
                <div className="bill-meta-row">
                  <span className="bill-duedate">Due {new Date(b.dueDate).toLocaleDateString()}</span>
                  {b.paid ? (
                    <span className="bill-paid-badge">
                      ✅ Paid {b.paidDate?.toDate?.() ? b.paidDate.toDate().toLocaleDateString() : (b.paidDate? new Date(b.paidDate).toLocaleDateString() : "")}
                      {b.paidVia ? ` • ${b.paidVia}` : ""}
                    </span>
                  ) : null}
                </div>
                <div className="bill-actions">
                  {!b.paid ? (
                    <button className="btn btn-success" onClick={() => markPaid(b)}>Mark Paid</button>
                  ) : (
                    <button className="btn btn-muted" disabled>Paid {b.paidVia?`(${b.paidVia})`:""}</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );

  return (
    <div className="bills-page">
      <Section title="Overdue" items={overdue} emptyText="No overdue bills 🎉"/>
      <Section title="Upcoming" items={upcoming} emptyText="No upcoming bills"/>
      <Section title="Paid (this month)" items={paid} emptyText="Nothing paid yet"/>
    </div>
  );
}
