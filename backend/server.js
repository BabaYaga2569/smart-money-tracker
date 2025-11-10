import express from "express";
import cors from "cors";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import admin from "firebase-admin";
import { errorHandler, createError } from './middleware/errorHandler.js';
import validators from './utils/validators.js';
import healthMonitor from './utils/healthMonitor.js';
import performanceTracker from './middleware/performanceTracker.js';
import logger from './utils/logger.js';
import { atomicTransaction, createOperation } from './utils/atomicTransaction.js';
import { validateAccount as validateAccountConsistency, validateTransaction as validateTransactionConsistency, validateBalanceConsistency, checkDuplicateTransaction } from './utils/consistencyValidators.js';

const app = express();
app.use(cors({
  origin: ['https://smart-money-tracker.netlify.app', 'https://smart-money-tracker-v2.netlify.app', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());
app.use(performanceTracker);

// ============================================================================
// DIAGNOSTIC LOGGING UTILITY
// ============================================================================

/**
 * Logs structured diagnostic information for troubleshooting
 */
const logDiagnostic = {
  info: (category, message, data = {}) => {
    console.log(`[INFO] [${category}] ${message}`, data);
  },
  error: (category, message, error = {}) => {
    console.error(`[ERROR] [${category}] ${message}`, {
      message: error.message,
      code: error.code,
      response: error.response?.data,
      stack: error.stack?.split('\n').slice(0, 3).join('\n')
    });
  },
  warn: (category, message, data = {}) => {
    console.warn(`[WARN] [${category}] ${message}`, data);
  },
  request: (endpoint, body = {}) => {
    const sanitizedBody = { ...body };
    if (sanitizedBody.access_token) sanitizedBody.access_token = '[REDACTED]';
    if (sanitizedBody.public_token) sanitizedBody.public_token = '[REDACTED]';
    console.log(`[REQUEST] ${endpoint}`, sanitizedBody);
  },
  response: (endpoint, statusCode, data = {}) => {
    const sanitizedData = { ...data };
    if (sanitizedData.access_token) sanitizedData.access_token = '[REDACTED]';
    if (sanitizedData.link_token) sanitizedData.link_token = '[REDACTED]';
    console.log(`[RESPONSE] ${endpoint} [${statusCode}]`, sanitizedData);
  }
};

// ============================================================================
// ERROR HANDLING HELPERS
// ============================================================================

/**
 * Check if an error is a Firebase error based on error code
 * Firebase errors have numeric codes in the range 1-16
 */
const isFirebaseError = (error) => {
  return error.code && typeof error.code === 'number' && error.code >= 1 && error.code <= 16;
};

/**
 * Determine if a Plaid error should be retryable
 * INVALID_REQUEST errors are typically not retryable
 */
const shouldRetryPlaidError = (errorType) => {
  return errorType !== 'INVALID_REQUEST';
};

// ============================================================================
// AUTO-CATEGORIZATION KEYWORDS & FUNCTION
// ============================================================================

// Auto-categorization keywords (from frontend/src/constants/categories.js)
const CATEGORY_KEYWORDS = {
  "Groceries": ["groceries", "grocery", "walmart", "target", "kroger", "safeway", "food shopping", "supermarket", "costco", "sam's club", "aldi", "whole foods"],
  "Food & Dining": ["restaurant", "mcdonalds", "starbucks", "pizza", "takeout", "dining", "coffee", "fast food", "burger king", "taco bell", "subway", "kfc", "dominos", "chipotle"],
  "Gas & Fuel": ["gas", "shell", "chevron", "exxon", "bp", "fuel", "gas station", "texaco", "mobil", "arco", "speedway", "circle k"],
  "Transportation": ["uber", "lyft", "taxi", "bus", "train", "parking", "car repair", "metro", "automotive", "public transport", "rideshare", "car wash"],
  "Bills & Utilities": ["electric", "electricity", "water", "internet", "phone", "cable", "utility", "verizon", "at&t", "comcast", "xfinity", "nv energy", "duke energy", "mepco"],
  "Household Items": ["cleaning", "paper towels", "household", "home supplies", "detergent", "toilet paper", "cleaning supplies", "home depot", "lowes", "ace hardware"],
  "Clothing": ["clothes", "shirt", "shoes", "pants", "clothing", "apparel", "nike", "adidas", "h&m", "zara", "gap", "old navy", "macy's"],
  "Healthcare": ["doctor", "hospital", "medical", "dentist", "health", "clinic", "kaiser", "urgent care", "prescription"],
  "Pharmacy": ["pharmacy", "cvs", "walgreens", "prescription", "medicine", "drugs", "rite aid", "medication"],
  "Personal Care": ["haircut", "salon", "cosmetics", "personal care", "beauty", "barbershop", "spa", "nails", "massage"],
  "Entertainment": ["movie", "theater", "game", "entertainment", "concert", "sports", "amusement park", "netflix", "spotify", "hulu", "disney"],
  "Subscriptions": ["netflix", "spotify", "amazon prime", "subscription", "monthly service", "hulu", "disney+", "apple music", "youtube premium"],
  "Shopping": ["amazon", "online shopping", "store", "retail", "ebay", "etsy", "best buy", "electronics", "shopping mall"],
  "Income": ["payroll", "salary", "bonus", "freelance", "income", "paycheck", "wages", "deposit", "payment", "refund", "tax refund"],
  "Transfer": ["transfer", "deposit", "withdrawal", "bank transfer", "atm", "cash", "venmo", "paypal", "zelle", "barclays"]
};

/**
 * Auto-categorize transaction based on merchant name/description
 * @param {string} description - Merchant name or transaction description
 * @returns {string} Category name or empty string if no match
 */
function autoCategorizTransaction(description) {
  if (!description) return '';
  
  const desc = description.toLowerCase().trim();
  
  // Try to match keywords to categories
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      const lowerKeyword = keyword.toLowerCase();
      // Handle variations with punctuation and word boundaries
      if (desc === lowerKeyword || 
          desc.includes(` ${lowerKeyword} `) ||
          desc.startsWith(lowerKeyword + ' ') ||
          desc.endsWith(' ' + lowerKeyword) ||
          desc.includes(lowerKeyword)) {
        return category;
      }
    }
  }
  
  return '';
}

// ============================================================================
// PLAID CONFIGURATION & STARTUP DIAGNOSTICS
// ============================================================================
// 
// PRODUCT CONFIGURATION:
// This app uses Plaid products: ["auth", "transactions"]
// 
// WHY THIS CONFIGURATION:
// - "transactions": Required for transaction history from checking, savings, AND credit cards
// - "auth": Provides account/routing numbers for checking/savings (enables ACH payments)
// 
// WHAT WE AVOID:
// - "transfer": Enables money movement but FILTERS OUT credit card accounts
// - "payment_initiation": Similar to transfer, not compatible with credit cards
// - "income": Income verification, not needed for this app
// 
// RESULT: Users can link checking, savings, AND credit card accounts successfully
// ============================================================================

const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID || "demo_client_id";
const PLAID_SECRET = process.env.PLAID_SECRET || "demo_secret";
const PLAID_ENV = process.env.PLAID_ENV || "sandbox";

// Log startup configuration (with masked secrets)
console.log('\n========================================');
console.log('PLAID CONFIGURATION');
console.log('========================================');
console.log('PLAID_CLIENT_ID:', PLAID_CLIENT_ID ? `${PLAID_CLIENT_ID.substring(0, 8)}...` : '[NOT SET]');
console.log('PLAID_SECRET:', PLAID_SECRET ? `${PLAID_SECRET.substring(0, 8)}...` : '[NOT SET]');
console.log('PLAID_ENV:', PLAID_ENV);
console.log('NODE_ENV:', process.env.NODE_ENV || 'development');
console.log('========================================\n');

const configuration = new Configuration({
  basePath: PlaidEnvironments[PLAID_ENV], // Dynamic based on environment variable
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": PLAID_CLIENT_ID,
      "PLAID-SECRET": PLAID_SECRET,
    },
  },
});

const plaidClient = new PlaidApi(configuration);

// ============================================================================
// FIREBASE ADMIN SDK INITIALIZATION
// ============================================================================

// Initialize Firebase Admin SDK
// For production, use service account key. For development, use application default credentials.
if (!admin.apps.length) {
  try {
    // Try to use service account key from environment variable
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      : null;

    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log('✓ Firebase Admin initialized with service account');
    } else {
      // Fallback to application default credentials (for local development)
      admin.initializeApp({
        credential: admin.credential.applicationDefault()
      });
      console.log('✓ Firebase Admin initialized with application default credentials');
    }
  } catch (error) {
    console.error('✗ Failed to initialize Firebase Admin:', error.message);
    console.log('⚠ Some features requiring Firestore will be unavailable');
  }
}

const db = admin.firestore();

// ============================================================================
// SECURE PLAID CREDENTIAL STORAGE HELPERS
// ============================================================================

/**
 * Store Plaid credentials securely in Firestore
 * Supports multiple bank connections per user
 * @param {string} userId - User's UID
 * @param {string} accessToken - Plaid access token
 * @param {string} itemId - Plaid item ID
 * @param {string} institutionId - Plaid institution ID (optional)
 * @param {string} institutionName - Institution name (optional)
 * @returns {Promise<void>}
 */
