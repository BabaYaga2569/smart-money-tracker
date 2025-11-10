import React, { useMemo, useState, useEffect } from "react";
import { collection, doc, onSnapshot, orderBy, query, updateDoc, Timestamp, getDoc, addDoc, where, getDocs, setDoc, deleteDoc, serverTimestamp, arrayUnion } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { findMatchingTransactionForBill } from "../utils/billMatcher";
import { RecurringBillManager } from '../utils/RecurringBillManager';
import { RecurringManager } from '../utils/RecurringManager';
import { BillSortingManager } from '../utils/BillSortingManager';
import { NotificationManager } from '../utils/NotificationManager';
import { BillAnimationManager } from '../utils/BillAnimationManager';
import { PlaidIntegrationManager } from '../utils/PlaidIntegrationManager';
import PlaidConnectionManager from '../utils/PlaidConnectionManager';
import PlaidErrorModal from '../components/PlaidErrorModal';
import BillCSVImportModal from '../components/BillCSVImportModal';
import PaymentHistoryModal from '../components/PaymentHistoryModal';
import DuplicatePreviewModal from '../components/DuplicatePreviewModal';
import { formatDateForDisplay, formatDateForInput, getPacificTime } from '../utils/DateUtils';
import { TRANSACTION_CATEGORIES, CATEGORY_ICONS, getCategoryIcon, migrateLegacyCategory } from '../constants/categories';
import NotificationSystem from '../components/NotificationSystem';
import { BillDeduplicationManager } from '../utils/BillDeduplicationManager';
import { cleanupDuplicateBills, analyzeForCleanup } from '../utils/billCleanupMigration';
import { detectAndAutoAddRecurringBills } from '../components/SubscriptionDetector';
import { generateAllBills, updateTemplatesDates } from '../utils/billGenerator';
import "./Bills.css";

