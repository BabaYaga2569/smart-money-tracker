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
import { runBillMatching } from './utils/BillMatchingService.js';
import { findPlaidItemDocument, syncPlaidItemTransactions } from './utils/plaidSyncEngine.js';
import {
  ACCOUNT_VISIBILITY_SCHEMA_VERSION,
  accountIdentityMatch,
  calculateVisibleDepositoryTotal,
  isDepositoryAccount,
  reconcileAccountRegistry,
  visibleAccounts,
  withVisibility
} from './utils/accountRegistry.js';
import { detectSubscriptions } from './utils/subscriptionDetector.js';
import { detectRecurringStreams, matchStreamsToTemplates } from './utils/recurringStreamDetector.js';

const app = express();

const allowedOrigins = new Set([
  'https://smart-money-tracker.netlify.app',
  'https://smart-money-tracker-v2.netlify.app',
  'https://smart-money-tracker-wine.vercel.app',
  'http://localhost:3000'
]);

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;

  // Allow only this app's Netlify PR deploy previews, e.g.
  // https://deploy-preview-372--smart-money-tracker-v2.netlify.app
  return /^https:\/\/deploy-preview-\d+--smart-money-tracker-v2\.netlify\.app$/.test(origin);
};

app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
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

/**
 * Wrap a promise with a timeout
 * @param {Promise} promise - The promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} operationName - Name of the operation for error messages
 * @returns {Promise} Promise that rejects if timeout is exceeded
 */
const withTimeout = (promise, timeoutMs, operationName = 'Operation') => {
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error(`${operationName} timeout after ${timeoutMs / 1000} seconds`)), timeoutMs)
  );
  return Promise.race([promise, timeoutPromise]);
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
 * Normalize string for comparison (removes special characters and converts to lowercase)
 * @param {string} str - String to normalize
 * @returns {string} Normalized string
 */