async function storePlaidCredentials(userId, accessToken, itemId, institutionId = null, institutionName = null) {
  if (!userId || !accessToken || !itemId) {
    throw new Error('Missing required parameters for storing Plaid credentials');
  }

  logger.info('FIREBASE', 'Storing Plaid credentials', { userId, itemId, institutionName: institutionName || 'unknown' });
  logDiagnostic.info('STORE_CREDENTIALS', `Storing credentials for user: ${userId}, item: ${itemId}, institution: ${institutionName || 'unknown'}`);

  // Use itemId as document ID to support multiple bank connections
  const userPlaidRef = db.collection('users').doc(userId).collection('plaid_items').doc(itemId);
  
  await userPlaidRef.set({
    accessToken,
    itemId,
    institutionId,
    institutionName,
    cursor: null,
    status: 'active',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  logger.info('FIREBASE', 'Credentials stored successfully', { userId, itemId });
  logDiagnostic.info('STORE_CREDENTIALS', 'Credentials stored successfully');
}

/**
 * Retrieve Plaid access token from Firestore for a specific item
 * @param {string} userId - User's UID
 * @param {string} itemId - Optional Plaid item ID. If not provided, returns first active item
 * @returns {Promise<{accessToken: string, itemId: string, institutionId: string, institutionName: string}|null>}
 */
async function getPlaidCredentials(userId, itemId = null) {
  if (!userId) {
    throw new Error('userId is required to retrieve Plaid credentials');
  }

  logger.info('FIREBASE', 'Retrieving Plaid credentials', { userId, itemId: itemId || 'first-active' });
  logDiagnostic.info('GET_CREDENTIALS', `Retrieving credentials for user: ${userId}${itemId ? `, item: ${itemId}` : ''}`);

  if (itemId) {
    // Get specific item
    const userPlaidRef = db.collection('users').doc(userId).collection('plaid_items').doc(itemId);
    const doc = await userPlaidRef.get();

    if (!doc.exists) {
      logger.info('FIREBASE', 'No credentials found for item', { userId, itemId });
      logDiagnostic.info('GET_CREDENTIALS', `No credentials found for item: ${itemId}`);
      return null;
    }

    const data = doc.data();
    logger.info('FIREBASE', 'Credentials retrieved', { userId, itemId: data.itemId });
    logDiagnostic.info('GET_CREDENTIALS', `Credentials retrieved for item: ${data.itemId}`);
    
    return {
      accessToken: data.accessToken,
      itemId: data.itemId,
      institutionId: data.institutionId,
      institutionName: data.institutionName,
      cursor: data.cursor
    };
  } else {
    // Get first active item (for backward compatibility)
    const itemsSnapshot = await db.collection('users').doc(userId).collection('plaid_items')
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (itemsSnapshot.empty) {
      logger.info('FIREBASE', 'No credentials found for user', { userId });
      logDiagnostic.info('GET_CREDENTIALS', 'No credentials found for user');
      return null;
    }

    const data = itemsSnapshot.docs[0].data();
    logger.info('FIREBASE', 'Credentials retrieved', { userId, itemId: data.itemId });
    logDiagnostic.info('GET_CREDENTIALS', `Credentials retrieved for item: ${data.itemId}`);
    
    return {
      accessToken: data.accessToken,
      itemId: data.itemId,
      institutionId: data.institutionId,
      institutionName: data.institutionName,
      cursor: data.cursor
    };
  }
}

/**
 * Get all Plaid items for a user
 * @param {string} userId - User's UID
 * @returns {Promise<Array>} Array of Plaid item credentials
 */
async function getAllPlaidItems(userId) {
  if (!userId) {
    throw new Error('userId is required to retrieve Plaid items');
  }

  logger.info('FIREBASE', 'Retrieving all items for user', { userId });
  logDiagnostic.info('GET_ALL_ITEMS', `Retrieving all items for user: ${userId}`);

  const itemsSnapshot = await db
    .collection('users')
    .doc(userId)
    .collection('plaid_items')
    .where('status', '==', 'active')
    .get();
  
  const items = itemsSnapshot.docs.map(doc => doc.data());
  logger.info('FIREBASE', 'Retrieved active items', { userId, itemCount: items.length });
  logDiagnostic.info('GET_ALL_ITEMS', `Retrieved ${items.length} active items`);
  
  return items;
}

/**
 * Deduplicate and save accounts to prevent duplicate accounts on reconnection
 * Matches accounts by institution_name + mask to handle reconnections with new item_ids
 * @param {string} userId - User's UID
 * @param {Array} newAccounts - New accounts to add
 * @param {string} institutionName - Institution name
 * @param {string} itemId - Plaid item ID
 * @returns {Promise<Object>} Result with added/deduplicated counts
 */
async function deduplicateAndSaveAccounts(userId, newAccounts, institutionName, itemId) {
  if (!userId || !Array.isArray(newAccounts)) {
    throw new Error('Invalid parameters for deduplicateAndSaveAccounts');
  }

  logger.info('FIREBASE', 'Deduplicating accounts for user', { userId, newAccountCount: newAccounts.length });
  logDiagnostic.info('DEDUPLICATE_ACCOUNTS', `Deduplicating ${newAccounts.length} accounts for user: ${userId}`);

  const settingsRef = db.collection('users').doc(userId)
    .collection('settings').doc('personal');

  // Get current settings to preserve other data
  const settingsDoc = await settingsRef.get();
  const currentSettings = settingsDoc.exists ? settingsDoc.data() : {};
  const existingPlaidAccounts = currentSettings.plaidAccounts || [];

  // Format accounts for frontend display
  const accountsToAdd = newAccounts.map(account => ({
    account_id: account.account_id,
    name: account.name,
    official_name: account.official_name || null,
    mask: account.mask || null,
    type: account.type,
    subtype: account.subtype || null,
    // Primary balance fields - using ?? to handle null without treating 0 as falsy
    available_balance: account.balances.available ?? account.balances.current ?? 0,
    current_balance: account.balances.current ?? 0,
    balance: account.balances.available ?? account.balances.current ?? 0, // For backwards compatibility
    // Full balances object for flexibility - no undefined values
    balances: {
      available: account.balances.available ?? null,
      current: account.balances.current ?? 0,
      limit: account.balances.limit ?? null,
      iso_currency_code: account.balances.iso_currency_code ?? 'USD',
      unofficial_currency_code: account.balances.unofficial_currency_code ?? null
    },
    institution_name: institutionName,
    item_id: itemId
  }));

  // Deduplicate by institution + mask
  // This handles reconnection scenarios where the same account gets a new item_id
  let deduplicatedCount = 0;
  const filteredExistingAccounts = existingPlaidAccounts.filter(existingAcc => {
    const isDuplicate = accountsToAdd.some(newAcc => 
      existingAcc.institution_name === newAcc.institution_name &&
      existingAcc.mask === newAcc.mask
    );
    
    if (isDuplicate) {
      deduplicatedCount++;
      logger.info('FIREBASE', 'Removing duplicate account', { userId, institution: existingAcc.institution_name, mask: existingAcc.mask });
      logDiagnostic.info('DEDUPLICATE_ACCOUNTS', `Removing duplicate account: ${existingAcc.institution_name} ...${existingAcc.mask}`);
    }
    
    return !isDuplicate;
  });

  // Add new accounts
  const updatedPlaidAccounts = [...filteredExistingAccounts, ...accountsToAdd];

  // Update settings/personal
  await settingsRef.set({
    ...currentSettings,
    plaidAccounts: updatedPlaidAccounts,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  logger.info('FIREBASE', 'Saved accounts, deduplicated', { userId, saved: accountsToAdd.length, deduplicated: deduplicatedCount });
  logDiagnostic.info('DEDUPLICATE_ACCOUNTS', `Saved ${accountsToAdd.length} accounts, deduplicated ${deduplicatedCount}`);

  return {
    added: accountsToAdd.length,
    deduplicated: deduplicatedCount,
    total: updatedPlaidAccounts.length
  };
}

/**
 * Update account balances in Firebase settings/personal collection
 * This function only updates balances for existing accounts, doesn't add/remove accounts
 * @param {string} userId - User's UID
 * @param {Array} accounts - Array of accounts with fresh balance data from Plaid
 * @returns {Promise<Object>} Result with { updated, total, unmatched } counts
 */
async function updateAccountBalances(userId, accounts) {
  if (!userId || !Array.isArray(accounts)) {
    throw new Error('Invalid parameters for updateAccountBalances');
  }

  logger.info('PLAID_ACCOUNTS', 'Updating balances for accounts for user', { userId, accountCount: accounts.length });
  logDiagnostic.info('UPDATE_BALANCES', `Updating balances for ${accounts.length} accounts for user: ${userId}`);

  const settingsRef = db.collection('users').doc(userId)
    .collection('settings').doc('personal');

  // Get current settings
  const settingsDoc = await settingsRef.get();
  const currentSettings = settingsDoc.exists ? settingsDoc.data() : {};
  const existingPlaidAccounts = currentSettings.plaidAccounts || [];

  if (existingPlaidAccounts.length === 0) {
    logger.info('PLAID_ACCOUNTS', 'No existing accounts to update', { userId });
    logDiagnostic.info('UPDATE_BALANCES', 'No existing accounts to update');
    return { updated: 0, total: 0, unmatched: 0 };
  }

  // 🔍 NEW: Log all account IDs from Plaid
  logDiagnostic.info('UPDATE_BALANCES_PLAID_ACCOUNTS', 'Fresh account data from Plaid:', {
    count: accounts.length,
    accounts: accounts.map(a => ({
      account_id: a.account_id,
      name: a.name,
      institution: a.institution_name || 'Unknown',
      balance_available: a.balances?.available,
      balance_current: a.balances?.current
    }))
  });

  // 🔍 NEW: Log all account IDs in Firebase
  logDiagnostic.info('UPDATE_BALANCES_FIREBASE_ACCOUNTS', 'Existing accounts in Firebase:', {
    count: existingPlaidAccounts.length,
    accounts: existingPlaidAccounts.map(a => ({
      account_id: a.account_id,
      name: a.name,
      institution: a.institution_name || 'Unknown',
      current_balance: a.balance
    }))
  });

  let updatedCount = 0;
  let unmatchedAccounts = [];

  // Update balances for matching accounts
  const updatedPlaidAccounts = existingPlaidAccounts.map(existingAcc => {
    // Find matching account in fresh data by account_id
    const freshAccount = accounts.find(acc => acc.account_id === existingAcc.account_id);
    
    if (freshAccount) {
      updatedCount++;
      const balances = freshAccount.balances || {};
      
      // Track both available and current balances - using ?? to handle null without treating 0 as falsy
      const oldAvailable = existingAcc.available_balance ?? existingAcc.available ?? existingAcc.balance ?? 0;
      const oldCurrent = existingAcc.current_balance ?? existingAcc.current ?? existingAcc.balance ?? 0;
      const newAvailable = balances.available ?? balances.current ?? 0;
      const newCurrent = balances.current ?? 0;
      
      // Calculate changes
      const availableChange = newAvailable - oldAvailable;
      const currentChange = newCurrent - oldCurrent;
      // Pending amount = current - available (when positive, means pending debits reducing available)
      const pendingAmount = newCurrent - newAvailable;
      
      // 🔍 Enhanced logging with both balance types
      logDiagnostic.info('UPDATE_BALANCES_MATCH', `✅ Matched and updated: ${existingAcc.name}`, {
        account_id: existingAcc.account_id,
        institution: existingAcc.institution_name,
        old_available: oldAvailable,
        new_available: newAvailable,
        available_change: availableChange,
        old_current: oldCurrent,
        new_current: newCurrent,
        current_change: currentChange,
        pending_amount: pendingAmount
      });
      
      // Update balance fields with fresh data - no undefined values
      return {
        ...existingAcc,
        balance: newAvailable ?? newCurrent ?? 0, // Primary balance = available (what you can spend)
        available_balance: newAvailable ?? newCurrent ?? 0,
        current_balance: newCurrent ?? 0,
        available: newAvailable ?? newCurrent ?? 0, // For compatibility
        current: newCurrent ?? 0, // For compatibility
        balances: {
          available: balances.available ?? null,
          current: balances.current ?? 0,
          limit: balances.limit ?? null,
          iso_currency_code: balances.iso_currency_code ?? 'USD',
          unofficial_currency_code: balances.unofficial_currency_code ?? null
        },
        lastUpdated: new Date().toISOString()
      };
    }
    
    // 🚨 NEW: Track and log unmatched accounts
    unmatchedAccounts.push({
      account_id: existingAcc.account_id,
      name: existingAcc.name,
      institution: existingAcc.institution_name,
      balance: existingAcc.balance
    });
    
    logDiagnostic.warn('UPDATE_BALANCES_NO_MATCH', `❌ No fresh data found for account: ${existingAcc.name}`, {
      account_id: existingAcc.account_id,
      institution: existingAcc.institution_name,
      stored_balance: existingAcc.balance,
      action: 'Keeping old balance (DATA MAY BE STALE!)'
    });
    
    // Keep existing account unchanged if no fresh data
    return existingAcc;
  });

  // 🔍 NEW: Log final summary
  logDiagnostic.info('UPDATE_BALANCES_SUMMARY', `Balance update complete`, {
    total_accounts: existingPlaidAccounts.length,
    updated: updatedCount,
    unmatched: unmatchedAccounts.length,
    success_rate: `${Math.round((updatedCount / existingPlaidAccounts.length) * 100)}%`,
    unmatched_accounts: unmatchedAccounts
  });

  // Calculate total balance from updated accounts
  const totalBalance = updatedPlaidAccounts.reduce((sum, acc) => sum + (acc.current_balance || 0), 0);
  
  // Validate balance consistency
  validateBalanceConsistency(updatedPlaidAccounts, totalBalance);
  
  // Create atomic operations
  const operations = [];
  
  // Add settings/personal update with fresh balances
  operations.push(createOperation('set', settingsRef, {
    ...currentSettings,
    plaidAccounts: updatedPlaidAccounts,
    lastBalanceUpdate: admin.firestore.FieldValue.serverTimestamp()
  }));
  
  // Add user total balance update
  const userRef = db.collection('users').doc(userId);
  operations.push(createOperation('update', userRef, {
    totalBalance,
    accountCount: updatedPlaidAccounts.length,
    lastSyncedAt: new Date()
  }));
  
  // Execute atomically
  await atomicTransaction(operations);

  logger.info('PLAID_ACCOUNTS', 'Persisted to Firebase atomically: accounts updated', { userId, updatedCount, totalBalance });
  logDiagnostic.info('UPDATE_BALANCES', `Persisted to Firebase atomically: ${updatedCount} accounts updated, total balance: ${totalBalance}`);

  return {
    updated: updatedCount,
    total: updatedPlaidAccounts.length,
    unmatched: unmatchedAccounts.length
  };
}

/**
 * Delete Plaid credentials from Firestore
 * @param {string} userId - User's UID
 * @param {string} itemId - Optional Plaid item ID. If not provided, deletes all items
 * @returns {Promise<void>}
 */
async function deletePlaidCredentials(userId, itemId = null) {
  if (!userId) {
    throw new Error('userId is required to delete Plaid credentials');
  }

  if (itemId) {
    // Delete specific item
    logger.info('FIREBASE', 'Deleting credentials for user', { userId, itemId });
    logDiagnostic.info('DELETE_CREDENTIALS', `Deleting credentials for user: ${userId}, item: ${itemId}`);
    const userPlaidRef = db.collection('users').doc(userId).collection('plaid_items').doc(itemId);
    await userPlaidRef.delete();
    logger.info('FIREBASE', 'Credentials deleted successfully', { userId, itemId });
    logDiagnostic.info('DELETE_CREDENTIALS', 'Credentials deleted successfully');
  } else {
    // Delete all items
    logger.info('FIREBASE', 'Deleting all credentials for user', { userId });
    logDiagnostic.info('DELETE_CREDENTIALS', `Deleting all credentials for user: ${userId}`);
    const itemsSnapshot = await db.collection('users').doc(userId).collection('plaid_items').get();
    const batch = db.batch();
    itemsSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    logger.info('FIREBASE', 'Deleted items successfully', { userId, deletedCount: itemsSnapshot.docs.length });
    logDiagnostic.info('DELETE_CREDENTIALS', `Deleted ${itemsSnapshot.docs.length} items successfully`);
  }
}

// ============================================================================
// FUZZY MATCHING HELPERS FOR DEDUPLICATION
// ============================================================================

/**
 * Calculate string similarity using Levenshtein distance
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score between 0 and 1
 */
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Edit distance
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

// Test route
app.get("/api/hello", (req, res) => {
  res.json({ message: "Backend is working!" });
});

// Enhanced health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const healthStatus = await healthMonitor.getHealthStatus(plaidClient);
    
    // Return 503 if any service is unhealthy
    const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json(healthStatus);
  } catch (error) {
    console.error('[HEALTH_CHECK] Error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// ============================================================================
// PLAID ENDPOINTS WITH DIAGNOSTIC LOGGING
// ============================================================================

// Create Plaid Link token
app.post("/api/plaid/create_link_token", async (req, res, next) => {
  const endpoint = "/api/plaid/create_link_token";
  logger.request('POST', endpoint, { body: req.body });
  logDiagnostic.request(endpoint, req.body);
  
  try {
    const { userId, mode, itemId } = req.body;
    
    // Validate userId if provided
    if (userId) {
      validators.validateUserId(userId);
    }
    
    logger.info('PLAID_LINK', 'Creating link token', { userId: userId || 'default', mode: mode || 'default', itemId });
    logDiagnostic.info('CREATE_LINK_TOKEN', `Creating link token for user: ${userId || 'default'}, mode: ${mode || 'default'}`);
    
    let request;
    
    // If mode is 'update', retrieve access token for the item and create update request
    if (mode === 'update' && itemId) {
      logger.info('PLAID_LINK', 'Update mode: fetching access token', { itemId });
      logDiagnostic.info('CREATE_LINK_TOKEN', `Update mode: fetching access token for item: ${itemId}`);
      
      if (!userId) {
        throw createError.badRequest('userId is required for update mode', 'MISSING_USER_ID');
      }
      
      const itemDoc = await db
        .collection('users')
        .doc(userId)
        .collection('plaid_items')
        .doc(itemId)
        .get();

      if (!itemDoc.exists) {
        logger.error('PLAID_LINK', 'Item not found', null, { itemId });
        logDiagnostic.error('CREATE_LINK_TOKEN', `Item not found: ${itemId}`);
        throw createError.notFound('Bank connection not found');
      }

      const accessToken = itemDoc.data().accessToken;
      if (!accessToken) {
        logger.error('PLAID_LINK', 'No access token for item', null, { itemId });
        logDiagnostic.error('CREATE_LINK_TOKEN', `No access token for item: ${itemId}`);
        throw createError.badRequest('Access token not found for this connection', 'MISSING_TOKEN');
      }

      // For update mode, use access_token instead of products
      request = {
        user: {
          client_user_id: userId || "user-id",
        },
        client_name: "Smart Money Tracker",
        access_token: accessToken,
        country_codes: ["US"],
        language: "en",
        webhook: "https://smart-money-tracker-09ks.onrender.com/api/plaid/webhook",
      };
      
      logger.info('PLAID_LINK', 'Update mode configured', { itemId });
      logDiagnostic.info('CREATE_LINK_TOKEN', `Update mode configured for item: ${itemId}`);
    } else {
      // Default mode for new connections
      // Products configuration:
      // - "transactions": Enables transaction history for checking, savings, AND credit cards
      // 
      // IMPORTANT: Do NOT include "auth", "transfer", or "payment_initiation" products as they
      // filter out credit card accounts in Production. Credit cards only support "transactions".
      // Using ["transactions"] allows:
      //   - Credit cards: transaction history ✓
      //   - Checking/Savings: transaction history ✓
      // Note: ACH routing numbers won't be available, but not needed for read-only transaction access.
      request = {
        user: {
          client_user_id: userId || "user-id",
        },
        client_name: "Smart Money Tracker",
        products: ["transactions"],
        country_codes: ["US"],
        language: "en",
        webhook: "https://smart-money-tracker-09ks.onrender.com/api/plaid/webhook",
      };
    }

    const createTokenResponse = await plaidClient.linkTokenCreate(request);
    
    logger.info('PLAID_LINK', 'Successfully created link token', { userId });
    logDiagnostic.info('CREATE_LINK_TOKEN', 'Successfully created link token');
    logDiagnostic.response(endpoint, 200, { success: true, has_link_token: !!createTokenResponse.data.link_token });
    
    res.json(createTokenResponse.data);
  } catch (error) {
    logger.error('PLAID_LINK', 'Failed to create link token', error, { userId: req.body.userId });
    logDiagnostic.error('CREATE_LINK_TOKEN', 'Failed to create link token', error);
    
    // Check if it's already an AppError
    if (error.statusCode) {
      return next(error);
    }
    
    // Check for network/CORS errors
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      logger.error('PLAID_LINK', 'Cannot reach Plaid API - network issue', error);
      logDiagnostic.error('NETWORK', 'Cannot reach Plaid API - network issue', error);
      return next(createError.plaidError('Cannot connect to Plaid API. Please check network connectivity.', false));
    }
    
    // Handle Plaid-specific errors
    if (error.response?.data) {
      const plaidError = error.response.data;
      return next(createError.plaidError(
        plaidError.error_message || 'Plaid API error',
        shouldRetryPlaidError(plaidError.error_type)
      ));
    }
    
    // Generic error
    next(createError.plaidError(error.message || 'Failed to create link token'));
  }
});

// Exchange public token for access token
app.post("/api/plaid/exchange_token", async (req, res, next) => {
  const endpoint = "/api/plaid/exchange_token";
  logger.request('POST', endpoint, { body: req.body });
  logDiagnostic.request(endpoint, req.body);
  
  try {
    const { public_token, userId } = req.body;

    if (!public_token) {
      logger.error('PLAID_AUTH', 'Missing public_token in request');
      logDiagnostic.error('EXCHANGE_TOKEN', 'Missing public_token in request');
      throw createError.badRequest('public_token is required', 'MISSING_PUBLIC_TOKEN');
    }

    if (!userId) {
      logger.error('PLAID_AUTH', 'Missing userId in request');
      logDiagnostic.error('EXCHANGE_TOKEN', 'Missing userId in request');
      throw createError.badRequest('userId is required', 'MISSING_USER_ID');
    }
    
    // Validate userId
    validators.validateUserId(userId);

    logger.info('PLAID_AUTH', 'Exchanging public token', { userId });
    logDiagnostic.info('EXCHANGE_TOKEN', `Exchanging public token for user: ${userId}`);

    // Exchange public token for access token
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token,
    });

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;
    
    logger.info('PLAID_AUTH', 'Successfully exchanged token', { userId, itemId });
    logDiagnostic.info('EXCHANGE_TOKEN', `Successfully exchanged token, item_id: ${itemId}`);

    // Get institution info
    const itemResponse = await plaidClient.itemGet({ access_token: accessToken });
    const institutionId = itemResponse.data.item.institution_id;
    
    logger.info('PLAID_AUTH', 'Fetching institution info', { institutionId });
    logDiagnostic.info('EXCHANGE_TOKEN', `Fetching institution info for: ${institutionId}`);

    const institutionResponse = await plaidClient.institutionsGetById({
      institution_id: institutionId,
      country_codes: ['US']
    });
    const institutionName = institutionResponse.data.institution.name;
    
    logger.info('PLAID_AUTH', 'Retrieved institution', { institutionName });
    logDiagnostic.info('EXCHANGE_TOKEN', `Institution: ${institutionName}`);

    // Store credentials securely in Firestore (server-side only)
    await storePlaidCredentials(userId, accessToken, itemId, institutionId, institutionName);

    // Get account information
    logger.info('PLAID_ACCOUNTS', 'Fetching account information', { userId, itemId });
    logDiagnostic.info('EXCHANGE_TOKEN', 'Fetching account information');
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken,
    });

    const accounts = accountsResponse.data.accounts;
    logger.info('PLAID_ACCOUNTS', 'Retrieved accounts', { userId, accountCount: accounts.length });
    logDiagnostic.info('EXCHANGE_TOKEN', `Retrieved ${accounts.length} accounts`);

    // Get account balances
    const balanceResponse = await plaidClient.accountsBalanceGet({
      access_token: accessToken,
    });
    
    // Validate each account before saving
    balanceResponse.data.accounts.forEach(account => {
      validators.validateAccount(account);
    });

    // Use deduplicateAndSaveAccounts to prevent duplicates on reconnection
    logger.info('PLAID_AUTH', 'Updating settings/personal with account display data', { userId, itemId });
    logDiagnostic.info('EXCHANGE_TOKEN', 'Updating settings/personal with account display data');
    const deduplicationResult = await deduplicateAndSaveAccounts(
      userId, 
      balanceResponse.data.accounts, 
      institutionName, 
      itemId
    );

    logger.info('PLAID_AUTH', 'Account deduplication complete', { userId, ...deduplicationResult });
    logDiagnostic.info('EXCHANGE_TOKEN', `Account deduplication complete:`, deduplicationResult);

    // Enhance accounts with institution name and balance fields for frontend display
    const accountsWithInstitution = balanceResponse.data.accounts.map(account => ({
      ...account,
      // Primary balance fields
      available_balance: account.balances.available || account.balances.current || 0,
      current_balance: account.balances.current || 0,
      institution_name: institutionName
    }));

    logDiagnostic.response(endpoint, 200, { 
      success: true, 
      item_id: itemId,
      account_count: accountsWithInstitution.length 
    });

    // IMPORTANT: Do NOT send access_token to frontend
    res.json({
      success: true,
      item_id: itemId,
      institution_name: institutionName,
      accounts: accountsWithInstitution,
    });
  } catch (error) {
    logger.error('PLAID_AUTH', 'Failed to exchange token', error, { userId });
    logDiagnostic.error('EXCHANGE_TOKEN', 'Failed to exchange token', error);
    
    // Check if it's already an AppError
    if (error.statusCode) {
      return next(error);
    }
    
    // Handle Plaid-specific errors
    if (error.response?.data) {
      const plaidError = error.response.data;
      return next(createError.plaidError(
        plaidError.error_message || 'Plaid API error',
        shouldRetryPlaidError(plaidError.error_type)
      ));
    }
    
    // Generic error
    next(createError.plaidError(error.message || 'Failed to exchange token'));
  }
});

