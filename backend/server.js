import express from "express";
import cors from "cors";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import admin from "firebase-admin";

const app = express();
app.use(cors({
  origin: ['https://smart-money-tracker.netlify.app', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());

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
// PLAID CONFIGURATION & STARTUP DIAGNOSTICS
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
 * @param {string} userId - User's UID
 * @param {string} accessToken - Plaid access token
 * @param {string} itemId - Plaid item ID
 * @returns {Promise<void>}
 */
async function storePlaidCredentials(userId, accessToken, itemId) {
  if (!userId || !accessToken || !itemId) {
    throw new Error('Missing required parameters for storing Plaid credentials');
  }

  logDiagnostic.info('STORE_CREDENTIALS', `Storing credentials for user: ${userId}, item: ${itemId}`);

  const userPlaidRef = db.collection('users').doc(userId).collection('plaid').doc('credentials');
  
  await userPlaidRef.set({
    accessToken,
    itemId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  logDiagnostic.info('STORE_CREDENTIALS', 'Credentials stored successfully');
}

/**
 * Retrieve Plaid access token from Firestore
 * @param {string} userId - User's UID
 * @returns {Promise<{accessToken: string, itemId: string}|null>}
 */
async function getPlaidCredentials(userId) {
  if (!userId) {
    throw new Error('userId is required to retrieve Plaid credentials');
  }

  logDiagnostic.info('GET_CREDENTIALS', `Retrieving credentials for user: ${userId}`);

  const userPlaidRef = db.collection('users').doc(userId).collection('plaid').doc('credentials');
  const doc = await userPlaidRef.get();

  if (!doc.exists) {
    logDiagnostic.info('GET_CREDENTIALS', 'No credentials found for user');
    return null;
  }

  const data = doc.data();
  logDiagnostic.info('GET_CREDENTIALS', `Credentials retrieved for item: ${data.itemId}`);
  
  return {
    accessToken: data.accessToken,
    itemId: data.itemId
  };
}

/**
 * Delete Plaid credentials from Firestore
 * @param {string} userId - User's UID
 * @returns {Promise<void>}
 */
async function deletePlaidCredentials(userId) {
  if (!userId) {
    throw new Error('userId is required to delete Plaid credentials');
  }

  logDiagnostic.info('DELETE_CREDENTIALS', `Deleting credentials for user: ${userId}`);

  const userPlaidRef = db.collection('users').doc(userId).collection('plaid').doc('credentials');
  await userPlaidRef.delete();

  logDiagnostic.info('DELETE_CREDENTIALS', 'Credentials deleted successfully');
}

// Test route
app.get("/api/hello", (req, res) => {
  res.json({ message: "Backend is working!" });
});

// ============================================================================
// PLAID ENDPOINTS WITH DIAGNOSTIC LOGGING
// ============================================================================

// Create Plaid Link token
app.post("/api/plaid/create_link_token", async (req, res) => {
  const endpoint = "/api/plaid/create_link_token";
  logDiagnostic.request(endpoint, req.body);
  
  try {
    const { userId } = req.body;
    logDiagnostic.info('CREATE_LINK_TOKEN', `Creating link token for user: ${userId || 'default'}`);
    
    const request = {
      user: {
        client_user_id: userId || "user-id",
      },
      client_name: "Smart Money Tracker",
      products: ["auth", "transactions"],
      country_codes: ["US"],
      language: "en",
    };

    const createTokenResponse = await plaidClient.linkTokenCreate(request);
    
    logDiagnostic.info('CREATE_LINK_TOKEN', 'Successfully created link token');
    logDiagnostic.response(endpoint, 200, { success: true, has_link_token: !!createTokenResponse.data.link_token });
    
    res.json(createTokenResponse.data);
  } catch (error) {
    logDiagnostic.error('CREATE_LINK_TOKEN', 'Failed to create link token', error);
    
    // Check for network/CORS errors
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      logDiagnostic.error('NETWORK', 'Cannot reach Plaid API - network issue', error);
      return res.status(503).json({ 
        error: 'Cannot connect to Plaid API. Please check network connectivity.',
        error_type: 'network',
        error_code: error.code
      });
    }
    
    // Return detailed error response
    const statusCode = error.response?.status || 500;
    logDiagnostic.response(endpoint, statusCode, { error: error.message });
    
    res.status(statusCode).json({ 
      error: error.message,
      error_code: error.response?.data?.error_code,
      error_type: error.response?.data?.error_type
    });
  }
});

// Exchange public token for access token
app.post("/api/plaid/exchange_token", async (req, res) => {
  const endpoint = "/api/plaid/exchange_token";
  logDiagnostic.request(endpoint, req.body);
  
  try {
    const { public_token, userId } = req.body;

    if (!public_token) {
      logDiagnostic.error('EXCHANGE_TOKEN', 'Missing public_token in request');
      return res.status(400).json({ error: "public_token is required" });
    }

    if (!userId) {
      logDiagnostic.error('EXCHANGE_TOKEN', 'Missing userId in request');
      return res.status(400).json({ error: "userId is required" });
    }

    logDiagnostic.info('EXCHANGE_TOKEN', `Exchanging public token for user: ${userId}`);

    // Exchange public token for access token
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token,
    });

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;
    
    logDiagnostic.info('EXCHANGE_TOKEN', `Successfully exchanged token, item_id: ${itemId}`);

    // Store credentials securely in Firestore (server-side only)
    await storePlaidCredentials(userId, accessToken, itemId);

    // Get account information
    logDiagnostic.info('EXCHANGE_TOKEN', 'Fetching account information');
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken,
    });

    const accounts = accountsResponse.data.accounts;
    logDiagnostic.info('EXCHANGE_TOKEN', `Retrieved ${accounts.length} accounts`);

    // Get account balances
    const balanceResponse = await plaidClient.accountsBalanceGet({
      access_token: accessToken,
    });

    logDiagnostic.response(endpoint, 200, { 
      success: true, 
      item_id: itemId,
      account_count: balanceResponse.data.accounts.length 
    });

    // IMPORTANT: Do NOT send access_token to frontend
    res.json({
      success: true,
      item_id: itemId,
      accounts: balanceResponse.data.accounts,
    });
  } catch (error) {
    logDiagnostic.error('EXCHANGE_TOKEN', 'Failed to exchange token', error);
    
    const statusCode = error.response?.status || 500;
    logDiagnostic.response(endpoint, statusCode, { error: error.message });
    
    res.status(statusCode).json({ 
      error: error.message,
      error_code: error.response?.data?.error_code,
      error_type: error.response?.data?.error_type
    });
  }
});

