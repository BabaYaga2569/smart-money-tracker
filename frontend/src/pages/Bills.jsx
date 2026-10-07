import React, { useMemo, useState, useEffect } from "react";
import { collection, doc, orderBy, query, updateDoc, getDoc, where, getDocs, setDoc, deleteDoc, serverTimestamp, arrayUnion } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../contexts/AuthContext";
import { RecurringBillManager } from '../utils/RecurringBillManager';
import { RecurringManager } from '../utils/RecurringManager';
import { BillSortingManager } from '../utils/BillSortingManager';
import { NotificationManager } from '../utils/NotificationManager';
import { BillAnimationManager } from '../utils/BillAnimationManager';
import PlaidConnectionManager from '../utils/PlaidConnectionManager';
import PlaidErrorModal from '../components/PlaidErrorModal';
import PaymentHistoryModal from '../components/PaymentHistoryModal';
import BillTransactionLinker from '../components/BillTransactionLinker';
import { formatDateForDisplay, formatDateForInput, getPacificTime } from '../utils/DateUtils';
import { getLocalMidnight, parseDueDateLocal, getRelativeDateString } from '../utils/dateHelpers';
import { TRANSACTION_CATEGORIES, CATEGORY_ICONS, getCategoryIcon, migrateLegacyCategory } from '../constants/categories';
import NotificationSystem from '../components/NotificationSystem';
import BillDuplicateCleanupPanel from '../components/BillDuplicateCleanupPanel';
import PriorMonthBillAuditPanel from '../components/PriorMonthBillAuditPanel';
import { getCanonicalDisplayBalance, getVisiblePlaidAccounts } from '../utils/accountVisibility';
import { visibleBillOccurrences } from '../utils/billVisibility';
import "./Bills.css";

