// RecurringTemplateBillSync.test.js - Test that template changes sync to bill instances
// This test validates the fix for: "Recurring template date changes don't update existing bill instances"

/**
 * Mock Firestore functions for testing
 */
const createMockFirestore = () => {
  const billInstances = new Map();
  const templates = new Map();

  return {
    billInstances,
    templates,

    // Mock getDocs - returns documents matching query
    getDocs: async (queryObj) => {
      const results = [];
      for (const [id, bill] of billInstances.entries()) {
        let matches = true;

        // Check where clauses
        for (const clause of queryObj.whereClauses || []) {
          if (clause.field === 'recurringTemplateId' && bill.recurringTemplateId !== clause.value) {
            matches = false;
          }
          if (clause.field === 'recurringPatternId' && bill.recurringPatternId !== clause.value) {
            matches = false;
          }
          if (clause.field === 'sourcePatternId' && bill.sourcePatternId !== clause.value) {
            matches = false;
          }
          if (clause.field === 'templateId' && bill.templateId !== clause.value) {
            matches = false;
          }
          if (clause.field === 'name' && bill.name !== clause.value) {
            matches = false;
          }
          if (clause.field === 'isPaid' && bill.isPaid !== clause.value) {
            matches = false;
          }
          if (clause.field === 'dueDate' && bill.dueDate !== clause.value) {
            matches = false;
          }
          if (clause.field === 'type' && bill.type !== clause.value) {
            matches = false;
          }
        }

        if (matches) {
          results.push({
            id,
            data: () => bill,
            ref: { id },
          });
        }
      }

      return {
        empty: results.length === 0,
        size: results.length,
        docs: results,
      };
    },

    // Mock updateDoc - updates a document
    updateDoc: async (docRef, data) => {
      const id = docRef.id;
      if (billInstances.has(id)) {
        billInstances.set(id, { ...billInstances.get(id), ...data });
      }
    },

    // Mock setDoc - creates/overwrites a document
    setDoc: async (docRef, data) => {
      billInstances.set(docRef.id, data);
    },

    // Mock query - returns query object
    query: (collection, ...whereClauses) => {
      return {
        collection,
        whereClauses: whereClauses.map((clause) => clause),
      };
    },

    // Mock where - returns where clause
    where: (field, op, value) => {
      return { field, op, value };
    },
  };
};

/**
 * Simulate the handleSaveItem function logic for editing templates
 */
