import React, { useState, useEffect, useMemo } from 'react';
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  setDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { RecurringManager } from '../utils/RecurringManager';
import { RecurringBillManager } from '../utils/RecurringBillManager';
import { formatDateForInput } from '../utils/DateUtils';
import { TRANSACTION_CATEGORIES, getCategoryIcon } from '../constants/categories';
import CSVImportModal from '../components/CSVImportModal';
import { BillSortingManager } from '../utils/BillSortingManager';
import { BillDeduplicationManager } from '../utils/BillDeduplicationManager';
import { format, addMonths } from 'date-fns';
import { getDateOnly } from '../utils/dateNormalization';
import './Recurring.css';
import { useAuth } from '../contexts/AuthContext';
import { ensureSettingsDocument } from '../utils/settingsUtils';

/**
 * Helper function to build update data without undefined values for Firebase updateDoc.
 * Firebase Firestore rejects updates containing undefined values, so this function filters them out.
 *
 * @param {Object} currentData - The current document data from Firestore
 * @param {Array} recurringItems - Array of recurring items to save (may contain undefined values)
 * @param {Object} additionalFields - Optional additional fields to include in the update (e.g., {bills: updatedBills})
 * @returns {Object} Object containing:
 *   - updateData: Clean object ready for Firebase updateDoc (no undefined values)
 *   - cleanedItems: Recurring items array with undefined values filtered out
 */
const buildUpdateData = (currentData, recurringItems, additionalFields = {}) => {
  // Clean undefined values from items
  const cleanedItems = recurringItems.map((item) =>
    Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined))
  );

  // Build update data without undefined values
  const updateData = { recurringItems: cleanedItems };
  if (currentData.plaidAccounts !== undefined) updateData.plaidAccounts = currentData.plaidAccounts;
  if (currentData.bankAccounts !== undefined) updateData.bankAccounts = currentData.bankAccounts;
  if (currentData.institutionMapping !== undefined)
    updateData.institutionMapping = currentData.institutionMapping;
  if (currentData.bills !== undefined) updateData.bills = currentData.bills;

  // Merge additional fields (e.g., when updating bills alongside recurringItems)
  Object.assign(updateData, additionalFields);

  return { updateData, cleanedItems };
};