app.post("/api/plaid/get_balances", async (req, res, next) => {
  const endpoint = "/api/plaid/get_balances";
  logDiagnostic.request(endpoint, req.body);
  
  try {
    const { userId } = req.body;

    if (!userId) {
      logger.error('PLAID_ACCOUNTS', 'Missing userId in request', null, {});
      logDiagnostic.error('GET_BALANCES', 'Missing userId in request');
      throw createError.badRequest('userId is required', 'MISSING_USER_ID');
    }
    
    // Validate userId
    validators.validateUserId(userId);

    // Retrieve all Plaid items for the user
    const items = await getAllPlaidItems(userId);
    if (!items || items.length === 0) {
      logger.error('PLAID_ACCOUNTS', 'No Plaid credentials found for user', null, { userId });
      logDiagnostic.error('GET_BALANCES', 'No Plaid credentials found for user');
      throw createError.notFound('No Plaid connection found. Please connect your bank account first.');
    }

    logger.info('PLAID_ACCOUNTS', 'Fetching account balances for bank connections', { userId, itemCount: items.length });
    logDiagnostic.info('GET_BALANCES', `Fetching account balances for ${items.length} bank connections`);

    // Fetch balances from all items
    let allAccounts = [];
    for (const item of items) {
      try {
        // Use accountsBalanceGet to fetch real-time balance data
        // This ensures we get fresh balances directly from the bank instead of cached data
        const balanceResponse = await plaidClient.accountsBalanceGet({
          access_token: item.accessToken
        });
        
        // Extract accounts with fresh balance from balance response
        const accountsWithInstitution = balanceResponse.data.accounts.map(account => ({
          account_id: account.account_id,
          name: account.name,
          official_name: account.official_name,
          type: account.type,
          subtype: account.subtype,
          mask: account.mask,
          // Primary balance fields
          available_balance: account.balances.available || account.balances.current || 0,
          current_balance: account.balances.current || 0,
          // Full balances object for flexibility
          balances: account.balances,
          institution_name: item.institutionName,
          institution_id: item.institutionId,
          item_id: item.itemId
        }));
        
        allAccounts.push(...accountsWithInstitution);
      } catch (itemError) {
        logger.error('PLAID_ACCOUNTS', 'Failed to fetch balances for item', itemError, { userId, itemId: item.itemId });
        logDiagnostic.error('GET_BALANCES', `Failed to fetch balances for item ${item.itemId}`, itemError);
        // Continue with other items even if one fails
      }
    }

    const accountCount = allAccounts.length;
    logger.info('PLAID_ACCOUNTS', 'Successfully fetched balances for accounts from banks', { userId, accountCount: allAccounts.length });
    logDiagnostic.info('GET_BALANCES', `Successfully fetched balances for ${accountCount} accounts from ${items.length} banks`);
    
    // Update account balances in Firebase settings/personal collection
    try {
      const updateResult = await updateAccountBalances(userId, allAccounts);
      logger.info('GET_BALANCES', 'Persisted balances to Firebase: accounts updated', {});
      logDiagnostic.info('GET_BALANCES', `Persisted balances to Firebase: ${updateResult.updated} accounts updated`);
    } catch (updateError) {
      logger.error('GET_BALANCES', 'Failed to persist balances to Firebase', updateError, {});
      logDiagnostic.error('GET_BALANCES', 'Failed to persist balances to Firebase', updateError);
      // Continue anyway - don't fail the request if Firebase update fails
    }
    
    logDiagnostic.response(endpoint, 200, { success: true, account_count: accountCount, item_count: items.length });

    res.json({
      success: true,
      accounts: allAccounts,
    });
  } catch (error) {
    logger.error('GET_BALANCES', 'Failed to fetch balances', error, {});
    logDiagnostic.error('GET_BALANCES', 'Failed to fetch balances', error);
    
    // Check if it's already an AppError
    if (error.statusCode) {
      return next(error);
    }
    
    // Handle Plaid-specific errors
    if (error.response?.data) {
      const plaidError = error.response.data;
      return next(createError.plaidError(
        plaidError.error_message || 'Plaid API error',
        shouldRetryPlaidError(plaidError.error_type)
      ));
    }
    
    // Generic error
    next(createError.plaidError(error.message || 'Failed to fetch balances'));
  }
});

