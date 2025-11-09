/**
 * billCleanupMigration.js
 * 
 * Cleanup utility to remove duplicate bill instances and keep only the next upcoming unpaid bill per group.
 * This fixes the issue where the system created NEW bill instances every month instead of updating existing ones.
 */

/**
 * Group bills by their identifying characteristics
 * @param {Array} bills - Array of bill objects
 * @returns {Map} Map of bill groups keyed by name|amount|frequency
 */
export function groupBillsByIdentity(bills) {
  const groups = new Map();
  
  bills.forEach(bill => {
    const key = generateBillGroupKey(bill);
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    
    groups.get(key).push(bill);
  });
  
  return groups;
}

/**
 * Generate a unique key for grouping bills
 * @param {Object} bill - Bill object
 * @returns {string} Unique key
 */
function generateBillGroupKey(bill) {
  const name = (bill.name || '').toLowerCase().trim();
  const amount = parseFloat(bill.amount || 0).toFixed(2);
  const frequency = (bill.recurrence || 'one-time').toLowerCase().trim();
  
  return `${name}|${amount}|${frequency}`;
}

/**
 * Select the best bill to keep from a group
 * Priority:
 * 1. Next upcoming unpaid bill (closest future due date)
 * 2. If no unpaid future bills, keep the most recent unpaid bill
 * 3. If all paid, keep the one with the latest due date
 * 
 * @param {Array} billsInGroup - Bills in the same group
 * @returns {Object} { keepBill, removeBills }
 */
export function selectBillToKeep(billsInGroup) {
  if (billsInGroup.length === 0) {
    return { keepBill: null, removeBills: [] };
  }
  
  if (billsInGroup.length === 1) {
    return { keepBill: billsInGroup[0], removeBills: [] };
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Separate unpaid and paid bills
  const unpaidBills = billsInGroup.filter(bill => !bill.isPaid && bill.status !== 'paid');
  const paidBills = billsInGroup.filter(bill => bill.isPaid || bill.status === 'paid');
  
  let keepBill = null;
  
  if (unpaidBills.length > 0) {
    // Find the next upcoming unpaid bill (future due date closest to today)
    const futureBills = unpaidBills
      .filter(bill => {
        const dueDate = new Date(bill.dueDate || bill.nextDueDate);
        return dueDate >= today;
      })
      .sort((a, b) => {
        const dateA = new Date(a.dueDate || a.nextDueDate);
        const dateB = new Date(b.dueDate || b.nextDueDate);
        return dateA - dateB;
      });
    
    if (futureBills.length > 0) {
      keepBill = futureBills[0];
    } else {
      // If no future unpaid bills, keep the most recent unpaid bill
      keepBill = unpaidBills.sort((a, b) => {
        const dateA = new Date(a.dueDate || a.nextDueDate);
        const dateB = new Date(b.dueDate || b.nextDueDate);
        return dateB - dateA;
      })[0];
    }
  } else if (paidBills.length > 0) {
    // All bills are paid, keep the one with the latest due date
    keepBill = paidBills.sort((a, b) => {
      const dateA = new Date(a.dueDate || a.nextDueDate);
      const dateB = new Date(b.dueDate || b.nextDueDate);
      return dateB - dateA;
    })[0];
  }
  
  const removeBills = billsInGroup.filter(bill => bill.id !== keepBill.id);
  
  return { keepBill, removeBills };
}

/**
 * Analyze bills and generate cleanup report
 * @param {Array} bills - Array of bill objects
 * @returns {Object} Report with statistics and bills to keep/remove
 */
export function analyzeForCleanup(bills) {
  const groups = groupBillsByIdentity(bills);
  const report = {
    totalBills: bills.length,
    uniqueGroups: groups.size,
    duplicatesFound: 0,
    billsToKeep: [],
    billsToRemove: [],
    groupDetails: []
  };
  
  groups.forEach((billsInGroup, key) => {
    const [name, amount, frequency] = key.split('|');
    const { keepBill, removeBills } = selectBillToKeep(billsInGroup);
    
    if (keepBill) {
      report.billsToKeep.push(keepBill);
    }
    
    report.billsToRemove.push(...removeBills);
    report.duplicatesFound += removeBills.length;
    
    if (billsInGroup.length > 1) {
      report.groupDetails.push({
        name,
        amount: parseFloat(amount),
        frequency,
        totalCount: billsInGroup.length,
        duplicateCount: removeBills.length,
        keepBillId: keepBill?.id,
        keepBillDueDate: keepBill?.dueDate || keepBill?.nextDueDate,
        removeBillIds: removeBills.map(b => b.id)
      });
    }
  });
  
  return report;
}

/**
 * Execute cleanup by deleting duplicate bills
 * NOTE: This function is Firebase-dependent and should be called from Bills.jsx
 * @param {Function} deleteDocFn - Firebase deleteDoc function
 * @param {Function} docFn - Firebase doc function
 * @param {Object} db - Firebase database instance
 * @param {string} userId - User ID
 * @param {Array} billsToRemove - Bills to delete
 * @returns {Promise<Object>} Result with success count and errors
 */
export async function executeCleanup(deleteDocFn, docFn, db, userId, billsToRemove) {
  const results = {
    successCount: 0,
    errors: []
  };
  
  for (const bill of billsToRemove) {
    try {
      await deleteDocFn(docFn(db, 'users', userId, 'billInstances', bill.id));
      results.successCount++;
      console.log(`✅ Deleted duplicate bill: ${bill.name} (${bill.id})`);
    } catch (error) {
      console.error(`❌ Error deleting bill ${bill.id}:`, error);
      results.errors.push({
        billId: bill.id,
        billName: bill.name,
        error: error.message
      });
    }
  }
  
  return results;
}

/**
 * Main cleanup function - analyze and clean up duplicate bills
 * NOTE: This function is Firebase-dependent and should be called from Bills.jsx
 * @param {Function} getDocsFn - Firebase getDocs function
 * @param {Function} collectionFn - Firebase collection function
 * @param {Function} deleteDocFn - Firebase deleteDoc function
 * @param {Function} docFn - Firebase doc function
 * @param {Object} db - Firebase database instance
 * @param {string} userId - User ID
 * @param {boolean} dryRun - If true, only analyze without deleting
 * @returns {Promise<Object>} Cleanup report
 */
export async function cleanupDuplicateBills(getDocsFn, collectionFn, deleteDocFn, docFn, db, userId, dryRun = false) {
  try {
    // Load all bills
    const billsSnapshot = await getDocsFn(
      collectionFn(db, 'users', userId, 'billInstances')
    );
    
    const bills = billsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Analyze for cleanup
    const report = analyzeForCleanup(bills);
    
    if (dryRun) {
      console.log('🔍 Dry run - no bills deleted');
      return { ...report, dryRun: true };
    }
    
    // Execute cleanup
    const cleanupResults = await executeCleanup(deleteDocFn, docFn, db, userId, report.billsToRemove);
    
    return {
      ...report,
      dryRun: false,
      deletedCount: cleanupResults.successCount,
      errors: cleanupResults.errors
    };
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  }
}