// ✅ OPTIMIZATION: Cache TTL for Plaid API responses
const PLAID_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const Recurring = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recurringItems, setRecurringItems] = useState([]);
  const [processedItems, setProcessedItems] = useState([]);
  const [accounts, setAccounts] = useState({});
  const [customMapping, setCustomMapping] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showCSVImport, setShowCSVImport] = useState(false);

  // Filters and search
  const [filterType, setFilterType] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState('dueDate'); // dueDate, alphabetical, amount

  // Form state
  const [newItem, setNewItem] = useState({
    name: '',
    type: 'expense',
    amount: '',
    category: '',
    frequency: 'monthly',
    nextOccurrence: formatDateForInput(new Date()),
    linkedAccount: '',
    autoPay: false,
    description: '',
    status: 'active',
    customRecurrence: false,
    activeMonths: [],
  });

  // Notification state
  const [notification, setNotification] = useState({ message: '', type: '' });

  // Bulk delete state
  const [deletedItems, setDeletedItems] = useState([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

  // Single item delete with options
  const [itemToDelete, setItemToDelete] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteGeneratedBills, setDeleteGeneratedBills] = useState(false);

  // Cleanup menu
  const [showCleanupMenu, setShowCleanupMenu] = useState(false);

  useEffect(() => {
    loadRecurringData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const processed = RecurringManager.processRecurringItems(recurringItems);
    setProcessedItems(processed);
  }, [recurringItems]);

  // Close cleanup menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        showCleanupMenu &&
        !event.target.closest('.cleanup-menu-button') &&
        !event.target.closest('.cleanup-dropdown')
      ) {
        setShowCleanupMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCleanupMenu]);

  const loadRecurringData = async () => {
    try {
      setLoading(true);
      await Promise.all([loadRecurringItems(), loadAccounts()]);
    } catch (error) {
      console.error('Error loading recurring data:', error);
      // Load sample data for demo
      loadSampleData();
    } finally {
      setLoading(false);
    }
  };

  const loadRecurringItems = async () => {
    try {
      // ✅ FIX: Read from recurringPatterns collection (after Phase 1 & 2 migration)
      const recurringPatternsRef = collection(db, 'users', currentUser.uid, 'recurringPatterns');
      const recurringPatternsSnap = await getDocs(recurringPatternsRef);
      
      const items = recurringPatternsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setRecurringItems(items);
      
      // Still load institution mapping from settings (not migrated)
      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      const settingsDocSnap = await getDoc(settingsDocRef);
      if (settingsDocSnap.exists()) {
        const data = settingsDocSnap.data();
        setCustomMapping(data.institutionMapping || {});
      }
      
      console.log(`✅ Loaded ${items.length} recurring items from recurringPatterns collection`);
    } catch (error) {
      console.error('Error loading recurring items:', error);
      throw error;
    }
  };

  // ✅ OPTIMIZATION: Cache Plaid API responses for 5 minutes
  const loadAccountsFromCache = async () => {
    const cacheKey = `plaidAccounts_${currentUser.uid}`;
    const cached = sessionStorage.getItem(cacheKey);
    
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < PLAID_CACHE_TTL_MS) {
        if (import.meta.env.DEV) {
          console.log('[Cache] Using cached Plaid accounts');
        }
        return data;
      }
    }
    
    // Fetch fresh data
    const apiUrl = import.meta.env.VITE_API_URL || 'https://smart-money-tracker-09ks.onrender.com';
    const response = await fetch(`${apiUrl}/api/accounts?userId=${currentUser.uid}&_t=${Date.now()}`);
    
    if (!response.ok) {
      throw new Error('Failed to fetch accounts from API');
    }
    
    const data = await response.json();
    
    // Cache the response
    sessionStorage.setItem(cacheKey, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
    
    return data;
  };

  const loadAccounts = async () => {
    try {
      // ✅ OPTIMIZATION: Try loading from cache first
      try {
        const cachedData = await loadAccountsFromCache();
        
        if (cachedData && cachedData.success && cachedData.accounts && cachedData.accounts.length > 0) {
          const accountsMap = {};
          cachedData.accounts.forEach((account) => {
            const accountId = account.account_id || account.id || account._id;
            let balance = 0;
            if (account.balances) {
              balance = account.balances.current || account.balances.available || 0;
            } else if (account.current_balance !== undefined) {
              balance = account.current_balance;
            } else if (account.balance !== undefined) {
              balance = account.balance;
            }

            accountsMap[accountId] = {
              name: account.name || account.official_name || 'Unknown Account',
              type: account.subtype || account.type || 'checking',
              balance: balance.toString(),
              mask: account.mask || '',
              institution: account.institution_name || '',
            };
          });
          setAccounts(accountsMap);
          return;
        }
      } catch (cacheError) {
        if (import.meta.env.DEV) {
          console.log('[Cache] Cache miss or error, falling back to Firebase:', cacheError.message);
        }
      }

      const token = localStorage.getItem('token');

      // Try to load from Plaid API first (fallback if cache failed)
      if (token) {
        try {
          const response = await fetch(
            'https://smart-money-tracker-09ks.onrender.com/api/accounts',
            {
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            }
          );

          if (response.ok) {
            const data = await response.json();

            // Check if API returned success flag
            if (data.success === false) {
              if (import.meta.env.DEV) {
                console.log(
                  'Plaid API returned no accounts:',
                  data.message || 'No accounts available'
                );
              }
              // Fall through to Firebase fallback
            } else {
              const accountsList = data.accounts || data;

              if (Array.isArray(accountsList) && accountsList.length > 0) {
                const accountsMap = {};
                accountsList.forEach((account) => {
                  const accountId = account.account_id || account.id || account._id;
                  let balance = 0;
                  if (account.balances) {
                    balance = account.balances.current || account.balances.available || 0;
                  } else if (account.current_balance !== undefined) {
                    balance = account.current_balance;
                  } else if (account.balance !== undefined) {
                    balance = account.balance;
                  }

                  accountsMap[accountId] = {
                    name: account.name || account.official_name || 'Unknown Account',
                    type: account.subtype || account.type || 'checking',
                    balance: balance.toString(),
                    mask: account.mask || '',
                    institution: account.institution_name || '',
                  };
                });
                setAccounts(accountsMap);
                return;
              }
            }
          } else if (response.status === 404) {
            if (import.meta.env.DEV) {
              console.log('Accounts endpoint not available, using Firebase fallback');
            }
          }
        } catch (apiError) {
          // Network errors are expected when API is not available
          if (import.meta.env.DEV) {
            console.log('Plaid API not available, trying Firebase...', apiError.message || '');
          }
        }
      }

      // Fallback to Firebase
      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      const settingsDocSnap = await getDoc(settingsDocRef);

      if (settingsDocSnap.exists()) {
        const data = settingsDocSnap.data();
        const plaidAccountsList = data.plaidAccounts || [];
        const bankAccounts = data.bankAccounts || {};

        // Prioritize Plaid accounts if they exist
        if (plaidAccountsList.length > 0) {
          const accountsMap = {};
          plaidAccountsList.forEach((account) => {
            const accountId = account.account_id;
            accountsMap[accountId] = {
              name: account.official_name || account.name,
              type: account.type,
              balance: account.balance,
              mask: account.mask || '',
              institution: '',
            };
          });
          setAccounts(accountsMap);
        } else {
          // Fall back to manual accounts
          setAccounts(bankAccounts);
        }
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
      // Fallback accounts
      setAccounts({
        bofa: { name: 'Bank of America', type: 'checking' },
        usaa: { name: 'USAA', type: 'checking' },
        capone: { name: 'Capital One', type: 'credit' },
      });
    }
  };

  const loadSampleData = () => {
    const sampleItems = [
      {
        id: 'salary-1',
        name: 'Monthly Salary',
        type: 'income',
        amount: 2500,
        category: 'Income',
        frequency: 'monthly',
        nextOccurrence: '2025-10-01',
        linkedAccount: 'bofa',
        autoPay: true,
        status: 'active',
        lastPaymentStatus: 'success',
        description: 'Regular monthly salary',
        history: [
          { date: '2025-09-01', status: 'success', amount: 2500 },
          { date: '2025-08-01', status: 'success', amount: 2500 },
          { date: '2025-07-01', status: 'success', amount: 2500 },
        ],
      },
      {
        id: 'netflix-1',
        name: 'Netflix',
        type: 'expense',
        amount: 15.99,
        category: 'Subscriptions',
        frequency: 'monthly',
        nextOccurrence: '2025-10-03',
        linkedAccount: 'bofa',
        autoPay: true,
        status: 'active',
        lastPaymentStatus: 'success',
        description: 'Netflix streaming subscription',
        history: [
          { date: '2025-09-03', status: 'success', amount: 15.99 },
          { date: '2025-08-03', status: 'success', amount: 15.99 },
          { date: '2025-07-03', status: 'success', amount: 15.99 },
          { date: '2025-06-03', status: 'failed', amount: 15.99 },
          { date: '2025-05-03', status: 'success', amount: 15.99 },
        ],
      },
      {
        id: 'rent-1',
        name: 'Apartment Rent',
        type: 'expense',
        amount: 1200,
        category: 'Bills & Utilities',
        frequency: 'monthly',
        nextOccurrence: '2025-10-01',
        linkedAccount: 'bofa',
        autoPay: false,
        status: 'active',
        lastPaymentStatus: 'success',
        description: 'Monthly apartment rent',
        history: [
          { date: '2025-09-01', status: 'success', amount: 1200 },
          { date: '2025-08-01', status: 'success', amount: 1200 },
          { date: '2025-07-01', status: 'success', amount: 1200 },
        ],
      },
      {
        id: 'spotify-1',
        name: 'Spotify Premium',
        type: 'expense',
        amount: 9.99,
        category: 'Subscriptions',
        frequency: 'monthly',
        nextOccurrence: '2025-10-15',
        linkedAccount: 'bofa',
        autoPay: true,
        status: 'active',
        lastPaymentStatus: 'success',
        description: 'Spotify music streaming',
        history: [
          { date: '2025-09-15', status: 'success', amount: 9.99 },
          { date: '2025-08-15', status: 'success', amount: 9.99 },
          { date: '2025-07-15', status: 'skipped', amount: 9.99 },
          { date: '2025-06-15', status: 'success', amount: 9.99 },
        ],
      },
      {
        id: 'insurance-1',
        name: 'Car Insurance',
        type: 'expense',
        amount: 125,
        category: 'Bills & Utilities',
        frequency: 'monthly',
        nextOccurrence: '2025-10-12',
        linkedAccount: 'bofa',
        autoPay: true,
        status: 'active',
        lastPaymentStatus: 'success',
        description: 'Monthly car insurance premium',
        history: [
          { date: '2025-09-12', status: 'success', amount: 125 },
          { date: '2025-08-12', status: 'success', amount: 125 },
          { date: '2025-07-12', status: 'success', amount: 125 },
        ],
      },
    ];
    setRecurringItems(sampleItems);
  };

  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification({ message: '', type: '' }), 3000);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const calculateMetrics = () => {
    const totals = RecurringManager.calculateMonthlyTotals(processedItems);
    const activeItems = processedItems.filter((item) => item.status === 'active');

    // Get upcoming items (next 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const upcomingItems = RecurringManager.getItemsInRange(
      activeItems,
      new Date(),
      thirtyDaysFromNow
    );

    // Get items due in next 7 days
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const dueSoonItems = RecurringManager.getItemsInRange(
      activeItems,
      new Date(),
      sevenDaysFromNow
    );

    // Get failed/missed items
    const failedItems = processedItems.filter((item) => item.status === 'failed');

    // Add urgency statistics using BillSortingManager
    const processedWithUrgency = BillSortingManager.processBillsWithUrgency(activeItems);
    const urgencySummary = BillSortingManager.getBillsUrgencySummary(processedWithUrgency);

    return {
      ...totals,
      totalActive: activeItems.length,
      upcomingCount: upcomingItems.length,
      dueSoonCount: dueSoonItems.length,
      failedCount: failedItems.length,
      upcomingItems,
      dueSoonItems,
      failedItems,
      urgency: urgencySummary,
    };
  };

  const metrics = calculateMetrics();

  // Filter items based on search and filters, then apply smart sorting
  // ✅ OPTIMIZATION: Use useMemo to prevent recalculation on every render
  const filteredItems = useMemo(() => {
    const filtered = processedItems.filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'all' || item.type === filterType;
      const matchesCategory = filterCategory === 'all' || item.category === filterCategory;
      const matchesStatus = filterStatus === 'all' || item.status === filterStatus;
      return matchesSearch && matchesType && matchesCategory && matchesStatus;
    });

    // Apply smart sorting with urgency information
    return BillSortingManager.processBillsWithUrgency(filtered, sortOrder);
  }, [processedItems, searchTerm, filterType, filterCategory, filterStatus, sortOrder]);

  const handleAddItem = () => {
    setEditingItem(null);
    setNewItem({
      name: '',
      type: 'expense',
      amount: '',
      category: '',
      frequency: 'monthly',
      nextOccurrence: formatDateForInput(new Date()),
      linkedAccount: '',
      autoPay: false,
      description: '',
      status: 'active',
      customRecurrence: false,
      activeMonths: [],
    });
    setShowModal(true);
  };

  const handleEditItem = (item) => {
    setEditingItem(item);
    setNewItem({
      ...item,
      nextOccurrence: getDateOnly(item.nextOccurrence),
      customRecurrence: item.activeMonths && item.activeMonths.length > 0,
      activeMonths: item.activeMonths || [],
    });
    setShowModal(true);
  };

  const handleSaveItem = async () => {
    if (!newItem.name.trim() || !newItem.amount) {
      showNotification('Please fill in required fields', 'error');
      return;
    }

    // Validate custom recurrence
    if (newItem.customRecurrence && (!newItem.activeMonths || newItem.activeMonths.length === 0)) {
      showNotification('Please select at least one month for custom recurrence', 'error');
      return;
    }

    try {
      setSaving(true);

      // Ensure settings document exists before attempting to save
      await ensureSettingsDocument(currentUser.uid);

      // Build itemData without undefined values
      const itemData = {
        ...newItem,
        id: editingItem ? editingItem.id : `recurring-${Date.now()}`,
        amount: parseFloat(newItem.amount),
        createdAt: editingItem ? editingItem.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Only include activeMonths and customRecurrence if customRecurrence is enabled
      // Otherwise, remove them from the object to prevent Firebase errors with undefined values
      if (newItem.customRecurrence && newItem.activeMonths.length > 0) {
        itemData.activeMonths = newItem.activeMonths;
        itemData.customRecurrence = true;
      } else {
        // Remove these fields entirely if not using custom recurrence
        delete itemData.activeMonths;
        delete itemData.customRecurrence;
      }

      // ✅ FIX: Check for duplicates in recurringPatterns collection
      const recurringPatternsRef = collection(db, 'users', currentUser.uid, 'recurringPatterns');
      const recurringPatternsSnap = await getDocs(recurringPatternsRef);
      
      const existingItems = recurringPatternsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      if (!editingItem) {
        // Check for potential duplicates before adding
        const isDuplicate = existingItems.some((item) => {
          // Exact duplicate: same name, amount, and next occurrence
          const exactMatch =
            item.name.toLowerCase() === itemData.name.toLowerCase() &&
            parseFloat(item.amount) === parseFloat(itemData.amount) &&
            item.nextOccurrence === itemData.nextOccurrence &&
            item.frequency === itemData.frequency;

          return exactMatch;
        });

        if (isDuplicate) {
          showNotification(
            'A recurring item with the same name, amount, frequency, and date already exists!',
            'error'
          );
          setSaving(false);
          return;
        }

        // Check for similar items (same name and amount but different date/frequency)
        const similarItem = existingItems.find(
          (item) =>
            item.name.toLowerCase() === itemData.name.toLowerCase() &&
            parseFloat(item.amount) === parseFloat(itemData.amount) &&
            (item.nextOccurrence !== itemData.nextOccurrence ||
              item.frequency !== itemData.frequency)
        );

        if (similarItem) {
          const proceed = window.confirm(
            `A recurring item named "${similarItem.name}" with amount $${similarItem.amount} already exists.\n\n` +
              `Existing: ${similarItem.frequency} on ${similarItem.nextOccurrence}\n` +
              `New: ${itemData.frequency} on ${itemData.nextOccurrence}\n\n` +
              `This might be legitimate if you have multiple similar recurring items.\n\n` +
              `Do you want to proceed?`
          );

          if (!proceed) {
            setSaving(false);
            return;
          }
        }
      }

      // ✅ NEW: Save to financialEvents collection instead of old bills array
      let billSyncStats = null;

      if (itemData.type === 'expense' && itemData.status === 'active') {
        try {
          // When adding a new template, create a bill instance (with duplicate prevention)
          if (!editingItem) {
            // Check if a bill instance already exists for this template and date
            const nextDueDate = getDateOnly(itemData.nextOccurrence);
            const existingBillQuery = query(
              collection(db, 'users', currentUser.uid, 'financialEvents'),
              where('type', '==', 'bill'),
              where('recurringPatternId', '==', itemData.id),
              where('dueDate', '==', nextDueDate)
            );
            const existingBills = await getDocs(existingBillQuery);

            if (existingBills.empty) {
              // Only create if bill doesn't already exist
              const billId = `bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

              // Create bill instance with proper structure
              const billInstance = {
                id: billId,
                name: itemData.name,
                amount: parseFloat(itemData.amount),
                dueDate: nextDueDate,
                originalDueDate: nextDueDate,
                isPaid: false,
                status: 'pending',
                category: itemData.category || 'Other',
                recurrence: itemData.frequency.toLowerCase(),
                type: itemData.type,
                isSubscription: false,
                paymentHistory: [],
                linkedTransactionIds: [],
                description: itemData.description || '',
                accountId:
                  itemData.linkedAccount !== 'Select Account' && itemData.linkedAccount
                    ? itemData.linkedAccount
                    : null,
                autoPayEnabled: itemData.autoPay || false,
                merchantNames: [
                  itemData.name.toLowerCase(),
                  itemData.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
                ],
                recurringPatternId: itemData.id,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                createdFrom: 'recurring-page',
              };

              // Save to financialEvents collection
              const billRef = doc(db, 'users', currentUser.uid, 'financialEvents', billId);
              await setDoc(billRef, billInstance);

              console.log('✅ Recurring bill saved to financialEvents:', billInstance);
              billSyncStats = { added: 1 };
            } else {
              console.log(
                `Bill instance already exists for ${itemData.name} on ${nextDueDate}`
              );
              billSyncStats = { skipped: 1 };
            }
          }
        } catch (error) {
          console.error('❌ Error saving bill to financialEvents:', error);
          // Continue with template save even if bill sync fails
        }
      }

      // ✅ FIX: Save recurring pattern to recurringPatterns collection
      const recurringPatternRef = doc(db, 'users', currentUser.uid, 'recurringPatterns', itemData.id);
      await setDoc(recurringPatternRef, itemData, { merge: true });
      
      console.log(`✅ Saved recurring pattern: ${itemData.name} to recurringPatterns collection`);

      // ✅ NEW: When editing a recurring template, also update existing unpaid bill instances
      console.log(`🔍 SYNC CHECK: editingItem=${!! editingItem}, type="${itemData.type}", status="${itemData. status}"`);
      if (editingItem && (itemData.type === 'expense' || ! itemData.type) && itemData.status === 'active') {
        try {
          // Query for related unpaid bills using all possible linking fields
          const billsCollection = collection(db, 'users', currentUser.uid, 'financialEvents');
          
          const queries = [
            query(billsCollection, where('type', '==', 'bill'), where('recurringPatternId', '==', itemData.id), where('isPaid', '==', false)),
            query(billsCollection, where('type', '==', 'bill'), where('sourcePatternId', '==', itemData.id), where('isPaid', '==', false)),
            query(billsCollection, where('type', '==', 'bill'), where('templateId', '==', itemData.id), where('isPaid', '==', false)),
            query(billsCollection, where('type', '==', 'bill'), where('recurringTemplateId', '==', itemData.id), where('isPaid', '==', false)),
          ];
          
          // Also try matching by name for legacy bills (as a fallback)
          // Note: This could match multiple bills with the same name, but that's acceptable
          // for legacy data where linking fields may not have been set properly
          const nameQuery = query(
            billsCollection,
            where('type', '==', 'bill'),
            where('name', '==', itemData.name),
            where('isPaid', '==', false)
          );
          queries.push(nameQuery);
          
          // Collect unique bills to update
          const billsToUpdate = new Map();
          
          for (const q of queries) {
            const snapshot = await getDocs(q);
            snapshot.docs.forEach(doc => {
              if (!billsToUpdate.has(doc.id)) {
                billsToUpdate.set(doc.id, { ref: doc.ref, data: doc.data() });
              }
            });
          }
          
          // ✅ FIX: Add case-insensitive name matching fallback
          // Query ALL unpaid bills and filter by name client-side (handles case sensitivity)
          const allUnpaidQuery = query(
            billsCollection,
            where('type', '==', 'bill'),
            where('isPaid', '==', false)
          );
          
          const allUnpaidSnapshot = await getDocs(allUnpaidQuery);
          const templateNameLower = itemData.name.toLowerCase().trim();
          
          allUnpaidSnapshot.docs.forEach(doc => {
            const billName = (doc.data().name || '').toLowerCase().trim();
            // Match by name (case-insensitive) AND not already in the map
            if (billName === templateNameLower && !billsToUpdate.has(doc.id)) {
              billsToUpdate.set(doc.id, { ref: doc.ref, data: doc.data() });
            }
          });
          
          // ✅ FIX: Add comprehensive debug logging
          console.log(`🔄 Bill Sync Debug for "${itemData.name}":`);
          console.log(`  Template ID: ${itemData.id}`);
          console.log(`  Template amount: $${parseFloat(itemData.amount)}`);
          console.log(`  Template date: ${itemData.nextOccurrence}`);
          console.log(`  Bills found: ${billsToUpdate.size}`);
          
          if (billsToUpdate.size === 0) {
            console.log('📝 No unpaid bills found to update');
          } else {
            console.log(`🔄 Found ${billsToUpdate.size} unpaid bill(s) to sync with template ${itemData.name}`);
            
            // Update each bill with new values from recurring item
            const updatePromises = [];
            const newDueDate = getDateOnly(itemData. nextOccurrence);
            const newAmount = parseFloat(itemData.amount);
            console.log(`  🎯 Target values: amount=$${newAmount}, date="${newDueDate}"`);
            
            billsToUpdate.forEach(({ ref, data }, billId) => {
              console.log(`\n  📋 Bill: "${data.name}" (${billId})`);
              console.log(`    Current amount: $${data.amount || data.cost}`);
              console.log(`    Current dueDate: ${data.dueDate}`);
              console.log(`    Has recurringPatternId: ${!!data.recurringPatternId}`);
              
              const updates = {
                updatedAt: serverTimestamp(),
              };
              
              const changes = [];
              
              // ✅ FIX: Always add recurringPatternId to enable future syncs
              // This is critical for legacy bills that were created before PR #325
              // and don't have proper linking fields (recurringPatternId, sourcePatternId, etc.)
              if (!data.recurringPatternId || data.recurringPatternId !== itemData.id) {
                updates.recurringPatternId = itemData.id;
                changes.push(`added recurringPatternId: ${itemData.id}`);
              }
              
                           // Update due date if changed
              // ✅ FIX: More aggressive date normalization to handle all formats
              const normalizeToYYYYMMDD = (dateVal) => {
                if (!dateVal) return '';
                // Handle Date objects
                if (dateVal instanceof Date) {
                  return dateVal.toISOString().split('T')[0];
                }
                // Handle ISO strings with time
                if (typeof dateVal === 'string' && dateVal.includes('T')) {
                  return dateVal.split('T')[0];
                }
                // Handle Firestore Timestamps
                if (dateVal.toDate && typeof dateVal.toDate === 'function') {
                  return dateVal.toDate().toISOString().split('T')[0];
                }
                // Already YYYY-MM-DD format
                return String(dateVal).trim();
              };
              
              const existingDate = normalizeToYYYYMMDD(data.dueDate) || 
                                   normalizeToYYYYMMDD(data.nextDueDate) || 
                                   normalizeToYYYYMMDD(data.nextOccurrence) || '';
              const targetDate = normalizeToYYYYMMDD(newDueDate) || '';
              
              console.log(`    📅 Date comparison:  existing="${existingDate}" vs target="${targetDate}" (equal: ${existingDate === targetDate})`);
              
              // ✅ CRITICAL FIX: Only update date if bill is in the SAME month as template
              // This prevents overwriting past/overdue bills with future dates
              const existingMonth = existingDate.substring(0, 7); // e.g., "2025-12"
              const targetMonth = targetDate.substring(0, 7);     // e.g., "2026-01"

              if (targetDate && existingDate !== targetDate) {
             // Only update if bill is in the same month as the template's next occurrence
             if (existingMonth === targetMonth) {
             // Same month - safe to update the day within that month
              updates.dueDate = targetDate;
              updates. nextDueDate = targetDate;
              updates.nextRenewal = targetDate;
              updates. nextOccurrence = targetDate;
              updates.originalDueDate = targetDate;
              changes. push(`date: ${existingDate} → ${targetDate}`);
              console.log(`    ✅ Updating date (same month:  ${targetMonth})`);
              } else {
              // Different month - this bill is from a different billing period, DON'T update! 
               console.log(`    ⏭️ Skipping date update:  bill is from ${existingMonth}, template is ${targetMonth} (different periods)`);
              }
             }
              
              
              
              // Update name if changed
              if (itemData.name && data.name !== itemData.name) {
                updates.name = itemData.name;
                changes.push(`name: ${data.name} → ${itemData.name}`);
              }
              
              // Update category if changed
              if (itemData.category && data.category !== itemData.category) {
                updates.category = itemData.category;
                changes.push(`category: ${data.category} → ${itemData.category}`);
              }
              
              // Update isAutoPay if changed
              if (itemData.autoPay !== undefined && data.autoPayEnabled !== itemData.autoPay) {
                updates.autoPayEnabled = itemData.autoPay;
                changes.push(`autoPay: ${data.autoPayEnabled} → ${itemData.autoPay}`);
              }
              
              // Only update if there are actual changes
              if (changes.length > 0) {
                console.log(`  💰 Updating bill "${data.name}": ${changes.join(', ')}`);
                updatePromises.push(updateDoc(ref, updates));
              } else {
                console.log(`  ✅ Bill "${data.name}" already up to date`);
              }
            });
            
            await Promise.all(updatePromises);
            
            if (updatePromises.length > 0) {
              console.log(`✅ Updated ${updatePromises.length} related bill(s) with new values`);
              if (!billSyncStats) billSyncStats = {};
              billSyncStats.updated = updatePromises.length;
            } else {
              console.log('✅ All bills already up to date');
            }
          }
        } catch (error) {
          console.error('❌ Error syncing bill updates:', error);
          // Don't fail the entire save if bill sync fails
        }
      }

      // ✅ FIX: Reload from recurringPatterns collection
      await loadRecurringItems();
      setShowModal(false);

      // Show success notification with bill sync details
      let message = editingItem ? 'Recurring item updated' : 'Recurring item added';
      if (billSyncStats && billSyncStats.added > 0) {
        message = `${message} and ${billSyncStats.added} bill instance(s) created`;
      }
      if (billSyncStats && billSyncStats.updated > 0) {
        message = editingItem 
          ? `Updated recurring item and ${billSyncStats.updated} related bill(s)`
          : `${message} and ${billSyncStats.updated} related bill(s) updated`;
      }

      showNotification(message, 'success');
    } catch (error) {
      console.error('❌ Error saving recurring item:', error);
      showNotification('Error saving item: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (item, alsoDeleteGeneratedBills = false) => {
    try {
      setSaving(true);

      console.log(`🗑️ Deleting recurring item: ${item.name}`);

      // CASCADE DELETION: Multi-field query for bills linked to this template
      let deletedCount = 0;
      let preservedCount = 0;

      if (item.id) {
        const billsCollection = collection(db, 'users', currentUser.uid, 'financialEvents');
        
        // Query by ALL possible field names that may link bills to templates
        // - recurringPatternId: current standard (new migrations)
        // - recurringTemplateId: older standard (widely used)
        // - sourcePatternId, templateId: alternative/legacy fields (backward compatibility)
        const queries = [
          query(billsCollection, where('type', '==', 'bill'), where('recurringPatternId', '==', item.id)),
          query(billsCollection, where('type', '==', 'bill'), where('sourcePatternId', '==', item.id)),
          query(billsCollection, where('type', '==', 'bill'), where('templateId', '==', item.id)),
          query(billsCollection, where('type', '==', 'bill'), where('recurringTemplateId', '==', item.id)),
        ];
        
        // Execute all queries in parallel and collect unique bills to delete
        // Map stores document references and data to enable deduplication while preserving info for deletion
        const billsToProcess = new Map();
        
        const queryPromises = queries.map(q => getDocs(q));
        const snapshots = await Promise.all(queryPromises);
        
        snapshots.forEach(snapshot => {
          snapshot.docs.forEach(doc => {
            if (!billsToProcess.has(doc.id)) {
              billsToProcess.set(doc.id, { ref: doc.ref, data: doc.data() });
            }
          });
        });

        console.log(`🗑️ Found ${billsToProcess.size} related bills to delete`);

        // Delete unpaid bills in batch, preserve paid ones for history
        const deletePromises = [];
        for (const [, { ref, data: billData }] of billsToProcess.entries()) {
          const isPaid = billData.isPaid || billData.status === 'paid';

          if (isPaid) {
            preservedCount++;
            console.log(`  ✓ Preserving paid bill: ${billData.name} (${billData.dueDate})`);
            // Keep paid bills for history
          } else {
            deletedCount++;
            console.log(`  🗑️ Deleting unpaid bill: ${billData.name} (${billData.dueDate})`);
            // Delete unpaid bill
            deletePromises.push(deleteDoc(ref));
          }
        }

        // Execute all deletions in parallel
        await Promise.all(deletePromises);

        console.log(`✅ Successfully deleted recurring item and ${deletedCount} related bills`);
      }

      // ✅ FIX: Delete from recurringPatterns collection
      const recurringPatternRef = doc(db, 'users', currentUser.uid, 'recurringPatterns', item.id);
      await deleteDoc(recurringPatternRef);
      
      console.log(`✅ Deleted recurring pattern: ${item.name} from recurringPatterns collection`);

      // ✅ FIX: Reload from recurringPatterns collection
      await loadRecurringItems();

      // Show notification with cascade deletion stats
      let message = `Deleted "${item.name}"`;
      if (deletedCount > 0) {
        message += ` and ${deletedCount} related bill${deletedCount !== 1 ? 's' : ''}`;
      } else if (billsToProcess.size === 0) {
        message += ` (no related bills found)`;
      }
      if (preservedCount > 0) {
        message += ` (${preservedCount} paid bill${preservedCount !== 1 ? 's' : ''} preserved)`;
      }

      showNotification(message, 'success');
    } catch (error) {
      console.error('❌ Error deleting recurring item:', error);
      showNotification('Error deleting item: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleBulkDelete = async () => {
    setShowBulkDeleteModal(false);

    try {
      setSaving(true);

      // ✅ FIX: Load and store current items from recurringPatterns for undo
      const recurringPatternsRef = collection(db, 'users', currentUser.uid, 'recurringPatterns');
      const recurringPatternsSnap = await getDocs(recurringPatternsRef);
      
      const itemsToDelete = recurringPatternsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setDeletedItems(itemsToDelete);

      // ✅ FIX: Delete all documents from recurringPatterns collection
      const deletePromises = recurringPatternsSnap.docs.map(doc => 
        deleteDoc(doc.ref)
      );
      await Promise.all(deletePromises);

      setRecurringItems([]);
      showNotification(`Deleted ${itemsToDelete.length} items. Click Undo to restore.`, 'success');
    } catch (error) {
      console.error('Error bulk deleting items:', error);
      showNotification('Error deleting items', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUndoBulkDelete = async () => {
    if (deletedItems.length === 0) return;

    try {
      setSaving(true);

      // ✅ FIX: Restore items to recurringPatterns collection
      const restorePromises = deletedItems.map(item => 
        setDoc(doc(db, 'users', currentUser.uid, 'recurringPatterns', item.id), item)
      );
      await Promise.all(restorePromises);

      // ✅ FIX: Reload from recurringPatterns collection
      await loadRecurringItems();
      setDeletedItems([]);
      showNotification('Items restored successfully!', 'success');
    } catch (error) {
      console.error('Error undoing bulk delete:', error);
      showNotification('Error restoring items', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAllGeneratedBills = async () => {
    if (
      !window.confirm('Delete all bills generated from recurring templates? This cannot be undone.')
    ) {
      return;
    }

    try {
      setSaving(true);
      setShowCleanupMenu(false);

      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};

      const bills = currentData.bills || [];
      const recurringTemplateIds = new Set(recurringItems.map((item) => item.id));

      // Filter out bills that have a recurringTemplateId matching any current recurring item
      const initialCount = bills.length;
      const updatedBills = bills.filter(
        (bill) => !bill.recurringTemplateId || !recurringTemplateIds.has(bill.recurringTemplateId)
      );
      const deletedCount = initialCount - updatedBills.length;

      await updateDoc(settingsDocRef, {
        ...currentData,
        bills: updatedBills,
      });

      showNotification(`Deleted ${deletedCount} auto-generated bill(s)`, 'success');
    } catch (error) {
      console.error('Error deleting generated bills:', error);
      showNotification('Error deleting generated bills', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateBillsFromTemplates = async () => {
    try {
      setSaving(true);
      setShowCleanupMenu(false);

      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};

      const bills = currentData.bills || [];
      const generateBillId = () => `bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Generate bills from active recurring templates
      const activeTemplates = recurringItems.filter(
        (item) => item.status === 'active' && item.type === 'expense'
      );
      let newBills = [];

      activeTemplates.forEach((template) => {
        try {
          // Generate 3 months of bills from each template
          const generatedBills = RecurringBillManager.generateBillsFromTemplate(
            template,
            3,
            generateBillId
          );

          // Filter out bills that already exist (same template ID and due date)
          const uniqueBills = generatedBills.filter((newBill) => {
            return !bills.some(
              (existingBill) =>
                existingBill.recurringTemplateId === newBill.recurringTemplateId &&
                existingBill.dueDate === newBill.dueDate
            );
          });

          newBills = [...newBills, ...uniqueBills];
        } catch (error) {
          console.error(`Error generating bills from template ${template.name}:`, error);
        }
      });

      if (newBills.length === 0) {
        showNotification('No new bills to generate (all bills already exist)', 'info');
        return;
      }

      // Add new bills to existing bills
      let updatedBills = [...bills, ...newBills];

      // DEDUPLICATION: Remove any duplicates that might have been created
      const deduplicationResult = BillDeduplicationManager.removeDuplicates(updatedBills);
      if (deduplicationResult.stats.duplicates > 0) {
        console.log('[Bill Generation] Removed duplicates:', deduplicationResult.stats.duplicates);
        updatedBills = deduplicationResult.cleanedBills;
      }

      await updateDoc(settingsDocRef, {
        ...currentData,
        bills: updatedBills,
      });

      const finalCount = updatedBills.length - bills.length;
      showNotification(
        `Generated ${finalCount} bill(s) from ${activeTemplates.length} template(s)`,
        'success'
      );
    } catch (error) {
      console.error('Error generating bills:', error);
      showNotification('Error generating bills from templates', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePause = async (item) => {
    const newStatus = item.status === 'paused' ? 'active' : 'paused';

    try {
      setSaving(true);

      const updatedItem = { ...item, status: newStatus, updatedAt: new Date().toISOString() };

      // Auto-sync bills when toggling pause/active status
      let billSyncStats = null;

      if (item.type === 'expense') {
        try {
          if (newStatus === 'paused') {
            // When pausing, remove unpaid bill instances from this template
            const billsQuery = query(
              collection(db, 'users', currentUser.uid, 'financialEvents'),
              where('type', '==', 'bill'),
              where('recurringPatternId', '==', item.id),
              where('isPaid', '==', false)
            );
            const billsSnapshot = await getDocs(billsQuery);
            
            const deletePromises = billsSnapshot.docs.map(doc => 
              deleteDoc(doc.ref)
            );
            await Promise.all(deletePromises);
            
            billSyncStats = { removed: billsSnapshot.size };
          }
          // Note: When activating, bills will be auto-generated on next load
        } catch (error) {
          console.error('Error syncing bills on pause toggle:', error);
        }
      }

      // ✅ FIX: Save to recurringPatterns collection
      const recurringPatternRef = doc(db, 'users', currentUser.uid, 'recurringPatterns', item.id);
      await setDoc(recurringPatternRef, updatedItem, { merge: true });

      // ✅ FIX: Reload from recurringPatterns collection
      await loadRecurringItems();

      // Show notification with bill sync details
      let message = newStatus === 'paused' ? 'Item paused' : 'Item resumed';
      if (billSyncStats) {
        if (newStatus === 'active' && billSyncStats.added > 0) {
          message += ` (${billSyncStats.added} bills generated)`;
        } else if (newStatus === 'paused' && billSyncStats.removed > 0) {
          message += ` (${billSyncStats.removed} future bills removed)`;
        }
      }

      showNotification(message, 'success');
    } catch (error) {
      console.error('Error toggling pause:', error);
      showNotification('Error updating item', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleMarkRecurringBillAsPaid = async (item) => {
    try {
      setSaving(true);

      if (import.meta.env.DEV) {
        console.log(`💰 Marking bill as paid for recurring item: ${item.name}`);
      }

      // Query for unpaid bills linked to this recurring pattern
      const billsCollection = collection(db, 'users', currentUser.uid, 'financialEvents');
      const billQuery = query(
        billsCollection,
        where('type', '==', 'bill'),
        where('recurringPatternId', '==', item.id),
        where('isPaid', '==', false)
      );

      const billsSnapshot = await getDocs(billQuery);

      if (billsSnapshot.empty) {
        showNotification('No unpaid bills found for this recurring item', 'warning');
        return;
      }

      // If multiple unpaid bills exist, mark the oldest one first
      const unpaidBills = billsSnapshot.docs.map(doc => ({
        id: doc.id,
        ref: doc.ref,
        ...doc.data()
      }));

      // Sort by dueDate to get the oldest bill
      unpaidBills.sort((a, b) => {
        const dateA = new Date(a.dueDate || a.nextDueDate || Date.now());
        const dateB = new Date(b.dueDate || b.nextDueDate || Date.now());
        return dateA - dateB;
      });

      const billToPay = unpaidBills[0];
      if (import.meta.env.DEV) {
        console.log(`💰 Marking oldest unpaid bill: ${billToPay.name} due ${billToPay.dueDate}`);
      }

      // Use RecurringBillManager to mark bill as paid with proper date advancement
      const updatedBill = RecurringBillManager.markBillAsPaid(billToPay);

      // Update the bill document in financialEvents
      await updateDoc(billToPay.ref, {
        isPaid: true,
        status: 'paid',
        paidDate: updatedBill.lastPaidDate,
        paidAmount: Math.abs(parseFloat(billToPay.amount) || 0),
        lastPaidDate: updatedBill.lastPaidDate,
        lastPayment: updatedBill.lastPayment,
        paymentHistory: updatedBill.paymentHistory,
        markedBy: 'user',
        markedAt: serverTimestamp(),
        markedVia: 'recurring-page-pay-button',
        canBeUnmarked: true,
        updatedAt: serverTimestamp()
      });

      if (import.meta.env.DEV) {
        console.log(`✅ Bill marked as paid in financialEvents: ${billToPay.name}`);
      }

      // Update the recurring pattern's nextOccurrence to the next billing cycle
      const recurringPatternRef = doc(db, 'users', currentUser.uid, 'recurringPatterns', item.id);
      await updateDoc(recurringPatternRef, {
        nextOccurrence: updatedBill.nextDueDate,
        lastPaidDate: updatedBill.lastPaidDate,
        updatedAt: serverTimestamp()
      });

      if (import.meta.env.DEV) {
        console.log(`✅ Advanced recurring pattern nextOccurrence to: ${updatedBill.nextDueDate}`);
      }

      // Reload recurring items to refresh the UI
      await loadRecurringItems();

      showNotification(
        `Payment recorded for ${item.name}! Next occurrence: ${updatedBill.nextDueDate}`,
        'success'
      );
    } catch (error) {
      console.error('❌ Error marking recurring bill as paid:', error);
      showNotification('Error marking bill as paid: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCSVImport = async (importedItems, conflicts, updatedCustomMapping) => {
    try {
      setSaving(true);

      // ✅ FIX: Load existing items from recurringPatterns collection
      const recurringPatternsRef = collection(db, 'users', currentUser.uid, 'recurringPatterns');
      const recurringPatternsSnap = await getDocs(recurringPatternsRef);
      
      const existingItems = recurringPatternsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Process conflicts - merge items where resolution is 'merge'
      const mergeUpdates = [];
      conflicts.forEach((conflict) => {
        if (conflict.resolution === 'merge') {
          const existingItem = existingItems.find((item) => item.id === conflict.existing.id);
          if (existingItem) {
            // Update existing item with new data, keeping original creation date
            const mergedItem = {
              ...existingItem,
              ...conflict.incoming,
              id: conflict.existing.id, // Keep existing ID
              createdAt: existingItem.createdAt, // Keep original creation date
              updatedAt: new Date().toISOString(),
              dataSource: 'csv_import_merged',
              mergedFrom: conflict.incoming.id,
            };
            mergeUpdates.push(mergedItem);
          }
        }
      });

      // Add new items (excluding those that were merged or skipped)
      const itemsToAdd = importedItems.filter((item) => {
        const conflict = conflicts.find((c) => c.incoming.id === item.id);
        return !conflict || (conflict.resolution !== 'merge' && conflict.resolution !== 'skip');
      });

      // ✅ FIX: Save all items to recurringPatterns collection
      const savePromises = [];
      
      // Save merged items
      mergeUpdates.forEach(item => {
        savePromises.push(
          setDoc(doc(db, 'users', currentUser.uid, 'recurringPatterns', item.id), item)
        );
      });
      
      // Save new items
      itemsToAdd.forEach(item => {
        savePromises.push(
          setDoc(doc(db, 'users', currentUser.uid, 'recurringPatterns', item.id), item)
        );
      });
      
      await Promise.all(savePromises);

      // Save custom mapping to settings if provided
      if (updatedCustomMapping && Object.keys(updatedCustomMapping).length > 0) {
        const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
        await setDoc(settingsDocRef, {
          institutionMapping: updatedCustomMapping
        }, { merge: true });
        setCustomMapping(updatedCustomMapping);
      }

      // ✅ FIX: Reload from recurringPatterns collection
      await loadRecurringItems();
      setShowCSVImport(false);

      const importCount = itemsToAdd.length;
      const mergeCount = mergeUpdates.length;
      let message = `Successfully imported ${importCount} recurring items`;
      if (mergeCount > 0) {
        message += ` and merged ${mergeCount} existing items`;
      }

      showNotification(message, 'success');

      // AUTO-GENERATE BILLS: Automatically generate bill instances from newly imported recurring templates
      console.log('[CSV Import] Auto-generating bills from imported recurring templates...');
      try {
        const bills = currentData.bills || [];
        const generateBillId = () =>
          `bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Generate bills only from newly imported active expense templates
        const newActiveExpenses = itemsToAdd.filter(
          (item) => item.status === 'active' && item.type === 'expense'
        );
        let newBills = [];

        newActiveExpenses.forEach((template) => {
          try {
            // Generate 3 months of bills from each template
            const generatedBills = RecurringBillManager.generateBillsFromTemplate(
              template,
              3,
              generateBillId
            );

            // Filter out bills that already exist (same template ID and due date)
            const uniqueBills = generatedBills.filter((newBill) => {
              return !bills.some(
                (existingBill) =>
                  existingBill.recurringTemplateId === newBill.recurringTemplateId &&
                  existingBill.dueDate === newBill.dueDate
              );
            });

            newBills = [...newBills, ...uniqueBills];
            console.log(
              `[CSV Import] Generated ${uniqueBills.length} bills from template: ${template.name}`
            );
          } catch (error) {
            console.error(
              `[CSV Import] Error generating bills from template ${template.name}:`,
              error
            );
          }
        });

        if (newBills.length > 0) {
          // Add new bills to existing bills
          let updatedBills = [...bills, ...newBills];

          // DEDUPLICATION: Remove any duplicates that might have been created during CSV import
          const deduplicationResult = BillDeduplicationManager.removeDuplicates(updatedBills);
          if (deduplicationResult.stats.duplicates > 0) {
            console.log(
              '[CSV Import] Removed duplicates during bill generation:',
              deduplicationResult.stats.duplicates
            );
            BillDeduplicationManager.logDeduplication(deduplicationResult, 'csv-import');
            updatedBills = deduplicationResult.cleanedBills;
          }

          // Update Firebase with the new bills
          await updateDoc(settingsDocRef, {
            ...currentData,
            recurringItems: updatedItems,
            bills: updatedBills,
          });

          const finalBillCount = updatedBills.length - bills.length;
          console.log(`[CSV Import] Successfully generated ${finalBillCount} bill instances`);

          // Update notification to include bill generation info
          const finalMessage =
            message + `. Auto-generated ${finalBillCount} bill instance(s) for Bills Management.`;
          showNotification(finalMessage, 'success');
        } else {
          console.log(
            '[CSV Import] No new bills to generate (templates already have bills or no active expense templates)'
          );
        }
      } catch (billError) {
        console.error('[CSV Import] Error auto-generating bills:', billError);
        // Don't fail the entire import if bill generation fails, just log it
        showNotification(message + ' (Note: Bill generation encountered an issue)', 'warning');
      }
    } catch (error) {
      console.error('Error importing CSV data:', error);
      showNotification('Error importing CSV data', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleShowHistory = (item) => {
    // Find the item from processedItems which includes history data
    const itemWithHistory = processedItems.find((i) => i.id === item.id) || item;
    setSelectedItem(itemWithHistory);
    setShowHistoryModal(true);
  };

  const getStatusBadgeClass = (status) => {
    const statusClasses = {
      active: 'status-active',
      paused: 'status-paused',
      ended: 'status-ended',
      failed: 'status-failed',
    };
    return `status-badge ${statusClasses[status] || 'status-active'}`;
  };

  const getTypeClass = (type) => {
    return type === 'income' ? 'type-income' : 'type-expense';
  };

  if (loading) {
    return (
      <div className="recurring-container">
        <div className="page-header">
          <h2>🔄 Recurring</h2>
          <p>Loading recurring data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="recurring-container">
      {/* Notification */}
      {notification.message && (
        <div className={`notification ${notification.type}`}>{notification.message}</div>
      )}

      {/* Page Header */}
      <div className="page-header">
        <h2>🔄 Recurring</h2>
        <p>Manage all recurring incomes, expenses, and subscriptions</p>
      </div>

      {/* Overview Dashboard */}
      <div className="recurring-summary">
        <div className="summary-card income">
          <div className="summary-icon">💰</div>
          <div className="summary-content">
            <div className="summary-amount">{formatCurrency(metrics.monthlyIncome)}</div>
            <div className="summary-label">Monthly Income</div>
          </div>
        </div>

        <div className="summary-card expense">
          <div className="summary-icon">💸</div>
          <div className="summary-content">
            <div className="summary-amount">{formatCurrency(metrics.monthlyExpenses)}</div>
            <div className="summary-label">Monthly Expenses</div>
          </div>
        </div>

        <div className={`summary-card net ${metrics.netRecurring >= 0 ? 'positive' : 'negative'}`}>
          <div className="summary-icon">📊</div>
          <div className="summary-content">
            <div className="summary-amount">{formatCurrency(metrics.netRecurring)}</div>
            <div className="summary-label">Net Recurring</div>
          </div>
        </div>

        <div className="summary-card upcoming">
          <div className="summary-icon">
            {metrics.urgency?.overdue > 0 ? '🔴' : metrics.urgency?.urgent > 0 ? '🟠' : '⏰'}
          </div>
          <div className="summary-content">
            <div className="summary-amount">
              {metrics.urgency?.overdue > 0 ? metrics.urgency.overdue : metrics.dueSoonCount}
            </div>
            <div className="summary-label">
              {metrics.urgency?.overdue > 0 ? 'Overdue Bills' : 'Due Next 7 Days'}
            </div>
            {metrics.urgency && (metrics.urgency.overdue > 0 || metrics.urgency.urgent > 0) && (
              <div className="urgency-breakdown">
                {metrics.urgency.overdue > 0 && (
                  <span className="urgency-stat overdue">🔴 {metrics.urgency.overdue} overdue</span>
                )}
                {metrics.urgency.urgent > 0 && (
                  <span className="urgency-stat urgent">🟠 {metrics.urgency.urgent} urgent</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="recurring-controls">
        <div className="search-filters">
          <input
            type="text"
            placeholder="Search recurring items..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Types</option>
            <option value="income">Income</option>
            <option value="expense">Expenses</option>
          </select>

          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Categories</option>
            {TRANSACTION_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="failed">Failed</option>
          </select>

          <select
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="filter-select sort-select"
          >
            <option value="dueDate">🔥 By Due Date</option>
            <option value="alphabetical">🔤 Alphabetical</option>
            <option value="amount">💰 By Amount</option>
          </select>
        </div>

        <div className="action-buttons">
          {deletedItems.length > 0 && (
            <button
              className="undo-button"
              onClick={handleUndoBulkDelete}
              disabled={saving}
              title="Restore deleted items"
            >
              ↩️ Undo Delete
            </button>
          )}
          {recurringItems.length > 0 && (
            <>
              <button
                className="delete-all-button"
                onClick={() => setShowBulkDeleteModal(true)}
                disabled={saving}
                title="Delete all recurring items"
              >
                🗑️ Delete All
              </button>
              <div style={{ position: 'relative' }}>
                <button
                  className="cleanup-menu-button"
                  onClick={() => setShowCleanupMenu(!showCleanupMenu)}
                  disabled={saving}
                  title="Cleanup & Maintenance"
                  style={{
                    background: '#6c757d',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '12px 20px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap',
                  }}
                >
                  🔧 Cleanup
                </button>
                {showCleanupMenu && (
                  <div
                    className="cleanup-dropdown"
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: '0',
                      marginTop: '8px',
                      background: '#1a1a1a',
                      border: '2px solid #333',
                      borderRadius: '8px',
                      padding: '8px',
                      minWidth: '250px',
                      zIndex: 1000,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    }}
                  >
                    <button
                      onClick={handleGenerateBillsFromTemplates}
                      disabled={saving}
                      style={{
                        width: '100%',
                        background: 'transparent',
                        color: '#fff',
                        border: 'none',
                        padding: '12px 16px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        transition: 'background 0.2s',
                        fontSize: '14px',
                        borderBottom: '1px solid #333',
                      }}
                      onMouseEnter={(e) => (e.target.style.background = '#2a2a2a')}
                      onMouseLeave={(e) => (e.target.style.background = 'transparent')}
                    >
                      ➕ Generate Bills from Templates
                      <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                        Create bill instances for next 3 months
                      </div>
                    </button>
                    <button
                      onClick={handleDeleteAllGeneratedBills}
                      disabled={saving}
                      style={{
                        width: '100%',
                        background: 'transparent',
                        color: '#fff',
                        border: 'none',
                        padding: '12px 16px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        transition: 'background 0.2s',
                        fontSize: '14px',
                      }}
                      onMouseEnter={(e) => (e.target.style.background = '#2a2a2a')}
                      onMouseLeave={(e) => (e.target.style.background = 'transparent')}
                    >
                      🗑️ Delete All Generated Bills
                      <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                        Remove bills auto-created from templates
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
          <button
            className="import-button"
            onClick={() => setShowCSVImport(true)}
            disabled={saving}
          >
            📊 Import from CSV
          </button>
          <button className="add-button" onClick={handleAddItem} disabled={saving}>
            ➕ Add Recurring Item
          </button>
        </div>
      </div>

      {/* Recurring Items Table */}
      <div className="recurring-table-container">
        <h3>Recurring Items ({filteredItems.length})</h3>
        <div className="recurring-table">
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => (
              <div
                key={item.id}
                className={`recurring-item ${getTypeClass(item.type)} ${item.urgencyInfo?.className || ''}`}
              >
                <div className="item-main-info">
                  <div className="item-icon">{getCategoryIcon(item.category)}</div>
                  <div className="item-details">
                    <h4>
                      {item.urgencyInfo && (
                        <span className="urgency-indicator" title={item.urgencyInfo.label}>
                          {item.urgencyInfo.indicator}
                        </span>
                      )}
                      {item.name}
                    </h4>
                    <div className="item-meta">
                      <span className={`item-type ${item.type}`}>
                        {item.type === 'income' ? '📈' : '📉'} {item.type}
                      </span>
                      <span className="item-category">{item.category}</span>
                      <span className="item-frequency">
                        {item.frequency}
                        {item.activeMonths && item.activeMonths.length > 0 && (
                          <span
                            style={{
                              marginLeft: '5px',
                              fontSize: '11px',
                              background: 'rgba(138, 43, 226, 0.2)',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: '600',
                            }}
                            title={`Active in: ${item.activeMonths.map((m) => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m]).join(', ')}`}
                          >
                            📅 {item.activeMonths.length}mo
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="item-amount-section">
                  <div className={`item-amount ${item.type}`}>
                    {item.type === 'income' ? '+' : '-'}
                    {formatCurrency(Math.abs(item.amount))}
                  </div>
                  <div className="item-next-date">
                    {item.formattedDueDate || `Next: ${formatDate(item.nextOccurrence)}`}
                  </div>
                  {item.urgencyInfo && (
                    <div className={`urgency-label ${item.urgencyInfo.className}`}>
                      {item.urgencyInfo.label}
                    </div>
                  )}
                </div>

                <div className="item-status-section">
                  <span className={getStatusBadgeClass(item.status)}>{item.status}</span>
                  <div className="item-account">
                    {accounts[item.linkedAccount]?.name || 'No Account'}
                  </div>
                  <div className="item-autopay">{item.autoPay ? '🔄 Auto' : '👤 Manual'}</div>
                </div>

                <div className="item-actions">
                  {item.type === 'expense' && item.status === 'active' && (
                    <button
                      className="action-btn pay"
                      onClick={() => handleMarkRecurringBillAsPaid(item)}
                      disabled={saving}
                      title="Mark as Paid"
                    >
                      💰 Pay
                    </button>
                  )}
                  <button
                    className="action-btn edit"
                    onClick={() => handleEditItem(item)}
                    title="Edit"
                  >
                    ✏️
                  </button>
                  <button
                    className={`action-btn ${item.status === 'paused' ? 'resume' : 'pause'}`}
                    onClick={() => handleTogglePause(item)}
                    title={item.status === 'paused' ? 'Resume' : 'Pause'}
                  >
                    {item.status === 'paused' ? '▶️' : '⏸️'}
                  </button>
                  <button
                    className="action-btn history"
                    onClick={() => handleShowHistory(item)}
                    title="History"
                  >
                    📋
                  </button>
                  <button
                    className="action-btn delete"
                    onClick={() => {
                      setItemToDelete(item);
                      setDeleteGeneratedBills(false);
                      setShowDeleteModal(true);
                    }}
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="no-items">
              <p>No recurring items found</p>
              <button onClick={handleAddItem} className="add-button">
                Add Your First Recurring Item
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingItem ? 'Edit Recurring Item' : 'Add Recurring Item'}</h3>
              <button className="close-btn" onClick={() => setShowModal(false)}>
                ×
              </button>
            </div>

            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Name *</label>
                  <input
                    type="text"
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    placeholder="Netflix, Salary, Rent..."
                  />
                </div>
                <div className="form-group">
                  <label>Type *</label>
                  <select
                    value={newItem.type}
                    onChange={(e) => setNewItem({ ...newItem, type: e.target.value })}
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Amount *</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newItem.amount}
                    onChange={(e) => setNewItem({ ...newItem, amount: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <select
                    value={newItem.category}
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                  >
                    <option value="">Select Category</option>
                    {TRANSACTION_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Frequency</label>
                  <select
                    value={newItem.frequency}
                    onChange={(e) => setNewItem({ ...newItem, frequency: e.target.value })}
                  >
                    <option value="weekly">Weekly</option>
                    <option value="bi-weekly">Bi-weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annually">Annually</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Next Occurrence</label>
                  <input
                    type="date"
                    value={newItem.nextOccurrence}
                    onChange={(e) => setNewItem({ ...newItem, nextOccurrence: e.target.value })}
                  />
                </div>
              </div>

              {newItem.frequency === 'monthly' && (
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                    <input
                      type="checkbox"
                      checked={newItem.customRecurrence}
                      onChange={(e) =>
                        setNewItem({
                          ...newItem,
                          customRecurrence: e.target.checked,
                          activeMonths: e.target.checked ? [] : [],
                        })
                      }
                      style={{
                        marginRight: '10px',
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer',
                      }}
                    />
                    <span>Custom monthly recurrence (select specific months)</span>
                  </label>

                  {newItem.customRecurrence && (
                    <div
                      style={{
                        padding: '15px',
                        background: 'rgba(138, 43, 226, 0.05)',
                        borderRadius: '8px',
                        border: '1px solid rgba(138, 43, 226, 0.2)',
                      }}
                    >
                      <div style={{ marginBottom: '10px', fontSize: '14px', color: '#666' }}>
                        Select the months when this bill should be generated:
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(4, 1fr)',
                          gap: '10px',
                        }}
                      >
                        {[
                          'Jan',
                          'Feb',
                          'Mar',
                          'Apr',
                          'May',
                          'Jun',
                          'Jul',
                          'Aug',
                          'Sep',
                          'Oct',
                          'Nov',
                          'Dec',
                        ].map((month, index) => (
                          <label
                            key={month}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '8px',
                              background: newItem.activeMonths.includes(index)
                                ? 'rgba(138, 43, 226, 0.2)'
                                : 'rgba(255, 255, 255, 0.5)',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              border: newItem.activeMonths.includes(index)
                                ? '2px solid #8a2be2'
                                : '1px solid rgba(0, 0, 0, 0.1)',
                              transition: 'all 0.2s ease',
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={newItem.activeMonths.includes(index)}
                              onChange={(e) => {
                                const updatedMonths = e.target.checked
                                  ? [...newItem.activeMonths, index]
                                  : newItem.activeMonths.filter((m) => m !== index);
                                setNewItem({
                                  ...newItem,
                                  activeMonths: updatedMonths.sort((a, b) => a - b),
                                });
                              }}
                              style={{ marginRight: '8px', cursor: 'pointer' }}
                            />
                            <span
                              style={{
                                fontSize: '14px',
                                fontWeight: newItem.activeMonths.includes(index) ? '600' : '400',
                              }}
                            >
                              {month}
                            </span>
                          </label>
                        ))}
                      </div>
                      {newItem.activeMonths.length > 0 && (
                        <div
                          style={{
                            marginTop: '10px',
                            fontSize: '13px',
                            color: '#8a2be2',
                            fontWeight: '500',
                          }}
                        >
                          ✓ Active in {newItem.activeMonths.length} month
                          {newItem.activeMonths.length !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="form-row">
                <div className="form-group">
                  <label>Account</label>
                  <select
                    value={newItem.linkedAccount}
                    onChange={(e) => setNewItem({ ...newItem, linkedAccount: e.target.value })}
                  >
                    <option value="">Select Account</option>
                    {Object.entries(accounts).map(([key, account]) => (
                      <option key={key} value={key}>
                        {account.name} {account.mask ? `(****${account.mask})` : ''} -{' '}
                        {account.type}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={newItem.autoPay}
                      onChange={(e) => setNewItem({ ...newItem, autoPay: e.target.checked })}
                    />
                    Auto-pay enabled
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={newItem.description}
                  onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                  placeholder="Optional description..."
                  rows="3"
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="cancel-btn" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button className="save-btn" onClick={handleSaveItem} disabled={saving}>
                {saving ? 'Saving...' : editingItem ? 'Update' : 'Add'} Item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Modal */}
      {showHistoryModal && selectedItem && (
        <div className="modal-overlay" onClick={() => setShowHistoryModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>History: {selectedItem.name}</h3>
              <button className="close-btn" onClick={() => setShowHistoryModal(false)}>
                ×
              </button>
            </div>

            <div className="modal-body">
              <div className="history-list">
                {selectedItem.history && selectedItem.history.length > 0 ? (
                  selectedItem.history.map((entry, index) => (
                    <div key={index} className="history-entry">
                      <div className="history-date">{formatDate(entry.date)}</div>
                      <div className={`history-status ${entry.status}`}>{entry.status}</div>
                      <div className="history-amount">{formatCurrency(entry.amount)}</div>
                    </div>
                  ))
                ) : (
                  <p>No history available</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showCSVImport && (
        <CSVImportModal
          existingItems={recurringItems}
          accounts={accounts}
          customMapping={customMapping}
          onImport={handleCSVImport}
          onCancel={() => setShowCSVImport(false)}
        />
      )}

      {/* Single Item Delete Confirmation Modal */}
      {showDeleteModal && itemToDelete && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>⚠️ Delete "{itemToDelete.name}"?</h3>
              <button className="close-btn" onClick={() => setShowDeleteModal(false)}>
                ×
              </button>
            </div>

            <div className="modal-body">
              <p style={{ marginBottom: '20px', fontSize: '16px' }}>
                Are you sure you want to delete this recurring item?
              </p>

              <div
                style={{
                  marginBottom: '20px',
                  padding: '12px',
                  background: 'rgba(138, 43, 226, 0.1)',
                  borderRadius: '8px',
                  border: '1px solid rgba(138, 43, 226, 0.3)',
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={deleteGeneratedBills}
                    onChange={(e) => setDeleteGeneratedBills(e.target.checked)}
                    style={{
                      marginRight: '10px',
                      width: '18px',
                      height: '18px',
                      cursor: 'pointer',
                    }}
                  />
                  <span>
                    <strong>Also delete bills generated from this template</strong>
                    <br />
                    <small style={{ color: '#ba68c8', marginTop: '4px', display: 'block' }}>
                      This will remove any bills in the Bills page that were auto-generated from
                      this recurring template
                    </small>
                  </span>
                </label>
              </div>

              <div
                className="modal-actions"
                style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}
              >
                <button
                  onClick={() => setShowDeleteModal(false)}
                  className="cancel-btn"
                  style={{ padding: '10px 20px' }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    handleDeleteItem(itemToDelete, deleteGeneratedBills);
                  }}
                  className="delete-btn"
                  disabled={saving}
                  style={{ padding: '10px 20px', backgroundColor: '#f44336' }}
                >
                  {saving ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowBulkDeleteModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>⚠️ Delete All Recurring Items?</h3>
              <button className="close-btn" onClick={() => setShowBulkDeleteModal(false)}>
                ×
              </button>
            </div>

            <div className="modal-body">
              <p style={{ marginBottom: '20px', fontSize: '16px' }}>
                Are you sure you want to delete{' '}
                <strong>all {recurringItems.length} recurring items</strong>?
              </p>
              <p style={{ marginBottom: '20px', color: '#ff9800' }}>
                ⚠️ This will permanently delete all your recurring incomes, expenses, and
                subscriptions.
              </p>
              <p style={{ marginBottom: '20px', color: '#00ff88' }}>
                ✓ Don't worry! You can undo this action using the "Undo Delete" button that will
                appear after deletion.
              </p>

              <div
                className="modal-actions"
                style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}
              >
                <button
                  onClick={() => setShowBulkDeleteModal(false)}
                  className="cancel-btn"
                  style={{ padding: '10px 20px' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="delete-btn"
                  disabled={saving}
                  style={{ padding: '10px 20px', backgroundColor: '#f44336' }}
                >
                  {saving ? 'Deleting...' : 'Delete All'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Recurring;
