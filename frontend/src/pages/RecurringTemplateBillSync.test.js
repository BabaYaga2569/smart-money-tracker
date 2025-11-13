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
          if (clause.field === 'isPaid' && bill.isPaid !== clause.value) {
            matches = false;
          }
          if (clause.field === 'dueDate' && bill.dueDate !== clause.value) {
            matches = false;
          }
        }

        if (matches) {
          results.push({
            id,
            data: () => bill,
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
      const billsQuery = mockDb.query(
        'billInstances',
        mockDb.where('recurringTemplateId', '==', itemData.id),
        mockDb.where('isPaid', '==', false)
      );
      const billsSnapshot = await mockDb.getDocs(billsQuery);

      if (billsSnapshot.size > 0) {
        const updatePromises = [];
        for (const billDoc of billsSnapshot.docs) {
          const billData = billDoc.data();

          const newDueDate = itemData.nextOccurrence;
          const newAmount = parseFloat(itemData.amount);
          const newCategory = itemData.category || billData.category;

          const dateChanged = billData.dueDate !== newDueDate;
          const amountChanged = billData.amount !== newAmount;
          const categoryChanged = billData.category !== newCategory;

          if (dateChanged || amountChanged || categoryChanged) {
            updatePromises.push(
              mockDb.updateDoc(
                { id: billDoc.id },
                {
                  dueDate: newDueDate,
                  originalDueDate: newDueDate,
                  amount: newAmount,
                  category: newCategory,
                }
              )
            );
          }
        }

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