// Get account balances
app.post("/api/plaid/get_balances", async (req, res) => {
  const endpoint = "/api/plaid/get_balances";
  logDiagnostic.request(endpoint, req.body);
  
  try {
    const { userId } = req.body;

    if (!userId) {
      logDiagnostic.error('GET_BALANCES', 'Missing userId in request');
      return res.status(400).json({ error: "userId is required" });
    }

    // Retrieve access token from Firestore
    const credentials = await getPlaidCredentials(userId);
    if (!credentials) {
      logDiagnostic.error('GET_BALANCES', 'No Plaid credentials found for user');
      return res.status(404).json({ 
        error: "No Plaid connection found. Please connect your bank account first.",
        error_code: "NO_CREDENTIALS"
      });
    }

    logDiagnostic.info('GET_BALANCES', 'Fetching account balances');

    const balanceResponse = await plaidClient.accountsBalanceGet({
      access_token: credentials.accessToken,
    });

    const accountCount = balanceResponse.data.accounts.length;
    logDiagnostic.info('GET_BALANCES', `Successfully fetched balances for ${accountCount} accounts`);
    logDiagnostic.response(endpoint, 200, { success: true, account_count: accountCount });

    res.json({
      success: true,
      accounts: balanceResponse.data.accounts,
    });
  } catch (error) {
    logDiagnostic.error('GET_BALANCES', 'Failed to fetch balances', error);
    
    const statusCode = error.response?.status || 500;
    logDiagnostic.response(endpoint, statusCode, { error: error.message });
    
    res.status(statusCode).json({ 
      error: error.message,
      error_code: error.response?.data?.error_code,
      error_type: error.response?.data?.error_type
    });
  }
});