const generateBillId = () => {
  return `bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const formatBillDate = (value) => {
  if (!value) return 'No date';

  try {
    const normalized =
      typeof value?.toDate === 'function'
        ? value.toDate()
        : value;

    return formatDateForDisplay(normalized);
  } catch (error) {
    console.warn('[Bills] Unable to format date:', value, error);
    return String(value);
  }
};

const safeBillName = (bill) => String(bill?.name || 'Unnamed bill');

const normalizeBillAuditName = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const billDateOnly = (bill) =>
  String(bill?.dueDate || bill?.nextDueDate || bill?.nextOccurrence || '').slice(0, 10);

const formatCurrency = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return '$0.00';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(number);
};

export default function Bills() {
  const { currentUser } = useAuth();
  
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
  const [showPaymentHistory, setShowPaymentHistory] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [editingBill, setEditingBill] = useState(null);
  const [refreshingTransactions, setRefreshingTransactions] = useState(false);
  const [paidThisMonth, setPaidThisMonth] = useState(0);
  const [paidBillsCount, setPaidBillsCount] = useState(0);
  const [recurringBills, setRecurringBills] = useState([]);
  const [showRecurringBills, setShowRecurringBills] = useState(false);
  const [showPaidBills, setShowPaidBills] = useState(false);
  const [paidBills, setPaidBills] = useState([]);
  const [showLinker, setShowLinker] = useState(false);
  const [selectedBillForLink, setSelectedBillForLink] = useState(null);
  const [duplicateCleanupPreview, setDuplicateCleanupPreview] = useState(null);
  const [duplicateCleanupConfirmation, setDuplicateCleanupConfirmation] = useState('');
  const [preparingDuplicateCleanup, setPreparingDuplicateCleanup] = useState(false);
  const [applyingDuplicateCleanup, setApplyingDuplicateCleanup] = useState(false);
  const [priorMonthAudit, setPriorMonthAudit] = useState(null);
  const [loadingPriorMonthAudit, setLoadingPriorMonthAudit] = useState(false);
  const [staleArchivePreview, setStaleArchivePreview] = useState(null);
  const [staleArchiveConfirmation, setStaleArchiveConfirmation] = useState('');
  const [preparingStaleArchive, setPreparingStaleArchive] = useState(false);
  const [applyingStaleArchive, setApplyingStaleArchive] = useState(false);

  // ✅ UPDATED: Load bills from financialEvents collection (one source of truth)
  const loadBills = async () => {
    if (!currentUser) return;
    try {
      // Load unpaid bills from financialEvents collection
      const eventsRef = collection(db, 'users', currentUser.uid, 'financialEvents');
      const q = query(
        eventsRef,
        where('type', '==', 'bill'),
        where('isPaid', '==', false)
      );
      
      const billsSnapshot = await getDocs(q);
      
      const allBills = visibleBillOccurrences(
        billsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
      );
      
      // Never hide unpaid bills because they are old. Overdue items remain visible
      // until they are explicitly paid, skipped, or otherwise resolved.
      const processed = allBills.map(bill => ({
        ...bill,
        status: determineBillStatus(bill)
      }));
      
      console.log('✅ Loaded bills from financialEvents:', {
        total: allBills.length,
        visible: allBills.length,
        hidden: 0,
        unpaid: processed.filter(b => !b.isPaid).length,
        paid: processed.filter(b => b.isPaid).length
      });
      
      setProcessedBills(processed);
      
      // Also load import history from settings (for backward compatibility)
      try {
        const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
        const settingsDoc = await getDoc(settingsDocRef);
        if (settingsDoc.exists()) {
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

  // Load paid bills archive from financialEvents
  const loadPaidBills = async () => {
    if (!currentUser) return;
    try {
      const eventsRef = collection(db, 'users', currentUser.uid, 'financialEvents');
      const q = query(
        eventsRef,
        where('type', '==', 'bill'),
        where('isPaid', '==', true)
        // Remove orderBy - will sort client-side instead
      );
      const snapshot = await getDocs(q);
      const bills = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Sort client-side by paidDate descending
      bills.sort((a, b) => {
        const dateA = a.paidDate ? new Date(a.paidDate) : new Date(0);
        const dateB = b.paidDate ? new Date(b.paidDate) : new Date(0);
        return dateB - dateA;
      });
      
      setPaidBills(bills);
      console.log(`✅ Loaded ${bills.length} paid bills from financialEvents`);
    } catch (error) {
      console.error('Error loading paid bills:', error);
      setPaidBills([]);
    }
  };

  const handlePrepareDuplicateCleanup = async () => {
    if (!currentUser) return;

    try {
      setPreparingDuplicateCleanup(true);
      setDuplicateCleanupPreview(null);
      setDuplicateCleanupConfirmation('');

      const apiUrl =
        import.meta.env.VITE_API_URL ||
        'https://smart-money-tracker-09ks.onrender.com';

      const response = await fetch(
        `${apiUrl}/api/bills/duplicate-cleanup/preview?userId=${currentUser.uid}&_t=${Date.now()}`,
        { headers: { 'Content-Type': 'application/json' } }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Unable to prepare duplicate cleanup preview.');
      }

      setDuplicateCleanupPreview(data);

      if (data.canApply) {
        NotificationManager.showSuccess(
          `Duplicate cleanup preview ready: ${data.summary.safeGroups} safe group(s), ${data.summary.duplicatesToArchive} duplicate bill(s) would be archived.`
        );
      } else {
        NotificationManager.showWarning(
          `Duplicate cleanup requires review: ${data.summary.reviewGroups} group(s) are not safe to auto-clean.`
        );
      }
    } catch (error) {
      console.error('Error preparing duplicate cleanup:', error);
      NotificationManager.showError('Duplicate cleanup preview failed', error.message);
    } finally {
      setPreparingDuplicateCleanup(false);
    }
  };

  const handleApplyDuplicateCleanup = async () => {
    if (!currentUser || !duplicateCleanupPreview?.fingerprint) {
      NotificationManager.showWarning('Run the duplicate cleanup preview first.');
      return;
    }

    if (duplicateCleanupConfirmation !== 'ARCHIVE DUPLICATE BILLS') {
      NotificationManager.showWarning('Type ARCHIVE DUPLICATE BILLS exactly before applying.');
      return;
    }

    try {
      setApplyingDuplicateCleanup(true);

      const apiUrl =
        import.meta.env.VITE_API_URL ||
        'https://smart-money-tracker-09ks.onrender.com';

      const response = await fetch(
        `${apiUrl}/api/bills/duplicate-cleanup/apply?userId=${currentUser.uid}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expectedFingerprint: duplicateCleanupPreview.fingerprint,
            confirmation: duplicateCleanupConfirmation
          })
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (data.code === 'DUPLICATE_CLEANUP_DRIFTED') {
          setDuplicateCleanupPreview(null);
          setDuplicateCleanupConfirmation('');
        }
        throw new Error(data.message || 'Duplicate cleanup failed.');
      }

      await loadBills();
      setDuplicateCleanupPreview(null);
      setDuplicateCleanupConfirmation('');

      NotificationManager.showSuccess(
        `Duplicate cleanup complete. Archived ${data.archived} duplicate bill(s). Backup: ${data.backupId}.`
      );
    } catch (error) {
      console.error('Error applying duplicate cleanup:', error);
      NotificationManager.showError('Duplicate cleanup failed', error.message);
    } finally {
      setApplyingDuplicateCleanup(false);
    }
  };

  const handleRunPriorMonthAudit = async () => {
    if (!currentUser) return;

    try {
      setLoadingPriorMonthAudit(true);
      setPriorMonthAudit(null);

      const apiUrl =
        import.meta.env.VITE_API_URL ||
        'https://smart-money-tracker-09ks.onrender.com';

      const response = await fetch(
        `${apiUrl}/api/bills/prior-month-audit?userId=${currentUser.uid}&_t=${Date.now()}`,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Unable to audit prior-month unpaid bills.');
      }

      setPriorMonthAudit(data.report);
      NotificationManager.showSuccess(
        `Prior-month audit complete: ${data.report.summary.total} old unpaid bill(s) reviewed.`
      );
    } catch (error) {
      console.error('Error auditing prior-month bills:', error);
      NotificationManager.showError(
        'Prior-month bill audit failed',
        error.message
      );
    } finally {
      setLoadingPriorMonthAudit(false);
    }
  };

  const handlePrepareStaleArchive = async () => {
    if (!currentUser) return;

    try {
      setPreparingStaleArchive(true);
      setStaleArchivePreview(null);
      setStaleArchiveConfirmation('');

      const apiUrl =
        import.meta.env.VITE_API_URL ||
        'https://smart-money-tracker-09ks.onrender.com';

      const response = await fetch(
        `${apiUrl}/api/bills/prior-month-archive/preview?userId=${currentUser.uid}&_t=${Date.now()}`,
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Unable to prepare stale bill archive preview.');
      }

      setStaleArchivePreview(data);

      if (data.canApply) {
        NotificationManager.showSuccess(
          `Stale bill archive preview ready: ${data.summary.archiveCandidates} bill(s) qualify, ${data.summary.blocked} blocked.`
        );
      } else {
        NotificationManager.showWarning(
          `Stale bill archive is blocked: ${data.summary.blocked} bill(s) need review.`
        );
      }
    } catch (error) {
      console.error('Error preparing stale bill archive:', error);
      NotificationManager.showError(
        'Stale bill archive preview failed',
        error.message
      );
    } finally {
      setPreparingStaleArchive(false);
    }
  };

  const handleApplyStaleArchive = async () => {
    if (!currentUser || !staleArchivePreview?.fingerprint) {
      NotificationManager.showWarning('Run the stale bill archive preview first.');
      return;
    }

    if (staleArchiveConfirmation !== 'ARCHIVE STALE BILLS') {
      NotificationManager.showWarning('Type ARCHIVE STALE BILLS exactly before applying.');
      return;
    }

    try {
      setApplyingStaleArchive(true);

      const apiUrl =
        import.meta.env.VITE_API_URL ||
        'https://smart-money-tracker-09ks.onrender.com';

      const response = await fetch(
        `${apiUrl}/api/bills/prior-month-archive/apply?userId=${currentUser.uid}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            expectedFingerprint: staleArchivePreview.fingerprint,
            confirmation: staleArchiveConfirmation
          })
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (data.code === 'STALE_BILL_ARCHIVE_DRIFTED') {
          setStaleArchivePreview(null);
          setStaleArchiveConfirmation('');
        }
        throw new Error(data.message || 'Unable to archive stale bills.');
      }

      await loadBills();
      setPriorMonthAudit(null);
      setStaleArchivePreview(null);
      setStaleArchiveConfirmation('');

      NotificationManager.showSuccess(
        `Archived ${data.archived} stale bill(s). Backup: ${data.backupId}.`
      );
    } catch (error) {
      console.error('Error applying stale bill archive:', error);
      NotificationManager.showError(
        'Stale bill archive failed',
        error.message
      );
    } finally {
      setApplyingStaleArchive(false);
    }
  };

  // Refresh Plaid transactions and match with bills - ADDED
  // ENHANCED: Refresh Plaid transactions and match with bills (90 days historical)
const refreshPlaidTransactions = async () => {
  if (!currentUser || refreshingTransactions) return;

  setRefreshingTransactions(true);

  const loadingNotificationId = NotificationManager.showLoading(
    'Syncing bank transactions and running the canonical bill engine...'
  );

  try {
    const apiUrl = import.meta.env.VITE_API_URL || 'https://smart-money-tracker-09ks.onrender.com';

    // The backend now owns both transaction reconciliation and automatic
    // bill clearing. The browser must not download transactions and re-match
    // them using a second algorithm.
    const response = await fetch(`${apiUrl}/api/plaid/sync_transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ userId: currentUser.uid })
    });

    if (!response.ok) {
      throw new Error('Failed to sync transactions from Plaid');
    }

    const data = await response.json();

    await loadBills();
    await loadPaidThisMonth();

    NotificationManager.removeNotification(loadingNotificationId);
    NotificationManager.showNotification({
      type: 'success',
      message:
        `Bank sync complete. ${data.added || 0} added, ${data.updated || 0} updated. ` +
        'Automatic bill matching was handled by the backend.',
      duration: 5000
    });
  } catch (error) {
    console.error('Error refreshing transactions:', error);
    NotificationManager.removeNotification(loadingNotificationId);
    NotificationManager.showError(
      'Error syncing transactions',
      error.message || 'Failed to connect to Plaid'
    );
  } finally {
    setRefreshingTransactions(false);
  }
};

 const handleRematchTransactions = async () => {
  if (!currentUser) return;

  const loadingId = NotificationManager.showLoading(
    '🔄 Re-running the canonical backend bill matcher...'
  );

  try {
    const apiUrl = import.meta.env.VITE_API_URL || 'https://smart-money-tracker-09ks.onrender.com';
    const response = await fetch(`${apiUrl}/api/bills/auto_clear`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ userId: currentUser.uid })
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Bill matching failed');
    }

    NotificationManager.removeNotification(loadingId);
    NotificationManager.showSuccess(
      `Backend matching complete: ${result.cleared || 0} cleared, ` +
      `${result.advanced || 0} recurring pattern(s) advanced, ` +
      `${result.generated || 0} next bill(s) generated.`
    );

    await loadBills();
    await loadPaidThisMonth();
  } catch (error) {
    console.error('[Re-match] Error:', error);
    NotificationManager.removeNotification(loadingId);
    NotificationManager.showError('Re-matching failed', error.message);
  }
};

  // Auto-generate bill instance from recurring template
  // Load recurring templates for display only. Bills must never generate or
  // mutate bill occurrences merely because the page was opened.
  useEffect(() => {
    if (!currentUser) return;

    const loadRecurringTemplatesForDisplay = async () => {
      try {
        const recurringPatternsRef = collection(
          db,
          'users',
          currentUser.uid,
          'recurringPatterns'
        );
        const snapshot = await getDocs(recurringPatternsRef);
        const patterns = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        setRecurringBills(
          patterns.filter(pattern => pattern.status === 'active')
        );
      } catch (error) {
        console.error('Error loading recurring bills:', error);
        setRecurringBills([]);
      }
    };

    loadRecurringTemplatesForDisplay();
  }, [currentUser]);

  // Load bills on mount - ADDED
  useEffect(() => {
    if (currentUser) {
      // Load settings FIRST before anything else
      const loadData = async () => {
        loadBills();
        loadAccounts();
        loadPaidThisMonth();
        if (showPaidBills) {
          loadPaidBills();
        }
      };
      loadData();
    }
  }, [currentUser, showPaidBills]);

  // Automatic transaction-to-bill clearing is backend-owned. Legacy /bills
  // listeners and browser-side transaction matchers were intentionally removed.

  const loadAccounts = async () => {
    // ... rest of your loadAccounts function stays exactly the same
    try {
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'https://smart-money-tracker-09ks.onrender.com';
        
        const response = await fetch(`${apiUrl}/api/accounts?userId=${currentUser.uid}&_t=${Date.now()}`, {
          headers: {
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
            console.log('API returned success=false, falling back to Firebase');
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
                
                const balance = getCanonicalDisplayBalance(account);
                
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
      } catch (error) {
        console.warn('Error fetching from API, continuing with Firebase fallback:', error);
      }
      
      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      const settingsDocSnap = await getDoc(settingsDocRef);
      
      if (settingsDocSnap.exists()) {
        const data = settingsDocSnap.data();
        const canonicalPlaidAccounts = data.plaidAccounts || [];
        const plaidAccountsList = getVisiblePlaidAccounts(canonicalPlaidAccounts, data);
        const bankAccounts = data.bankAccounts || {};
        
        setHasPlaidAccounts(canonicalPlaidAccounts.length > 0);
        
        if (canonicalPlaidAccounts.length > 0) {
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
      setAccounts({});
    }
  };

  const determineBillStatus = (bill) => {
    if (bill.status === 'skipped') {
      return 'skipped';
    }
    
    if (RecurringBillManager.isBillPaidForCurrentCycle(bill)) {
      return 'paid';
    }
    
    // Use timezone-aware helpers to avoid off-by-one errors
    const now = getLocalMidnight(); // Get current date at LOCAL midnight
    
    // Parse due date as LOCAL date, not UTC
    const dueDateStr = bill.nextDueDate || bill.dueDate;
    const dueDate = parseDueDateLocal(dueDateStr);
    
    if (!dueDate) {
      return 'pending'; // If date parsing fails, default to pending
    }
    
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
      const dueDate = parseDueDateLocal(bill.nextDueDate || bill.dueDate);
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
      .sort((a, b) => {
        const dateA = parseDueDateLocal(a.nextDueDate || a.dueDate);
        const dateB = parseDueDateLocal(b.nextDueDate || b.dueDate);
        return dateA - dateB;
      })[0];
    
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

  const integrityAudit = useMemo(() => {
    const exactGroups = new Map();
    const recurringGroups = new Map();

    processedBills.forEach((bill) => {
      const dueDate = billDateOnly(bill);
      const amount = Number(bill?.amount);
      const amountKey = Number.isFinite(amount) ? Math.abs(amount).toFixed(2) : 'na';
      const nameKey = normalizeBillAuditName(bill?.name);

      if (nameKey && dueDate) {
        const exactKey = `${nameKey}|${amountKey}|${dueDate}`;
        const group = exactGroups.get(exactKey) || [];
        group.push(bill);
        exactGroups.set(exactKey, group);
      }

      if (bill?.recurringPatternId && dueDate) {
        const recurringKey = `${bill.recurringPatternId}|${dueDate}`;
        const group = recurringGroups.get(recurringKey) || [];
        group.push(bill);
        recurringGroups.set(recurringKey, group);
      }
    });

    const exactDuplicates = [...exactGroups.values()].filter(group => group.length > 1);
    const recurringConflicts = [...recurringGroups.values()].filter(group => group.length > 1);

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const staleOverdue = processedBills.filter((bill) => {
      const parsed = parseDueDateLocal(billDateOnly(bill));
      return parsed && parsed < currentMonthStart && bill.status === 'overdue';
    });

    return {
      exactDuplicates,
      recurringConflicts,
      staleOverdue,
      hasIssues:
        exactDuplicates.length > 0 ||
        recurringConflicts.length > 0 ||
        staleOverdue.length > 0
    };
  }, [processedBills]);

  const filteredBills = (() => {
    const filtered = processedBills.filter(bill => {
      const matchesSearch = safeBillName(bill).toLowerCase().includes(String(searchTerm || '').toLowerCase());
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
    const loadingNotificationId = NotificationManager.showLoading(
      `Unmarking ${bill.name} as paid...`
    );

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'https://smart-money-tracker-09ks.onrender.com';
      const response = await fetch(`${apiUrl}/api/bills/${bill.id}/unpay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ userId: currentUser.uid })
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        const reason = result.reason || result.error || 'Unable to unmark this payment safely';
        throw new Error(reason);
      }

      await loadBills();
      await loadPaidThisMonth();
      if (showPaidBills) {
        await loadPaidBills();
      }

      NotificationManager.removeNotification(loadingNotificationId);

      if (result.idempotent) {
        NotificationManager.showInfo(`${bill.name} is already unpaid`);
      } else {
        NotificationManager.showSuccess(`${bill.name} unmarked as paid`);
      }
    } catch (error) {
      console.error('Error unmarking bill as paid:', error);
      NotificationManager.removeNotification(loadingNotificationId);
      NotificationManager.showError(
        'Unable to safely unmark payment',
        error.message || 'The recurring chain may have moved forward.'
      );
    }
  };

  // Handler for manual transaction linking
  const handleLinkTransaction = (bill) => {
    setSelectedBillForLink(bill);
    setShowLinker(true);
  };

  const handleManualLink = async (billId, transactionId) => {
    console.log('Manual link created:', { billId, transactionId });
    NotificationManager.showSuccess('Transaction linked successfully!');
    
    // Reload bills to show updated link status
    await loadBills();
  };
  
  const processBillPaymentInternal = async (bill, paymentData = {}) => {
    const paidDate = paymentData.paidDate || getPacificTime();
    const paidDateStr = formatDateForInput(paidDate);
    const apiUrl = import.meta.env.VITE_API_URL || 'https://smart-money-tracker-09ks.onrender.com';

    const response = await fetch(`${apiUrl}/api/bills/${bill.id}/pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: currentUser.uid,
        paidDate: paidDateStr,
        amount: Math.abs(parseFloat(bill.amount)),
        paymentMethod: paymentData.method || paymentData.source || 'Manual'
      })
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      const reason = result.reason || result.error || 'Unable to mark bill paid safely';
      throw new Error(reason);
    }

    await loadBills();
    await loadPaidThisMonth();

    return result;
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
        // ✅ Update existing bill in financialEvents
        const billRef = doc(db, 'users', currentUser.uid, 'financialEvents', editingBill.id);
        await updateDoc(billRef, {
          ...billData,
          originalDueDate: billData.dueDate,
          updatedAt: serverTimestamp()
        });
        
        showNotification('Bill updated successfully!', 'success');
      } else {
        // ✅ Check for duplicates in financialEvents
        const billsSnapshot = await getDocs(
          query(
            collection(db, 'users', currentUser.uid, 'financialEvents'),
            where('type', '==', 'bill')
          )
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
        
        // ✅ Add new bill to financialEvents
        const billId = generateBillId();
        const newBill = {
          ...billData,
          id: billId,
          type: 'bill',
          originalDueDate: billData.dueDate,
          isPaid: false,
          status: 'pending',
          paidDate: null,
          paidAmount: null,
          linkedTransactionId: null,
          recurringPatternId: null,
          paymentHistory: [],
          merchantNames: [
            billData.name.toLowerCase(),
            billData.name.toLowerCase().replace(/[^a-z0-9]/g, '')
          ],
          autoPayEnabled: false,
          notes: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdFrom: 'bills-page'
        };
        
        await setDoc(doc(db, 'users', currentUser.uid, 'financialEvents', billId), newBill);
        
        console.log('✅ Bill saved to financialEvents:', newBill);
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
      // ✅ Delete bill from financialEvents collection
      await deleteDoc(doc(db, 'users', currentUser.uid, 'financialEvents', billToDelete.id));
      
      console.log('✅ Bill deleted from financialEvents:', billToDelete.id);
      
      // ✅ ZOMBIE BILL FIX: Add period to skippedPeriods to prevent auto-recreation
      if (billToDelete.recurringPatternId) {
        const billDueDate = billToDelete.dueDate || billToDelete.nextDueDate;
        if (billDueDate) {
          const period = billDueDate.substring(0, 7); // e.g., "2025-12"
          const patternRef = doc(db, 'users', currentUser.uid, 'recurringPatterns', billToDelete.recurringPatternId);
          
          try {
            await updateDoc(patternRef, {
              skippedPeriods: arrayUnion(period),
              updatedAt: serverTimestamp()
            });
            console.log(`✅ Added ${period} to skippedPeriods for pattern ${billToDelete.recurringPatternId}`);
          } catch (error) {
            console.warn('Could not update skippedPeriods:', error);
          }
        }
      }
      
      await loadBills();
      showNotification('Bill deleted successfully!', 'success');
    } catch (error) {
      console.error('❌ Error deleting bill:', error);
      showNotification('Error deleting bill: ' + error.message, 'error');
    }
  };

  const handleToggleSkipBill = async (bill) => {
    try {
      const billRef = doc(db, 'users', currentUser.uid, 'financialEvents', bill.id);
      
      if (bill.status === 'skipped') {
        // Unskip: Just set status back to pending
        await updateDoc(billRef, {
          status: 'pending',
          skippedAt: null,
          updatedAt: serverTimestamp()
        });
        
        await loadBills();
        showNotification('Bill unskipped', 'success');
      } else {
        // Skip: Advance the due date to next period (for recurring bills)
        const isRecurring = bill.recurrence && bill.recurrence !== 'one-time';
        
        if (isRecurring) {
          const currentDueDate = bill.dueDate || bill.nextDueDate;
          let nextDueDate;
          const frequency = bill.recurrence;
          
          // Calculate next due date based on frequency
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
            nextDueDate = new Date(currentDueDate);
            nextDueDate.setMonth(nextDueDate.getMonth() + 1);
          }
          
          const nextDueDateStr = nextDueDate.toISOString().split('T')[0];
          
          await updateDoc(billRef, {
            status: 'pending',
            dueDate: nextDueDateStr,
            nextDueDate: nextDueDateStr,
            skippedDate: formatDateForInput(getPacificTime()),
            updatedAt: serverTimestamp()
          });
          
          console.log(`✅ Bill skipped to next period: ${bill.name} -> ${nextDueDateStr}`);
          await loadBills();
          showNotification(`Bill skipped! Due date advanced to ${nextDueDateStr}`, 'success');
        } else {
          // For one-time bills, just mark as skipped
          await updateDoc(billRef, {
            status: 'skipped',
            skippedAt: new Date().toISOString(),
            updatedAt: serverTimestamp()
          });
          
          await loadBills();
          showNotification('One-time bill marked as skipped', 'success');
        }
      }
    } catch (error) {
      console.error('❌ Error toggling skip status:', error);
      showNotification('Error updating bill: ' + error.message, 'error');
    }
  };

  const handleExportToCSV = () => {
    try {
      const csvData = processedBills.map(bill => ({
        'Name': bill.name || '',
        'Amount': bill.amount || '',
        'Due Date': bill.nextDueDate || bill.dueDate || '',
        'Category': bill.category || '',
        'Status': bill.isPaid ? 'paid' : 'unpaid',
        'Account': bill.accountId ? (accounts[bill.accountId]?.name || bill.accountId) : '',
        'Frequency': bill.recurrence || ''
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
            
            <button 
              onClick={handleRematchTransactions}
              disabled={!hasPlaidAccounts && !plaidStatus.isConnected}
              title="Re-match unpaid bills with recent transactions (last 30 days)"
              style={{ 
                marginLeft: '10px', 
                background: (!hasPlaidAccounts && !plaidStatus.isConnected)
                  ? '#999'
                  : '#3b82f6', 
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 20px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: (!hasPlaidAccounts && !plaidStatus.isConnected) ? 'not-allowed' : 'pointer',
                opacity: (!hasPlaidAccounts && !plaidStatus.isConnected) ? 0.6 : 1,
                boxShadow: (!hasPlaidAccounts && !plaidStatus.isConnected) ? 'none' : '0 2px 4px rgba(59,130,246,0.3)'
              }}
            >
              🔄 Re-match Transactions
            </button>
            
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
              {metrics.nextBillDue ? `${metrics.nextBillDue.name} on ${formatBillDate(metrics.nextBillDue.nextDueDate)}` : 'No upcoming bills'}
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
        </div>
      </div>

      <div className={`bill-integrity-audit ${integrityAudit.hasIssues ? 'has-issues' : ''}`}>
        <div className="bill-integrity-header">
          <div>
            <h3>🩺 Bill Integrity Audit</h3>
            <div style={{ color: '#bbb', fontSize: '12px', marginTop: '4px' }}>
              Read-only check of the {processedBills.length} unpaid bills already loaded on this page.
            </div>
          </div>
          <div className="bill-integrity-summary">
            <span className={`bill-integrity-pill ${integrityAudit.exactDuplicates.length ? 'danger' : ''}`}>
              Exact duplicate groups: {integrityAudit.exactDuplicates.length}
            </span>
            <span className={`bill-integrity-pill ${integrityAudit.recurringConflicts.length ? 'danger' : ''}`}>
              Pattern/date conflicts: {integrityAudit.recurringConflicts.length}
            </span>
            <span className={`bill-integrity-pill ${integrityAudit.staleOverdue.length ? 'warning' : ''}`}>
              Prior-month unpaid: {integrityAudit.staleOverdue.length}
            </span>
          </div>
        </div>

        {integrityAudit.hasIssues && (
          <details className="bill-integrity-details">
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>
              Review integrity findings
            </summary>

            {integrityAudit.exactDuplicates.map((group, index) => (
              <div className="bill-integrity-group" key={`exact-${index}`}>
                <strong>Exact duplicate:</strong>{' '}
                {safeBillName(group[0])} · {formatCurrency(group[0]?.amount)} · {billDateOnly(group[0])}
                <div style={{ marginTop: '4px', color: '#aaa' }}>
                  {group.length} unpaid documents: {group.map(item => item.id).join(', ')}
                </div>
              </div>
            ))}

            {integrityAudit.recurringConflicts.map((group, index) => (
              <div className="bill-integrity-group" key={`pattern-${index}`}>
                <strong>Recurring pattern/date conflict:</strong>{' '}
                {safeBillName(group[0])} · {billDateOnly(group[0])}
                <div style={{ marginTop: '4px', color: '#aaa' }}>
                  Pattern {group[0]?.recurringPatternId} has {group.length} unpaid occurrences for the same due date.
                </div>
              </div>
            ))}

            {integrityAudit.staleOverdue.length > 0 && (
              <div className="bill-integrity-group">
                <strong>Prior-month unpaid bills:</strong>{' '}
                {integrityAudit.staleOverdue.length}. These are not automatically considered wrong;
                they are flagged for review because they predate the current month.
              </div>
            )}
          </details>
        )}

        <BillDuplicateCleanupPanel
          preview={duplicateCleanupPreview}
          confirmation={duplicateCleanupConfirmation}
          preparing={preparingDuplicateCleanup}
          applying={applyingDuplicateCleanup}
          hasDuplicates={integrityAudit.exactDuplicates.length > 0}
          onPrepare={handlePrepareDuplicateCleanup}
          onCancel={() => {
            setDuplicateCleanupPreview(null);
            setDuplicateCleanupConfirmation('');
          }}
          onConfirmationChange={setDuplicateCleanupConfirmation}
          onApply={handleApplyDuplicateCleanup}
          formatCurrency={formatCurrency}
        />

        <PriorMonthBillAuditPanel
          report={priorMonthAudit}
          loading={loadingPriorMonthAudit}
          onRun={handleRunPriorMonthAudit}
          formatCurrency={formatCurrency}
          archivePreview={staleArchivePreview}
          archiveConfirmation={staleArchiveConfirmation}
          preparingArchive={preparingStaleArchive}
          applyingArchive={applyingStaleArchive}
          onPrepareArchive={handlePrepareStaleArchive}
          onCancelArchive={() => {
            setStaleArchivePreview(null);
            setStaleArchiveConfirmation('');
          }}
          onArchiveConfirmationChange={setStaleArchiveConfirmation}
          onApplyArchive={handleApplyStaleArchive}
        />
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
                    <div className="bill-title-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h4 style={{ margin: 0 }}>
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
                      <div className="bill-title-actions" style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => {
                            setEditingBill(bill);
                            setShowModal(true);
                          }}
                          style={{
                            padding: '4px 8px',
                            background: 'rgba(0, 180, 255, 0.2)',
                            color: '#00b4ff',
                            border: '1px solid #00b4ff',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                          }}
                          title="Edit bill"
                        >
                          ✏️ Edit
                        </button>
                        <button
                          onClick={() => handleDeleteBill(bill)}
                          style={{
                            padding: '4px 8px',
                            background: 'rgba(255, 7, 58, 0.2)',
                            color: '#ff073a',
                            border: '1px solid #ff073a',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                          }}
                          title="Delete bill"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
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
                    {/* Show actual date */}
                    <div style={{ 
                      fontWeight: '700', 
                      fontSize: '14px',
                      marginBottom: '4px',
                      color: '#fff'
                    }}>
                      {formatBillDate(bill.nextDueDate || bill.dueDate)}
                    </div>
                    
                    {/* Show relative time below */}
                    <div style={{ 
                      fontSize: '11px', 
                      opacity: 0.85,
                      color: '#00d4ff'
                    }}>
                      {getRelativeDateString(bill.nextDueDate || bill.dueDate)}
                    </div>
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
    
    {/* Link Transaction Button */}
    {!bill.linkedTransactionId && (
      <button
        onClick={() => handleLinkTransaction(bill)}
        style={{
          marginTop: '8px',
          width: '100%',
          padding: '8px 12px',
          background: 'rgba(59, 130, 246, 0.1)',
          color: '#3b82f6',
          border: '1px solid #3b82f6',
          borderRadius: '6px',
          fontSize: '11px',
          fontWeight: '600',
          cursor: 'pointer',
          transition: 'all 0.2s ease'
        }}
        onMouseOver={(e) => {
          e.target.style.background = 'rgba(59, 130, 246, 0.2)';
        }}
        onMouseOut={(e) => {
          e.target.style.background = 'rgba(59, 130, 246, 0.1)';
        }}
      >
        🔗 Link Transaction
      </button>
    )}
    
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
                        {formatBillDate(bill.lastPayment.paidDate)}
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
                      ✅ PAID {formatBillDate(bill.lastPaidDate)}
                      
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
              </div>
            ))
          ) : (
            <div className="bills-empty">No bills found</div>
          )}
        </div>
      </div>

      {/* Paid Bills Archive Section */}
      <div className="bills-list-section" style={{ marginTop: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3>📦 Paid Bills Archive ({paidBills.length})</h3>
          <button 
            onClick={() => setShowPaidBills(!showPaidBills)}
            style={{
              background: 'rgba(0, 255, 136, 0.2)',
              color: '#00ff88',
              border: '1px solid #00ff88',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            {showPaidBills ? '▼ Hide' : '▶ Show'}
          </button>
        </div>
        
        {showPaidBills && (
          <>
            <div style={{
              padding: '16px',
              background: 'rgba(0, 255, 136, 0.1)',
              borderRadius: '8px',
              marginBottom: '20px',
              border: '1px solid rgba(0, 255, 136, 0.3)'
            }}>
              <p style={{ margin: 0, fontSize: '14px', color: '#00ff88' }}>
                <strong>ℹ️ Historical Record</strong><br/>
                This is your archive of all paid bills. These bills are kept for your records and financial tracking.
                {paidBills.length > 0 && ` Showing ${paidBills.length} paid bill${paidBills.length !== 1 ? 's' : ''}.`}
              </p>
            </div>

            {paidBills.length > 0 ? (
              <div className="bills-list">
                {paidBills.map((bill, index) => (
                  <div 
                    key={bill.id || index}
                    className="bill-item paid"
                    style={{
                      background: 'rgba(0, 255, 136, 0.05)',
                      border: '2px solid rgba(0, 255, 136, 0.3)'
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
                            className="paid-badge" 
                            style={{
                              marginLeft: '8px',
                              padding: '2px 8px',
                              fontSize: '11px',
                              background: 'rgba(0, 255, 136, 0.3)',
                              color: '#00ff88',
                              borderRadius: '4px',
                              fontWeight: 'normal'
                            }}
                          >
                            ✅ PAID
                          </span>
                        </h4>
                        <div className="bill-meta">
                          <span className="bill-category">{bill.category}</span>
                          <span className="bill-frequency">{bill.recurrence}</span>
                          <span>Paid: {formatBillDate(bill.paidDate)}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="bill-amount-section">
                      <div className="bill-amount">{formatCurrency(bill.amount)}</div>
                      <div className="bill-due-date">
                        Original Due: {formatBillDate(bill.dueDate || bill.nextDueDate)}
                      </div>
                      <div style={{ 
                        marginTop: '8px', 
                        fontSize: '12px', 
                        color: '#888',
                        textAlign: 'center'
                      }}>
                        {bill.paymentMethod && `Paid via ${bill.paymentMethod}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bills-empty">No paid bills in archive yet. Pay some bills to see them here!</div>
            )}
          </>
        )}
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
                      <div className="bill-amount">{formatCurrency(bill.cost || bill.amount || 0)}</div>
                      <div className="bill-due-date">
                        Next: {formatBillDate(bill.nextRenewal || bill.nextOccurrence)}
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

      {/* Bill Edit/Add Modal */}
      {showModal && (
        <div 
          className="modal-overlay"
          onClick={() => setShowModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
          }}
        >
          <div 
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1a1a1a',
              border: '2px solid #333',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '500px',
              width: '90%',
              maxHeight: '90vh',
              overflowY: 'auto'
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#fff' }}>
              {editingBill ? 'Edit Bill' : 'Add New Bill'}
            </h3>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              const billData = {
                name: formData.get('name'),
                amount: parseFloat(formData.get('amount')),
                dueDate: formData.get('dueDate'),
                category: formData.get('category'),
                recurrence: formData.get('recurrence')
              };
              handleSaveBill(billData);
            }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', color: '#ccc' }}>
                  Bill Name *
                </label>
                <input
                  type="text"
                  name="name"
                  defaultValue={editingBill?.name || ''}
                  required
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: '#2a2a2a',
                    border: '1px solid #444',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '14px'
                  }}
                />
              </div>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', color: '#ccc' }}>
                  Amount *
                </label>
                <input
                  type="number"
                  name="amount"
                  step="0.01"
                  min="0"
                  defaultValue={editingBill?.amount || ''}
                  required
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: '#2a2a2a',
                    border: '1px solid #444',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '14px'
                  }}
                />
              </div>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', color: '#ccc' }}>
                  Due Date *
                </label>
                <input
                  type="date"
                  name="dueDate"
                  defaultValue={editingBill?.dueDate || editingBill?.nextDueDate || ''}
                  required
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: '#2a2a2a',
                    border: '1px solid #444',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '14px'
                  }}
                />
              </div>
              
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', color: '#ccc' }}>
                  Category *
                </label>
                <select
                  name="category"
                  defaultValue={editingBill?.category || 'Bills & Utilities'}
                  required
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: '#2a2a2a',
                    border: '1px solid #444',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '14px'
                  }}
                >
                  {TRANSACTION_CATEGORIES.map(category => (
                    <option key={category} value={category}>
                      {getCategoryIcon(category)} {category}
                    </option>
                  ))}
                </select>
              </div>
              
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '8px', color: '#ccc' }}>
                  Frequency *
                </label>
                <select
                  name="recurrence"
                  defaultValue={editingBill?.recurrence || 'monthly'}
                  required
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: '#2a2a2a',
                    border: '1px solid #444',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '14px'
                  }}
                >
                  <option value="one-time">One-time</option>
                  <option value="weekly">Weekly</option>
                  <option value="bi-weekly">Bi-weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annually">Annually</option>
                </select>
              </div>
              
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingBill(null);
                  }}
                  style={{
                    padding: '10px 20px',
                    background: '#444',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '10px 20px',
                    background: 'linear-gradient(135deg, #00ff88 0%, #00d4ff 100%)',
                    color: '#000',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '700',
                    cursor: 'pointer'
                  }}
                >
                  {editingBill ? 'Update Bill' : 'Add Bill'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import History Modal */}
      {/* Help Modal */}
      {showHelpModal && (
        <div 
          className="modal-overlay"
          onClick={() => setShowHelpModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
          }}
        >
          <div 
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#1a1a1a',
              border: '2px solid #333',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto'
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: '20px', color: '#fff' }}>
              📚 Bills Page Help
            </h3>
            
            <div style={{ color: '#ccc', lineHeight: '1.6' }}>
              <h4 style={{ color: '#00ff88', marginTop: '16px' }}>Managing Bills</h4>
              <ul style={{ paddingLeft: '20px' }}>
                <li>Click "Add New Bill" to create a new bill</li>
                <li>Click "Edit" on any bill to modify its details</li>
                <li>Click "Mark as Paid" to record a payment</li>
                <li>Click "Skip This Month" to skip a recurring bill</li>
                <li>Click "Delete" to remove a bill</li>
              </ul>

              <h4 style={{ color: '#00ff88', marginTop: '16px' }}>Automatic Features</h4>
              <ul style={{ paddingLeft: '20px' }}>
                <li>Connect Plaid to automatically match bank transactions with bills</li>
                <li>Use "Match Transactions" to sync and auto-pay bills</li>
                <li>Bills with 🔄 Auto badge are generated from recurring templates</li>
              </ul>

              <h4 style={{ color: '#00ff88', marginTop: '16px' }}>Importing & Exporting</h4>
              <ul style={{ paddingLeft: '20px' }}>
                <li>Import bills from CSV files</li>
                <li>Export your bills to CSV for backup</li>
                <li>View import history to track changes</li>
              </ul>

              <h4 style={{ color: '#00ff88', marginTop: '16px' }}>Status Indicators</h4>
              <ul style={{ paddingLeft: '20px' }}>
                <li>🚨 <span style={{ color: '#ff073a' }}>OVERDUE</span> - Past due date</li>
                <li>📅 <span style={{ color: '#ff6b00' }}>DUE TODAY</span> - Due today</li>
                <li>⚠️ <span style={{ color: '#ffdd00' }}>URGENT</span> - Due in 3 days or less</li>
                <li>📆 <span style={{ color: '#00b4ff' }}>THIS WEEK</span> - Due within 7 days</li>
                <li>✅ <span style={{ color: '#00ff88' }}>PAID</span> - Already paid</li>
                <li>⏭️ <span style={{ color: '#ba68c8' }}>SKIPPED</span> - Skipped for this cycle</li>
              </ul>
            </div>
            
            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowHelpModal(false)}
                style={{
                  padding: '10px 20px',
                  background: 'linear-gradient(135deg, #00ff88 0%, #00d4ff 100%)',
                  color: '#000',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '700',
                  cursor: 'pointer'
                }}
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment History Modal */}
      {showPaymentHistory && (
        <PaymentHistoryModal
          userId={currentUser?.uid}
          onClose={() => setShowPaymentHistory(false)}
        />
      )}

      {/* Plaid Error Modal */}
      {showErrorModal && (
        <PlaidErrorModal
          onClose={() => setShowErrorModal(false)}
        />
      )}

      {/* Bill Transaction Linker Modal */}
      {showLinker && selectedBillForLink && (
        <BillTransactionLinker
          bill={selectedBillForLink}
          onLink={handleManualLink}
          onClose={() => {
            setShowLinker(false);
            setSelectedBillForLink(null);
          }}
        />
      )}

    </div>
  );
}