const simulateTemplateUpdate = async (mockDb, templateId, newData, editingItem) => {
  const itemData = {
    id: templateId,
    ...newData,
  };

  let billSyncStats = null;

  if (itemData.type === 'expense' && itemData.status === 'active') {
    try {
      // When adding a new template, create a bill instance (with duplicate prevention)
      if (!editingItem) {
        const existingBillQuery = mockDb.query(
          'billInstances',
          mockDb.where('recurringTemplateId', '==', itemData.id),
          mockDb.where('dueDate', '==', itemData.nextOccurrence)
        );
        const existingBills = await mockDb.getDocs(existingBillQuery);

        if (existingBills.empty) {
          const billId = `bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const billInstance = {
            id: billId,
            name: itemData.name,
            amount: parseFloat(itemData.amount),
            dueDate: itemData.nextOccurrence,
            originalDueDate: itemData.nextOccurrence,
            isPaid: false,
            status: 'pending',
            category: itemData.category || 'Other',
            recurringTemplateId: itemData.id,
          };

          await mockDb.setDoc({ id: billId }, billInstance);
          billSyncStats = { added: 1 };
        } else {
          billSyncStats = { skipped: 1 };
        }
      }
    } catch (error) {
      console.error('❌ Error creating bill:', error);
    }
  }

  // When editing a recurring template, also update existing unpaid bill instances
  if (editingItem && itemData.type === 'expense' && itemData.status === 'active') {
    try {
      // Query for related unpaid bills using all possible linking fields
      const queries = [
        mockDb.query(
          'billInstances',
          mockDb.where('type', '==', 'bill'),
          mockDb.where('recurringPatternId', '==', itemData.id),
          mockDb.where('isPaid', '==', false)
        ),
        mockDb.query(
          'billInstances',
          mockDb.where('type', '==', 'bill'),
          mockDb.where('sourcePatternId', '==', itemData.id),
          mockDb.where('isPaid', '==', false)
        ),
        mockDb.query(
          'billInstances',
          mockDb.where('type', '==', 'bill'),
          mockDb.where('templateId', '==', itemData.id),
          mockDb.where('isPaid', '==', false)
        ),
        mockDb.query(
          'billInstances',
          mockDb.where('type', '==', 'bill'),
          mockDb.where('recurringTemplateId', '==', itemData.id),
          mockDb.where('isPaid', '==', false)
        ),
      ];
      
      // Also try matching by name for legacy bills
      const nameQuery = mockDb.query(
        'billInstances',
        mockDb.where('type', '==', 'bill'),
        mockDb.where('name', '==', itemData.name),
        mockDb.where('isPaid', '==', false)
      );
      queries.push(nameQuery);
      
      // Collect unique bills to update
      const billsToUpdate = new Map();
      
      for (const q of queries) {
        const snapshot = await mockDb.getDocs(q);
        snapshot.docs.forEach(doc => {
          if (!billsToUpdate.has(doc.id)) {
            billsToUpdate.set(doc.id, { ref: doc.ref, data: doc.data() });
          }
        });
      }

      if (billsToUpdate.size > 0) {
        const updatePromises = [];
        billsToUpdate.forEach(({ ref, data }) => {
          const newDueDate = itemData.nextOccurrence;
          const newAmount = parseFloat(itemData.amount);
          const newCategory = itemData.category || data.category;

          const updates = {};
          let hasChanges = false;

          if (data.dueDate !== newDueDate) {
            updates.dueDate = newDueDate;
            updates.originalDueDate = newDueDate;
            hasChanges = true;
          }

          if (data.amount !== newAmount) {
            updates.amount = newAmount;
            updates.cost = newAmount;
            hasChanges = true;
          }

          if (data.category !== newCategory) {
            updates.category = newCategory;
            hasChanges = true;
          }

          if (itemData.name && data.name !== itemData.name) {
            updates.name = itemData.name;
            hasChanges = true;
          }

          if (itemData.autoPay !== undefined && data.autoPayEnabled !== itemData.autoPay) {
            updates.autoPayEnabled = itemData.autoPay;
            hasChanges = true;
          }

          if (hasChanges) {
            updatePromises.push(mockDb.updateDoc(ref, updates));
          }
        });

        await Promise.all(updatePromises);

        if (updatePromises.length > 0) {
          if (!billSyncStats) billSyncStats = {};
          billSyncStats.updated = updatePromises.length;
        }
      }
    } catch (error) {
      console.error('❌ Error updating bills:', error);
    }
  }

  return billSyncStats;
};

/**
 * Run all tests
 */
const runTests = () => {
  console.log('🧪 Testing Recurring Template -> Bill Instance Sync\n');

  let passedTests = 0;
  let failedTests = 0;

  const assert = (condition, message) => {
    if (!condition) {
      console.error(`❌ FAILED: ${message}`);
      failedTests++;
      throw new Error(message);
    }
    passedTests++;
  };

  const test = async (name, fn) => {
    try {
      console.log(`\n🧪 ${name}`);
      await fn();
      console.log(`✅ PASSED: ${name}`);
    } catch (error) {
      console.error(`❌ FAILED: ${name}`);
      console.error(error.message);
    }
  };

  // Test 1: Adding a new template creates a bill instance
  test('Adding new template creates bill instance with duplicate prevention', async () => {
    const mockDb = createMockFirestore();

    const stats = await simulateTemplateUpdate(
      mockDb,
      'template-1',
      {
        name: 'Netflix',
        amount: 15.99,
        nextOccurrence: '2025-11-14',
        type: 'expense',
        status: 'active',
        category: 'Subscriptions',
      },
      false // not editing
    );

    assert(stats && stats.added === 1, 'Should create 1 bill instance');
    assert(mockDb.billInstances.size === 1, 'Should have 1 bill in database');

    const bill = Array.from(mockDb.billInstances.values())[0];
    assert(bill.dueDate === '2025-11-14', 'Bill should have correct due date');
    assert(bill.amount === 15.99, 'Bill should have correct amount');

    // Try adding the same template again - should skip duplicate
    const stats2 = await simulateTemplateUpdate(
      mockDb,
      'template-1',
      {
        name: 'Netflix',
        amount: 15.99,
        nextOccurrence: '2025-11-14',
        type: 'expense',
        status: 'active',
        category: 'Subscriptions',
      },
      false // not editing
    );

    assert(stats2 && stats2.skipped === 1, 'Should skip duplicate bill');
    assert(mockDb.billInstances.size === 1, 'Should still have only 1 bill');
  });

  // Test 2: Editing template date updates unpaid bill instances
  test('Editing template date updates unpaid bill instances', async () => {
    const mockDb = createMockFirestore();

    // Create initial bill instance
    mockDb.billInstances.set('bill-1', {
      id: 'bill-1',
      name: 'Netflix',
      amount: 15.99,
      dueDate: '2025-11-13',
      originalDueDate: '2025-11-13',
      isPaid: false,
      status: 'pending',
      category: 'Subscriptions',
      recurringTemplateId: 'template-1',
      type: 'bill', // Add type field
    });

    // Edit template to change date from 11/13 to 11/14
    const stats = await simulateTemplateUpdate(
      mockDb,
      'template-1',
      {
        name: 'Netflix',
        amount: 15.99,
        nextOccurrence: '2025-11-14', // Changed date
        type: 'expense',
        status: 'active',
        category: 'Subscriptions',
      },
      true // editing
    );

    assert(stats && stats.updated === 1, 'Should update 1 bill instance');

    const bill = mockDb.billInstances.get('bill-1');
    assert(bill.dueDate === '2025-11-14', 'Bill due date should be updated to 2025-11-14');
    assert(bill.originalDueDate === '2025-11-14', 'Bill original due date should be updated');
  });

  // Test 3: Editing template amount updates unpaid bills
  test('Editing template amount updates unpaid bill instances', async () => {
    const mockDb = createMockFirestore();

    mockDb.billInstances.set('bill-1', {
      id: 'bill-1',
      name: 'Netflix',
      amount: 15.99,
      dueDate: '2025-11-14',
      originalDueDate: '2025-11-14',
      isPaid: false,
      status: 'pending',
      category: 'Subscriptions',
      recurringTemplateId: 'template-1',
      type: 'bill', // Add type field
    });

    // Edit template to change amount
    const stats = await simulateTemplateUpdate(
      mockDb,
      'template-1',
      {
        name: 'Netflix',
        amount: 17.99, // Price increase
        nextOccurrence: '2025-11-14',
        type: 'expense',
        status: 'active',
        category: 'Subscriptions',
      },
      true // editing
    );

    assert(stats && stats.updated === 1, 'Should update 1 bill instance');

    const bill = mockDb.billInstances.get('bill-1');
    assert(bill.amount === 17.99, 'Bill amount should be updated to 17.99');
  });

  // Test 4: Editing template doesn't affect paid bills
  test('Editing template preserves paid bill instances', async () => {
    const mockDb = createMockFirestore();

    // Create one paid bill and one unpaid bill
    mockDb.billInstances.set('bill-paid', {
      id: 'bill-paid',
      name: 'Netflix',
      amount: 15.99,
      dueDate: '2025-11-13',
      originalDueDate: '2025-11-13',
      isPaid: true, // This bill is paid
      status: 'paid',
      category: 'Subscriptions',
      recurringTemplateId: 'template-1',
      type: 'bill', // Add type field
    });

    mockDb.billInstances.set('bill-unpaid', {
      id: 'bill-unpaid',
      name: 'Netflix',
      amount: 15.99,
      dueDate: '2025-11-13',
      originalDueDate: '2025-11-13',
      isPaid: false, // This bill is unpaid
      status: 'pending',
      category: 'Subscriptions',
      recurringTemplateId: 'template-1',
      type: 'bill', // Add type field
    });

    // Edit template
    const stats = await simulateTemplateUpdate(
      mockDb,
      'template-1',
      {
        name: 'Netflix',
        amount: 17.99,
        nextOccurrence: '2025-11-14',
        type: 'expense',
        status: 'active',
        category: 'Subscriptions',
      },
      true // editing
    );

    assert(stats && stats.updated === 1, 'Should update only 1 unpaid bill');

    const paidBill = mockDb.billInstances.get('bill-paid');
    const unpaidBill = mockDb.billInstances.get('bill-unpaid');

    // Paid bill should remain unchanged
    assert(paidBill.dueDate === '2025-11-13', 'Paid bill date should NOT change');
    assert(paidBill.amount === 15.99, 'Paid bill amount should NOT change');

    // Unpaid bill should be updated
    assert(unpaidBill.dueDate === '2025-11-14', 'Unpaid bill date should be updated');
    assert(unpaidBill.amount === 17.99, 'Unpaid bill amount should be updated');
  });

  // Test 5: Editing template category updates unpaid bills
  test('Editing template category updates unpaid bill instances', async () => {
    const mockDb = createMockFirestore();

    mockDb.billInstances.set('bill-1', {
      id: 'bill-1',
      name: 'Netflix',
      amount: 15.99,
      dueDate: '2025-11-14',
      originalDueDate: '2025-11-14',
      isPaid: false,
      status: 'pending',
      category: 'Subscriptions',
      recurringTemplateId: 'template-1',
      type: 'bill', // Add type field
    });

    // Edit template to change category
    const stats = await simulateTemplateUpdate(
      mockDb,
      'template-1',
      {
        name: 'Netflix',
        amount: 15.99,
        nextOccurrence: '2025-11-14',
        type: 'expense',
        status: 'active',
        category: 'Entertainment', // Changed category
      },
      true // editing
    );

    assert(stats && stats.updated === 1, 'Should update 1 bill instance');

    const bill = mockDb.billInstances.get('bill-1');
    assert(bill.category === 'Entertainment', 'Bill category should be updated');
  });

  // Test 6: Multiple unpaid bills from same template all get updated
  test('Multiple unpaid bills from same template all get updated', async () => {
    const mockDb = createMockFirestore();

    // Create multiple unpaid bills from the same template
    mockDb.billInstances.set('bill-1', {
      id: 'bill-1',
      name: 'Netflix',
      amount: 15.99,
      dueDate: '2025-11-14',
      originalDueDate: '2025-11-14',
      isPaid: false,
      recurringTemplateId: 'template-1',
      category: 'Subscriptions',
      type: 'bill',
    });

    mockDb.billInstances.set('bill-2', {
      id: 'bill-2',
      name: 'Netflix',
      amount: 15.99,
      dueDate: '2025-12-14',
      originalDueDate: '2025-12-14',
      isPaid: false,
      recurringTemplateId: 'template-1',
      category: 'Subscriptions',
      type: 'bill',
    });

    mockDb.billInstances.set('bill-3', {
      id: 'bill-3',
      name: 'Netflix',
      amount: 15.99,
      dueDate: '2026-01-14',
      originalDueDate: '2026-01-14',
      isPaid: false,
      recurringTemplateId: 'template-1',
      category: 'Subscriptions',
      type: 'bill',
    });

    // Edit template to change amount
    const stats = await simulateTemplateUpdate(
      mockDb,
      'template-1',
      {
        name: 'Netflix',
        amount: 19.99, // Price increase
        nextOccurrence: '2025-11-14',
        type: 'expense',
        status: 'active',
        category: 'Subscriptions',
      },
      true // editing
    );

    assert(stats && stats.updated === 3, 'Should update all 3 unpaid bills');

    // Verify all bills were updated
    for (let i = 1; i <= 3; i++) {
      const bill = mockDb.billInstances.get(`bill-${i}`);
      assert(bill.amount === 19.99, `Bill ${i} amount should be updated to 19.99`);
    }
  });

  // Test 7: Editing template name updates unpaid bill instances
  test('Editing template name updates unpaid bill instances', async () => {
    const mockDb = createMockFirestore();

    mockDb.billInstances.set('bill-1', {
      id: 'bill-1',
      name: 'Netflix',
      amount: 15.99,
      dueDate: '2025-11-14',
      originalDueDate: '2025-11-14',
      isPaid: false,
      status: 'pending',
      category: 'Subscriptions',
      recurringTemplateId: 'template-1',
      type: 'bill',
    });

    // Edit template to change name
    const stats = await simulateTemplateUpdate(
      mockDb,
      'template-1',
      {
        name: 'Netflix Premium', // Changed name
        amount: 15.99,
        nextOccurrence: '2025-11-14',
        type: 'expense',
        status: 'active',
        category: 'Subscriptions',
      },
      true // editing
    );

    assert(stats && stats.updated === 1, 'Should update 1 bill instance');

    const bill = mockDb.billInstances.get('bill-1');
    assert(bill.name === 'Netflix Premium', 'Bill name should be updated to Netflix Premium');
  });

  // Test 8: Editing template autoPay updates unpaid bill instances
  test('Editing template autoPay updates unpaid bill instances', async () => {
    const mockDb = createMockFirestore();

    mockDb.billInstances.set('bill-1', {
      id: 'bill-1',
      name: 'Netflix',
      amount: 15.99,
      dueDate: '2025-11-14',
      originalDueDate: '2025-11-14',
      isPaid: false,
      status: 'pending',
      category: 'Subscriptions',
      recurringTemplateId: 'template-1',
      autoPayEnabled: false,
      type: 'bill',
    });

    // Edit template to enable autoPay
    const stats = await simulateTemplateUpdate(
      mockDb,
      'template-1',
      {
        name: 'Netflix',
        amount: 15.99,
        nextOccurrence: '2025-11-14',
        type: 'expense',
        status: 'active',
        category: 'Subscriptions',
        autoPay: true, // Enable autoPay
      },
      true // editing
    );

    assert(stats && stats.updated === 1, 'Should update 1 bill instance');

    const bill = mockDb.billInstances.get('bill-1');
    assert(bill.autoPayEnabled === true, 'Bill autoPayEnabled should be updated to true');
  });

  // Test 9: Query by different linking field names (recurringPatternId, sourcePatternId, etc.)
  test('Query finds bills by different linking field names', async () => {
    const mockDb = createMockFirestore();

    // Create bills with different linking field names
    mockDb.billInstances.set('bill-1', {
      id: 'bill-1',
      name: 'T-Mobile',
      amount: 336.33,
      dueDate: '2025-12-20',
      originalDueDate: '2025-12-20',
      isPaid: false,
      recurringPatternId: 'template-1', // Different field name
      category: 'Bills & Utilities',
      type: 'bill',
    });

    mockDb.billInstances.set('bill-2', {
      id: 'bill-2',
      name: 'T-Mobile',
      amount: 336.33,
      dueDate: '2025-12-20',
      originalDueDate: '2025-12-20',
      isPaid: false,
      sourcePatternId: 'template-1', // Different field name
      category: 'Bills & Utilities',
      type: 'bill',
    });

    mockDb.billInstances.set('bill-3', {
      id: 'bill-3',
      name: 'T-Mobile',
      amount: 336.33,
      dueDate: '2025-12-20',
      originalDueDate: '2025-12-20',
      isPaid: false,
      templateId: 'template-1', // Different field name
      category: 'Bills & Utilities',
      type: 'bill',
    });

    // Edit template
    const stats = await simulateTemplateUpdate(
      mockDb,
      'template-1',
      {
        name: 'T-Mobile Cell Phone Bill',
        amount: 485.26, // Changed amount
        nextOccurrence: '2025-12-21', // Changed date
        type: 'expense',
        status: 'active',
        category: 'Bills & Utilities',
      },
      true // editing
    );

    assert(stats && stats.updated === 3, 'Should find and update all 3 bills with different linking fields');

    // Verify all bills were updated
    const bill1 = mockDb.billInstances.get('bill-1');
    const bill2 = mockDb.billInstances.get('bill-2');
    const bill3 = mockDb.billInstances.get('bill-3');
    
    assert(bill1.amount === 485.26, 'Bill 1 amount should be updated');
    assert(bill1.dueDate === '2025-12-21', 'Bill 1 date should be updated');
    assert(bill2.amount === 485.26, 'Bill 2 amount should be updated');
    assert(bill2.dueDate === '2025-12-21', 'Bill 2 date should be updated');
    assert(bill3.amount === 485.26, 'Bill 3 amount should be updated');
    assert(bill3.dueDate === '2025-12-21', 'Bill 3 date should be updated');
  });

  console.log(`\n${'='.repeat(50)}`);
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`${'='.repeat(50)}\n`);
};

// Run tests if executed directly
if (typeof process !== 'undefined') {
  runTests();
}

export { runTests, simulateTemplateUpdate, createMockFirestore };