// Get accounts - provides account list for frontend (gracefully handles missing credentials)
app.get("/api/accounts", async (req, res) => {
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

    // Retrieve access token from Firestore
    const credentials = await getPlaidCredentials(userId);
    if (!credentials) {
      return res.status(200).json({ 
        success: false,
        accounts: [],
        message: "No Plaid connection found. Please connect your bank account."
      });
    }

    const balanceResponse = await plaidClient.accountsBalanceGet({
      access_token: credentials.accessToken,
    });

    res.json({
      success: true,
      accounts: balanceResponse.data.accounts,
    });
  } catch (error) {
    console.error("Error getting accounts:", error);
    
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
app.post("/api/plaid/get_transactions", async (req, res) => {
  const endpoint = "/api/plaid/get_transactions";
  logDiagnostic.request(endpoint, req.body);
  
  try {
    const { userId, start_date, end_date } = req.body;

    if (!userId) {
      logDiagnostic.error('GET_TRANSACTIONS', 'Missing userId in request');
      return res.status(400).json({ 
        success: false,
        error: "userId is required. Please authenticate." 
      });
    }

    // Retrieve access token from Firestore
    const credentials = await getPlaidCredentials(userId);
    if (!credentials) {
      logDiagnostic.error('GET_TRANSACTIONS', 'No Plaid credentials found for user');
      return res.status(404).json({ 
        success: false,
        error: "No Plaid connection found. Please connect your bank account first.",
        error_code: "NO_CREDENTIALS"
      });
    }

    // Default to last 30 days if no dates provided
    const endDate = end_date || new Date().toISOString().split('T')[0];
    const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    logDiagnostic.info('GET_TRANSACTIONS', `Fetching transactions from ${startDate} to ${endDate}`);

    const transactionsResponse = await plaidClient.transactionsGet({
      access_token: credentials.accessToken,
      start_date: startDate,
      end_date: endDate,
      options: {
        count: 100,
        offset: 0,
        include_personal_finance_category: true
      }
    });

    const txCount = transactionsResponse.data.transactions.length;
    const totalTx = transactionsResponse.data.total_transactions;
    logDiagnostic.info('GET_TRANSACTIONS', `Successfully fetched ${txCount} of ${totalTx} transactions`);
    logDiagnostic.response(endpoint, 200, { 
      success: true, 
      transaction_count: txCount,
      total_transactions: totalTx 
    });

    res.json({
      success: true,
      transactions: transactionsResponse.data.transactions,
      accounts: transactionsResponse.data.accounts,
      total_transactions: transactionsResponse.data.total_transactions
    });
  } catch (error) {
    logDiagnostic.error('GET_TRANSACTIONS', 'Failed to fetch transactions', error);
    
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
        statusCode = 401;
      } else if (plaidError.error_code === 'INVALID_ACCESS_TOKEN') {
        errorMessage = "Invalid access token. Please reconnect your bank account.";
        statusCode = 401;
      } else if (plaidError.error_code === 'PRODUCT_NOT_READY') {
        errorMessage = "Transaction data is not yet available. Please try again in a few moments.";
        statusCode = 503;
      } else if (plaidError.error_message) {
        errorMessage = `Bank error: ${plaidError.error_message}`;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    logDiagnostic.response(endpoint, statusCode, { error: errorMessage });
    
    res.status(statusCode).json({ 
      success: false,
      error: errorMessage,
      error_code: error.response?.data?.error_code,
      error_type: error.response?.data?.error_type
    });
  }
});

// Sync transactions to Firebase (includes pending transactions)
app.post("/api/plaid/sync_transactions", async (req, res) => {
  const endpoint = "/api/plaid/sync_transactions";
  logDiagnostic.request(endpoint, req.body);
  
  try {
    const { userId, start_date, end_date } = req.body;

    if (!userId) {
      logDiagnostic.error('SYNC_TRANSACTIONS', 'Missing userId in request');
      return res.status(400).json({ 
        success: false,
        error: "userId is required. Please authenticate." 
      });
    }

    // Retrieve access token from Firestore
    const credentials = await getPlaidCredentials(userId);
    if (!credentials) {
      logDiagnostic.error('SYNC_TRANSACTIONS', 'No Plaid credentials found for user');
      return res.status(404).json({ 
        success: false,
        error: "No Plaid connection found. Please connect your bank account first.",
        error_code: "NO_CREDENTIALS"
      });
    }

    // Default to last 30 days if no dates provided
    const endDate = end_date || new Date().toISOString().split('T')[0];
    const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    logDiagnostic.info('SYNC_TRANSACTIONS', `Syncing transactions from ${startDate} to ${endDate}`);

    // Fetch transactions from Plaid (including pending)
    const transactionsResponse = await plaidClient.transactionsGet({
      access_token: credentials.accessToken,
      start_date: startDate,
      end_date: endDate,
      options: {
        count: 500,
        offset: 0,
        include_personal_finance_category: true
      }
    });

    const plaidTransactions = transactionsResponse.data.transactions;
    const txCount = plaidTransactions.length;
    const totalTx = transactionsResponse.data.total_transactions;
    
    logDiagnostic.info('SYNC_TRANSACTIONS', `Fetched ${txCount} of ${totalTx} transactions from Plaid`);

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

    logDiagnostic.info('SYNC_TRANSACTIONS', `Found ${manualPendingCharges.length} manual pending charges for deduplication check`);

    // Sync transactions to Firebase
    let addedCount = 0;
    let updatedCount = 0;
    let pendingCount = 0;
    let deduplicatedCount = 0;

    const batch = db.batch();

    for (const plaidTx of plaidTransactions) {
      const txDocRef = transactionsRef.doc(plaidTx.transaction_id);
      
      // Check if transaction exists
      const txDoc = await txDocRef.get();
      
      // Prepare transaction data in our format
      const transactionData = {
        transaction_id: plaidTx.transaction_id,
        account_id: plaidTx.account_id,
        amount: plaidTx.amount,
        date: plaidTx.date,
        name: plaidTx.name,
        merchant_name: plaidTx.merchant_name || plaidTx.name,
        category: plaidTx.category || [],
        pending: plaidTx.pending || false,  // ← KEY FIELD!
        payment_channel: plaidTx.payment_channel || 'other',
        source: 'plaid',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        lastSyncedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (plaidTx.pending) {
        pendingCount++;
      }

      // Check for duplicate manual pending charges
      const matchingManualCharge = manualPendingCharges.find(manual => {
        // Match criteria:
        // 1. Same account
        // 2. Same amount (within $0.01 tolerance for floating point)
        // 3. Date within 3 days
        // 4. Merchant name similarity (basic check)
        
        const accountMatch = manual.account_id === plaidTx.account_id || manual.account === plaidTx.account_id;
        const amountMatch = Math.abs(manual.amount - plaidTx.amount) < 0.01;
        
        const manualDate = new Date(manual.date);
        const plaidDate = new Date(plaidTx.date);
        const daysDiff = Math.abs((manualDate - plaidDate) / (1000 * 60 * 60 * 24));
        const dateMatch = daysDiff <= 3;
        
        const manualName = (manual.merchant_name || manual.name || manual.description || '').toLowerCase();
        const plaidName = (plaidTx.merchant_name || plaidTx.name || '').toLowerCase();
        const nameMatch = manualName.includes(plaidName) || plaidName.includes(manualName) || 
                         (manualName.length > 3 && plaidName.length > 3 && 
                          (manualName.substring(0, Math.min(5, manualName.length)) === plaidName.substring(0, Math.min(5, plaidName.length))));
        
        return accountMatch && amountMatch && dateMatch && nameMatch;
      });

      if (matchingManualCharge) {
        // Found a duplicate - delete the manual pending charge
        const manualDocRef = transactionsRef.doc(matchingManualCharge.id);
        batch.delete(manualDocRef);
        deduplicatedCount++;
        
        logDiagnostic.info('SYNC_TRANSACTIONS', `Deduplicating: Manual charge "${matchingManualCharge.merchant_name}" matches Plaid transaction "${plaidTx.name}"`);
        
        // Remove from the list so we don't match it again
        const index = manualPendingCharges.indexOf(matchingManualCharge);
        if (index > -1) {
          manualPendingCharges.splice(index, 1);
        }
      }

      if (!txDoc.exists) {
        // New transaction - add to batch
        batch.set(txDocRef, transactionData);
        addedCount++;
      } else {
        // Existing transaction - update it (in case pending status changed)
        batch.update(txDocRef, transactionData);
        updatedCount++;
      }
    }

    // Commit the batch
    await batch.commit();

    logDiagnostic.info('SYNC_TRANSACTIONS', `Synced ${addedCount} new, ${updatedCount} updated, ${pendingCount} pending, ${deduplicatedCount} deduplicated transactions`);
    logDiagnostic.response(endpoint, 200, { 
      success: true, 
      added: addedCount,
      updated: updatedCount,
      pending: pendingCount,
      deduplicated: deduplicatedCount
    });

    res.json({
      success: true,
      added: addedCount,
      updated: updatedCount,
      pending: pendingCount,
      deduplicated: deduplicatedCount,
      total: txCount,
      message: `Synced ${addedCount} new transactions (${pendingCount} pending${deduplicatedCount > 0 ? `, ${deduplicatedCount} deduplicated` : ''})`
    });
  } catch (error) {
    logDiagnostic.error('SYNC_TRANSACTIONS', 'Failed to sync transactions', error);
    
    // Provide more detailed error information
    let errorMessage = "Failed to sync transactions from your bank";
    let statusCode = 500;
    
    if (error.response) {
      // Plaid API error
      const plaidError = error.response.data;
      statusCode = error.response.status;
      
      logDiagnostic.error('SYNC_TRANSACTIONS', `Plaid API error: ${plaidError.error_code}`, {
        error_code: plaidError.error_code,
        error_type: plaidError.error_type,
        error_message: plaidError.error_message
      });
      
      if (plaidError.error_code === 'ITEM_LOGIN_REQUIRED') {
        errorMessage = "Your bank connection has expired. Please reconnect your account.";
        statusCode = 401;
      } else if (plaidError.error_code === 'INVALID_ACCESS_TOKEN') {
        errorMessage = "Invalid access token. Please reconnect your bank account.";
        statusCode = 401;
      } else if (plaidError.error_code === 'PRODUCT_NOT_READY') {
        errorMessage = "Transaction data is not yet available. Please try again in a few moments.";
        statusCode = 503;
      } else if (plaidError.error_message) {
        errorMessage = `Bank error: ${plaidError.error_message}`;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    logDiagnostic.response(endpoint, statusCode, { error: errorMessage });
    
    res.status(statusCode).json({ 
      success: false,
      error: errorMessage,
      error_code: error.response?.data?.error_code,
      error_type: error.response?.data?.error_type
    });
  }
});

// ============================================================================
// PLAID HEALTH CHECK ENDPOINT
// ============================================================================

app.get("/api/plaid/health", async (req, res) => {
  const endpoint = "/api/plaid/health";
  logDiagnostic.info('HEALTH_CHECK', 'Running Plaid health check');
  
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

  // Check 1: Credentials Configuration
  if (!PLAID_CLIENT_ID || PLAID_CLIENT_ID === 'demo_client_id') {
    healthStatus.checks.credentials.status = 'error';
    healthStatus.checks.credentials.message = 'PLAID_CLIENT_ID not configured or using demo value';
    logDiagnostic.error('HEALTH_CHECK', 'Invalid PLAID_CLIENT_ID configuration');
  } else if (!PLAID_SECRET || PLAID_SECRET === 'demo_secret') {
    healthStatus.checks.credentials.status = 'error';
    healthStatus.checks.credentials.message = 'PLAID_SECRET not configured or using demo value';
    logDiagnostic.error('HEALTH_CHECK', 'Invalid PLAID_SECRET configuration');
  } else {
    healthStatus.checks.credentials.status = 'ok';
    healthStatus.checks.credentials.message = 'Plaid credentials configured';
  }

  // Check 2: Configuration
  if (PLAID_ENV === 'sandbox' || PLAID_ENV === 'development' || PLAID_ENV === 'production') {
    healthStatus.checks.configuration.status = 'ok';
    healthStatus.checks.configuration.message = `Environment set to: ${PLAID_ENV}`;
  } else {
    healthStatus.checks.configuration.status = 'warning';
    healthStatus.checks.configuration.message = `Unknown PLAID_ENV: ${PLAID_ENV}`;
  }

  // Check 3: API Connectivity - Try to create a test link token
  if (healthStatus.checks.credentials.status === 'ok') {
    try {
      logDiagnostic.info('HEALTH_CHECK', 'Testing Plaid API connectivity');
      
      const testRequest = {
        user: {
          client_user_id: 'health-check-test',
        },
        client_name: "Smart Money Tracker Health Check",
        products: ["auth"],
        country_codes: ["US"],
        language: "en",
      };

      const testResponse = await plaidClient.linkTokenCreate(testRequest);
      
      if (testResponse.data.link_token) {
        healthStatus.checks.api_connectivity.status = 'ok';
        healthStatus.checks.api_connectivity.message = 'Successfully connected to Plaid API';
        logDiagnostic.info('HEALTH_CHECK', 'Plaid API connectivity verified');
      } else {
        healthStatus.checks.api_connectivity.status = 'error';
        healthStatus.checks.api_connectivity.message = 'Received response but no link token';
        logDiagnostic.error('HEALTH_CHECK', 'Invalid response from Plaid API');
      }
    } catch (error) {
      healthStatus.checks.api_connectivity.status = 'error';
      healthStatus.checks.api_connectivity.message = error.message || 'Failed to connect to Plaid API';
      
      if (error.response?.data?.error_code) {
        healthStatus.checks.api_connectivity.error_code = error.response.data.error_code;
        healthStatus.checks.api_connectivity.error_type = error.response.data.error_type;
      }
      
      logDiagnostic.error('HEALTH_CHECK', 'Failed to connect to Plaid API', error);
    }
  } else {
    healthStatus.checks.api_connectivity.status = 'skipped';
    healthStatus.checks.api_connectivity.message = 'Skipped due to invalid credentials';
  }

  // Determine overall status
  const allChecks = Object.values(healthStatus.checks);
  if (allChecks.every(check => check.status === 'ok')) {
    healthStatus.status = 'healthy';
  } else if (allChecks.some(check => check.status === 'error')) {
    healthStatus.status = 'unhealthy';
  } else {
    healthStatus.status = 'degraded';
  }

  logDiagnostic.info('HEALTH_CHECK', `Health check completed: ${healthStatus.status}`);
  logDiagnostic.response(endpoint, 200, { status: healthStatus.status });

  // Return 200 with health status (don't use 503 to avoid confusion with server downtime)
  res.json(healthStatus);
});

// Health check
app.get("/healthz", (req, res) => res.send("ok"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