// Get accounts - provides account list for frontend (gracefully handles missing credentials)
app.get("/api/accounts", async (req, res, next) => {
  try {
    // Extract userId from query parameter or header
    const userId = req.query.userId || req.headers['x-user-id'];

    if (!userId) {
      return res.status(200).json({ 
        success: false,
        accounts: [],
        message: "No userId provided. Please authenticate." 
      });
    }
    
    // Validate userId
    validators.validateUserId(userId);

    // Retrieve all Plaid items for the user
    const items = await getAllPlaidItems(userId);
    if (!items || items.length === 0) {
      return res.status(200).json({ 
        success: false,
        accounts: [],
        message: "No Plaid connection found. Please connect your bank account."
      });
    }

    // Fetch accounts from all items
    let allAccounts = [];
    for (const item of items) {
      try {
        // Use transactionsSync for fresher balance data (same approach as Rocket Money)
        // Why transactionsSync instead of accountsBalanceGet:
        // - Plaid prioritizes transaction sync endpoints (called more frequently by apps)
        // - Transaction sync has less aggressive caching (updates more often)
        // - Returns both transactions AND current balance in one call
        // - Balance data comes from transaction stream (more up-to-date)
        const syncResponse = await plaidClient.transactionsSync({
          access_token: item.accessToken,
          options: {
            include_personal_finance_category: true
          }
        });
        
        // Extract accounts with fresh balance from sync response
        // transactionsSync returns more up-to-date balance data than accountsBalanceGet
        const accountsWithInstitution = syncResponse.data.accounts.map(account => {
          // Validate account data
          validators.validateAccount(account);
          
          return {
            account_id: account.account_id,
            name: account.name,
            official_name: account.official_name,
            type: account.type,
            subtype: account.subtype,
            mask: account.mask,
            // Primary balance fields
            available_balance: account.balances.available || account.balances.current || 0,
            current_balance: account.balances.current || 0,
            // Full balances object for flexibility
            balances: account.balances, // This balance is FRESH from transaction sync!
            institution_name: item.institutionName,
            institution_id: item.institutionId,
            item_id: item.itemId
          };
        });
        
        allAccounts.push(...accountsWithInstitution);
      } catch (itemError) {
        console.error(`Error getting accounts for item ${item.itemId}:`, itemError);
        // Continue with other items even if one fails
      }
    }

    // Update account balances in Firebase settings/personal collection
    try {
      const updateResult = await updateAccountBalances(userId, allAccounts);
      logger.info('PLAID_ACCOUNTS', 'Persisted balances to Firebase: accounts updated', {});
      logDiagnostic.info('GET_ACCOUNTS', `Persisted balances to Firebase: ${updateResult.updated} accounts updated`);
    } catch (updateError) {
      logger.error('PLAID_ACCOUNTS', 'Failed to persist balances to Firebase', updateError, {});
      logDiagnostic.error('GET_ACCOUNTS', 'Failed to persist balances to Firebase', updateError);
      // Continue anyway - don't fail the request if Firebase update fails
    }

    res.json({
      success: true,
      accounts: allAccounts,
    });
  } catch (error) {
    console.error("Error getting accounts:", error);
    
    // Check if it's already an AppError
    if (error.statusCode) {
      return next(error);
    }
    
    // Handle Plaid-specific errors
    if (error.response?.data) {
      const plaidError = error.response.data;
      return next(createError.plaidError(
        plaidError.error_message || 'Unable to fetch accounts. Please reconnect your bank account.',
        shouldRetryPlaidError(plaidError.error_type)
      ));
    }
    
    // Return graceful error instead of 500
    res.status(200).json({ 
      success: false,
      accounts: [],
      error: "Unable to fetch accounts. Please reconnect your bank account.",
      error_details: error.message
    });
  }
});

