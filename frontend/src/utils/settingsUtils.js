import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Default settings document structure for new users
 */
const getDefaultSettings = () => ({
  personalInfo: { 
    yourName: '',
    spouseName: '' 
  },
  paySchedules: {
    yours: {
      type: 'bi-weekly',
      amount: '',
      lastPaydate: '',
      bankSplit: {
        fixedAmount: { bank: 'SoFi', amount: '' },
        remainder: { bank: 'Bank of America' }
      }
    },
    spouse: {
      type: 'bi-monthly',
      amount: '',
      dates: [15, 30]
    }
  },
  payAmount: 0,
  spousePayAmount: 0,
  preferences: {
    warningDays: 3,
    safetyBuffer: 200,
    weeklyEssentials: 300,
    billSortOrder: 'dueDate',
    urgentDays: 7,
    dueDateAlerts: true,
    debugMode: false
  },
  bills: [],
  recurringItems: [],
  plaidAccounts: [],
  bankAccounts: {
    bofa: { name: 'Bank of America', type: 'Checking', balance: '' },
    sofi: { name: 'SoFi', type: 'Savings', balance: '' },
    usaa: { name: 'USAA', type: 'Checking', balance: '' },
    cap1: { name: 'Capital One', type: 'Credit', balance: '' }
  },
  lastPayDate: null,
  nextPaydayOverride: null,
  isOnboardingComplete: false,
  // FIX: New users should default to auto-generation ENABLED
  disableAutoGeneration: false,  // Changed from true to false
  autoDetectBills: true,          // Changed from false to true
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp()
});

/**
 * Ensures that a settings document exists for the given user.
 * If the document doesn't exist, it creates one with default values.
 * 
 * @param {string} userId - The Firebase UID of the user
 * @returns {Promise<DocumentReference>} - The document reference
 */
export async function ensureSettingsDocument(userId) {
  if (!userId) {
    throw new Error('User ID is required to ensure settings document');
  }

  try {
    const settingsDocRef = doc(db, 'users', userId, 'settings', 'personal');
    const settingsDocSnap = await getDoc(settingsDocRef);

    if (!settingsDocSnap.exists()) {
      console.log('[SettingsUtils] No settings document found for user, creating default...');
      const defaultSettings = getDefaultSettings();
      await setDoc(settingsDocRef, defaultSettings);
      console.log('[SettingsUtils] ✅ Default settings document created successfully');
    } else {
      console.log('[SettingsUtils] Settings document already exists');
    }

    return settingsDocRef;
  } catch (error) {
    console.error('[SettingsUtils] Error ensuring settings document:', error);
    throw error;
  }
}

/**
 * Safely updates a settings document, ensuring it exists first.
 * This is a wrapper around updateDoc that creates the document if needed.
 * 
 * NOTE: This is an optional helper function for convenience. The current pattern
 * of calling ensureSettingsDocument() followed by updateDoc() works fine.
 * This function is provided for future use if a more concise API is desired.
 * 
 * @param {string} userId - The Firebase UID of the user
 * @param {Object} updates - The updates to apply to the document
 * @returns {Promise<void>}
 * @example
 * // Instead of:
 * // await ensureSettingsDocument(userId);
 * // await updateDoc(settingsDocRef, updates);
 * // You can use:
 * // await safeUpdateSettings(userId, updates);
 */
export async function safeUpdateSettings(userId, updates) {
  await ensureSettingsDocument(userId);
  const settingsDocRef = doc(db, 'users', userId, 'settings', 'personal');
  
  // Get current data to preserve existing fields
  const currentDoc = await getDoc(settingsDocRef);
  const currentData = currentDoc.exists() ? currentDoc.data() : {};
  
  // Merge updates with current data
  const mergedData = {
    ...currentData,
    ...updates,
    updatedAt: serverTimestamp()
  };
  
  await setDoc(settingsDocRef, mergedData);
}
