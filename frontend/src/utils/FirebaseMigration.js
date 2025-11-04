// FirebaseMigration.js - Unified Bill Structure Migration Utility
import { 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc,
  collection, 
  query, 
  where,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Generate unique bill instance ID
 */
const generateBillId = () => {
  return `bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Generate merchant name variations for transaction matching
 * @param {string} billName - Name of the bill
 * @returns {Array<string>} Array of possible merchant name variations
 */
const generateMerchantVariations = (billName) => {
  if (!billName) return [];
  
  const variations = new Set();
  const cleanName = billName.trim();
  
  // Add original name
  variations.add(cleanName.toUpperCase());
  variations.add(cleanName.toLowerCase());
  
  // Add variations with common patterns
  variations.add(cleanName.replace(/\s+/g, '').toUpperCase());
  variations.add(cleanName.replace(/\s+/g, '_').toUpperCase());
  variations.add(cleanName.replace(/\s+/g, '-').toUpperCase());
  variations.add(cleanName.replace(/\s+/g, '*').toUpperCase());
  
  // Add with common prefixes
  ['WWW.', 'HTTP://', 'HTTPS://'].forEach(prefix => {
    variations.add(prefix + cleanName.toUpperCase());
  });
  
  return Array.from(variations);
};

/**
 * Check if a date is past due
 * @param {string} dateString - Date in YYYY-MM-DD format
 * @returns {boolean}
 */
const isPastDue = (dateString) => {
  if (!dateString) return false;
  const dueDate = new Date(dateString + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dueDate < today;
};

/**
 * Migrate bills from all sources to unified billInstances collection
 * @param {string} userId - Firebase user ID
 * @returns {Object} Migration results
 */
export const migrateToUnifiedBillStructure = async (userId) => {
  console.log('🔄 Starting bill migration to unified structure...');
  
  const results = {
    subscriptionsMigrated: 0,
    regularBillsMigrated: 0,
    duplicatesSkipped: 0,
    errors: [],
    success: false
  };

  try {
    // Step 1: Migrate subscription bills
    console.log('📋 Step 1: Migrating subscription bills...');
    const subscriptionResults = await migrateSubscriptionBills(userId);
    results.subscriptionsMigrated = subscriptionResults.migrated;
    results.duplicatesSkipped += subscriptionResults.skipped;
    
    // Step 2: Migrate regular bills from settings
    console.log('📋 Step 2: Migrating regular bills from settings...');
    const regularResults = await migrateRegularBills(userId);
    results.regularBillsMigrated = regularResults.migrated;
    results.duplicatesSkipped += regularResults.skipped;
    
    // Step 3: Mark migration as complete
    await markMigrationComplete(userId);
    
    results.success = true;
    console.log('✅ Migration completed successfully:', results);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    results.errors.push(error.message);
  }
  
  return results;
};

/**
 * Migrate subscription bills to billInstances
 */
const migrateSubscriptionBills = async (userId) => {
  const results = { migrated: 0, skipped: 0 };
  
  try {
    const subscriptionsSnapshot = await getDocs(
      collection(db, 'users', userId, 'subscriptions')
    );
    
    console.log(`Found ${subscriptionsSnapshot.docs.length} subscription(s) to process`);
    
    for (const subDoc of subscriptionsSnapshot.docs) {
      const sub = subDoc.data();
      
      // Skip inactive subscriptions
      if (sub.status !== 'active') {
        console.log(`Skipping inactive subscription: ${sub.name}`);
        continue;
      }
      
      // Check if bill instance already exists for this subscription
      const existingBillQuery = query(
        collection(db, 'users', userId, 'billInstances'),
        where('subscriptionId', '==', subDoc.id),
        where('isPaid', '==', false)
      );
      
      const existingBills = await getDocs(existingBillQuery);
      
      if (!existingBills.empty) {
        console.log(`Bill instance already exists for subscription: ${sub.name}`);
        results.skipped++;
        continue;
      }
      
      // Parse amount properly
      let amount = 0;
      const rawAmount = sub.cost || sub.amount;
      if (typeof rawAmount === 'number') {
        amount = rawAmount;
      } else if (typeof rawAmount === 'string') {
        amount = parseFloat(rawAmount.replace(/[$,\s]/g, ''));
      }
      
      if (isNaN(amount) || amount < 0) {
        console.warn(`Invalid amount for subscription ${sub.name}: ${rawAmount}`);
        amount = 0;
      }
      
      // Create bill instance
      const dueDate = sub.nextRenewal || sub.nextBillingDate;
      if (!dueDate) {
        console.warn(`No due date for subscription: ${sub.name}`);
        continue;
      }
      
      const billInstance = {
        id: generateBillId(),
        name: sub.name,
        amount: amount,
        dueDate: dueDate,
        originalDueDate: dueDate,
        isPaid: false,
        status: isPastDue(dueDate) ? 'overdue' : 'pending',
        category: sub.category || 'Subscriptions',
        recurrence: 'monthly',
        isSubscription: true,
        subscriptionId: subDoc.id,
        paymentHistory: [],
        linkedTransactionIds: [],
        merchantNames: generateMerchantVariations(sub.name),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      await setDoc(
        doc(db, 'users', userId, 'billInstances', billInstance.id),
        billInstance
      );
      
      console.log(`✅ Migrated subscription: ${sub.name} - $${amount}`);
      results.migrated++;
    }
    
  } catch (error) {
    console.error('Error migrating subscription bills:', error);
    throw error;
  }
  
  return results;
};

/**
 * Migrate regular bills from settings/personal/bills
 */
const migrateRegularBills = async (userId) => {
  const results = { migrated: 0, skipped: 0 };
  
  try {
    const settingsDocRef = doc(db, 'users', userId, 'settings', 'personal');
    const settingsDoc = await getDoc(settingsDocRef);
    
    if (!settingsDoc.exists()) {
      console.log('No settings document found');
      return results;
    }
    
    const regularBills = settingsDoc.data()?.bills || [];
    console.log(`Found ${regularBills.length} regular bill(s) to process`);
    
    for (const bill of regularBills) {
      // Skip already paid bills
      if (bill.isPaid) {
        console.log(`Skipping paid bill: ${bill.name}`);
        continue;
      }
      
      // Check if already migrated
      const existingBillQuery = query(
        collection(db, 'users', userId, 'billInstances'),
        where('name', '==', bill.name),
        where('dueDate', '==', bill.dueDate || bill.nextDueDate)
      );
      
      const existingBills = await getDocs(existingBillQuery);
      
      if (!existingBills.empty) {
        console.log(`Bill instance already exists: ${bill.name}`);
        results.skipped++;
        continue;
      }
      
      // Create bill instance
      const dueDate = bill.dueDate || bill.nextDueDate;
      if (!dueDate) {
        console.warn(`No due date for bill: ${bill.name}`);
        continue;
      }
      
      const billInstance = {
        id: bill.id || generateBillId(),
        name: bill.name,
        amount: parseFloat(bill.amount) || 0,
        dueDate: dueDate,
        originalDueDate: bill.originalDueDate || dueDate,
        isPaid: false,
        status: bill.status || (isPastDue(dueDate) ? 'overdue' : 'pending'),
        category: bill.category || 'Bills & Utilities',
        recurrence: bill.recurrence || 'one-time',
        isSubscription: false,
        paymentHistory: bill.paymentHistory || [],
        linkedTransactionIds: [],
        recurringTemplateId: bill.recurringTemplateId,
        merchantNames: generateMerchantVariations(bill.name),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      await setDoc(
        doc(db, 'users', userId, 'billInstances', billInstance.id),
        billInstance
      );
      
      console.log(`✅ Migrated regular bill: ${bill.name} - $${bill.amount}`);
      results.migrated++;
    }
    
  } catch (error) {
    console.error('Error migrating regular bills:', error);
    throw error;
  }
  
  return results;
};

/**
 * Mark migration as complete in user metadata
 */
const markMigrationComplete = async (userId) => {
  try {
    const metadataRef = doc(db, 'users', userId, 'metadata', 'system');
    await setDoc(metadataRef, {
      billsMigrated: true,
      migrationTimestamp: serverTimestamp(),
      migrationVersion: '1.0'
    }, { merge: true });
    
    console.log('✅ Migration marked as complete');
  } catch (error) {
    console.error('Error marking migration complete:', error);
    // Don't throw - this is not critical
  }
};

/**
 * Check if user's bills have been migrated
 * @param {string} userId - Firebase user ID
 * @returns {boolean}
 */
export const isMigrationComplete = async (userId) => {
  try {
    const metadataRef = doc(db, 'users', userId, 'metadata', 'system');
    const metadataDoc = await getDoc(metadataRef);
    
    if (!metadataDoc.exists()) {
      return false;
    }
    
    return metadataDoc.data()?.billsMigrated === true;
  } catch (error) {
    console.error('Error checking migration status:', error);
    return false;
  }
};

/**
 * Auto-run migration on app load if not already done
 * @param {string} userId - Firebase user ID
 */
export const autoMigrateBills = async (userId) => {
  if (!userId) return;
  
  try {
    const migrated = await isMigrationComplete(userId);
    
    if (!migrated) {
      console.log('🔄 Auto-migration triggered for user:', userId);
      const results = await migrateToUnifiedBillStructure(userId);
      
      if (results.success) {
        console.log('✅ Auto-migration completed successfully');
        return results;
      } else {
        console.error('❌ Auto-migration failed:', results.errors);
      }
    } else {
      console.log('✓ Bills already migrated for user:', userId);
    }
  } catch (error) {
    console.error('Error in auto-migration:', error);
    // Don't throw - let the app continue even if migration fails
  }
};
