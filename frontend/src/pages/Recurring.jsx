import React, { useState, useEffect, useMemo } from 'react';
import {
  doc,
  getDoc,
  collection,
  setDoc,
  getDocs,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { RecurringManager } from '../utils/RecurringManager';
import { formatDateForInput } from '../utils/DateUtils';
import { TRANSACTION_CATEGORIES, getCategoryIcon } from '../constants/categories';
import CSVImportModal from '../components/CSVImportModal';
import RecurringDetectionReview from '../components/RecurringDetectionReview';
import { BillSortingManager } from '../utils/BillSortingManager';
import { format, addMonths } from 'date-fns';
import { getDateOnly } from '../utils/dateNormalization';
import './Recurring.css';
import { useAuth } from '../contexts/AuthContext';
import { ensureSettingsDocument } from '../utils/settingsUtils';
import { getCanonicalDisplayBalance, getVisiblePlaidAccounts } from '../utils/accountVisibility';

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
  const [showDetection, setShowDetection] = useState(false);

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

  useEffect(() => {
    loadRecurringData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const processed = RecurringManager.processRecurringItems(recurringItems);
    setProcessedItems(processed);
  }, [recurringItems]);

  const loadRecurringData = async () => {
    try {
      setLoading(true);
      await Promise.all([loadRecurringItems(), loadAccounts()]);
    } catch (error) {
      console.error('Error loading recurring data:', error);
      // Never substitute demo financial records for failed production data.
      setRecurringItems([]);
      showNotification('Unable to load recurring items. Please try again.', 'error');
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
            const balance = getCanonicalDisplayBalance(account);

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

      // Try to load from Plaid API first (fallback if the API is unavailable).
      // Authentication is attached globally by authFetch using the Firebase ID token.
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'https://smart-money-tracker-09ks.onrender.com';
        const response = await fetch(
          `${apiUrl}/api/accounts?userId=${currentUser.uid}&_t=${Date.now()}`,
          {
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        if (response.ok) {
          const data = await response.json();

          if (data.success === false) {
            if (import.meta.env.DEV) {
              console.log(
                'Plaid API returned no accounts:',
                data.message || 'No accounts available'
              );
            }
          } else {
            const accountsList = data.accounts || data;

            if (Array.isArray(accountsList) && accountsList.length > 0) {
              const accountsMap = {};
              accountsList.forEach((account) => {
                const accountId = account.account_id || account.id || account._id;
                const balance = getCanonicalDisplayBalance(account);

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
        if (import.meta.env.DEV) {
          console.log('Plaid API not available, trying Firebase...', apiError.message || '');
        }
      }

      // Fallback to Firebase
      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      const settingsDocSnap = await getDoc(settingsDocRef);

      if (settingsDocSnap.exists()) {
        const data = settingsDocSnap.data();
        const canonicalPlaidAccounts = data.plaidAccounts || [];
        const plaidAccountsList = getVisiblePlaidAccounts(canonicalPlaidAccounts, data);
        const bankAccounts = data.bankAccounts || {};

        // Keep connection truth separate from visibility.
        if (canonicalPlaidAccounts.length > 0) {
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
      setAccounts({});
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

      // Recurring owns templates only. Bill occurrences are created/advanced
      // by the canonical backend bill lifecycle, never as a side effect of
      // saving or editing a template.
      const recurringPatternRef = doc(
        db,
        'users',
        currentUser.uid,
        'recurringPatterns',
        itemData.id
      );
      await setDoc(recurringPatternRef, itemData, { merge: true });

      console.log(`✅ Saved recurring pattern: ${itemData.name} to recurringPatterns collection`);

      // ✅ FIX: Reload from recurringPatterns collection
      await loadRecurringItems();
      setShowModal(false);

      const message = editingItem ? 'Recurring item updated' : 'Recurring item added';
      showNotification(message, 'success');
    } catch (error) {
      console.error('❌ Error saving recurring item:', error);
      showNotification('Error saving item: ' + error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (item) => {
    try {
      setSaving(true);

      const recurringPatternRef = doc(
        db,
        'users',
        currentUser.uid,
        'recurringPatterns',
        item.id
      );
      await deleteDoc(recurringPatternRef);

      // Intentionally preserve existing bill occurrences and payment history.
      // Removing a template must not erase or rewrite financial history.
      await loadRecurringItems();
      showNotification(`Deleted recurring template "${item.name}"`, 'success');
    } catch (error) {
      console.error('Error deleting recurring template:', error);
      showNotification('Error deleting recurring template', 'error');
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

  const handleTogglePause = async (item) => {
    const newStatus = item.status === 'paused' ? 'active' : 'paused';

    try {
      setSaving(true);

      const recurringPatternRef = doc(
        db,
        'users',
        currentUser.uid,
        'recurringPatterns',
        item.id
      );

      await setDoc(
        recurringPatternRef,
        {
          ...item,
          status: newStatus,
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );

      // Existing bill occurrences are intentionally untouched. Pausing a
      // template controls future recurrence; it does not rewrite history.
      await loadRecurringItems();
      showNotification(newStatus === 'paused' ? 'Item paused' : 'Item resumed', 'success');
    } catch (error) {
      console.error('Error toggling pause:', error);
      showNotification('Error updating item', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCSVImport = async (importedItems, conflicts, updatedCustomMapping) => {
    try {
      setSaving(true);

      const recurringPatternsRef = collection(
        db,
        'users',
        currentUser.uid,
        'recurringPatterns'
      );
      const recurringPatternsSnap = await getDocs(recurringPatternsRef);

      const existingItems = recurringPatternsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      const mergeUpdates = [];
      conflicts.forEach((conflict) => {
        if (conflict.resolution !== 'merge') return;

        const existingItem = existingItems.find(
          (item) => item.id === conflict.existing.id
        );
        if (!existingItem) return;

        mergeUpdates.push({
          ...existingItem,
          ...conflict.incoming,
          id: conflict.existing.id,
          createdAt: existingItem.createdAt,
          updatedAt: new Date().toISOString(),
          dataSource: 'csv_import_merged',
          mergedFrom: conflict.incoming.id
        });
      });

      const itemsToAdd = importedItems.filter((item) => {
        const conflict = conflicts.find((c) => c.incoming.id === item.id);
        return !conflict ||
          (conflict.resolution !== 'merge' && conflict.resolution !== 'skip');
      });

      const savePromises = [
        ...mergeUpdates.map(item =>
          setDoc(
            doc(db, 'users', currentUser.uid, 'recurringPatterns', item.id),
            item
          )
        ),
        ...itemsToAdd.map(item =>
          setDoc(
            doc(db, 'users', currentUser.uid, 'recurringPatterns', item.id),
            item
          )
        )
      ];

      await Promise.all(savePromises);

      if (updatedCustomMapping && Object.keys(updatedCustomMapping).length > 0) {
        const settingsDocRef = doc(
          db,
          'users',
          currentUser.uid,
          'settings',
          'personal'
        );
        await setDoc(
          settingsDocRef,
          { institutionMapping: updatedCustomMapping },
          { merge: true }
        );
        setCustomMapping(updatedCustomMapping);
      }

      await loadRecurringItems();
      setShowCSVImport(false);

      const importCount = itemsToAdd.length;
      const mergeCount = mergeUpdates.length;
      let message = `Successfully imported ${importCount} recurring items`;
      if (mergeCount > 0) {
        message += ` and merged ${mergeCount} existing items`;
      }

      showNotification(message, 'success');
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
            </>
          )}
          <button
            className="import-button"
            onClick={() => setShowDetection(true)}
            disabled={saving}
          >
            🔍 Detect from my banks
          </button>
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

      {/* Auto-Detection Review Modal */}
      {showDetection && (
        <RecurringDetectionReview
          userId={currentUser.uid}
          apiUrl={import.meta.env.VITE_API_URL}
          onApprove={async (approvedTemplates) => {
            await handleCSVImport(approvedTemplates, [], null);
          }}
          onClose={() => setShowDetection(false)}
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
                    handleDeleteItem(itemToDelete);
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