// Get transactions for bill matching
app.post("/api/plaid/get_transactions", async (req, res, next) => {
  const endpoint = "/api/plaid/get_transactions";
  logDiagnostic.request(endpoint, req.body);
  
  try {
    const { userId, start_date, end_date } = req.body;

    if (!userId) {
      logger.error('PLAID_SYNC', 'Missing userId in request', null, {});
      logDiagnostic.error('GET_TRANSACTIONS', 'Missing userId in request');
      throw createError.badRequest('userId is required. Please authenticate.', 'MISSING_USER_ID');
    }
    
    // Validate userId
    validators.validateUserId(userId);

    // Retrieve all Plaid items for the user
    const items = await getAllPlaidItems(userId);
    if (!items || items.length === 0) {
      logger.error('PLAID_SYNC', 'No Plaid credentials found for user', null, {});
      logDiagnostic.error('GET_TRANSACTIONS', 'No Plaid credentials found for user');
      throw createError.notFound('No Plaid connection found. Please connect your bank account first.');
    }

    // Default to last 30 days if no dates provided
    const endDate = end_date || new Date().toISOString().split('T')[0];
    const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    logger.info('PLAID_SYNC', 'Fetching transactions from bank connections', { userId, itemCount: items.length });
    logDiagnostic.info('GET_TRANSACTIONS', `Fetching transactions from ${items.length} bank connections using transactionsSync API`);

    // Fetch transactions from all items
    let allTransactions = [];
    let allAccounts = [];
    
    for (const item of items) {
      try {
        // Use transactionsSync instead of transactionsGet for better pending transaction support
        const transactionsResponse = await plaidClient.transactionsSync({
          access_token: item.accessToken,
          options: {
            include_personal_finance_category: true
          }
        });

        // transactionsSync returns different structure:
        // - added: [] (new transactions)
        // - modified: [] (updated transactions)
        // - removed: [] (deleted transaction IDs)
        // - next_cursor: "..." (save for next sync)
        // Combine added + modified for response
        const itemTransactions = [
          ...transactionsResponse.data.added,
          ...transactionsResponse.data.modified
        ];
        
        // Add institution info to each transaction
        const transactionsWithInstitution = itemTransactions.map(tx => ({
          ...tx,
          institution_name: item.institutionName,
          institution_id: item.institutionId,
          item_id: item.itemId
        }));
        
        allTransactions.push(...transactionsWithInstitution);
        
        if (transactionsResponse.data.accounts) {
          const accountsWithInstitution = transactionsResponse.data.accounts.map(account => ({
            ...account,
            institution_name: item.institutionName,
            institution_id: item.institutionId,
            item_id: item.itemId
          }));
          allAccounts.push(...accountsWithInstitution);
        }
      } catch (itemError) {
        logger.error('PLAID_SYNC', 'Failed to fetch transactions for item', itemError, {});
        logDiagnostic.error('GET_TRANSACTIONS', `Failed to fetch transactions for item ${item.itemId}`, itemError);
        // Continue with other items even if one fails
      }
    }

    const txCount = allTransactions.length;
    const totalTx = allTransactions.length;
    logger.info('PLAID_SYNC', 'Successfully fetched transactions from banks', { userId, transactionCount: txCount, bankCount: items.length });
    logDiagnostic.info('GET_TRANSACTIONS', `Successfully fetched ${txCount} transactions from ${items.length} banks via transactionsSync`);
    logDiagnostic.response(endpoint, 200, { 
      success: true, 
      transaction_count: txCount,
      total_transactions: totalTx 
    });

    res.json({
      success: true,
      transactions: allTransactions,
      accounts: allAccounts,
      total_transactions: totalTx
    });
  } catch (error) {
    logger.error('PLAID_SYNC', 'Failed to fetch transactions', error, {});
    logDiagnostic.error('GET_TRANSACTIONS', 'Failed to fetch transactions', error);
    
    // Check if it's already an AppError
    if (error.statusCode) {
      return next(error);
    }
    
    // Provide more detailed error information
    let errorMessage = "Failed to fetch transactions from your bank";
    let statusCode = 500;
    
    if (error.response) {
      // Plaid API error
      const plaidError = error.response.data;
      statusCode = error.response.status;
      
      logDiagnostic.error('GET_TRANSACTIONS', `Plaid API error: ${plaidError.error_code}`, {
        error_code: plaidError.error_code,
        error_type: plaidError.error_type,
        error_message: plaidError.error_message
      });
      
      if (plaidError.error_code === 'ITEM_LOGIN_REQUIRED') {
        errorMessage = "Your bank connection has expired. Please reconnect your account.";
        return next(createError.unauthorized(errorMessage));
      } else if (plaidError.error_code === 'INVALID_ACCESS_TOKEN') {
        errorMessage = "Invalid access token. Please reconnect your bank account.";
        return next(createError.unauthorized(errorMessage));
      } else if (plaidError.error_code === 'PRODUCT_NOT_READY') {
        errorMessage = "Transaction data is not yet available. Please try again in a few moments.";
        return next(createError.plaidError(errorMessage, true));
      } else if (plaidError.error_message) {
        errorMessage = `Bank error: ${plaidError.error_message}`;
        return next(createError.plaidError(errorMessage, shouldRetryPlaidError(plaidError.error_type)));
      }
    }
    
    // Generic error
    next(createError.plaidError(error.message || errorMessage));
  }
});
// Sync transactions to Firebase (includes pending transactions)
app.post("/api/plaid/sync_transactions", async (req, res, next) => {
  const endpoint = "/api/plaid/sync_transactions";
  logDiagnostic.request(endpoint, req.body);
  
  try {
    const { userId, start_date, end_date } = req.body;

    if (!userId) {
      logger.error('PLAID_SYNC', 'Missing userId in request', null, {});
      logDiagnostic.error('SYNC_TRANSACTIONS', 'Missing userId in request');
      throw createError.badRequest('userId is required. Please authenticate.', 'MISSING_USER_ID');
    }
    
    // Validate userId
    validators.validateUserId(userId);
    
    // Set sync status to "syncing"
    await db.collection('users')
      .doc(userId)
      .collection('metadata')
      .doc('sync')
      .set({
        syncStatus: 'syncing',
        lastSyncStart: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

    // Retrieve all Plaid items for the user
    const items = await getAllPlaidItems(userId);
    if (!items || items.length === 0) {
      logger.error('PLAID_SYNC', 'No Plaid credentials found for user', null, {});
      logDiagnostic.error('SYNC_TRANSACTIONS', 'No Plaid credentials found for user');
      throw createError.notFound('No Plaid connection found. Please connect your bank account first.');
    }

    // Default to last 30 days if no dates provided
    const endDate = end_date || new Date().toISOString().split('T')[0];
    const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    logger.info('PLAID_SYNC', 'Syncing transactions from bank connections', { userId, itemCount: items.length });
    logDiagnostic.info('SYNC_TRANSACTIONS', `Syncing transactions from ${items.length} bank connections using transactionsSync API`);

    // Fetch all transaction changes from all items
    let allAdded = [];
    let allModified = [];
    let allRemoved = [];
    
    for (const item of items) {
      try {
        // Get last cursor from the item document for incremental sync
        const lastCursor = item.cursor || null;

        logger.info('PLAID_SYNC', 'Syncing item (), cursor:', {});
        logDiagnostic.info('SYNC_TRANSACTIONS', `Syncing item ${item.itemId} (${item.institutionName}), cursor: ${lastCursor ? 'exists' : 'none'}`);

        // Fetch all transaction changes using transactionsSync with pagination
        let itemAdded = [];
        let itemModified = [];
        let itemRemoved = [];
        let hasMore = true;
        let cursor = lastCursor;
        
        // Map to store account information by account_id for quick lookup
        let accountsMap = {};

        while (hasMore) {
          const response = await plaidClient.transactionsSync({
            access_token: item.accessToken,
            cursor: cursor,
            options: {
              include_personal_finance_category: true
            }
          });
          
          // Build accounts map from response for mask lookup
          if (response.data.accounts && response.data.accounts.length > 0) {
            response.data.accounts.forEach(account => {
              accountsMap[account.account_id] = account;
            });
          }
          
          // Add institution info and mask to transactions
          const addedWithInstitution = response.data.added.map(tx => ({
            ...tx,
            institution_name: item.institutionName,
            institution_id: item.institutionId,
            item_id: item.itemId,
            mask: accountsMap[tx.account_id]?.mask || null
          }));
          
          const modifiedWithInstitution = response.data.modified.map(tx => ({
            ...tx,
            institution_name: item.institutionName,
            institution_id: item.institutionId,
            item_id: item.itemId,
            mask: accountsMap[tx.account_id]?.mask || null
          }));
          
          itemAdded.push(...addedWithInstitution);
          itemModified.push(...modifiedWithInstitution);
          itemRemoved.push(...response.data.removed);
          
          cursor = response.data.next_cursor;
          hasMore = response.data.has_more;
          
          logger.info('PLAID_SYNC', 'Item : added, modified, removed, hasMore:', {});
          logDiagnostic.info('SYNC_TRANSACTIONS', `Item ${item.itemId}: ${response.data.added.length} added, ${response.data.modified.length} modified, ${response.data.removed.length} removed, hasMore: ${hasMore}`);
        }

        // Save new cursor for this item
        const itemRef = db.collection('users').doc(userId).collection('plaid_items').doc(item.itemId);
        await itemRef.update({
          cursor: cursor,
          lastSyncedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        allAdded.push(...itemAdded);
        allModified.push(...itemModified);
        allRemoved.push(...itemRemoved);
        
        logger.info('PLAID_SYNC', 'Item sync complete: added, modified, removed', {});
        logDiagnostic.info('SYNC_TRANSACTIONS', `Item ${item.itemId} sync complete: ${itemAdded.length} added, ${itemModified.length} modified, ${itemRemoved.length} removed`);
      } catch (itemError) {
        logger.error('PLAID_SYNC', 'Failed to sync item', itemError, {});
        logDiagnostic.error('SYNC_TRANSACTIONS', `Failed to sync item ${item.itemId}`, itemError);
        // Continue with other items even if one fails
      }
    }

    const plaidTransactions = [...allAdded, ...allModified];
    const txCount = plaidTransactions.length;
    const totalTx = plaidTransactions.length;
    
    logger.info('PLAID_SYNC', 'Fetched transactions from Plaid', { userId, added: allAdded.length, modified: allModified.length, removed: allRemoved.length });
    logDiagnostic.info('SYNC_TRANSACTIONS', `Fetched total: ${allAdded.length} new, ${allModified.length} modified, ${allRemoved.length} removed transactions from Plaid`);

    // Load existing manual pending charges for deduplication
    const transactionsRef = db.collection('users').doc(userId).collection('transactions');
    const manualPendingSnapshot = await transactionsRef
      .where('source', '==', 'manual')
      .where('pending', '==', true)
      .get();
    
    const manualPendingCharges = [];
    manualPendingSnapshot.forEach(doc => {
      manualPendingCharges.push({ id: doc.id, ...doc.data() });
    });

    logger.info('PLAID_SYNC', 'Found manual pending charges for deduplication check', {});
    logDiagnostic.info('SYNC_TRANSACTIONS', `Found ${manualPendingCharges.length} manual pending charges for deduplication check`);

    // Get existing transactions for duplicate detection
    const existingSnapshot = await transactionsRef.get();
    const existingTransactions = existingSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // Sync transactions to Firebase
    let addedCount = 0;
    let updatedCount = 0;
    let pendingCount = 0;
    let deduplicatedCount = 0;
    let skippedCount = 0;

    // Prepare atomic operations
    const operations = [];
    const cursorsToUpdate = new Map();

    for (const plaidTx of plaidTransactions) {
      try {
        // Validate transaction data
        validateTransactionConsistency(plaidTx);
        
        const txDocRef = transactionsRef.doc(plaidTx.transaction_id);
        
        // Check if transaction exists
        const existingTx = existingTransactions.find(t => t.transaction_id === plaidTx.transaction_id);
        
        // Check for duplicates using consistency validator
        const duplicate = checkDuplicateTransaction(plaidTx, existingTransactions);
        if (duplicate && duplicate.transaction_id !== plaidTx.transaction_id) {
          logger.warn('TRANSACTION_SYNC', 'Duplicate transaction skipped', { 
            transaction: plaidTx.transaction_id,
            duplicate: duplicate.transaction_id 
          });
          skippedCount++;
          continue;
        }
        
        // Prepare transaction data in our format
        const isPending = Boolean(plaidTx.pending);
        
        const transactionData = {
          transaction_id: plaidTx.transaction_id,
          account_id: plaidTx.account_id,
          amount: -plaidTx.amount,  // FLIP SIGN: Plaid positive=expense, we need negative=expense
          date: plaidTx.date,
          name: plaidTx.name,
          merchant_name: plaidTx.merchant_name || plaidTx.name,
          category: autoCategorizTransaction(plaidTx.merchant_name || plaidTx.name),
          pending: isPending,
          payment_channel: plaidTx.payment_channel || 'other',
          source: 'plaid',
          mask: plaidTx.mask || null,
          institution_name: plaidTx.institution_name || null,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          lastSyncedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (isPending) {
          pendingCount++;
        }

        // Check for duplicate manual pending charges
        const matchingManualCharge = manualPendingCharges.find(manual => {
          // Skip if Plaid transaction is still pending
          if (plaidTx.pending) {
            return false;
          }
          
          const accountMatch = manual.account_id === plaidTx.account_id || manual.account === plaidTx.account_id;
          const amountMatch = Math.abs(manual.amount - (-plaidTx.amount)) < 0.01;
          
          const manualDate = new Date(manual.date);
          const plaidDate = new Date(plaidTx.date);
          const daysDiff = Math.abs((manualDate - plaidDate) / (1000 * 60 * 60 * 24));
          const dateMatch = daysDiff <= 3;
          
          const manualName = (manual.merchant_name || manual.name || manual.description || '').toLowerCase().trim();
          const plaidName = (plaidTx.merchant_name || plaidTx.name || '').toLowerCase().trim();
          
          const exactMatch = manualName === plaidName;
          const containsMatch = manualName.includes(plaidName) || plaidName.includes(manualName);
          const prefixMatch = manualName.length > 5 && plaidName.length > 5 && 
                              manualName.substring(0, 5) === plaidName.substring(0, 5);
          
          const similarity = calculateSimilarity(manualName, plaidName);
          const fuzzyMatch = similarity > 0.6;
          
          const nameMatch = exactMatch || containsMatch || prefixMatch || fuzzyMatch;
          
          return accountMatch && amountMatch && dateMatch && nameMatch;
        });

        if (matchingManualCharge) {
          const manualDocRef = transactionsRef.doc(matchingManualCharge.id);
          operations.push(createOperation('delete', manualDocRef));
          deduplicatedCount++;
          
          logDiagnostic.info('DEDUPE', 
            `Deleting manual pending: "${matchingManualCharge.merchant_name}" (${matchingManualCharge.amount}) ` +
            `matched with Plaid posted: "${plaidTx.merchant_name || plaidTx.name}" (${plaidTx.amount})`
          );
          
          const index = manualPendingCharges.indexOf(matchingManualCharge);
          if (index > -1) {
            manualPendingCharges.splice(index, 1);
          }
        }

        if (!existingTx) {
          operations.push(createOperation('set', txDocRef, transactionData));
          addedCount++;
        } else {
          operations.push(createOperation('update', txDocRef, transactionData));
          updatedCount++;
        }
      } catch (validationError) {
        logger.warn('TRANSACTION_SYNC', 'Invalid transaction skipped', { 
          transaction: plaidTx.transaction_id, 
          error: validationError.message 
        });
        skippedCount++;
      }
    }

    // Handle removed transactions from Plaid
    for (const removedTx of allRemoved) {
      const removedDocRef = transactionsRef.doc(removedTx.transaction_id);
      const existingRemoved = existingTransactions.find(t => t.transaction_id === removedTx.transaction_id);
      
      if (existingRemoved && existingRemoved.source === 'plaid') {
        operations.push(createOperation('delete', removedDocRef));
        logger.info('PLAID_SYNC', 'Removing transaction:', {});
        logDiagnostic.info('SYNC_TRANSACTIONS', `Removing transaction: ${removedTx.transaction_id}`);
      }
    }

    // Update cursors for each item atomically
    for (const item of items) {
      const itemRef = db.collection('users').doc(userId).collection('plaid_items').doc(item.itemId);
      // Note: cursors were already saved in the loop above, this just ensures they're in the atomic transaction
    }

    // Add metadata update to atomic operations
    const metadataRef = db.collection('users')
      .doc(userId)
      .collection('metadata')
      .doc('sync');
    
    operations.push(createOperation('set', metadataRef, {
      lastPlaidSync: admin.firestore.FieldValue.serverTimestamp(),
      lastPlaidSyncDate: new Date().toISOString(),
      syncStatus: 'idle',
      lastSyncError: null,
      transactionCount: existingTransactions.length + addedCount - allRemoved.length
    }));

    // Execute all operations atomically
    if (operations.length > 0) {
      await atomicTransaction(operations);
      
      logger.info('PLAID_SYNC', 'Synced transactions atomically', { 
        userId, 
        added: addedCount, 
        updated: updatedCount, 
        pending: pendingCount, 
        deduplicated: deduplicatedCount, 
        removed: allRemoved.length,
        skipped: skippedCount
      });
      logDiagnostic.info('SYNC_TRANSACTIONS', `Synced atomically: ${addedCount} new, ${updatedCount} updated, ${pendingCount} pending, ${deduplicatedCount} deduplicated, ${allRemoved.length} removed, ${skippedCount} skipped`);
    }
    
    logDiagnostic.response(endpoint, 200, { 
      success: true, 
      added: addedCount,
      updated: updatedCount,
      pending: pendingCount,
      deduplicated: deduplicatedCount,
      removed: allRemoved.length,
      skipped: skippedCount
    });

    res.json({
      success: true,
      added: addedCount,
      updated: updatedCount,
      pending: pendingCount,
      deduplicated: deduplicatedCount,
      removed: allRemoved.length,
      skipped: skippedCount,
      total: txCount,
      message: `Synced ${addedCount} new transactions (${pendingCount} pending${deduplicatedCount > 0 ? `, ${deduplicatedCount} deduplicated` : ''}${allRemoved.length > 0 ? `, ${allRemoved.length} removed` : ''}${skippedCount > 0 ? `, ${skippedCount} skipped` : ''})`
    });
  } catch (error) {
    logger.error('PLAID_SYNC', 'Failed to sync transactions', error, {});
    logDiagnostic.error('SYNC_TRANSACTIONS', 'Failed to sync transactions', error);

    // Mark sync as failed
    try {
      await db.collection('users')
        .doc(req.body.userId)
        .collection('metadata')
        .doc('sync')
        .set({
          syncStatus: 'error',
          lastSyncError: error.message,
          lastErrorTime: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (metadataError) {
      logger.error('PLAID_SYNC', 'Could not update error status:', metadataError, {});
      logDiagnostic.error('SYNC_TRANSACTIONS', 'Could not update error status:', metadataError);
    }
    
    // Check if it's already an AppError
    if (error.statusCode) {
      return next(error);
    }
    
    let errorMessage = "Failed to sync transactions from your bank";
    
    if (error.response) {
      const plaidError = error.response.data;
      
      logDiagnostic.error('SYNC_TRANSACTIONS', `Plaid API error: ${plaidError.error_code}`, {
        error_code: plaidError.error_code,
        error_type: plaidError.error_type,
        error_message: plaidError.error_message
      });
      
      if (plaidError.error_code === 'ITEM_LOGIN_REQUIRED') {
        errorMessage = "Your bank connection has expired. Please reconnect your account.";
        return next(createError.unauthorized(errorMessage));
      } else if (plaidError.error_code === 'INVALID_ACCESS_TOKEN') {
        errorMessage = "Invalid access token. Please reconnect your bank account.";
        return next(createError.unauthorized(errorMessage));
      } else if (plaidError.error_code === 'PRODUCT_NOT_READY') {
        errorMessage = "Transaction data is not yet available. Please try again in a few moments.";
        return next(createError.plaidError(errorMessage, true));
      } else if (plaidError.error_message) {
        errorMessage = `Bank error: ${plaidError.error_message}`;
        return next(createError.plaidError(errorMessage, shouldRetryPlaidError(plaidError.error_type)));
      }
    }
    
    // Generic error
    next(createError.plaidError(error.message || errorMessage));
  }
});

// Force Plaid to check the bank immediately
app.post("/api/plaid/refresh_transactions", async (req, res, next) => {
  const endpoint = "/api/plaid/refresh_transactions";
  logDiagnostic.request(endpoint, req.body);
  
  try {
    const { userId } = req.body;

    if (!userId) {
      logger.error('REFRESH_TRANSACTIONS', 'Missing userId in request', null, {});
      logDiagnostic.error('REFRESH_TRANSACTIONS', 'Missing userId in request');
      throw createError.badRequest('userId is required', 'MISSING_USER_ID');
    }
    
    // Validate userId
    validators.validateUserId(userId);

    const items = await getAllPlaidItems(userId);
    if (!items || items.length === 0) {
      logger.error('REFRESH_TRANSACTIONS', 'No Plaid credentials found for user', null, {});
      logDiagnostic.error('REFRESH_TRANSACTIONS', 'No Plaid credentials found for user');
      throw createError.notFound('No Plaid connection found. Please connect your bank account first.');
    }

    logger.info('REFRESH_TRANSACTIONS', 'Requesting Plaid to refresh transactions for bank connection', {});
    logDiagnostic.info('REFRESH_TRANSACTIONS', `Requesting Plaid to refresh transactions for ${items.length} bank connections`);

    const refreshResults = [];
    for (const item of items) {
      try {
        const response = await plaidClient.transactionsSync({
          access_token: item.accessToken,
          options: {
            include_personal_finance_category: true,
            count: 500
          }
        });

        refreshResults.push({
          item_id: item.itemId,
          institution_name: item.institutionName,
          request_id: response.data.request_id,
          success: true
        });
        
        logDiagnostic.info('REFRESH_TRANSACTIONS', `Refresh request sent for ${item.institutionName} (${item.itemId})`, {
          request_id: response.data.request_id
        });
      } catch (itemError) {
        logger.error('REFRESH_TRANSACTIONS', 'Failed to refresh item', itemError, {});
        logDiagnostic.error('REFRESH_TRANSACTIONS', `Failed to refresh item ${item.itemId}`, itemError);
        refreshResults.push({
          item_id: item.itemId,
          institution_name: item.institutionName,
          success: false,
          error: itemError.message
        });
      }
    }

    const successCount = refreshResults.filter(r => r.success).length;
    
    logDiagnostic.response(endpoint, 200, { 
      success: true,
      refreshed_count: successCount,
      total_count: items.length
    });

    res.json({
      success: true,
      message: `Plaid is checking ${successCount} of ${items.length} banks now. New transactions should appear in 1-5 minutes.`,
      results: refreshResults
    });
  } catch (error) {
    logger.error('REFRESH_TRANSACTIONS', 'Failed to refresh transactions', error, {});
    logDiagnostic.error('REFRESH_TRANSACTIONS', 'Failed to refresh transactions', error);
    
    // Check if it's already an AppError
    if (error.statusCode) {
      return next(error);
    }
    
    // Handle Plaid-specific errors
    if (error.response?.data) {
      const plaidError = error.response.data;
      return next(createError.plaidError(
        plaidError.error_message || 'Plaid API error',
        shouldRetryPlaidError(plaidError.error_type)
      ));
    }
    
    // Generic error
    next(createError.plaidError(error.message || 'Failed to refresh transactions'));
  }
});

// Webhook endpoint for Plaid
app.post("/api/plaid/webhook", async (req, res, next) => {
  const endpoint = "/api/plaid/webhook";
  logDiagnostic.request(endpoint, req.body);
  
  try {
    const { webhook_type, webhook_code, item_id, error } = req.body;
    
    logDiagnostic.info('WEBHOOK', `Received webhook: ${webhook_type} - ${webhook_code}`, {
      item_id,
      has_error: !!error
    });
    
    if (webhook_type === 'TRANSACTIONS') {
      if (webhook_code === 'DEFAULT_UPDATE' || 
          webhook_code === 'INITIAL_UPDATE' ||
          webhook_code === 'HISTORICAL_UPDATE') {
        
        logger.info('WEBHOOK', 'Processing transaction update webhook', {});
        logDiagnostic.info('WEBHOOK', 'Processing transaction update webhook', { item_id });
        
        const itemsSnapshot = await db.collectionGroup('plaid_items')
          .where('itemId', '==', item_id)
          .limit(1)
          .get();
        
        if (!itemsSnapshot.empty) {
          const itemDoc = itemsSnapshot.docs[0];
          const itemData = itemDoc.data();
          const userId = itemDoc.ref.parent.parent.id;
          
          logDiagnostic.info('WEBHOOK', `Found item for user ${userId}`, {
            institution: itemData.institutionName
          });
          
          const syncResponse = await plaidClient.transactionsSync({
            access_token: itemData.accessToken,
            cursor: itemData.cursor || undefined,
            options: {
              include_personal_finance_category: true
            }
          });

          // ✅ ADD LOGGING HERE TO SEE WHAT PLAID SENDS:
          logDiagnostic.info('WEBHOOK', `Raw Plaid response for ${itemData.institutionName}:`, {
            total_added: syncResponse.data.added.length,
            total_modified: syncResponse.data.modified.length,
            total_removed: syncResponse.data.removed.length,
            pending_count: syncResponse.data.added.filter(tx => tx.pending === true).length
          });

          // Log first few transactions to see structure
          if (syncResponse.data.added.length > 0) {
            syncResponse.data.added.slice(0, 3).forEach(tx => {
              logDiagnostic.info('WEBHOOK', `Transaction sample:`, {
                merchant: tx.merchant_name || tx.name,
                amount: tx.amount,
                pending: tx.pending,
                date: tx.date,
                account_id: tx.account_id
              });
            });
          }
          
          logDiagnostic.info('WEBHOOK', 'Received transaction data from Plaid', {
            accounts: syncResponse.data.accounts.length,
            added: syncResponse.data.added.length,
            modified: syncResponse.data.modified.length,
            removed: syncResponse.data.removed.length
          });
          
          const userDocRef = db.collection('users').doc(userId);
          const userDoc = await userDocRef.get();
          
          if (!userDoc.exists) {
            logger.info('WEBHOOK', 'Initializing user document for', {});
            logDiagnostic.info('WEBHOOK', `Initializing user document for ${userId}`);
            await userDocRef.set({
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
          }
          
          const accountsMap = {};
          if (syncResponse.data.accounts && syncResponse.data.accounts.length > 0) {
            syncResponse.data.accounts.forEach(account => {
              accountsMap[account.account_id] = account;
            });
          }
          
          const allTransactions = [
            ...syncResponse.data.added,
            ...syncResponse.data.modified
          ];
          
          if (allTransactions.length > 0) {
            let batch = db.batch();
            let batchCount = 0;
            let totalSaved = 0;
            
            for (const transaction of allTransactions) {
              const transactionRef = userDocRef
                .collection('transactions')
                .doc(transaction.transaction_id);
              
              const txMask = accountsMap[transaction.account_id]?.mask || null;
              const txInstitution = itemData.institutionName;
              
              batch.set(transactionRef, {
                ...transaction,
                amount: -transaction.amount,
                category: autoCategorizTransaction(transaction.merchant_name || transaction.name),
                item_id: item_id,
                institutionName: txInstitution,
                institution_name: txInstitution,
                mask: txMask,
                synced_at: admin.firestore.FieldValue.serverTimestamp(),
                webhook_code: webhook_code
              }, { merge: true });
              
              batchCount++;
              
              if (batchCount >= 500) {
                await batch.commit();
                totalSaved += batchCount;
                logger.info('WEBHOOK', 'Committed batch of transactions', {});
                logDiagnostic.info('WEBHOOK', `Committed batch of ${batchCount} transactions`);
                batch = db.batch();
                batchCount = 0;
              }
            }
            
            if (batchCount > 0) {
              await batch.commit();
              totalSaved += batchCount;
            }
            
            logger.info('WEBHOOK', 'Successfully saved transactions to Firebase', {});
            logDiagnostic.info('WEBHOOK', `Successfully saved ${totalSaved} transactions to Firebase`);
          }
          
          if (syncResponse.data.removed.length > 0) {
            let batch = db.batch();
            let batchCount = 0;
            
            for (const removedTx of syncResponse.data.removed) {
              const transactionRef = userDocRef
                .collection('transactions')
                .doc(removedTx.transaction_id);
              
              batch.delete(transactionRef);
              batchCount++;
              
              if (batchCount >= 500) {
                await batch.commit();
                logger.info('WEBHOOK', 'Deleted batch of transactions', {});
                logDiagnostic.info('WEBHOOK', `Deleted batch of ${batchCount} transactions`);
                batch = db.batch();
                batchCount = 0;
              }
            }
            
            if (batchCount > 0) {
              await batch.commit();
            }
            
            logger.info('WEBHOOK', 'Removed transactions from Firebase', {});
            logDiagnostic.info('WEBHOOK', `Removed ${syncResponse.data.removed.length} transactions from Firebase`);
          }
          
          await itemDoc.ref.set({
            cursor: syncResponse.data.next_cursor,
            lastWebhookUpdate: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
          
          logDiagnostic.info('WEBHOOK', 'Successfully processed webhook update', {
            saved: allTransactions.length,
            removed: syncResponse.data.removed.length,
            cursor_updated: true
          });
        } else {
          logger.info('WEBHOOK', 'No user found for item_id', {});
          logDiagnostic.info('WEBHOOK', 'No user found for item_id', { item_id });
        }
      }
    }
    
    if (webhook_type === 'ITEM' && webhook_code === 'ERROR') {
      logDiagnostic.error('WEBHOOK', 'Item error reported by Plaid', {
        item_id,
        error
      });
      
      const itemsSnapshot = await db.collectionGroup('plaid_items')
        .where('itemId', '==', item_id)
        .limit(1)
        .get();
      
      if (!itemsSnapshot.empty) {
        const errorCode = error?.error_code;
        const needsReauth = errorCode === 'ITEM_LOGIN_REQUIRED' || 
                           errorCode === 'INVALID_CREDENTIALS' ||
                           errorCode === 'ITEM_LOCKED' ||
                           errorCode === 'ITEM_NO_LONGER_AVAILABLE';
        
        await itemsSnapshot.docs[0].ref.set({
          status: needsReauth ? 'NEEDS_REAUTH' : 'error',
          error: error,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        logDiagnostic.info('WEBHOOK', `Item marked as ${needsReauth ? 'NEEDS_REAUTH' : 'error'}`, {
          item_id,
          error_code: errorCode
        });
      }
    }
    
    logDiagnostic.response(endpoint, 200, { success: true });
    res.json({ success: true });
    
  } catch (error) {
    if (error.code === 9) {
      logDiagnostic.error('WEBHOOK', 'FAILED_PRECONDITION error - Document structure may not exist', {
        message: error.message,
        code: error.code,
        item_id: req.body.item_id,
        webhook_type: req.body.webhook_type,
        webhook_code: req.body.webhook_code
      });
    } else {
      logger.error('WEBHOOK', 'Error processing webhook', error, {});
      logDiagnostic.error('WEBHOOK', 'Error processing webhook', error);
    }
    
    // Check if it's already an AppError
    if (error.statusCode) {
      return next(error);
    }
    
    // Handle Firebase errors
    if (isFirebaseError(error)) {
      return next(createError.firebaseError(error.message || 'Firebase error processing webhook'));
    }
    
    // Return 200 to Plaid to prevent retries for internal errors
    res.status(200).json({ 
      success: false, 
      error: 'Internal error processing webhook' 
    });
  }
});

// Health check endpoints
app.get("/api/plaid/health", async (req, res, next) => {
  const endpoint = "/api/plaid/health";
  logger.info('HEALTH_CHECK', 'Running Plaid health check', {});
  logDiagnostic.info('HEALTH_CHECK', 'Running Plaid health check');
  
  try {
    const healthStatus = {
      status: 'unknown',
      timestamp: new Date().toISOString(),
      checks: {
        credentials: { status: 'unknown', message: '' },
        api_connectivity: { status: 'unknown', message: '' },
        configuration: { status: 'unknown', message: '' }
      },
      environment: {
        plaid_env: PLAID_ENV,
        has_client_id: !!PLAID_CLIENT_ID && PLAID_CLIENT_ID !== 'demo_client_id',
        has_secret: !!PLAID_SECRET && PLAID_SECRET !== 'demo_secret',
        node_env: process.env.NODE_ENV || 'development'
      }
    };

    if (!PLAID_CLIENT_ID || PLAID_CLIENT_ID === 'demo_client_id') {
      healthStatus.checks.credentials.status = 'error';
      healthStatus.checks.credentials.message = 'PLAID_CLIENT_ID not configured or using demo value';
      logger.error('HEALTH_CHECK', 'Invalid PLAID_CLIENT_ID configuration', null, {});
      logDiagnostic.error('HEALTH_CHECK', 'Invalid PLAID_CLIENT_ID configuration');
    } else if (!PLAID_SECRET || PLAID_SECRET === 'demo_secret') {
      healthStatus.checks.credentials.status = 'error';
      healthStatus.checks.credentials.message = 'PLAID_SECRET not configured or using demo value';
      logger.error('HEALTH_CHECK', 'Invalid PLAID_SECRET configuration', null, {});
      logDiagnostic.error('HEALTH_CHECK', 'Invalid PLAID_SECRET configuration');
    } else {
      healthStatus.checks.credentials.status = 'ok';
      healthStatus.checks.credentials.message = 'Plaid credentials configured';
    }

    if (PLAID_ENV === 'sandbox' || PLAID_ENV === 'development' || PLAID_ENV === 'production') {
      healthStatus.checks.configuration.status = 'ok';
      healthStatus.checks.configuration.message = `Environment set to: ${PLAID_ENV}`;
    } else {
      healthStatus.checks.configuration.status = 'warning';
      healthStatus.checks.configuration.message = `Unknown PLAID_ENV: ${PLAID_ENV}`;
    }

    if (healthStatus.checks.credentials.status === 'ok') {
      try {
        logger.info('HEALTH_CHECK', 'Testing Plaid API connectivity', {});
        logDiagnostic.info('HEALTH_CHECK', 'Testing Plaid API connectivity');
        
        // Health check only tests basic connectivity with minimal products
        const testRequest = {
          user: {
            client_user_id: 'health-check-test',
          },
          client_name: "Smart Money Tracker Health Check",
          products: ["auth"], // Minimal product for health check only
          country_codes: ["US"],
          language: "en",
        };

        const testResponse = await plaidClient.linkTokenCreate(testRequest);
        
        if (testResponse.data.link_token) {
          healthStatus.checks.api_connectivity.status = 'ok';
          healthStatus.checks.api_connectivity.message = 'Successfully connected to Plaid API';
          logger.info('HEALTH_CHECK', 'Plaid API connectivity verified', {});
          logDiagnostic.info('HEALTH_CHECK', 'Plaid API connectivity verified');
        } else {
          healthStatus.checks.api_connectivity.status = 'error';
          healthStatus.checks.api_connectivity.message = 'Received response but no link token';
          logger.error('HEALTH_CHECK', 'Invalid response from Plaid API', null, {});
          logDiagnostic.error('HEALTH_CHECK', 'Invalid response from Plaid API');
        }
      } catch (error) {
        healthStatus.checks.api_connectivity.status = 'error';
        healthStatus.checks.api_connectivity.message = error.message || 'Failed to connect to Plaid API';
        
        if (error.response?.data?.error_code) {
          healthStatus.checks.api_connectivity.error_code = error.response.data.error_code;
          healthStatus.checks.api_connectivity.error_type = error.response.data.error_type;
        }
        
        logger.error('HEALTH_CHECK', 'Failed to connect to Plaid API', error, {});
        logDiagnostic.error('HEALTH_CHECK', 'Failed to connect to Plaid API', error);
      }
    } else {
      healthStatus.checks.api_connectivity.status = 'skipped';
      healthStatus.checks.api_connectivity.message = 'Skipped due to invalid credentials';
    }

    const allChecks = Object.values(healthStatus.checks);
    if (allChecks.every(check => check.status === 'ok')) {
      healthStatus.status = 'healthy';
    } else if (allChecks.some(check => check.status === 'error')) {
      healthStatus.status = 'unhealthy';
    } else {
      healthStatus.status = 'degraded';
    }

    logger.info('HEALTH_CHECK', 'Health check completed:', {});
    logDiagnostic.info('HEALTH_CHECK', `Health check completed: ${healthStatus.status}`);
    logDiagnostic.response(endpoint, 200, { status: healthStatus.status });

    res.json(healthStatus);
  } catch (error) {
    logger.error('HEALTH_CHECK', 'Health check failed', error, {});
    logDiagnostic.error('HEALTH_CHECK', 'Health check failed', error);
    
    // Check if it's already an AppError
    if (error.statusCode) {
      return next(error);
    }
    
    // Generic error
    next(createError.plaidError(error.message || 'Health check failed'));
  }
});

app.post("/api/plaid/health_check", async (req, res, next) => {
  const endpoint = "/api/plaid/health_check";
  logDiagnostic.request(endpoint, req.body);
  
  try {
    const { userId } = req.body;

    if (!userId) {
      logger.error('HEALTH_CHECK_USER', 'Missing userId in request', null, {});
      logDiagnostic.error('HEALTH_CHECK_USER', 'Missing userId in request');
      throw createError.badRequest('userId is required', 'MISSING_USER_ID');
    }
    
    // Validate userId
    validators.validateUserId(userId);

    logger.info('HEALTH_CHECK_USER', 'Checking connection health for user:', {});
    logDiagnostic.info('HEALTH_CHECK_USER', `Checking connection health for user: ${userId}`);

    const itemsSnapshot = await db
      .collection('users')
      .doc(userId)
      .collection('plaid_items')
      .get();

    if (itemsSnapshot.empty) {
      logger.info('HEALTH_CHECK_USER', 'No Plaid items found for user', {});
      logDiagnostic.info('HEALTH_CHECK_USER', 'No Plaid items found for user');
      return res.json({
        status: 'no_connections',
        message: 'No bank connections found',
        items: []
      });
    }

    const items = itemsSnapshot.docs.map(doc => ({
      itemId: doc.id,
      ...doc.data()
    }));

    logger.info('HEALTH_CHECK_USER', 'Found Plaid items', {});
    logDiagnostic.info('HEALTH_CHECK_USER', `Found ${items.length} Plaid items`);

    const itemStatuses = items.map(item => ({
      itemId: item.itemId,
      institutionName: item.institutionName || 'Unknown Bank',
      status: item.status || 'active',
      needsReauth: item.status === 'NEEDS_REAUTH' || item.status === 'error',
      error: item.error || null,
      lastUpdated: item.updatedAt || item.createdAt
    }));

    const needsReauthCount = itemStatuses.filter(item => item.needsReauth).length;
    const healthyCount = itemStatuses.filter(item => !item.needsReauth).length;

    const overallStatus = needsReauthCount > 0 ? 'needs_reauth' : 'healthy';

    const response = {
      status: overallStatus,
      message: needsReauthCount > 0 
        ? `${needsReauthCount} bank connection(s) need reconnection`
        : 'All bank connections are healthy',
      items: itemStatuses,
      summary: {
        total: items.length,
        healthy: healthyCount,
        needsReauth: needsReauthCount
      }
    };

    logger.info('HEALTH_CHECK_USER', 'Health check complete:', {});
    logDiagnostic.info('HEALTH_CHECK_USER', `Health check complete:`, response.summary);
    logDiagnostic.response(endpoint, 200, { status: overallStatus });

    res.json(response);
  } catch (error) {
    logger.error('HEALTH_CHECK_USER', 'Health check failed', error, {});
    logDiagnostic.error('HEALTH_CHECK_USER', 'Health check failed', error);
    
    // Check if it's already an AppError
    if (error.statusCode) {
      return next(error);
    }
    
    // Handle Firebase errors
    if (isFirebaseError(error)) {
      return next(createError.firebaseError(error.message || 'Firebase error during health check'));
    }
    
    // Generic error
    next(createError.plaidError(error.message || 'Health check failed'));
  }
});

app.post('/api/plaid/reset_cursors', async (req, res, next) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      throw createError.badRequest('userId is required', 'MISSING_USER_ID');
    }
    
    // Validate userId
    validators.validateUserId(userId);
    
    logger.info('RESET_CURSORS', 'Resetting sync cursors for user:', {});
    logDiagnostic.info('RESET_CURSORS', `Resetting sync cursors for user: ${userId}`);
    
    const plaidItemsRef = db.collection('users').doc(userId).collection('plaid_items');
    const snapshot = await plaidItemsRef.get();
    
    if (snapshot.empty) {
      logger.info('RESET_CURSORS', 'No plaid_items found for user', {});
      logDiagnostic.info('RESET_CURSORS', 'No plaid_items found for user');
      return res.json({ success: true, reset_count: 0, message: 'No items to reset' });
    }
    
    const batch = db.batch();
    let resetCount = 0;
    
    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, { 
        cursor: admin.firestore.FieldValue.delete() 
      });
      resetCount++;
      logger.info('RESET_CURSORS', 'Reset cursor for item:', {});
      logDiagnostic.info('RESET_CURSORS', `Reset cursor for item: ${doc.id}`);
    });
    
    await batch.commit();
    
    logger.info('RESET_CURSORS', 'Successfully reset cursors', {});
    logDiagnostic.info('RESET_CURSORS', `Successfully reset ${resetCount} cursors`);
    
    res.json({ 
      success: true, 
      reset_count: resetCount,
      message: `Reset ${resetCount} sync cursor(s). Next sync will fetch all transactions.`
    });
    
  } catch (error) {
    logger.error('RESET_CURSORS', 'Failed to reset cursors', error, {});
    logDiagnostic.error('RESET_CURSORS', 'Failed to reset cursors', error);
    
    // Check if it's already an AppError
    if (error.statusCode) {
      return next(error);
    }
    
    // Handle Firebase errors
    if (isFirebaseError(error)) {
      return next(createError.firebaseError(error.message || 'Firebase error resetting cursors'));
    }
    
    // Generic error
    next(createError.firebaseError(error.message || 'Failed to reset cursors'));
  }
});

// CORRECTED VERSION - Replace lines 1894-1957 with this:

app.put("/api/transactions/:transactionId", async (req, res, next) => {
  const endpoint = `/api/transactions/${req.params.transactionId}`;
  logDiagnostic.request(endpoint, req.body);
  
  try {
    const { transactionId } = req.params;
    const { userId, merchant_name, amount, date, category, notes } = req.body;
    
    if (!userId) {
      throw createError.badRequest('userId is required', 'MISSING_USER_ID');
    }
    
    // Validate userId
    validators.validateUserId(userId);
    
    const transactionRef = db
      .collection('users')
      .doc(userId)
      .collection('transactions')
      .doc(transactionId);
      
    const transactionDoc = await transactionRef.get();
    
    if (!transactionDoc.exists) {
      throw createError.notFound('Transaction not found');
    }
    
    const existingTransaction = transactionDoc.data();
    
    // Check if trying to edit protected fields on Plaid transactions
    if (existingTransaction.source === 'plaid') {
      if (merchant_name !== undefined || amount !== undefined || 
          date !== undefined || notes !== undefined) {
        throw createError.badRequest(
          'Can only edit category for Plaid transactions.',
          'PLAID_READ_ONLY'
        );
      }
    }
    
    // Build updates object
    const updates = {
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    };
    
    if (merchant_name !== undefined) updates.merchant_name = merchant_name;
    if (amount !== undefined) updates.amount = amount;
    if (date !== undefined) updates.date = date;
    if (category !== undefined) {
      updates.category = category;
      updates.category_override = true;
    }
    if (notes !== undefined) updates.notes = notes;
    
    await transactionRef.update(updates);
    
    logger.info('UPDATE_TRANSACTION', 'Updated transaction', {});
    logDiagnostic.info('UPDATE_TRANSACTION', `Updated transaction ${transactionId}`);
    logDiagnostic.response(endpoint, 200, { success: true });
    
    res.json({
      success: true,
      message: "Transaction updated successfully"
    });
    
  } catch (error) {
    logger.error('UPDATE_TRANSACTION', 'Update failed', error, {});
    logDiagnostic.error('UPDATE_TRANSACTION', 'Update failed', error);
    
    // Check if it's already an AppError
    if (error.statusCode) {
      return next(error);
    }
    
    // Handle Firebase errors
    if (isFirebaseError(error)) {
      return next(createError.firebaseError(error.message || 'Firebase error updating transaction'));
    }
    
    // Generic error
    next(createError.firebaseError(error.message || 'Failed to update transaction'));
  }
});

// Bulk categorize transactions
app.post("/api/transactions/bulk-categorize", async (req, res, next) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      throw createError.badRequest('userId is required', 'MISSING_USER_ID');
    }
    
    // Validate userId
    validators.validateUserId(userId);
    
    const CATEGORY_KEYWORDS = {
      "Groceries": ["walmart", "target", "kroger", "costco", "trader joe"],
      "Food & Dining": ["mcdonalds", "starbucks", "pizza", "burger king", "chipotle"],
      "Gas & Fuel": ["shell", "chevron", "exxon", "bp"],
      "Pharmacy": ["cvs", "walgreens"],
      "Shopping": ["amazon"]
    };
    
    const categorize = (name) => {
      if (!name) return null;
      const n = name.toLowerCase();
      for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
        if (words.some(w => n.includes(w))) return cat;
      }
      return null;
    };
    
    const ref = db.collection('users').doc(userId).collection('transactions');
    const snap = await ref.get();
    const batch = db.batch();
    let categorized = 0;
    
    snap.forEach(doc => {
      const t = doc.data();
      if (!t.category && !t.category_override) {
        const cat = categorize(t.merchant_name || t.name || t.description);
        if (cat) {
          batch.update(doc.ref, { category: cat, category_auto_assigned: true });
          categorized++;
        }
      }
    });
    
    await batch.commit();
    res.json({ success: true, categorized, message: `Categorized ${categorized} transactions` });
  } catch (error) {
    // Check if it's already an AppError
    if (error.statusCode) {
      return next(error);
    }
    
    // Handle Firebase errors
    if (isFirebaseError(error)) {
      return next(createError.firebaseError(error.message || 'Firebase error during bulk categorization'));
    }
    
    // Generic error
    next(createError.firebaseError(error.message || 'Failed to bulk categorize transactions'));
  }
});

// Subscriptions endpoints
app.get("/api/subscriptions", async (req, res, next) => {
  const endpoint = "/api/subscriptions";
  logDiagnostic.request(endpoint, req.query);
  
  try {
    const { userId } = req.query;
    
    if (!userId) {
      throw createError.badRequest('userId is required', 'MISSING_USER_ID');
    }
    
    // Validate userId
    validators.validateUserId(userId);
    
    const subscriptionsRef = db.collection('users').doc(userId).collection('subscriptions');
    const snapshot = await subscriptionsRef.get();
    
    const subscriptions = [];
    snapshot.forEach(doc => {
      subscriptions.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    logDiagnostic.response(endpoint, 200, { count: subscriptions.length });
    res.json({ subscriptions });
    
  } catch (error) {
    logger.error('GET_SUBSCRIPTIONS', 'Failed to get subscriptions', error, {});
    logDiagnostic.error('GET_SUBSCRIPTIONS', 'Failed to get subscriptions', error);
    
    // Check if it's already an AppError
    if (error.statusCode) {
      return next(error);
    }
    
    // Handle Firebase errors
    if (isFirebaseError(error)) {
      return next(createError.firebaseError(error.message || 'Firebase error fetching subscriptions'));
    }
    
    // Generic error
    next(createError.firebaseError(error.message || 'Failed to get subscriptions'));
  }
});

app.post("/api/subscriptions", async (req, res, next) => {
  const endpoint = "/api/subscriptions";
  logDiagnostic.request(endpoint, req.body);
  
  try {
    const { userId, subscription } = req.body;
    
    if (!userId || !subscription) {
      throw createError.badRequest('userId and subscription data are required', 'MISSING_REQUIRED_FIELDS');
    }
    
    // Validate userId
    validators.validateUserId(userId);
    
    const newSubscription = {
      ...subscription,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    const subscriptionsRef = db.collection('users').doc(userId).collection('subscriptions');
    const docRef = await subscriptionsRef.add(newSubscription);
    
    logDiagnostic.response(endpoint, 201, { id: docRef.id });
    res.status(201).json({ 
      success: true,
      id: docRef.id,
      message: "Subscription created successfully"
    });
    
  } catch (error) {
    logger.error('CREATE_SUBSCRIPTION', 'Failed to create subscription', error, {});
    logDiagnostic.error('CREATE_SUBSCRIPTION', 'Failed to create subscription', error);
    
    // Check if it's already an AppError
    if (error.statusCode) {
      return next(error);
    }
    
    // Handle Firebase errors
    if (isFirebaseError(error)) {
      return next(createError.firebaseError(error.message || 'Firebase error creating subscription'));
    }
    
    // Generic error
    next(createError.firebaseError(error.message || 'Failed to create subscription'));
  }
});

app.put("/api/subscriptions/:id", async (req, res, next) => {
  const endpoint = "/api/subscriptions/:id";
  logDiagnostic.request(endpoint, req.body);
  
  try {
    const { id } = req.params;
    const { userId, subscription } = req.body;
    
    if (!userId || !subscription) {
      throw createError.badRequest('userId and subscription data are required', 'MISSING_REQUIRED_FIELDS');
    }
    
    // Validate userId
    validators.validateUserId(userId);
    
    const updatedSubscription = {
      ...subscription,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    const docRef = db.collection('users').doc(userId).collection('subscriptions').doc(id);
    await docRef.update(updatedSubscription);
    
    logDiagnostic.response(endpoint, 200, { id });
    res.json({ 
      success: true,
      message: "Subscription updated successfully"
    });
    
  } catch (error) {
    logger.error('UPDATE_SUBSCRIPTION', 'Failed to update subscription', error, {});
    logDiagnostic.error('UPDATE_SUBSCRIPTION', 'Failed to update subscription', error);
    
    // Check if it's already an AppError
    if (error.statusCode) {
      return next(error);
    }
    
    // Handle Firebase errors
    if (isFirebaseError(error)) {
      return next(createError.firebaseError(error.message || 'Firebase error updating subscription'));
    }
    
    // Generic error
    next(createError.firebaseError(error.message || 'Failed to update subscription'));
  }
});

app.delete("/api/subscriptions/:id", async (req, res, next) => {
  const endpoint = "/api/subscriptions/:id";
  logDiagnostic.request(endpoint, req.params);
  
  try {
    const { id } = req.params;
    const { userId } = req.query;
    
    if (!userId) {
      throw createError.badRequest('userId is required', 'MISSING_USER_ID');
    }
    
    // Validate userId
    validators.validateUserId(userId);
    
    const docRef = db.collection('users').doc(userId).collection('subscriptions').doc(id);
    await docRef.delete();
    
    logDiagnostic.response(endpoint, 200, { id });
    res.json({ 
      success: true,
      message: "Subscription deleted successfully"
    });
    
  } catch (error) {
    logger.error('DELETE_SUBSCRIPTION', 'Failed to delete subscription', error, {});
    logDiagnostic.error('DELETE_SUBSCRIPTION', 'Failed to delete subscription', error);
    
    // Check if it's already an AppError
    if (error.statusCode) {
      return next(error);
    }
    
    // Handle Firebase errors
    if (isFirebaseError(error)) {
      return next(createError.firebaseError(error.message || 'Firebase error deleting subscription'));
    }
    
    // Generic error
    next(createError.firebaseError(error.message || 'Failed to delete subscription'));
  }
});

app.post("/api/subscriptions/:id/cancel", async (req, res, next) => {
  const endpoint = "/api/subscriptions/:id/cancel";
  logDiagnostic.request(endpoint, req.params);
  
  try {
    const { id } = req.params;
    const { userId } = req.body;
    
    if (!userId) {
      throw createError.badRequest('userId is required', 'MISSING_USER_ID');
    }
    
    // Validate userId
    validators.validateUserId(userId);
    
    const docRef = db.collection('users').doc(userId).collection('subscriptions').doc(id);
    await docRef.update({
      status: 'cancelled',
      cancelledDate: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    logDiagnostic.response(endpoint, 200, { id });
    res.json({ 
      success: true,
      message: "Subscription cancelled successfully"
    });
    
  } catch (error) {
    logger.error('CANCEL_SUBSCRIPTION', 'Failed to cancel subscription', error, {});
    logDiagnostic.error('CANCEL_SUBSCRIPTION', 'Failed to cancel subscription', error);
    
    // Check if it's already an AppError
    if (error.statusCode) {
      return next(error);
    }
    
    // Handle Firebase errors
    if (isFirebaseError(error)) {
      return next(createError.firebaseError(error.message || 'Firebase error cancelling subscription'));
    }
    
    // Generic error
    next(createError.firebaseError(error.message || 'Failed to cancel subscription'));
  }
});

app.get("/healthz", (req, res) => res.send("ok"));

// ============================================================================
// ERROR HANDLER (Must be last!)
// ============================================================================

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({
    error: true,
    code: 'NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found`,
    timestamp: Date.now()
  });
});

// Error handler must be added AFTER all routes
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