function normalizeString(str) {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

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

// Log startup configuration without exposing any credential material.
console.log('\n========================================');
console.log('PLAID CONFIGURATION');
console.log('========================================');
console.log('PLAID_CLIENT_ID configured:', Boolean(PLAID_CLIENT_ID && PLAID_CLIENT_ID !== 'demo_client_id'));
console.log('PLAID_SECRET configured:', Boolean(PLAID_SECRET && PLAID_SECRET !== 'demo_secret'));
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
  
  const items = itemsSnapshot.docs.map(doc => ({
    documentId: doc.id,
    ...doc.data()
  }));
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

  const settingsRef = db.collection('users').doc(userId)
    .collection('settings').doc('personal');
  const settingsDoc = await settingsRef.get();
  const currentSettings = settingsDoc.exists ? settingsDoc.data() : {};

  const freshAccounts = newAccounts.map(account => ({
    ...account,
    institution_name: institutionName,
    item_id: itemId
  }));

  const reconciliation = reconcileAccountRegistry({
    existingAccounts: currentSettings.plaidAccounts || [],
    freshAccounts,
    preferences: currentSettings.accountPreferences || {},
    visibilitySchemaVersion: currentSettings.accountVisibilitySchemaVersion || 0,
    completeSnapshot: false,
    newAccountsVisible: true
  });

  const now = new Date().toISOString();
  const updatedAccounts = reconciliation.accounts.map(account => {
    const isFresh = freshAccounts.some(fresh => accountIdentityMatch(account, fresh));
    return isFresh
      ? { ...account, lastBalanceUpdate: now, lastSeenAt: now }
      : account;
  });

  await settingsRef.set({
    plaidAccounts: updatedAccounts,
    accountPreferences: reconciliation.preferences,
    accountVisibilitySchemaVersion: reconciliation.visibilitySchemaVersion,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  const matchedExistingCount = (currentSettings.plaidAccounts || []).filter(existing =>
    freshAccounts.some(fresh => accountIdentityMatch(existing, fresh))
  ).length;

  logDiagnostic.info('ACCOUNT_REGISTRY', 'Merged newly connected Plaid accounts into canonical registry', {
    connected_accounts: freshAccounts.length,
    matched_existing: matchedExistingCount,
    canonical_accounts: updatedAccounts.length
  });

  return {
    added: Math.max(0, freshAccounts.length - matchedExistingCount),
    deduplicated: matchedExistingCount,
    total: updatedAccounts.length
  };
}

/**
 * Update account balances in Firebase settings/personal collection
 * This function only updates balances for existing accounts, doesn't add/remove accounts
 * @param {string} userId - User's UID
 * @param {Array} accounts - Array of accounts with fresh balance data from Plaid
 * @returns {Promise<Object>} Result with { updated, total, unmatched } counts
 */
async function updateAccountBalances(userId, accounts, options = {}) {
  if (!userId || !Array.isArray(accounts)) {
    throw new Error('Invalid parameters for updateAccountBalances');
  }

  const completeSnapshot = options.completeSnapshot === true;
  const settingsRef = db.collection('users').doc(userId)
    .collection('settings').doc('personal');

  const settingsDoc = await settingsRef.get();
  const currentSettings = settingsDoc.exists ? settingsDoc.data() : {};
  const existingAccounts = currentSettings.plaidAccounts || [];
  const existingPreferences = currentSettings.accountPreferences || {};

  const reconciliation = reconcileAccountRegistry({
    existingAccounts,
    freshAccounts: accounts,
    preferences: existingPreferences,
    visibilitySchemaVersion: currentSettings.accountVisibilitySchemaVersion || 0,
    completeSnapshot,
    newAccountsVisible: true
  });

  const now = new Date().toISOString();
  const canonicalAccounts = reconciliation.accounts.map(account => {
    const isFresh = accounts.some(fresh => accountIdentityMatch(account, fresh));
    return isFresh
      ? { ...account, lastBalanceUpdate: now, lastSeenAt: now }
      : account;
  });

  const accountsWithVisibility = withVisibility(
    canonicalAccounts,
    reconciliation.preferences
  );
  const currentVisibleAccounts = accountsWithVisibility.filter(account => account.visible !== false);
  const hiddenAccounts = accountsWithVisibility.filter(account => account.visible === false);
  const visibleDepositoryAccounts = currentVisibleAccounts.filter(isDepositoryAccount);
  const totalBalance = calculateVisibleDepositoryTotal(
    canonicalAccounts,
    reconciliation.preferences
  );

  validateBalanceConsistency(visibleDepositoryAccounts, totalBalance);

  const operations = [
    createOperation('set', settingsRef, {
      plaidAccounts: canonicalAccounts,
      accountPreferences: reconciliation.preferences,
      accountVisibilitySchemaVersion: reconciliation.visibilitySchemaVersion,
      lastBalanceUpdate: admin.firestore.FieldValue.serverTimestamp(),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    }),
    createOperation('update', db.collection('users').doc(userId), {
      totalBalance,
      accountCount: visibleDepositoryAccounts.length,
      connectedAccountCount: canonicalAccounts.length,
      hiddenAccountCount: hiddenAccounts.length,
      lastSyncedAt: new Date()
    })
  ];

  await atomicTransaction(operations);

  logDiagnostic.info('ACCOUNT_REGISTRY', 'Canonical Plaid account registry reconciled', {
    fresh_accounts: accounts.length,
    canonical_accounts: canonicalAccounts.length,
    visible_accounts: currentVisibleAccounts.length,
    hidden_accounts: hiddenAccounts.length,
    visible_depository_accounts: visibleDepositoryAccounts.length,
    complete_snapshot: completeSnapshot,
    visibility_schema: reconciliation.visibilitySchemaVersion
  });

  return {
    updated: accounts.length,
    total: canonicalAccounts.length,
    unmatched: Math.max(0, existingAccounts.length - accounts.length),
    accounts: canonicalAccounts,
    preferences: reconciliation.preferences,
    visibleAccounts: currentVisibleAccounts,
    hiddenAccounts,
    totalBalance,
    visibilitySchemaVersion: reconciliation.visibilitySchemaVersion
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

// Complete an existing Plaid Item update-mode reconnect.
// Plaid update mode keeps the same access token, so there is no token exchange here.
app.post("/api/plaid/complete_update", async (req, res, next) => {
  const endpoint = "/api/plaid/complete_update";
  logDiagnostic.request(endpoint, req.body);

  try {
    const { userId, itemId } = req.body;

    if (!userId) {
      throw createError.badRequest('userId is required', 'MISSING_USER_ID');
    }
    if (!itemId) {
      throw createError.badRequest('itemId is required', 'MISSING_ITEM_ID');
    }

    validators.validateUserId(userId);

    const itemRef = db
      .collection('users')
      .doc(userId)
      .collection('plaid_items')
      .doc(itemId);

    const itemDoc = await itemRef.get();
    if (!itemDoc.exists) {
      throw createError.notFound('Bank connection not found');
    }

    const item = itemDoc.data();
    if (!item.accessToken) {
      throw createError.badRequest('Access token not found for this connection', 'MISSING_TOKEN');
    }

    // Verify the repaired Item can make a normal Plaid request before marking it healthy.
    await plaidClient.accountsGet({ access_token: item.accessToken });

    await itemRef.set({
      status: 'active',
      error: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    logDiagnostic.info(
      'PLAID_COMPLETE_UPDATE',
      `Reactivated Plaid item ${itemId} for ${item.institutionName || 'bank'}`
    );

    res.json({
      success: true,
      itemId,
      institutionName: item.institutionName || 'Bank'
    });
  } catch (error) {
    if (error.statusCode) {
      return next(error);
    }

    const plaidError = error?.response?.data;
    if (plaidError?.error_code === 'ITEM_LOGIN_REQUIRED') {
      return next(createError.unauthorized(
        'Bank connection still requires login. Please complete the reconnect flow.'
      ));
    }

    if (plaidError) {
      return next(createError.plaidError(
        plaidError.error_message || 'Unable to verify the repaired bank connection',
        shouldRetryPlaidError(plaidError.error_type)
      ));
    }

    next(createError.plaidError(error.message || 'Unable to complete bank reconnection'));
  }
});

// Exchange public token for access token
app.post("/api/plaid/exchange_token", async (req, res, next) => {
  const endpoint = "/api/plaid/exchange_token";
  logger.request('POST', endpoint, { body: req.body });
  logDiagnostic.request(endpoint, req.body);
  
  let userId = null; // ✅ Declare at function scope
  
  try {
    const { public_token, userId: userIdFromBody } = req.body;
    userId = userIdFromBody; // ✅ Assign to outer variable

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

    // Exchange public token for access token with 30-second timeout
    const exchangeResponse = await withTimeout(
      plaidClient.itemPublicTokenExchange({ public_token }),
      30000,
      'Plaid itemPublicTokenExchange'
    );

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;
    
    logger.info('PLAID_AUTH', 'Successfully exchanged token', { userId, itemId });
    logDiagnostic.info('EXCHANGE_TOKEN', `Successfully exchanged token, item_id: ${itemId}`);

    // Get institution info with 15-second timeout
    const itemResponse = await withTimeout(
      plaidClient.itemGet({ access_token: accessToken }),
      15000,
      'Plaid itemGet'
    );
    const institutionId = itemResponse.data.item.institution_id;
    
    logger.info('PLAID_AUTH', 'Fetching institution info', { institutionId });
    logDiagnostic.info('EXCHANGE_TOKEN', `Fetching institution info for: ${institutionId}`);

    const institutionResponse = await withTimeout(
      plaidClient.institutionsGetById({
        institution_id: institutionId,
        country_codes: ['US']
      }),
      15000,
      'Plaid institutionsGetById'
    );
    const institutionName = institutionResponse.data.institution.name;
    
    logger.info('PLAID_AUTH', 'Retrieved institution', { institutionName });
    logDiagnostic.info('EXCHANGE_TOKEN', `Institution: ${institutionName}`);

    // Store credentials securely in Firestore (server-side only)
    await storePlaidCredentials(userId, accessToken, itemId, institutionId, institutionName);

    // Get account information with 15-second timeout
    logger.info('PLAID_ACCOUNTS', 'Fetching account information', { userId, itemId });
    logDiagnostic.info('EXCHANGE_TOKEN', 'Fetching account information');
    const accountsResponse = await withTimeout(
      plaidClient.accountsGet({ access_token: accessToken }),
      15000,
      'Plaid accountsGet'
    );

    const accounts = accountsResponse.data.accounts;
    logger.info('PLAID_ACCOUNTS', 'Retrieved accounts', { userId, accountCount: accounts.length });
    logDiagnostic.info('EXCHANGE_TOKEN', `Retrieved ${accounts.length} accounts`);

    // Get account balances with 15-second timeout
    const balanceResponse = await withTimeout(
      plaidClient.accountsBalanceGet({ access_token: accessToken }),
      15000,
      'Plaid accountsBalanceGet'
    );
    
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
    
    // Handle timeout errors
    if (error.message && error.message.includes('timeout')) {
      return next(createError.gatewayTimeout(
        'Request to Plaid API timed out. Please try again.',
        'PLAID_TIMEOUT'
      ));
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

        const plaidError = itemError?.response?.data;
        if (plaidError?.error_code === 'ITEM_LOGIN_REQUIRED' && item.itemId) {
          try {
            await db
              .collection('users')
              .doc(userId)
              .collection('plaid_items')
              .doc(item.itemId)
              .set({
                status: 'NEEDS_REAUTH',
                error: {
                  error_code: plaidError.error_code,
                  error_type: plaidError.error_type || 'ITEM_ERROR',
                  error_message: plaidError.error_message || 'Bank login required'
                },
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
              }, { merge: true });

            logDiagnostic.info(
              'GET_ACCOUNTS',
              `Marked ${item.institutionName || item.itemId} as NEEDS_REAUTH after ITEM_LOGIN_REQUIRED`
            );
          } catch (statusError) {
            logger.error('PLAID_ACCOUNTS', 'Failed to mark item as NEEDS_REAUTH', statusError, {
              userId,
              itemId: item.itemId
            });
          }
        }

        // Continue with other items even if one fails.
        // The frontend health check will render a reconnect card for this item.
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
// Sync transactions to Firebase using the canonical Plaid reconciliation engine.
app.post("/api/plaid/sync_transactions", async (req, res, next) => {
  const endpoint = "/api/plaid/sync_transactions";
  logDiagnostic.request(endpoint, req.body);

  const { userId } = req.body || {};

  try {
    if (!userId) {
      throw createError.badRequest('userId is required. Please authenticate.', 'MISSING_USER_ID');
    }

    validators.validateUserId(userId);

    const metadataRef = db.collection('users')
      .doc(userId)
      .collection('metadata')
      .doc('sync');

    await metadataRef.set({
      syncStatus: 'syncing',
      lastSyncStart: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    const items = await getAllPlaidItems(userId);
    if (!items || items.length === 0) {
      throw createError.notFound('No Plaid connection found. Please connect your bank account first.');
    }

    const totals = {
      added: 0,
      updated: 0,
      pending: 0,
      deduplicated: 0,
      pendingReplaced: 0,
      removed: 0,
      skipped: 0,
      committedWrites: 0
    };
    const failedItems = [];
    let successfulItems = 0;

    for (const item of items) {
      try {
        const result = await syncPlaidItemTransactions({
          db,
          admin,
          plaidClient,
          userId,
          item,
          trigger: 'manual',
          autoCategorize: autoCategorizTransaction,
          logDiagnostic
        });

        totals.added += result.added;
        totals.updated += result.updated;
        totals.pending += result.pending;
        totals.deduplicated += result.deduplicated;
        totals.pendingReplaced += result.pendingReplaced;
        totals.removed += result.removed;
        totals.skipped += result.skipped;
        totals.committedWrites += result.committedWrites;
        successfulItems++;
      } catch (itemError) {
        const plaidError = itemError?.response?.data;

        if (plaidError?.error_code === 'ITEM_LOGIN_REQUIRED' && item.documentId) {
          await db.collection('users')
            .doc(userId)
            .collection('plaid_items')
            .doc(item.documentId)
            .set({
              status: 'NEEDS_REAUTH',
              error: {
                error_code: plaidError.error_code,
                error_type: plaidError.error_type || 'ITEM_ERROR',
                error_message: plaidError.error_message || 'Bank login required'
              },
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true })
            .catch(statusError => {
              logger.error('PLAID_SYNC', 'Failed to mark item as NEEDS_REAUTH', statusError, {
                userId,
                itemId: item.itemId
              });
            });
        }

        logger.error('PLAID_SYNC', 'Failed to sync Plaid item', itemError, {
          userId,
          itemId: item.itemId,
          institution: item.institutionName
        });

        failedItems.push({
          item_id: item.itemId,
          institution_name: item.institutionName || 'Unknown Bank',
          error_code: plaidError?.error_code || itemError.code || 'SYNC_FAILED'
        });
      }
    }

    const fullySuccessful = failedItems.length === 0;

    await metadataRef.set({
      lastPlaidSync: admin.firestore.FieldValue.serverTimestamp(),
      lastPlaidSyncDate: new Date().toISOString(),
      syncStatus: fullySuccessful ? 'idle' : 'partial_error',
      lastSyncError: fullySuccessful ? null : `${failedItems.length} bank connection(s) failed to sync`,
      successfulItemCount: successfulItems,
      failedItemCount: failedItems.length
    }, { merge: true });

    if (totals.added > 0 || totals.updated > 0) {
      setImmediate(async () => {
        try {
          const billsSnapshot = await db.collection('users').doc(userId)
            .collection('financialEvents')
            .where('type', '==', 'bill')
            .where('isPaid', '==', false)
            .get();

          const unpaidBills = billsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));

          const sixtyDaysAgo = new Date();
          sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
          const startDate = sixtyDaysAgo.toISOString().split('T')[0];

          const txSnapshot = await db.collection('users').doc(userId)
            .collection('transactions')
            .where('date', '>=', startDate)
            .get();

          const transactions = txSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));

          const results = await runBillMatching(db, userId, transactions, unpaidBills);
          if (!results.success) {
            logger.error('AUTO_BILL_CLEAR', 'Bill clearing failed after Plaid sync', new Error(results.error), {});
          }
        } catch (clearingError) {
          logger.error('AUTO_BILL_CLEAR', 'Automatic bill clearing failed after Plaid sync', clearingError, {});
        }
      });
    }

    const responseBody = {
      success: fullySuccessful,
      partial: !fullySuccessful && successfulItems > 0,
      added: totals.added,
      updated: totals.updated,
      pending: totals.pending,
      deduplicated: totals.deduplicated,
      pending_replaced: totals.pendingReplaced,
      removed: totals.removed,
      skipped: totals.skipped,
      committed_writes: totals.committedWrites,
      synced_items: successfulItems,
      failed_items: failedItems,
      message: fullySuccessful
        ? `Synced ${totals.added} new transactions across ${successfulItems} bank connection(s).`
        : `Synced ${successfulItems} bank connection(s); ${failedItems.length} connection(s) need attention.`
    };

    logDiagnostic.response(endpoint, 200, {
      success: responseBody.success,
      partial: responseBody.partial,
      added: responseBody.added,
      updated: responseBody.updated,
      pending: responseBody.pending,
      pending_replaced: responseBody.pending_replaced,
      removed: responseBody.removed,
      synced_items: responseBody.synced_items,
      failed_item_count: failedItems.length
    });

    res.json(responseBody);
  } catch (error) {
    logger.error('PLAID_SYNC', 'Failed to sync transactions', error, { userId });

    if (userId) {
      await db.collection('users')
        .doc(userId)
        .collection('metadata')
        .doc('sync')
        .set({
          syncStatus: 'error',
          lastSyncError: error.message,
          lastErrorTime: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true })
        .catch(() => {});
    }

    if (error.statusCode) return next(error);

    const plaidError = error?.response?.data;
    if (plaidError?.error_code === 'ITEM_LOGIN_REQUIRED') {
      return next(createError.unauthorized('Your bank connection has expired. Please reconnect your bank account.'));
    }
    if (plaidError?.error_code === 'INVALID_ACCESS_TOKEN') {
      return next(createError.unauthorized('Invalid access token. Please reconnect your bank account.'));
    }

    next(createError.plaidError(error.message || 'Failed to sync transactions from your bank'));
  }
});

// Automatic bill clearing endpoint - matches transactions to bills and clears them
app.post("/api/bills/auto_clear", async (req, res, next) => {
  const endpoint = "/api/bills/auto_clear";
  logDiagnostic.request(endpoint, req.body);
  
  try {
    const { userId } = req.body;
    
    if (!userId) {
      logger.error('AUTO_BILL_CLEAR', 'Missing userId in request', null, {});
      logDiagnostic.error('AUTO_BILL_CLEAR', 'Missing userId in request');
      throw createError.badRequest('userId is required', 'MISSING_USER_ID');
    }
    
    // Validate userId
    validators.validateUserId(userId);
    
    logger.info('AUTO_BILL_CLEAR', 'Starting automatic bill clearing', { userId });
    logDiagnostic.info('AUTO_BILL_CLEAR', `Starting automatic bill clearing for user ${userId}`);
    
    // Load unpaid bills from financialEvents
    const billsSnapshot = await db.collection('users').doc(userId)
      .collection('financialEvents')
      .where('type', '==', 'bill')
      .where('isPaid', '==', false)
      .get();
    
    const unpaidBills = billsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Load recent transactions (last 60 days for better matching)
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const startDate = sixtyDaysAgo.toISOString().split('T')[0];
    
    const txSnapshot = await db.collection('users').doc(userId)
      .collection('transactions')
      .where('date', '>=', startDate)
      .get();
    
    const transactions = txSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`[AUTO_BILL_CLEAR] Found ${unpaidBills.length} unpaid bills and ${transactions.length} recent transactions`);
    logDiagnostic.info('AUTO_BILL_CLEAR', `Found ${unpaidBills.length} unpaid bills and ${transactions.length} transactions`);
    
    // Run matching algorithm
    const results = await runBillMatching(db, userId, transactions, unpaidBills);
    
    if (results.success) {
      logger.info('AUTO_BILL_CLEAR', 'Bill clearing completed', { 
        cleared: results.cleared, 
        advanced: results.advanced, 
        generated: results.generated 
      });
      logDiagnostic.info('AUTO_BILL_CLEAR', `Cleared ${results.cleared} bills, advanced ${results.advanced} patterns, generated ${results.generated} bills`);
    } else {
      logger.error('AUTO_BILL_CLEAR', 'Bill clearing failed', new Error(results.error), {});
      logDiagnostic.error('AUTO_BILL_CLEAR', 'Bill clearing failed', { error: results.error });
    }
    
    logDiagnostic.response(endpoint, 200, results);
    res.json(results);
  } catch (error) {
    logger.error('AUTO_BILL_CLEAR', 'Failed to run automatic bill clearing', error, {});
    logDiagnostic.error('AUTO_BILL_CLEAR', 'Failed to run automatic bill clearing', error);
    next(error.statusCode ? error : createError.internal(error.message || 'Failed to clear bills'));
  }
});

// Force Plaid to poll connected institutions for fresh transaction data.
app.post("/api/plaid/refresh_transactions", async (req, res, next) => {
  const endpoint = "/api/plaid/refresh_transactions";
  logDiagnostic.request(endpoint, req.body);

  try {
    const { userId } = req.body || {};

    if (!userId) {
      throw createError.badRequest('userId is required', 'MISSING_USER_ID');
    }

    validators.validateUserId(userId);

    const items = await getAllPlaidItems(userId);
    if (!items || items.length === 0) {
      throw createError.notFound('No Plaid connection found. Please connect your bank account first.');
    }

    const results = [];

    for (const item of items) {
      try {
        const response = await plaidClient.transactionsRefresh({
          access_token: item.accessToken
        });

        results.push({
          item_id: item.itemId,
          institution_name: item.institutionName,
          request_id: response.data.request_id,
          success: true
        });
      } catch (itemError) {
        const plaidError = itemError?.response?.data;

        if (plaidError?.error_code === 'ITEM_LOGIN_REQUIRED' && item.documentId) {
          await db.collection('users')
            .doc(userId)
            .collection('plaid_items')
            .doc(item.documentId)
            .set({
              status: 'NEEDS_REAUTH',
              error: {
                error_code: plaidError.error_code,
                error_type: plaidError.error_type || 'ITEM_ERROR',
                error_message: plaidError.error_message || 'Bank login required'
              },
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true })
            .catch(() => {});
        }

        results.push({
          item_id: item.itemId,
          institution_name: item.institutionName,
          success: false,
          error_code: plaidError?.error_code || itemError.code || 'REFRESH_FAILED'
        });
      }
    }

    const successCount = results.filter(result => result.success).length;

    logDiagnostic.response(endpoint, 200, {
      success: successCount > 0,
      refreshed_count: successCount,
      total_count: items.length
    });

    res.json({
      success: successCount > 0,
      refreshed_count: successCount,
      total_count: items.length,
      results,
      message: 'Plaid bank refresh requested. New activity will be reconciled through the normal sync pipeline.'
    });
  } catch (error) {
    logger.error('REFRESH_TRANSACTIONS', 'Failed to refresh transactions', error, {});
    if (error.statusCode) return next(error);

    const plaidError = error?.response?.data;
    if (plaidError) {
      return next(createError.plaidError(
        plaidError.error_message || 'Plaid API error',
        shouldRetryPlaidError(plaidError.error_type)
      ));
    }

    next(createError.plaidError(error.message || 'Failed to refresh transactions'));
  }
});

// Google Sheets dashboard: behind-the-scenes on-demand Plaid refresh.
// Protected by a dedicated sheet-only token and locked to the TEST workbook/user.
app.post("/api/plaid/sheets_force_refresh", async (req, res, next) => {
  const endpoint = "/api/plaid/sheets_force_refresh";
  try {
    const configuredUser = String(process.env.SHEETS_USER_ID || "").trim();
    const expectedToken = String(process.env.SHEETS_FORCE_REFRESH_TOKEN || "").trim();
    const providedToken = String(req.headers["x-sheet-refresh-token"] || "").trim();
    const expectedSpreadsheet = "1qaaf0t9il726oQpL2oXMbZqlF7zJpHomsClk8vklE_g";
    const spreadsheetId = String(req.body?.spreadsheetId || "").trim();

    if (!configuredUser || !expectedToken) {
      throw createError.internal("Sheet refresh endpoint is not configured.");
    }
    if (spreadsheetId !== expectedSpreadsheet) {
      return res.status(400).json({ success: false, error: "Refresh is locked to the TEST workbook." });
    }
    if (!providedToken || providedToken !== expectedToken) {
      logger.warn("SHEETS_FORCE_REFRESH", "Rejected unauthorized sheet refresh request", {});
      return res.status(403).json({ success: false, error: "Unauthorized sheet refresh request." });
    }

    // Durable 2-minute guard against double-clicks / accidental repeat paid refreshes.
    const guardRef = db.collection("users").doc(configuredUser)
      .collection("settings").doc("sheetForceRefreshGuard");
    const guardSnap = await guardRef.get();
    const lastRequestedMs = guardSnap.exists ? Number(guardSnap.data()?.lastRequestedMs || 0) : 0;
    const nowMs = Date.now();

    if (lastRequestedMs && nowMs - lastRequestedMs < 120000) {
      const retryAfterSeconds = Math.ceil((120000 - (nowMs - lastRequestedMs)) / 1000);
      return res.status(429).json({
        success: false,
        cooldown: true,
        retryAfterSeconds,
        error: "A bank refresh was already requested recently."
      });
    }

    const items = await getAllPlaidItems(configuredUser);
    if (!items || items.length === 0) {
      throw createError.notFound("No active Plaid connections found.");
    }

    await guardRef.set({
      lastRequestedMs: nowMs,
      source: "google_sheets_test_dashboard"
    }, { merge: true });

    const results = [];
    for (const item of items) {
      try {
        const response = await plaidClient.transactionsRefresh({
          access_token: item.accessToken
        });
        results.push({
          institution_name: item.institutionName,
          success: true,
          request_id: response.data.request_id
        });
      } catch (itemError) {
        results.push({
          institution_name: item.institutionName,
          success: false,
          error: itemError.message
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    logDiagnostic.response(endpoint, 200, {
      success: successCount > 0,
      refreshed_count: successCount,
      total_count: items.length
    });

    res.json({
      success: successCount > 0,
      refreshed_count: successCount,
      total_count: items.length,
      message: "Plaid bank refresh requested. New activity normally arrives within a few minutes."
    });
  } catch (error) {
    logger.error("SHEETS_FORCE_REFRESH", "Sheet-triggered bank refresh failed", error, {});
    if (error.statusCode) return next(error);
    next(createError.internal(error.message || "Sheet-triggered bank refresh failed"));
  }
});

// Plaid webhook: trigger the same canonical sync engine used by manual refresh.
app.post("/api/plaid/webhook", async (req, res) => {
  const endpoint = "/api/plaid/webhook";
  const { webhook_type, webhook_code, item_id, error: plaidWebhookError } = req.body || {};

  logDiagnostic.request(endpoint, {
    webhook_type,
    webhook_code,
    item_id,
    has_error: Boolean(plaidWebhookError)
  });

  try {
    const transactionCodes = new Set([
      'SYNC_UPDATES_AVAILABLE',
      'DEFAULT_UPDATE',
      'INITIAL_UPDATE',
      'HISTORICAL_UPDATE'
    ]);

    if (webhook_type === 'TRANSACTIONS' && transactionCodes.has(webhook_code)) {
      const itemDoc = await findPlaidItemDocument(db, item_id);

      if (!itemDoc) {
        logDiagnostic.warn('WEBHOOK', 'No Plaid item mapping found for transaction webhook', {
          webhook_code,
          item_id
        });
      } else {
        const itemData = itemDoc.data();
        const userId = itemDoc.ref.parent.parent.id;

        const result = await syncPlaidItemTransactions({
          db,
          admin,
          plaidClient,
          userId,
          item: {
            documentId: itemDoc.id,
            ...itemData,
            itemId: itemData.itemId || itemData.item_id || item_id
          },
          trigger: 'webhook',
          autoCategorize: autoCategorizTransaction,
          logDiagnostic
        });

        await db.collection('users')
          .doc(userId)
          .collection('metadata')
          .doc('sync')
          .set({
            lastPlaidSync: admin.firestore.FieldValue.serverTimestamp(),
            lastPlaidSyncDate: new Date().toISOString(),
            syncStatus: 'idle',
            lastSyncError: null,
            lastSyncTrigger: 'webhook'
          }, { merge: true });

        logDiagnostic.info('WEBHOOK', 'Transaction webhook reconciled', {
          webhook_code,
          added: result.added,
          updated: result.updated,
          pending: result.pending,
          pending_replaced: result.pendingReplaced,
          removed: result.removed,
          cursor_advanced: result.cursorAdvanced
        });
      }
    }

    if (webhook_type === 'ITEM' && webhook_code === 'ERROR') {
      const itemDoc = await findPlaidItemDocument(db, item_id);

      if (itemDoc) {
        const errorCode = plaidWebhookError?.error_code || 'UNKNOWN_ERROR';
        const needsReauth =
          errorCode === 'ITEM_LOGIN_REQUIRED' ||
          errorCode === 'INVALID_ACCESS_TOKEN';

        await itemDoc.ref.set({
          status: needsReauth ? 'NEEDS_REAUTH' : 'error',
          error: plaidWebhookError || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        logDiagnostic.info('WEBHOOK', 'Plaid item status updated from ITEM error', {
          item_id,
          error_code: errorCode,
          status: needsReauth ? 'NEEDS_REAUTH' : 'error'
        });
      }
    }

    logDiagnostic.response(endpoint, 200, { success: true });
    res.status(200).json({ success: true });
  } catch (error) {
    const plaidError = error?.response?.data;

    if (plaidError?.error_code === 'ITEM_LOGIN_REQUIRED' && item_id) {
      const itemDoc = await findPlaidItemDocument(db, item_id).catch(() => null);
      if (itemDoc) {
        await itemDoc.ref.set({
          status: 'NEEDS_REAUTH',
          error: {
            error_code: plaidError.error_code,
            error_type: plaidError.error_type || 'ITEM_ERROR',
            error_message: plaidError.error_message || 'Bank login required'
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true }).catch(() => {});
      }
    }

    logger.error('WEBHOOK', 'Error processing Plaid webhook', error, {
      webhook_type,
      webhook_code,
      item_id
    });

    // Plaid webhook delivery should not retry indefinitely because of an
    // application-side reconciliation failure. The error remains visible in logs
    // and the stored cursor is not advanced, so the next sync can safely retry.
    res.status(200).json({
      received: true,
      error: 'logged'
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
    
    // If editing a Plaid transaction, mark it as manually edited
    // This prevents it from being overwritten during next Plaid sync
    if (existingTransaction.source === 'plaid' || existingTransaction.transaction_id) {
      updates.manuallyEdited = true;
      updates.lastEditedAt = admin.firestore.FieldValue.serverTimestamp();
      updates.lastEditedBy = userId;
      
      logger.info('UPDATE_TRANSACTION', 'Marking Plaid transaction as manually edited', {
        transactionId: transactionId,
        userId: userId
      });
    }
    
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

// Auto-detect recurring subscriptions/bills from transaction history
app.post("/api/subscriptions/detect", async (req, res, next) => {
  const endpoint = "/api/subscriptions/detect";
  logDiagnostic.request(endpoint, req.body);
  
  try {
    const { userId } = req.body;
    
    if (!userId) {
      throw createError.badRequest('userId is required', 'MISSING_USER_ID');
    }
    
    // Validate userId
    validators.validateUserId(userId);
    
    logger.info('DETECT_SUBSCRIPTIONS', 'Starting detection for user', { userId });
    logDiagnostic.info('DETECT_SUBSCRIPTIONS', `Starting detection for user: ${userId}`);
    
    // Get transactions from Firebase
    const transactionsRef = db.collection('users').doc(userId).collection('transactions');
    const transactionsSnap = await transactionsRef.get();
    const transactions = transactionsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    logger.info('DETECT_SUBSCRIPTIONS', 'Found transactions', { count: transactions.length });
    logDiagnostic.info('DETECT_SUBSCRIPTIONS', `Analyzing ${transactions.length} transactions`);
    
    // Get existing subscriptions to avoid duplicates
    const subscriptionsRef = db.collection('users').doc(userId).collection('subscriptions');
    const subscriptionsSnap = await subscriptionsRef.get();
    const existingSubscriptions = subscriptionsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    logger.info('DETECT_SUBSCRIPTIONS', 'Found existing subscriptions', { count: existingSubscriptions.length });
    logDiagnostic.info('DETECT_SUBSCRIPTIONS', `Found ${existingSubscriptions.length} existing subscriptions`);
    
    // Run detection
    const detectionResult = detectSubscriptions(transactions, existingSubscriptions);
    
    // Handle both old and new return formats for backward compatibility
    const detected = detectionResult.all || detectionResult;
    const matches = detectionResult.matches || [];
    const newPatterns = detectionResult.newPatterns || detected;
    
    logger.info('DETECT_SUBSCRIPTIONS', 'Detection complete', { 
      total: detected.length,
      matches: matches.length,
      newPatterns: newPatterns.length
    });
    logDiagnostic.info('DETECT_SUBSCRIPTIONS', `Found ${detected.length} recurring patterns (${matches.length} matches, ${newPatterns.length} new)`);
    logDiagnostic.response(endpoint, 200, { 
      total: detected.length, 
      matches: matches.length,
      newPatterns: newPatterns.length,
      scannedTransactions: transactions.length 
    });
    
    res.json({
      detected,  // All patterns (for backward compatibility)
      matches,   // Patterns matching existing subscriptions
      newPatterns, // New patterns not yet tracked
      count: detected.length,
      scannedTransactions: transactions.length
    });
    
  } catch (error) {
    logger.error('DETECT_SUBSCRIPTIONS', 'Detection failed', error, {});
    logDiagnostic.error('DETECT_SUBSCRIPTIONS', 'Detection failed', error);
    
    // Check if it's already an AppError
    if (error.statusCode) {
      return next(error);
    }
    
    // Handle Firebase errors
    if (isFirebaseError(error)) {
      return next(createError.firebaseError(error.message || 'Firebase error during detection'));
    }
    
    // Generic error
    next(createError.firebaseError(error.message || 'Failed to detect subscriptions'));
  }
});

app.get("/healthz", (req, res) => res.send("ok"));

/**
 * POST /api/recurring/detect
 * Body: { userId: string, lookbackDays?: number, minOccurrences?: number }
 *
 * Scans the user's synced transaction history for recurring streams and
 * compares them against existing recurring templates.
 *
 * Costs nothing extra: uses transactions already stored by /transactions/sync.
 *
 * Response:
 * {
 *   success: true,
 *   newStreams:    [ ... streams with no matching template — candidates to add ],
 *   matched:       [ ... streams matched to templates, with amountDrift info ],
 *   incomeStreams: [ ... detected paydays / recurring deposits ],
 *   stats: { transactionsScanned, skipped }
 * }
 */
app.post("/api/recurring/detect", async (req, res) => {
  const endpoint = "/api/recurring/detect";
  try {
    const { userId, lookbackDays = 400, minOccurrences = 3 } = req.body || {};
    if (!userId) {
      return res.status(400).json({ success: false, error: "userId is required" });
    }
    logDiagnostic.request(endpoint, { userId, lookbackDays, minOccurrences });

    // --- Load transactions (last `lookbackDays`) -----------------------------
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - lookbackDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const txSnapshot = await db
      .collection("users").doc(userId)
      .collection("transactions")
      .where("date", ">=", cutoffStr)
      .get();

    const transactions = txSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

    // --- Load existing recurring templates for dedup/drift -------------------
    // Templates may live in two places today (settings array + collection);
    // read both until the data model is unified.
    const templates = [];

    const settingsDoc = await db
      .collection("users").doc(userId)
      .collection("settings").doc("personal")
      .get();
    if (settingsDoc.exists) {
      const items = settingsDoc.data().recurringItems || [];
      for (const item of items) templates.push(item);
    }

    const recurringSnap = await db
      .collection("users").doc(userId)
      .collection("recurringPatterns")
      .get()
      .catch(() => null);
    if (recurringSnap) {
      recurringSnap.docs.forEach(d => templates.push({ id: d.id, ...d.data() }));
    }

    // --- Detect + match -------------------------------------------------------
    const { expenseStreams, incomeStreams, skipped } = detectRecurringStreams(
      transactions,
      { lookbackDays, minOccurrences }
    );
    const { newStreams, matched } = matchStreamsToTemplates(expenseStreams, templates);

    logDiagnostic.response(endpoint, 200, {
      scanned: transactions.length,
      newStreams: newStreams.length,
      matched: matched.length,
      income: incomeStreams.length,
    });

    return res.json({
      success: true,
      newStreams,
      matched,
      incomeStreams,
      stats: { transactionsScanned: transactions.length, skipped },
    });
  } catch (error) {
    logDiagnostic.error("RECURRING_DETECT", "Detection failed", error);
    return res.status(500).json({ success: false, error: "Failed to detect recurring streams" });
  }
});

/**
 * OPTIONAL — Plaid Recurring Transactions add-on endpoint.
 * Only works after you request access to the add-on in the Plaid dashboard
 * (it is subscription-billed per Item). Until then it returns a clear error
 * instead of crashing, so it is safe to ship now and enable later.
 */
app.post("/api/plaid/recurring_streams", async (req, res) => {
  const endpoint = "/api/plaid/recurring_streams";
  try {
    const { userId } = req.body || {};
    if (!userId) {
      return res.status(400).json({ success: false, error: "userId is required" });
    }

    // Reuse however server.js currently loads the user's Plaid items/tokens.
    // This assumes plaid_items subcollection like the sync flow uses.
    const itemsSnap = await db
      .collection("users").doc(userId)
      .collection("plaid_items")
      .get();

    if (itemsSnap.empty) {
      return res.status(404).json({ success: false, error: "No Plaid items found for user" });
    }

    const allStreams = { inflow: [], outflow: [] };
    for (const doc of itemsSnap.docs) {
      const { accessToken, access_token } = doc.data();
      const token = accessToken || access_token;
      if (!token) continue;
      try {
        const resp = await plaidClient.transactionsRecurringGet({ access_token: token });
        allStreams.inflow.push(...(resp.data.inflow_streams || []));
        allStreams.outflow.push(...(resp.data.outflow_streams || []));
      } catch (err) {
        // ADDITIONAL_CONSENT_REQUIRED / PRODUCT_NOT_ENABLED => add-on not active
        const code = err?.response?.data?.error_code;
        if (code === "PRODUCT_NOT_READY" || code === "PRODUCTS_NOT_SUPPORTED" || code === "ADDITIONAL_CONSENT_REQUIRED") {
          return res.status(402).json({
            success: false,
            error: "Plaid Recurring Transactions add-on is not enabled on this account.",
            hint: "Request access in the Plaid dashboard, or use /api/recurring/detect (free) instead.",
            plaidError: code,
          });
        }
        throw err;
      }
    }

    return res.json({ success: true, streams: allStreams });
  } catch (error) {
    logDiagnostic.error("PLAID_RECURRING", "Plaid recurring fetch failed", error);
    return res.status(500).json({ success: false, error: "Failed to fetch Plaid recurring streams" });
  }
});



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