const generateBillId = () => {
  return `bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

export default function Bills() {
  const { currentUser } = useAuth();
  const [bills, setBills] = useState([]);
  const [transactions, setTransactions] = useState([]);
  
  // Missing State Declarations - ADDED
  const [loading, setLoading] = useState(true);
  const [processedBills, setProcessedBills] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterRecurring, setFilterRecurring] = useState('all');
  const [payingBill, setPayingBill] = useState(null);
  const [accounts, setAccounts] = useState({});
  const [hasPlaidAccounts, setHasPlaidAccounts] = useState(false);
  const [plaidStatus, setPlaidStatus] = useState({ isConnected: false, hasError: false });
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [showImportHistory, setShowImportHistory] = useState(false);
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [deletedBills, setDeletedBills] = useState([]);
  const [editingBill, setEditingBill] = useState(null);
  const [deduplicating, setDeduplicating] = useState(false);
  const [showDuplicatePreview, setShowDuplicatePreview] = useState(false);
  const [duplicateReport, setDuplicateReport] = useState(null);
  const [importHistory, setImportHistory] = useState([]);
  const [refreshingTransactions, setRefreshingTransactions] = useState(false);
  const [paidThisMonth, setPaidThisMonth] = useState(0);
  const [paidBillsCount, setPaidBillsCount] = useState(0);
  const [recurringBills, setRecurringBills] = useState([]);
  const [showRecurringBills, setShowRecurringBills] = useState(false);
  const [generatingBills, setGeneratingBills] = useState(false);
  const [showPaidBills, setShowPaidBills] = useState(false);
  const [paidBills, setPaidBills] = useState([]);

  // ✅ NEW: Load bills from billInstances collection
  const loadBills = async () => {
    if (!currentUser) return;
    try {
      // Load all bills from billInstances collection
      const billsSnapshot = await getDocs(
        collection(db, 'users', currentUser.uid, 'billInstances')
      );
      
      const allBills = billsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Process bills with status
      const processed = allBills.map(bill => ({
        ...bill,
        status: determineBillStatus(bill)
      }));
      
      console.log('✅ Loaded bills from billInstances:', {
        total: allBills.length,
        unpaid: processed.filter(b => !b.isPaid).length,
        paid: processed.filter(b => b.isPaid).length
      });
      
      setProcessedBills(processed);
      
      // Also load import history from settings (for backward compatibility)
      try {
        const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
        const settingsDoc = await getDoc(settingsDocRef);
        if (settingsDoc.exists()) {
          setImportHistory(settingsDoc.data().importHistory || []);
        }
      } catch (err) {
        console.log('No import history found');
      }
      
      setLoading(false);
    } catch (error) {
      console.error('❌ Error loading bills:', error);
      setProcessedBills([]);
      setLoading(false);
    }
  };

  // Load paid bills for current month - ADDED
  const loadPaidThisMonth = async () => {
    if (!currentUser) return;
    try {
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      
      const paymentsRef = collection(db, 'users', currentUser.uid, 'bill_payments');
      const q = query(paymentsRef, where('paymentMonth', '==', currentMonth));
      const snapshot = await getDocs(q);
      
      let total = 0;
      snapshot.docs.forEach(doc => {
        total += doc.data().amount || 0;
      });
      
      setPaidThisMonth(total);
      setPaidBillsCount(snapshot.size);
    } catch (error) {
      console.error('Error loading paid bills:', error);
    }
  };

  // Load paid bills archive
  const loadPaidBills = async () => {
    if (!currentUser) return;
    try {
      const paidBillsRef = collection(db, 'users', currentUser.uid, 'paidBills');
      const q = query(paidBillsRef, orderBy('paidDate', 'desc'));
      const snapshot = await getDocs(q);
      const bills = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPaidBills(bills);
      console.log(`✅ Loaded ${bills.length} paid bills from archive`);
    } catch (error) {
      console.error('Error loading paid bills:', error);
      setPaidBills([]);
    }
  };

  // Refresh Plaid transactions and match with bills - ADDED
  // ENHANCED: Refresh Plaid transactions and match with bills (90 days historical)
const refreshPlaidTransactions = async () => {
  if (!currentUser || refreshingTransactions) return;
  
  setRefreshingTransactions(true);
  
  const loadingNotificationId = NotificationManager.showLoading(
    'Syncing bank transactions and matching bills...'
  );
  
  try {
    // Step 1: Fetch Plaid transactions from backend (last 90 days)
    const token = localStorage.getItem('token');
    const apiUrl = import.meta.env.VITE_API_URL || 'https://smart-money-tracker-09ks.onrender.com';
    
    const response = await fetch(`${apiUrl}/api/plaid/transactions?days=90`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to fetch transactions from Plaid');
    }
    
    const data = await response.json();
    const plaidTransactions = data.transactions || [];
    
    console.log(`[Plaid Sync] Fetched ${plaidTransactions.length} transactions from last 90 days`);
    
    // Step 2: Store transactions in Firebase (avoid duplicates)
    const transactionsRef = collection(db, 'users', currentUser.uid, 'transactions');
    let newTransactionsCount = 0;
    
    for (const tx of plaidTransactions) {
      const txId = tx.transaction_id;
      if (!txId) continue;
      
      // Check if transaction already exists
      const existingQuery = query(transactionsRef, where('transaction_id', '==', txId));
      const existingDocs = await getDocs(existingQuery);
      
      if (existingDocs.empty) {
        await addDoc(transactionsRef, {
          transaction_id: txId,
          name: tx.name || tx.merchant_name || 'Unknown',
          merchant_name: tx.merchant_name,
          amount: tx.amount,
          date: tx.date,
          category: tx.category?.[0] || 'Other',
          pending: tx.pending || false,
          account_id: tx.account_id,
          synced_at: new Date().toISOString()
        });
        newTransactionsCount++;
      }
    }
    
    console.log(`[Plaid Sync] Added ${newTransactionsCount} new transactions to Firebase`);
    
    // Step 3: Get all transactions from Firebase
    const allTransactionsSnap = await getDocs(transactionsRef);
    const allTransactions = allTransactionsSnap.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));
    
    // Step 4: Get all bills
    const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
    const settingsDoc = await getDoc(settingsDocRef);
    const billsData = settingsDoc.exists() ? settingsDoc.data().bills || [] : [];
    
    // Step 5: Match bills with transactions (including historical)
    let matchedCount = 0;
    const matchedBills = [];
    
    const updatedBills = billsData.map(bill => {
      // Skip if already paid for current cycle
      if (RecurringBillManager.isBillPaidForCurrentCycle(bill)) {
        return bill;
      }
      
      // Try to find matching transaction
      const matchedTransaction = findMatchingTransactionForBill(bill, allTransactions);
      
      if (matchedTransaction && !matchedTransaction.pending) {
        matchedCount++;
        matchedBills.push({
          name: bill.name,
          amount: bill.amount,
          transactionName: matchedTransaction.name || matchedTransaction.merchant_name,
          transactionDate: matchedTransaction.date,
          transactionId: matchedTransaction.transaction_id || matchedTransaction.id
        });
        
        // Mark bill as paid with transaction details
        return RecurringBillManager.markBillAsPaid(
          bill,
          new Date(matchedTransaction.date),
          {
            source: 'plaid',
            method: 'auto',
            transactionId: matchedTransaction.transaction_id || matchedTransaction.id,
            accountId: matchedTransaction.account_id,
            merchantName: matchedTransaction.merchant_name || matchedTransaction.name || bill.name,
            amount: Math.abs(parseFloat(matchedTransaction.amount))
          }
        );
      }
      
      return bill;
    });
    
    // Step 6: Update recurring templates for bills that were auto-matched
    const currentData = settingsDoc.exists() ? settingsDoc.data() : {};
    const recurringItems = currentData.recurringItems || [];
    let updatedRecurringItems = recurringItems;
    
    // Advance recurring templates for matched bills
    matchedBills.forEach(match => {
      const matchedBill = updatedBills.find(b => b.name === match.name);
      if (matchedBill && matchedBill.recurringTemplateId) {
        updatedRecurringItems = updatedRecurringItems.map(template => {
          if (template.id === matchedBill.recurringTemplateId) {
            const billDueDate = matchedBill.dueDate || matchedBill.nextDueDate;
            const templateNextOccurrence = template.nextOccurrence;
            
            // Only advance if bill's due date matches template's current nextOccurrence
            if (billDueDate === templateNextOccurrence) {
              const nextOccurrence = RecurringManager.calculateNextOccurrenceAfterPayment(
                templateNextOccurrence,
                template.frequency
              );
              
              console.log(`[Plaid Auto-Pay] Advancing recurring template "${template.name}" from ${templateNextOccurrence} to ${nextOccurrence.toISOString().split('T')[0]}`);
              
              return {
                ...template,
                nextOccurrence: nextOccurrence.toISOString().split('T')[0],
                lastPaidDate: match.transactionDate,
                updatedAt: new Date().toISOString()
              };
            }
          }
          return template;
        });
      }
    });
    
    // Step 7: Save updated bills and recurring items
    await updateDoc(settingsDocRef, {
      bills: updatedBills,
      recurringItems: updatedRecurringItems
    });
    
    // Step 8: Record payments in bill_payments collection
    const paymentsRef = collection(db, 'users', currentUser.uid, 'bill_payments');
    for (const match of matchedBills) {
      const matchedBill = updatedBills.find(b => b.name === match.name);
      if (!matchedBill) continue;
      
      const paidDate = match.transactionDate;
      const dueDate = matchedBill.nextDueDate || matchedBill.dueDate;
      const daysPastDue = Math.max(0, Math.floor((new Date(paidDate) - new Date(dueDate)) / (1000 * 60 * 60 * 24)));
      
      await addDoc(paymentsRef, {
        billId: matchedBill.id,
        billName: matchedBill.name,
        amount: Math.abs(parseFloat(matchedBill.amount)),
        dueDate: dueDate,
        paidDate: paidDate,
        paymentMonth: paidDate.slice(0, 7),
        paymentMethod: 'Auto (Plaid)',
        category: matchedBill.category || 'Bills & Utilities',
        linkedTransactionId: match.transactionId,
        isOverdue: daysPastDue > 0,
        daysPastDue: daysPastDue,
        createdAt: new Date()
      });
    }
    
    // Step 9: Reload bills
    await loadBills();
    await loadPaidThisMonth();
    
    // Step 10: Show success notification
    NotificationManager.removeNotification(loadingNotificationId);
    
    if (matchedCount > 0) {
      // Show detailed match notification
      const matchDetails = matchedBills.map(m => 
        `✅ ${m.name} → ${m.transactionName} (${m.transactionDate})`
      ).join('\n');
      
      NotificationManager.showNotification({
        type: 'success',
        message: `🎉 Auto-matched ${matchedCount} bill${matchedCount !== 1 ? 's' : ''}!\n\n${matchDetails}`,
        duration: 8000
      });
    } else {
      NotificationManager.showNotification({
        type: 'info',
        message: `Synced ${plaidTransactions.length} transactions. No new bill matches found.`,
        duration: 4000
      });
    }
    
  } catch (error) {
    console.error('Error refreshing transactions:', error);
    NotificationManager.removeNotification(loadingNotificationId);
    NotificationManager.showError('Error syncing transactions', error.message || 'Failed to connect to Plaid');
  } finally {
    setRefreshingTransactions(false);
  }
};

  // Load recurring bills from subscriptions collection
  useEffect(() => {
    if (!currentUser) return;

    const subscriptionsRef = collection(db, 'users', currentUser.uid, 'subscriptions');
    const unsubscribe = onSnapshot(
      subscriptionsRef,
      (snapshot) => {
        const subs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        // Filter for recurring bills only
        const bills = subs.filter(sub => 
          sub.status === 'active' && 
          sub.type === 'recurring_bill'
        );
        setRecurringBills(bills);
      },
      (error) => {
        console.error('Error loading recurring bills:', error);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  // Auto-detect recurring bills on first login
  useEffect(() => {
    if (!currentUser) return;

    const checkAndAutoDetect = async () => {
      try {
        const settingsRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
        const settingsSnap = await getDoc(settingsRef);

        if (settingsSnap.exists()) {
          const data = settingsSnap.data();

          // Only auto-detect once
          if (!data.recurringBillsDetected) {
            console.log('Running automatic recurring bill detection...');
            
            const result = await detectAndAutoAddRecurringBills(currentUser.uid, db);
            
            if (result.success && result.addedCount > 0) {
              NotificationManager.showSuccess(
                `Auto-detected and added ${result.addedCount} recurring bill${result.addedCount > 1 ? 's' : ''}!`
              );
            }

            // Mark as detected
            await updateDoc(settingsRef, { 
              recurringBillsDetected: true,
              lastAutoDetection: new Date().toISOString()
            });
          }
        } else {
          // Create settings document if it doesn't exist
          await setDoc(settingsRef, {
            recurringBillsDetected: false
          });
        }
      } catch (error) {
        console.error('Error in auto-detection:', error);
      }
    };

    checkAndAutoDetect();
  }, [currentUser]);

  // Load bills on mount - ADDED
  useEffect(() => {
    if (currentUser) {
      loadBills();
      loadAccounts();
      loadPaidThisMonth();
      if (showPaidBills) {
        loadPaidBills();
      }
    }
  }, [currentUser, showPaidBills]);

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
    
    // Enhanced payment recording with metadata
    const paidDateISO = new Date(paidDate).toISOString();
    const paymentYear = new Date(paidDate).getFullYear();
    const paymentQuarter = `Q${Math.ceil((new Date(paidDate).getMonth() + 1) / 3)}`;
    
    const paymentsRef = collection(db, 'users', currentUser.uid, 'bill_payments');
    await addDoc(paymentsRef, {
      billId: bill.id,
      billName: bill.name,
      amount: Math.abs(parseFloat(bill.amount)),
      category: bill.category || 'Bills & Utilities',
      dueDate: bill.nextDueDate || bill.dueDate,
      paidDate: paidDateStr,
      paymentMonth: paidDateStr.slice(0, 7),
      year: paymentYear,
      quarter: paymentQuarter,
      paymentMethod: paymentData.method || paymentData.source || 'Manual',
      recurringTemplateId: bill.recurringTemplateId || null,
      tags: [bill.category?.toLowerCase() || 'bills', bill.recurrence || 'one-time'],
      linkedTransactionId: paymentData.transactionId || null,
      isOverdue: daysPastDue > 0,
      daysPastDue: daysPastDue,
      createdAt: serverTimestamp()
    });
    
    // Archive to paidBills collection for historical reference
    const paidBillsRef = collection(db, 'users', currentUser.uid, 'paidBills');
    await addDoc(paidBillsRef, {
      ...bill,
      isPaid: true,
      paidDate: paidDateISO,
      paymentMonth: paidDateStr.slice(0, 7),
      year: paymentYear,
      quarter: paymentQuarter,
      paymentMethod: paymentData.method || paymentData.source || 'Manual',
      archivedAt: serverTimestamp()
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
      const billRef = doc(db, 'users', currentUser.uid, 'billInstances', bill.id);
      const isRecurring = bill.recurrence && bill.recurrence !== 'one-time';
      
      if (isRecurring) {
        // For RECURRING bills: Update the same bill with next due date
        const currentDueDate = bill.dueDate || bill.nextDueDate;
        const currentDueDateObj = new Date(currentDueDate);
        
        // Calculate next due date based on frequency
        let nextDueDate;
        const frequency = bill.recurrence;
        
        if (frequency === 'monthly') {
          nextDueDate = RecurringManager.calculateNextOccurrenceAfterPayment(currentDueDate, 'monthly');
        } else if (frequency === 'weekly') {
          nextDueDate = RecurringManager.calculateNextOccurrenceAfterPayment(currentDueDate, 'weekly');
        } else if (frequency === 'bi-weekly') {
          nextDueDate = RecurringManager.calculateNextOccurrenceAfterPayment(currentDueDate, 'bi-weekly');
        } else if (frequency === 'quarterly') {
          nextDueDate = RecurringManager.calculateNextOccurrenceAfterPayment(currentDueDate, 'quarterly');
        } else if (frequency === 'annually') {
          nextDueDate = RecurringManager.calculateNextOccurrenceAfterPayment(currentDueDate, 'annually');
        } else {
          nextDueDate = new Date(currentDueDateObj);
          nextDueDate.setMonth(nextDueDate.getMonth() + 1);
        }
        
        const nextDueDateStr = nextDueDate.toISOString().split('T')[0];
        
        // Update the bill with new due date and reset payment status
        await updateDoc(billRef, {
          dueDate: nextDueDateStr,
          nextDueDate: nextDueDateStr,
          isPaid: false,
          status: 'pending',
          lastPaidDate: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        
        console.log(`✅ Recurring bill updated with next due date: ${bill.name} -> ${nextDueDateStr}`);
      } else {
        // For ONE-TIME bills: Delete after payment
        await deleteDoc(billRef);
        console.log(`✅ One-time bill deleted after payment: ${bill.name}`);
      }
      
      // If bill was generated from recurring template, advance template's nextOccurrence
      if (bill.recurringTemplateId) {
        const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
        const currentDoc = await getDoc(settingsDocRef);
        const currentData = currentDoc.exists() ? currentDoc.data() : {};
        const recurringItems = currentData.recurringItems || [];
        
        const updatedRecurringItems = recurringItems.map(template => {
          if (template.id === bill.recurringTemplateId) {
            // Check if bill's due date matches template's nextOccurrence
            const billDueDate = bill.dueDate || bill.nextDueDate;
            const templateNextOccurrence = template.nextOccurrence;
            
            // Only advance if this bill's due date matches the template's current nextOccurrence
            if (billDueDate === templateNextOccurrence) {
              // Advance recurring template to next occurrence
              const nextOccurrence = RecurringManager.calculateNextOccurrenceAfterPayment(
                templateNextOccurrence,
                template.frequency
              );
              
              console.log(`[Bill Payment] Advancing recurring template "${template.name}" from ${templateNextOccurrence} to ${nextOccurrence.toISOString().split('T')[0]}`);
              
              return {
                ...template,
                nextOccurrence: nextOccurrence.toISOString().split('T')[0],
                lastPaidDate: paidDate || getPacificTime(),
                updatedAt: new Date().toISOString()
              };
            }
          }
          return template;
        });
        
        // Update recurring templates
        await updateDoc(settingsDocRef, {
          ...currentData,
          recurringItems: updatedRecurringItems
        });
      }
    } catch (error) {
      console.error('❌ Error updating bill status:', error);
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
      if (editingBill) {
        // ✅ Update existing bill in billInstances
        const billRef = doc(db, 'users', currentUser.uid, 'billInstances', editingBill.id);
        await updateDoc(billRef, {
          ...billData,
          originalDueDate: billData.dueDate,
          updatedAt: serverTimestamp()
        });
        
        showNotification('Bill updated successfully!', 'success');
      } else {
        // ✅ Check for duplicates in billInstances
        const billsSnapshot = await getDocs(
          collection(db, 'users', currentUser.uid, 'billInstances')
        );
        const existingBills = billsSnapshot.docs.map(doc => doc.data());
        
        const isDuplicate = existingBills.some(bill => {
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
        
        const similarBill = existingBills.find(bill => 
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
        
        // ✅ Add new bill to billInstances
        const billId = generateBillId();
        const newBill = {
          ...billData,
          id: billId,
          originalDueDate: billData.dueDate,
          isPaid: false,
          status: 'pending',
          paymentHistory: [],
          linkedTransactionIds: [],
          merchantNames: [
            billData.name.toLowerCase(),
            billData.name.toLowerCase().replace(/[^a-z0-9]/g, '')
          ],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdFrom: 'bills-page'
        };
        
        await setDoc(doc(db, 'users', currentUser.uid, 'billInstances', billId), newBill);
        
        console.log('✅ Bill saved to billInstances:', newBill);
        showNotification('Bill added successfully!', 'success');
      }
      
      await loadBills();
      
      setTimeout(() => {
        syncBillVisuals();
      }, 200);
      
      setShowModal(false);
      setEditingBill(null);
    } catch (error) {
      console.error('❌ Error saving bill:', error);
      showNotification('Error saving bill: ' + error.message, 'error');
    }
  };

  const handleDeleteBill = async (billToDelete) => {
    if (!confirm(`Are you sure you want to delete ${billToDelete.name}?`)) {
      return;
    }

    try {
      // ✅ Delete bill from billInstances collection
      await deleteDoc(doc(db, 'users', currentUser.uid, 'billInstances', billToDelete.id));
      
      console.log('✅ Bill deleted from billInstances:', billToDelete.id);
      await loadBills();
      showNotification('Bill deleted successfully!', 'success');
    } catch (error) {
      console.error('❌ Error deleting bill:', error);
      showNotification('Error deleting bill: ' + error.message, 'error');
    }
  };

  const handleToggleSkipBill = async (bill) => {
    try {
      // ✅ Update bill in billInstances collection
      const newStatus = bill.status === 'skipped' ? 'pending' : 'skipped';
      const billRef = doc(db, 'users', currentUser.uid, 'billInstances', bill.id);
      
      await updateDoc(billRef, {
        status: newStatus,
        skippedAt: newStatus === 'skipped' ? new Date().toISOString() : null,
        updatedAt: serverTimestamp()
      });
      
      await loadBills();
      showNotification(
        newStatus === 'skipped' ? 'Bill skipped for this month' : 'Bill unskipped', 
        'success'
      );
    } catch (error) {
      console.error('❌ Error toggling skip status:', error);
      showNotification('Error updating bill: ' + error.message, 'error');
    }
  };

  const handleBulkDelete = async () => {
    setShowBulkDeleteModal(false);
    
    try {
      setLoading(true);
      
      // ✅ Get all bills from billInstances
      const billsSnapshot = await getDocs(
        collection(db, 'users', currentUser.uid, 'billInstances')
      );
      
      const billsToDelete = billsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setDeletedBills(billsToDelete);
      
      // ✅ Delete all bills from billInstances
      for (const billDoc of billsSnapshot.docs) {
        await deleteDoc(doc(db, 'users', currentUser.uid, 'billInstances', billDoc.id));
      }
      
      await loadBills();
      showNotification(
        `Deleted ${billsToDelete.length} bills. Click Undo to restore.`, 
        'success'
      );
    } catch (error) {
      console.error('❌ Error bulk deleting bills:', error);
      showNotification('Error deleting bills: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUndoBulkDelete = async () => {
    if (deletedBills.length === 0) return;
    
    try {
      setLoading(true);
      
      // ✅ Restore all bills to billInstances
      for (const bill of deletedBills) {
        await setDoc(doc(db, 'users', currentUser.uid, 'billInstances', bill.id), bill);
      }
      
      await loadBills();
      setDeletedBills([]);
      showNotification('Bills restored successfully!', 'success');
    } catch (error) {
      console.error('❌ Error undoing bulk delete:', error);
      showNotification('Error restoring bills: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeduplicateBills = async () => {
    try {
      setDeduplicating(true);
      
      // ✅ Load all bills from billInstances
      const billsSnapshot = await getDocs(
        collection(db, 'users', currentUser.uid, 'billInstances')
      );
      
      const existingBills = billsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Use the new cleanup migration logic
      const report = analyzeForCleanup(existingBills);
      
      if (report.duplicatesFound === 0) {
        showNotification('No duplicate bills found. All bills are unique.', 'info');
        setDeduplicating(false);
        return;
      }
      
      // Convert to format expected by DuplicatePreviewModal
      const modalReport = {
        duplicateCount: report.duplicatesFound,
        totalBills: report.totalBills,
        billsToKeep: report.billsToKeep.length,
        groups: report.groupDetails.map(group => ({
          name: group.name,
          amount: group.amount,
          frequency: group.frequency,
          totalCount: group.totalCount,
          duplicateCount: group.duplicateCount,
          keepBill: report.billsToKeep.find(b => b.id === group.keepBillId),
          removeBills: report.billsToRemove.filter(b => group.removeBillIds.includes(b.id))
        }))
      };
      
      // Show preview modal
      setDuplicateReport(modalReport);
      setShowDuplicatePreview(true);
      setDeduplicating(false);
      
    } catch (error) {
      console.error('❌ Error analyzing duplicates:', error);
      showNotification('Error analyzing duplicates: ' + error.message, 'error');
      setDeduplicating(false);
    }
  };

  const handleConfirmDeduplication = async () => {
    if (!duplicateReport) return;
    
    try {
      setDeduplicating(true);
      setShowDuplicatePreview(false);
      
      // Delete all bills marked for removal
      const allBillsToRemove = duplicateReport.groups.flatMap(g => g.removeBills);
      
      for (const bill of allBillsToRemove) {
        await deleteDoc(doc(db, 'users', currentUser.uid, 'billInstances', bill.id));
      }
      
      await loadBills();
      
      showNotification(
        `Successfully removed ${duplicateReport.duplicateCount} duplicate bills!`,
        'success'
      );
      
    } catch (error) {
      console.error('❌ Error removing duplicates:', error);
      showNotification('Error removing duplicates: ' + error.message, 'error');
    } finally {
      setDeduplicating(false);
      setDuplicateReport(null);
    }
  };

  const handleExportToCSV = () => {
    try {
      const csvData = processedBills.map(bill => ({
        'Bill Name': bill.name || '',
        'Amount': bill.amount || '',
        'Due Date': bill.nextDueDate || bill.dueDate || '',
        'Frequency': bill.recurrence || '',
        'Category': bill.category || '',
        'Status': bill.status || '',
        'Is Paid': bill.isPaid ? 'Yes' : 'No',
        'Last Paid Date': bill.lastPaidDate || '',
        'Payment Method': bill.lastPayment?.method || '',
        'Recurring Template ID': bill.recurringTemplateId || '',
        'Created From': bill.createdFrom || '',
        'Bill ID': bill.id || ''
      }));
      
      if (csvData.length === 0) {
        showNotification('No bills to export', 'info');
        return;
      }
      
      const headers = Object.keys(csvData[0]).join(',');
      const rows = csvData.map(row => 
        Object.values(row).map(val => 
          `"${String(val).replace(/"/g, '""')}"`
        ).join(',')
      ).join('\n');
      
      const csv = headers + '\n' + rows;
      
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bills-export-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      
      showNotification(`Exported ${csvData.length} bills to CSV!`, 'success');
    } catch (error) {
      console.error('Error exporting bills:', error);
      showNotification('Error exporting bills: ' + error.message, 'error');
    }
  };

  const handleCSVImport = async (importedBills) => {
    try {
      setLoading(true);
      
      const cleanedBills = importedBills.map(bill => {
        const { dateError, dateWarning, rowNumber, isDuplicate, ...cleanBill } = bill;
        // Ensure bill has all required fields
        return {
          ...cleanBill,
          isPaid: false,
          status: 'pending',
          paymentHistory: [],
          linkedTransactionIds: [],
          merchantNames: [
            cleanBill.name.toLowerCase(),
            cleanBill.name.toLowerCase().replace(/[^a-z0-9]/g, '')
          ],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdFrom: 'csv-import'
        };
      });
      
      // ✅ Save all bills to billInstances collection
      for (const bill of cleanedBills) {
        await setDoc(doc(db, 'users', currentUser.uid, 'billInstances', bill.id), bill);
      }
      
      const errorsCount = importedBills.filter(b => b.dateError).length;
      const warningsCount = importedBills.filter(b => b.dateWarning && !b.dateError).length;
      
      // Save import history to settings
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
      
      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      await updateDoc(settingsDocRef, {
        ...currentData,
        importHistory: newHistory
      });
      
      console.log('✅ CSV import: Saved', cleanedBills.length, 'bills to billInstances');
      
      await loadBills();
      setShowCSVImport(false);
      
      let message = `Successfully imported ${importedBills.length} bills`;
      if (errorsCount > 0) message += ` (${errorsCount} with errors)`;
      if (warningsCount > 0) message += ` (${warningsCount} with warnings)`;
      showNotification(message, errorsCount > 0 ? 'warning' : 'success');
    } catch (error) {
      console.error('❌ Error importing bills:', error);
      showNotification('Error importing bills: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUndoLastImport = async () => {
    if (importHistory.length === 0) return;
    
    try {
      setLoading(true);
      const lastImport = importHistory[0];
      
      // ✅ Delete bills from billInstances collection
      const importedBillIds = new Set(lastImport.bills.map(b => b.id));
      for (const billId of importedBillIds) {
        try {
          await deleteDoc(doc(db, 'users', currentUser.uid, 'billInstances', billId));
        } catch (err) {
          console.log('Bill already deleted:', billId);
        }
      }
      
      const newHistory = importHistory.slice(1);
      setImportHistory(newHistory);
      
      // Update import history in settings
      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      await updateDoc(settingsDocRef, {
        ...currentData,
        importHistory: newHistory
      });
      
      await loadBills();
      showNotification(`Undid import of ${lastImport.billCount} bills`, 'success');
    } catch (error) {
      console.error('❌ Error undoing import:', error);
      showNotification('Error undoing import: ' + error.message, 'error');
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

  const handleGenerateAllBills = async () => {
    if (generatingBills) return;
    
    // Confirm with user
    const confirmed = window.confirm(
      '🔄 Generate Bills from Recurring Templates?\n\n' +
      'This will:\n' +
      '• Read all recurring bill templates\n' +
      '• Update any October dates to current month\n' +
      '• Generate fresh bill instances\n' +
      '• Show all bills on this page\n\n' +
      'Existing unpaid bills will be replaced. Continue?'
    );
    
    if (!confirmed) return;
    
    setGeneratingBills(true);
    
    const loadingNotificationId = NotificationManager.showLoading(
      '🔄 Generating bills from recurring templates...'
    );
    
    try {
      // Step 1: Update template dates
      const updateResult = await updateTemplatesDates(currentUser.uid, db);
      
      if (updateResult.templatesUpdated > 0) {
        console.log(`✅ Updated ${updateResult.templatesUpdated} template dates`);
      }
      
      // Step 2: Generate all bills (clear existing and create fresh)
      const generateResult = await generateAllBills(currentUser.uid, db, true);
      
      NotificationManager.removeNotification(loadingNotificationId);
      
      if (generateResult.success) {
        NotificationManager.showNotification({
          type: 'success',
          message: `✅ Success!\n\n` +
            `📋 Generated ${generateResult.billsGenerated} bills from ${generateResult.templatesProcessed} templates\n` +
            `🗑️ Cleared ${generateResult.billsCleared} old bill instances\n` +
            `📅 Updated ${updateResult.templatesUpdated} template dates`,
          duration: 6000
        });
        
        // Reload bills to show the new ones
        await loadBills();
        await loadPaidThisMonth();
      } else {
        NotificationManager.showNotification({
          type: 'error',
          message: `❌ Error: ${generateResult.message}`,
          duration: 5000
        });
      }
    } catch (error) {
      console.error('Error generating bills:', error);
      NotificationManager.removeNotification(loadingNotificationId);
      NotificationManager.showError('Error generating bills', error.message);
    } finally {
      setGeneratingBills(false);
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
      <NotificationSystem />
      
      {showDuplicatePreview && (
        <DuplicatePreviewModal
          report={duplicateReport}
          onConfirm={handleConfirmDeduplication}
          onCancel={() => {
            setShowDuplicatePreview(false);
            setDuplicateReport(null);
          }}
        />
      )}
      
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
              onClick={async () => {
                const result = await detectAndAutoAddRecurringBills(currentUser.uid, db);
                if (result.success) {
                  NotificationManager.showSuccess(
                    result.addedCount > 0 
                      ? `Auto-detected and added ${result.addedCount} recurring bill${result.addedCount > 1 ? 's' : ''}!`
                      : `Found ${result.totalDetected} recurring bills but all already exist.`
                  );
                } else {
                  NotificationManager.showError('Detection failed', result.error);
                }
              }}
              style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '12px 20px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              title="Manually run recurring bill detection"
            >
              🤖 Detect Recurring Bills
            </button>
            <button 
              onClick={handleGenerateAllBills}
              disabled={generatingBills}
              style={{
                background: generatingBills 
                  ? 'linear-gradient(135deg, #999 0%, #666 100%)'
                  : 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '12px 20px',
                fontWeight: '600',
                cursor: generatingBills ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                opacity: generatingBills ? 0.6 : 1
              }}
              title="Generate bill instances from all recurring templates"
            >
              {generatingBills ? '⏳ Generating...' : '🔄 Generate All Bills'}
            </button>
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
              title="Cleanup duplicate bills - keeps only the next upcoming unpaid bill per group"
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
              {deduplicating ? '🔄 Cleaning up...' : '🧹 Cleanup Duplicates'}
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
          <button 
            className="export-button"
            onClick={handleExportToCSV}
            disabled={loading || processedBills.length === 0}
            title="Export bills to CSV"
            style={{
              background: '#28a745',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '12px 20px',
              fontWeight: '600',
              cursor: (loading || processedBills.length === 0) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap',
              opacity: (loading || processedBills.length === 0) ? 0.6 : 1
            }}
          >
            📊 Export to CSV
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
                  
{/* Manual Mark as Paid Button */}
{bill.status !== 'paid' && bill.status !== 'skipped' && (
  <div style={{ marginTop: '12px' }}>
    <button
      onClick={() => handleMarkAsPaid(bill)}
      disabled={payingBill === bill.name}
      style={{
        width: '100%',
        padding: '10px 16px',
        background: payingBill === bill.name 
          ? 'rgba(0, 255, 136, 0.3)' 
          : 'linear-gradient(135deg, #00ff88 0%, #00d4ff 100%)',
        color: '#000',
        border: 'none',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: '700',
        cursor: payingBill === bill.name ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s ease',
        opacity: payingBill === bill.name ? 0.6 : 1,
        boxShadow: payingBill === bill.name 
          ? 'none' 
          : '0 4px 12px rgba(0, 255, 136, 0.3)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
      }}
    >
      {payingBill === bill.name ? '⏳ Processing...' : '💳 Mark as Paid'}
    </button>
    
    {/* Skip Button */}
    <button
      onClick={() => handleToggleSkipBill(bill)}
      style={{
        marginTop: '8px',
        width: '100%',
        padding: '8px 12px',
        background: bill.status === 'skipped' 
          ? 'rgba(138, 43, 226, 0.2)' 
          : 'rgba(156, 39, 176, 0.1)',
        color: bill.status === 'skipped' ? '#ba68c8' : '#9c27b0',
        border: '1px solid ' + (bill.status === 'skipped' ? '#ba68c8' : '#9c27b0'),
        borderRadius: '6px',
        fontSize: '11px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s ease'
      }}
    >
      {bill.status === 'skipped' ? '↩️ Unskip Bill' : '⏭️ Skip This Month'}
    </button>
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
    
    {/* Undo Payment Button */}
    <button
      onClick={() => handleUnmarkAsPaid(bill)}
      style={{
        marginTop: '6px',
        width: '100%',
        padding: '6px 10px',
        background: 'rgba(255, 107, 0, 0.2)',
        color: '#ff6b00',
        border: '1px solid #ff6b00',
        borderRadius: '4px',
        fontSize: '10px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        textTransform: 'uppercase'
      }}
    >
      ↩️ Undo Payment
    </button>
  </div>
)}
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="bills-empty">No bills found</div>
          )}
        </div>
      </div>

      {/* Recurring Bills Section */}
      {recurringBills.length > 0 && (
        <div className="bills-list-section" style={{ marginTop: '40px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h3>🔄 Auto-Detected Recurring Bills ({recurringBills.length})</h3>
            <button 
              onClick={() => setShowRecurringBills(!showRecurringBills)}
              style={{
                background: 'rgba(138, 43, 226, 0.2)',
                color: '#ba68c8',
                border: '1px solid #ba68c8',
                borderRadius: '6px',
                padding: '8px 16px',
                fontSize: '13px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              {showRecurringBills ? '▼ Hide' : '▶ Show'}
            </button>
          </div>
          
          {showRecurringBills && (
            <>
              <div style={{
                padding: '16px',
                background: 'rgba(138, 43, 226, 0.1)',
                borderRadius: '8px',
                marginBottom: '20px',
                border: '1px solid rgba(138, 43, 226, 0.3)'
              }}>
                <p style={{ margin: 0, fontSize: '14px', color: '#ba68c8' }}>
                  <strong>ℹ️ These bills were automatically detected from your transactions.</strong><br/>
                  These are utilities, rent, insurance, and other recurring bills that were identified based on transaction patterns.
                  They are tracked separately from entertainment subscriptions (Netflix, Spotify, etc.).
                </p>
              </div>

              <div className="bills-list">
                {recurringBills.map((bill, index) => (
                  <div 
                    key={bill.id || index}
                    className="bill-item"
                    style={{
                      background: 'rgba(138, 43, 226, 0.05)',
                      border: '2px solid rgba(138, 43, 226, 0.3)'
                    }}
                  >
                    <div className="bill-main-info">
                      <div className="bill-icon">
                        {getCategoryIcon(bill.category)}
                      </div>
                      <div className="bill-details">
                        <h4>
                          {bill.name}
                          <span 
                            className="recurring-badge" 
                            title="Auto-detected from transactions"
                            style={{
                              marginLeft: '8px',
                              padding: '2px 8px',
                              fontSize: '11px',
                              background: 'rgba(138, 43, 226, 0.3)',
                              color: '#ba68c8',
                              borderRadius: '4px',
                              fontWeight: 'normal'
                            }}
                          >
                            🤖 Auto-Detected
                          </span>
                        </h4>
                        <div className="bill-meta">
                          <span className="bill-category">{bill.category}</span>
                          <span className="bill-frequency">{bill.billingCycle}</span>
                          {bill.essential && <span style={{ color: '#ffdd00' }}>⭐ Essential</span>}
                        </div>
                        {bill.notes && (
                          <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                            {bill.notes}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="bill-amount-section">
                      <div className="bill-amount">{formatCurrency(bill.cost)}</div>
                      <div className="bill-due-date">
                        Next: {formatDate(bill.nextRenewal)}
                      </div>
                      {bill.paymentMethod && (
                        <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                          Payment: {bill.paymentMethod}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

    </div>
  );
}
