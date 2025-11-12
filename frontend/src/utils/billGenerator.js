/**
 * Bill Generator Utility
 * 
 * Generates bill instances from recurring templates stored in Firestore.
 * This utility reads recurring templates from users/{uid}/settings/personal
 * and creates bill instances in the billInstances collection.
 */

import { 
  doc, 
  getDoc, 
  collection, 
  getDocs, 
  setDoc, 
  deleteDoc,
  serverTimestamp,
  query,
  where
} from 'firebase/firestore';
import { RecurringManager } from './RecurringManager';

// Generation lock to prevent concurrent bill generation
let isGeneratingBills = false;

/**
 * Generate a unique bill ID
 * @returns {string} Unique bill ID
 */
export const generateBillId = () => {
  return `bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Read all recurring templates from Firestore
 * @param {string} uid - User ID
 * @param {object} db - Firestore database instance
 * @returns {Promise<Array>} Array of recurring templates
 */
export const readRecurringTemplates = async (uid, db) => {
  try {
    const settingsDocRef = doc(db, 'users', uid, 'settings', 'personal');
    const settingsDoc = await getDoc(settingsDocRef);
    
    if (!settingsDoc.exists()) {
      console.log('No settings document found');
      return [];
    }
    
    const data = settingsDoc.data();
    const recurringItems = data.recurringItems || [];
    
    // Filter for active expense items (bills)
    const activeTemplates = recurringItems.filter(
      item => item.status === 'active' && item.type === 'expense'
    );
    
    console.log(`Found ${activeTemplates.length} active recurring bill templates`);
    return activeTemplates;
  } catch (error) {
    console.error('Error reading recurring templates:', error);
    throw error;
  }
};

/**
 * Clear all existing bill instances
 * @param {string} uid - User ID
 * @param {object} db - Firestore database instance
 * @returns {Promise<number>} Number of bills deleted
 */
export const clearBillInstances = async (uid, db) => {
  try {
    const billsRef = collection(db, 'users', uid, 'billInstances');
    const billsSnapshot = await getDocs(billsRef);
    
    const deletePromises = [];
    billsSnapshot.docs.forEach(billDoc => {
      deletePromises.push(deleteDoc(doc(db, 'users', uid, 'billInstances', billDoc.id)));
    });
    
    await Promise.all(deletePromises);
    console.log(`Cleared ${billsSnapshot.size} existing bill instances`);
    return billsSnapshot.size;
  } catch (error) {
    console.error('Error clearing bill instances:', error);
    throw error;
  }
};

/**
 * Update October dates to November 2025
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {string} Updated date string
 */
export const updateDateToNovember = (dateStr) => {
  const date = new Date(dateStr);
  const currentDate = new Date();
  
  // If date is in October 2025 or earlier, move to current month
  if (date < currentDate) {
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    const dayOfMonth = date.getDate();
    
    // Create date in current month
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const adjustedDay = Math.min(dayOfMonth, lastDayOfMonth);
    
    const updatedDate = new Date(currentYear, currentMonth, adjustedDay);
    return updatedDate.toISOString().split('T')[0];
  }
  
  return dateStr;
};

/**
 * Generate a single bill instance from a recurring template
 * @param {object} template - Recurring template object
 * @param {string} dueDate - Due date for this instance (YYYY-MM-DD)
 * @returns {object} Bill instance object
 */
export const generateBillInstance = (template, dueDate) => {
  const billId = generateBillId();
  
  return {
    id: billId,
    name: template.name,
    amount: parseFloat(template.amount),
    dueDate: dueDate,
    nextDueDate: dueDate,
    originalDueDate: dueDate,
    isPaid: false,
    status: 'pending',
    category: template.category || 'Bills & Utilities',
    recurrence: template.frequency?.toLowerCase() || 'monthly',
    type: 'expense',
    isSubscription: false,
    paymentHistory: [],
    linkedTransactionIds: [],
    description: template.description || '',
    accountId: template.linkedAccount || null,
    autoPayEnabled: template.autoPay || false,
    merchantNames: [
      template.name.toLowerCase(),
      template.name.toLowerCase().replace(/[^a-z0-9]/g, '')
    ],
    recurringTemplateId: template.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdFrom: 'bill-generator'
  };
};

/**
 * Check if a bill already exists for a template and due date
 * @param {string} uid - User ID
 * @param {object} db - Firestore database instance
 * @param {string} templateId - Recurring template ID
 * @param {string} dueDate - Due date in YYYY-MM-DD format
 * @returns {Promise<boolean>} True if bill exists, false otherwise
 */
export const checkBillExists = async (uid, db, templateId, dueDate) => {
  try {
    const billsQuery = query(
      collection(db, 'users', uid, 'billInstances'),
      where('recurringTemplateId', '==', templateId),
      where('dueDate', '==', dueDate)
    );
    
    const existingBills = await getDocs(billsQuery);
    return !existingBills.empty;
  } catch (error) {
    console.error('Error checking bill existence:', error);
    return false;
  }
};

/**
 * Count unpaid bills for a template (for max limit check)
 * @param {string} uid - User ID
 * @param {object} db - Firestore database instance
 * @param {string} templateId - Recurring template ID
 * @returns {Promise<number>} Count of unpaid bills
 */
export const countUnpaidBills = async (uid, db, templateId) => {
  try {
    const billsQuery = query(
      collection(db, 'users', uid, 'billInstances'),
      where('recurringTemplateId', '==', templateId),
      where('isPaid', '==', false)
    );
    
    const unpaidBills = await getDocs(billsQuery);
    return unpaidBills.size;
  } catch (error) {
    console.error('Error counting unpaid bills:', error);
    return 0;
  }
};

/**
 * Generate bill instances from all recurring templates
 * @param {string} uid - User ID
 * @param {object} db - Firestore database instance
 * @param {boolean} clearExisting - Whether to clear existing bills first
 * @returns {Promise<object>} Result object with statistics
 */
export const generateAllBills = async (uid, db, clearExisting = false) => {
  // Check generation lock to prevent concurrent runs
  if (isGeneratingBills) {
    console.log('⚠️ Bill generation already in progress, skipping');
    return {
      success: false,
      message: 'Bill generation already in progress',
      templatesProcessed: 0,
      billsGenerated: 0,
      billsCleared: 0,
      skipped: 0,
      duplicatesPrevented: 0
    };
  }
  
  isGeneratingBills = true;
  
  try {
    console.log('Starting bill generation...');
    
    // Step 1: Read recurring templates
    const templates = await readRecurringTemplates(uid, db);
    
    if (templates.length === 0) {
      return {
        success: true,
        message: 'No active recurring templates found',
        templatesProcessed: 0,
        billsGenerated: 0,
        billsCleared: 0,
        skipped: 0,
        duplicatesPrevented: 0
      };
    }
    
    // Step 2: Clear existing bills if requested
    let billsCleared = 0;
    if (clearExisting) {
      billsCleared = await clearBillInstances(uid, db);
    }
    
    // Step 3: Generate bill instances with duplicate checking
    const billPromises = [];
    let billsGenerated = 0;
    let skipped = 0;
    let duplicatesPrevented = 0;
    
    for (const template of templates) {
      // Get the next occurrence date, updated to current month if overdue
      let dueDate = template.nextOccurrence || new Date().toISOString().split('T')[0];
      dueDate = updateDateToNovember(dueDate);
      
      // Check if bill already exists
      const exists = await checkBillExists(uid, db, template.id, dueDate);
      if (exists) {
        console.log(`⚠️ Bill already exists: ${template.name} on ${dueDate} - skipping`);
        duplicatesPrevented++;
        continue;
      }
      
      // Check max unpaid bills limit (2 per template)
      const unpaidCount = await countUnpaidBills(uid, db, template.id);
      if (unpaidCount >= 2) {
        console.log(`⚠️ Already have ${unpaidCount} unpaid bills for template ${template.name} - skipping`);
        skipped++;
        continue;
      }
      
      // Generate bill instance
      const billInstance = generateBillInstance(template, dueDate);
      
      // Save to Firestore
      const billRef = doc(db, 'users', uid, 'billInstances', billInstance.id);
      billPromises.push(setDoc(billRef, billInstance));
      billsGenerated++;
      
      console.log(`✅ Generated bill: ${template.name} - Due: ${dueDate}`);
    }
    
    // Wait for all bills to be saved
    await Promise.all(billPromises);
    
    console.log(`✅ Bill generation complete: ${billsGenerated} bills created, ${duplicatesPrevented} duplicates prevented, ${skipped} skipped due to limits`);
    
    return {
      success: true,
      message: `Successfully generated ${billsGenerated} bills from ${templates.length} templates (${duplicatesPrevented} duplicates prevented, ${skipped} skipped)`,
      templatesProcessed: templates.length,
      billsGenerated: billsGenerated,
      billsCleared: billsCleared,
      skipped: skipped,
      duplicatesPrevented: duplicatesPrevented
    };
  } catch (error) {
    console.error('Error generating bills:', error);
    return {
      success: false,
      message: `Error generating bills: ${error.message}`,
      error: error,
      templatesProcessed: 0,
      billsGenerated: 0,
      billsCleared: 0,
      skipped: 0,
      duplicatesPrevented: 0
    };
  } finally {
    // Always clear the lock
    isGeneratingBills = false;
  }
};

/**
 * Update all October dates to November in recurring templates
 * @param {string} uid - User ID
 * @param {object} db - Firestore database instance
 * @returns {Promise<object>} Result object with statistics
 */
export const updateTemplatesDates = async (uid, db) => {
  try {
    const settingsDocRef = doc(db, 'users', uid, 'settings', 'personal');
    const settingsDoc = await getDoc(settingsDocRef);
    
    if (!settingsDoc.exists()) {
      return {
        success: false,
        message: 'No settings document found',
        templatesUpdated: 0
      };
    }
    
    const data = settingsDoc.data();
    const recurringItems = data.recurringItems || [];
    
    let templatesUpdated = 0;
    const updatedItems = recurringItems.map(item => {
      if (item.nextOccurrence) {
        const updatedDate = updateDateToNovember(item.nextOccurrence);
        if (updatedDate !== item.nextOccurrence) {
          templatesUpdated++;
          console.log(`Updated ${item.name}: ${item.nextOccurrence} -> ${updatedDate}`);
          return {
            ...item,
            nextOccurrence: updatedDate,
            updatedAt: new Date().toISOString()
          };
        }
      }
      return item;
    });
    
    // Save updated templates
    await setDoc(settingsDocRef, {
      ...data,
      recurringItems: updatedItems
    }, { merge: true });
    
    return {
      success: true,
      message: `Updated ${templatesUpdated} template dates`,
      templatesUpdated: templatesUpdated
    };
  } catch (error) {
    console.error('Error updating template dates:', error);
    return {
      success: false,
      message: `Error updating dates: ${error.message}`,
      error: error,
      templatesUpdated: 0
    };
  }
};
