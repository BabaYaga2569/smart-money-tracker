import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { RecurringManager } from '../utils/RecurringManager';
import { formatDateForInput } from '../utils/DateUtils';
import { TRANSACTION_CATEGORIES, getCategoryIcon } from '../constants/categories';
import CSVImportModal from '../components/CSVImportModal';
import SettingsMigrationModal from '../components/SettingsMigrationModal';
import { BillMigrationManager } from '../utils/BillMigrationManager';
import { BillSortingManager } from '../utils/BillSortingManager';
import './Recurring.css';

const Recurring = () => {
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
  const [showSettingsMigration, setShowSettingsMigration] = useState(false);
  const [settingsBills, setSettingsBills] = useState([]);
  const [migrationAnalysis, setMigrationAnalysis] = useState(null);
  
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
    status: 'active'
  });

  // Notification state
  const [notification, setNotification] = useState({ message: '', type: '' });
  
  // Bulk delete state
  const [deletedItems, setDeletedItems] = useState([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

  useEffect(() => {
    loadRecurringData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const processed = RecurringManager.processRecurringItems(recurringItems);
    setProcessedItems(processed);
  }, [recurringItems]);

  useEffect(() => {
    if (settingsBills.length > 0 && recurringItems.length >= 0) {
      const analysis = BillMigrationManager.analyzeMigrationNeed(settingsBills, recurringItems);
      setMigrationAnalysis(analysis);
    }
  }, [settingsBills, recurringItems]);

  const loadRecurringData = async () => {
    try {
      setLoading(true);
      await Promise.all([loadRecurringItems(), loadAccounts()]);
      // Load settings bills after recurring items are loaded
      await loadSettingsBillsAndAnalyzeMigration();
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
      const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
      const settingsDocSnap = await getDoc(settingsDocRef);
      
      if (settingsDocSnap.exists()) {
        const data = settingsDocSnap.data();
        setRecurringItems(data.recurringItems || []);
        setCustomMapping(data.institutionMapping || {});
      }
    } catch (error) {
      console.error('Error loading recurring items:', error);
      throw error;
    }
  };

  const loadAccounts = async () => {
    try {
      const token = localStorage.getItem('token');
      
      // Try to load from Plaid API first
      if (token) {
        try {
          const response = await fetch('https://smart-money-tracker-09ks.onrender.com/api/accounts', {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (response.ok) {
            const data = await response.json();
            const accountsList = data.accounts || data;
            
            if (Array.isArray(accountsList) && accountsList.length > 0) {
              const accountsMap = {};
              accountsList.forEach(account => {
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
                  institution: account.institution_name || ''
                };
              });
              setAccounts(accountsMap);
              return;
            }
          }
        } catch (apiError) {
          console.log('Plaid API not available, trying Firebase...', apiError.message || '');
        }
      }
      
      // Fallback to Firebase
      const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
      const settingsDocSnap = await getDoc(settingsDocRef);
      
      if (settingsDocSnap.exists()) {
        const data = settingsDocSnap.data();
        const plaidAccountsList = data.plaidAccounts || [];
        const bankAccounts = data.bankAccounts || {};
        
        // Prioritize Plaid accounts if they exist
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
          // Fall back to manual accounts
          setAccounts(bankAccounts);
        }
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
      // Fallback accounts
      setAccounts({
        bofa: { name: "Bank of America", type: "checking" },
        usaa: { name: "USAA", type: "checking" },
        capone: { name: "Capital One", type: "credit" }
      });
    }
  };

  const loadSettingsBillsAndAnalyzeMigration = async () => {
    try {
      const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
      const settingsDocSnap = await getDoc(settingsDocRef);
      
      if (settingsDocSnap.exists()) {
        const data = settingsDocSnap.data();
        const bills = data.bills || [];
        setSettingsBills(bills);
        
        // Analyze migration needs
        const analysis = BillMigrationManager.analyzeMigrationNeed(bills, recurringItems);
        setMigrationAnalysis(analysis);
      }
    } catch (error) {
      console.error('Error loading settings bills:', error);
      setSettingsBills([]);
      setMigrationAnalysis(null);
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
          { date: '2025-07-01', status: 'success', amount: 2500 }
        ]
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
          { date: '2025-05-03', status: 'success', amount: 15.99 }
        ]
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
          { date: '2025-07-01', status: 'success', amount: 1200 }
        ]
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
          { date: '2025-06-15', status: 'success', amount: 9.99 }
        ]
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
          { date: '2025-07-12', status: 'success', amount: 125 }
        ]
      }
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
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const calculateMetrics = () => {
    const totals = RecurringManager.calculateMonthlyTotals(processedItems);
    const activeItems = processedItems.filter(item => item.status === 'active');
    
    // Get upcoming items (next 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    const upcomingItems = RecurringManager.getItemsInRange(activeItems, new Date(), thirtyDaysFromNow);
    
    // Get items due in next 7 days
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const dueSoonItems = RecurringManager.getItemsInRange(activeItems, new Date(), sevenDaysFromNow);
    
    // Get failed/missed items
    const failedItems = processedItems.filter(item => item.status === 'failed');
    
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
      urgency: urgencySummary
    };
  };

  const metrics = calculateMetrics();

  // Filter items based on search and filters, then apply smart sorting
  const filteredItems = (() => {
    const filtered = processedItems.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesType = filterType === 'all' || item.type === filterType;
      const matchesCategory = filterCategory === 'all' || item.category === filterCategory;
      const matchesStatus = filterStatus === 'all' || item.status === filterStatus;
      return matchesSearch && matchesType && matchesCategory && matchesStatus;
    });
    
    // Apply smart sorting with urgency information
    return BillSortingManager.processBillsWithUrgency(filtered, sortOrder);
  })();

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
      status: 'active'
    });
    setShowModal(true);
  };

  const handleEditItem = (item) => {
    setEditingItem(item);
    setNewItem({
      ...item,
      nextOccurrence: formatDateForInput(new Date(item.nextOccurrence))
    });
    setShowModal(true);
  };

  const handleSaveItem = async () => {
    if (!newItem.name.trim() || !newItem.amount) {
      showNotification('Please fill in required fields', 'error');
      return;
    }

    try {
      setSaving(true);
      
      const itemData = {
        ...newItem,
        id: editingItem ? editingItem.id : `recurring-${Date.now()}`,
        amount: parseFloat(newItem.amount),
        createdAt: editingItem ? editingItem.createdAt : new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      const existingItems = currentData.recurringItems || [];
      let updatedItems;
      
      if (editingItem) {
        updatedItems = existingItems.map(item => 
          item.id === editingItem.id ? itemData : item
        );
      } else {
        // Check for potential duplicates before adding
        const isDuplicate = existingItems.some(item => {
          // Exact duplicate: same name, amount, and next occurrence
          const exactMatch = item.name.toLowerCase() === itemData.name.toLowerCase() && 
                             parseFloat(item.amount) === parseFloat(itemData.amount) &&
                             item.nextOccurrence === itemData.nextOccurrence &&
                             item.frequency === itemData.frequency;
          
          return exactMatch;
        });
        
        if (isDuplicate) {
          showNotification('A recurring item with the same name, amount, frequency, and date already exists!', 'error');
          setSaving(false);
          return;
        }
        
        // Check for similar items (same name and amount but different date/frequency)
        const similarItem = existingItems.find(item => 
          item.name.toLowerCase() === itemData.name.toLowerCase() && 
          parseFloat(item.amount) === parseFloat(itemData.amount) &&
          (item.nextOccurrence !== itemData.nextOccurrence || item.frequency !== itemData.frequency)
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
        
        updatedItems = [...existingItems, itemData];
      }
      
      await updateDoc(settingsDocRef, {
        ...currentData,
        recurringItems: updatedItems
      });
      
      setRecurringItems(updatedItems);
      setShowModal(false);
      showNotification(
        editingItem ? 'Recurring item updated!' : 'Recurring item added!', 
        'success'
      );
    } catch (error) {
      console.error('Error saving recurring item:', error);
      showNotification('Error saving item', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (item) => {
    if (!window.confirm(`Delete "${item.name}"?`)) return;

    try {
      setSaving(true);
      
      const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      const updatedItems = (currentData.recurringItems || []).filter(i => i.id !== item.id);
      
      await updateDoc(settingsDocRef, {
        ...currentData,
        recurringItems: updatedItems
      });
      
      setRecurringItems(updatedItems);
      showNotification('Recurring item deleted', 'success');
    } catch (error) {
      console.error('Error deleting recurring item:', error);
      showNotification('Error deleting item', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleBulkDelete = async () => {
    setShowBulkDeleteModal(false);
    
    try {
      setSaving(true);
      
      const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      // Store current items for undo
      const itemsToDelete = currentData.recurringItems || [];
      setDeletedItems(itemsToDelete);
      
      // Clear all items
      await updateDoc(settingsDocRef, {
        ...currentData,
        recurringItems: []
      });
      
      setRecurringItems([]);
      showNotification(
        `Deleted ${itemsToDelete.length} items. Click Undo to restore.`, 
        'success'
      );
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
      
      const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      await updateDoc(settingsDocRef, {
        ...currentData,
        recurringItems: deletedItems
      });
      
      setRecurringItems(deletedItems);
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
      
      const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      const updatedItems = (currentData.recurringItems || []).map(i => 
        i.id === item.id ? { ...i, status: newStatus, updatedAt: new Date().toISOString() } : i
      );
      
      await updateDoc(settingsDocRef, {
        ...currentData,
        recurringItems: updatedItems
      });
      
      setRecurringItems(updatedItems);
      showNotification(
        newStatus === 'paused' ? 'Item paused' : 'Item resumed', 
        'success'
      );
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
      
      const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      const existingItems = currentData.recurringItems || [];
      
      // Process conflicts - merge items where resolution is 'merge'
      const mergeUpdates = [];
      conflicts.forEach(conflict => {
        if (conflict.resolution === 'merge') {
          const existingIndex = existingItems.findIndex(item => item.id === conflict.existing.id);
          if (existingIndex !== -1) {
            // Update existing item with new data, keeping original creation date
            const mergedItem = {
              ...existingItems[existingIndex],
              ...conflict.incoming,
              id: conflict.existing.id, // Keep existing ID
              createdAt: existingItems[existingIndex].createdAt, // Keep original creation date
              updatedAt: new Date().toISOString(),
              dataSource: 'csv_import_merged',
              mergedFrom: conflict.incoming.id
            };
            mergeUpdates.push({ index: existingIndex, item: mergedItem });
          }
        }
      });
      
      // Apply merge updates
      let updatedItems = [...existingItems];
      mergeUpdates.forEach(update => {
        updatedItems[update.index] = update.item;
      });
      
      // Add new items (excluding those that were merged or skipped)
      const itemsToAdd = importedItems.filter(item => {
        const conflict = conflicts.find(c => c.incoming.id === item.id);
        return !conflict || (conflict.resolution !== 'merge' && conflict.resolution !== 'skip');
      });
      
      updatedItems = [...updatedItems, ...itemsToAdd];
      
      // Update Firebase with items and custom mapping
      const updateData = {
        ...currentData,
        recurringItems: updatedItems
      };
      
      // Save custom mapping if provided
      if (updatedCustomMapping && Object.keys(updatedCustomMapping).length > 0) {
        updateData.institutionMapping = updatedCustomMapping;
        setCustomMapping(updatedCustomMapping);
      }
      
      await updateDoc(settingsDocRef, updateData);
      
      setRecurringItems(updatedItems);
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
    const itemWithHistory = processedItems.find(i => i.id === item.id) || item;
    setSelectedItem(itemWithHistory);
    setShowHistoryModal(true);
  };

  const handleSettingsMigration = () => {
    setShowSettingsMigration(true);
  };

  const handleMigrationImport = async (migratedItems, conflicts) => {
    try {
      setSaving(true);
      
      const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      const existingItems = currentData.recurringItems || [];
      
      // Process conflicts - merge, replace, or skip items based on resolution
      const mergeUpdates = [];
      conflicts.forEach(conflict => {
        if (conflict.resolution === 'merge') {
          const existingIndex = existingItems.findIndex(item => item.id === conflict.existing.id);
          if (existingIndex !== -1) {
            // Update existing item with new data, keeping original creation date
            const mergedItem = {
              ...existingItems[existingIndex],
              ...conflict.incoming,
              id: conflict.existing.id, // Keep existing ID
              createdAt: existingItems[existingIndex].createdAt, // Keep original creation date
              updatedAt: new Date().toISOString()
            };
            mergeUpdates.push({ index: existingIndex, item: mergedItem });
          }
        } else if (conflict.resolution === 'replace') {
          const existingIndex = existingItems.findIndex(item => item.id === conflict.existing.id);
          if (existingIndex !== -1) {
            const replacementItem = {
              ...conflict.incoming,
              id: conflict.existing.id, // Keep existing ID for consistency
              createdAt: existingItems[existingIndex].createdAt, // Keep original creation date
              updatedAt: new Date().toISOString()
            };
            mergeUpdates.push({ index: existingIndex, item: replacementItem });
          }
        }
      });

      // Apply merge/replace updates
      let updatedItems = [...existingItems];
      mergeUpdates.forEach(({ index, item }) => {
        updatedItems[index] = item;
      });

      // Add new items (excluding those that were skipped or merged)
      const itemsToAdd = migratedItems.filter(item => {
        const conflict = conflicts.find(c => c.incoming.id === item.id);
        return !conflict || (conflict.resolution !== 'skip' && conflict.resolution !== 'merge' && conflict.resolution !== 'replace');
      });

      updatedItems = [...updatedItems, ...itemsToAdd];

      await updateDoc(settingsDocRef, {
        ...currentData,
        recurringItems: updatedItems
      });

      // Reload data to reflect changes
      await loadRecurringItems();
      await loadSettingsBillsAndAnalyzeMigration();
      
      showNotification(`Successfully imported ${migratedItems.length} bills from Settings!`, 'success');
      setShowSettingsMigration(false);
    } catch (error) {
      console.error('Error importing from settings:', error);
      showNotification('Error importing bills from Settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadgeClass = (status) => {
    const statusClasses = {
      'active': 'status-active',
      'paused': 'status-paused', 
      'ended': 'status-ended',
      'failed': 'status-failed'
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
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
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
            {TRANSACTION_CATEGORIES.map(category => (
              <option key={category} value={category}>{category}</option>
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
            <button 
              className="delete-all-button"
              onClick={() => setShowBulkDeleteModal(true)}
              disabled={saving}
              title="Delete all recurring items"
            >
              🗑️ Delete All
            </button>
          )}
          {migrationAnalysis?.hasUnmigratedBills && (
            <button 
              className="migration-button"
              onClick={handleSettingsMigration}
              disabled={saving}
              title={`Import ${migrationAnalysis.unmigratedCount} bills from Settings`}
            >
              📦 Import from Settings ({migrationAnalysis.unmigratedCount})
            </button>
          )}
          <button 
            className="import-button"
            onClick={() => setShowCSVImport(true)}
            disabled={saving}
          >
            📊 Import from CSV
          </button>
          <button 
            className="add-button"
            onClick={handleAddItem}
            disabled={saving}
          >
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
              <div key={item.id} className={`recurring-item ${getTypeClass(item.type)} ${item.urgencyInfo?.className || ''}`}>
                <div className="item-main-info">
                  <div className="item-icon">
                    {getCategoryIcon(item.category)}
                  </div>
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
                      <span className="item-frequency">{item.frequency}</span>
                    </div>
                  </div>
                </div>
                
                <div className="item-amount-section">
                  <div className={`item-amount ${item.type}`}>
                    {item.type === 'income' ? '+' : '-'}{formatCurrency(Math.abs(item.amount))}
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
                  <span className={getStatusBadgeClass(item.status)}>
                    {item.status}
                  </span>
                  <div className="item-account">
                    {accounts[item.linkedAccount]?.name || 'No Account'}
                  </div>
                  <div className="item-autopay">
                    {item.autoPay ? '🔄 Auto' : '👤 Manual'}
                  </div>
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
                    onClick={() => handleDeleteItem(item)}
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
              <button className="close-btn" onClick={() => setShowModal(false)}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Name *</label>
                  <input
                    type="text"
                    value={newItem.name}
                    onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                    placeholder="Netflix, Salary, Rent..."
                  />
                </div>
                <div className="form-group">
                  <label>Type *</label>
                  <select
                    value={newItem.type}
                    onChange={(e) => setNewItem({...newItem, type: e.target.value})}
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
                    onChange={(e) => setNewItem({...newItem, amount: e.target.value})}
                    placeholder="0.00"
                  />
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <select
                    value={newItem.category}
                    onChange={(e) => setNewItem({...newItem, category: e.target.value})}
                  >
                    <option value="">Select Category</option>
                    {TRANSACTION_CATEGORIES.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Frequency</label>
                  <select
                    value={newItem.frequency}
                    onChange={(e) => setNewItem({...newItem, frequency: e.target.value})}
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
                    onChange={(e) => setNewItem({...newItem, nextOccurrence: e.target.value})}
                  />
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Account</label>
                  <select
                    value={newItem.linkedAccount}
                    onChange={(e) => setNewItem({...newItem, linkedAccount: e.target.value})}
                  >
                    <option value="">Select Account</option>
                    {Object.entries(accounts).map(([key, account]) => (
                      <option key={key} value={key}>
                        {account.name} {account.mask ? `(****${account.mask})` : ''} - {account.type}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={newItem.autoPay}
                      onChange={(e) => setNewItem({...newItem, autoPay: e.target.checked})}
                    />
                    Auto-pay enabled
                  </label>
                </div>
              </div>
              
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={newItem.description}
                  onChange={(e) => setNewItem({...newItem, description: e.target.value})}
                  placeholder="Optional description..."
                  rows="3"
                />
              </div>
            </div>
            
            <div className="modal-footer">
              <button className="cancel-btn" onClick={() => setShowModal(false)}>
                Cancel
              </button>
              <button 
                className="save-btn" 
                onClick={handleSaveItem}
                disabled={saving}
              >
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
              <button className="close-btn" onClick={() => setShowHistoryModal(false)}>×</button>
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

      {/* Settings Migration Modal */}
      {showSettingsMigration && (
        <SettingsMigrationModal
          settingsBills={settingsBills}
          existingItems={recurringItems}
          onImport={handleMigrationImport}
          onCancel={() => setShowSettingsMigration(false)}
        />
      )}

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowBulkDeleteModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>⚠️ Delete All Recurring Items?</h3>
              <button className="close-btn" onClick={() => setShowBulkDeleteModal(false)}>×</button>
            </div>
            
            <div className="modal-body">
              <p style={{ marginBottom: '20px', fontSize: '16px' }}>
                Are you sure you want to delete <strong>all {recurringItems.length} recurring items</strong>?
              </p>
              <p style={{ marginBottom: '20px', color: '#ff9800' }}>
                ⚠️ This will permanently delete all your recurring incomes, expenses, and subscriptions.
              </p>
              <p style={{ marginBottom: '20px', color: '#00ff88' }}>
                ✓ Don't worry! You can undo this action using the "Undo Delete" button that will appear after deletion.
              </p>
              
              <div className="modal-actions" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
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