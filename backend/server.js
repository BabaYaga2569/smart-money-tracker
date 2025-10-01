import express from "express";
import cors from "cors";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

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
  basePath: PlaidEnvironments.sandbox, // Use sandbox for development
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": PLAID_CLIENT_ID,
      "PLAID-SECRET": PLAID_SECRET,
    },
  },
});

const plaidClient = new PlaidApi(configuration);

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
    const { public_token } = req.body;

    if (!public_token) {
      logDiagnostic.error('EXCHANGE_TOKEN', 'Missing public_token in request');
      return res.status(400).json({ error: "public_token is required" });
    }

    logDiagnostic.info('EXCHANGE_TOKEN', 'Exchanging public token for access token');

    // Exchange public token for access token
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token,
    });

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;
    
    logDiagnostic.info('EXCHANGE_TOKEN', `Successfully exchanged token, item_id: ${itemId}`);

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

    res.json({
      success: true,
      access_token: accessToken,
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
    const { access_token } = req.body;

    if (!access_token) {
      logDiagnostic.error('GET_BALANCES', 'Missing access_token in request');
      return res.status(400).json({ error: "access_token is required" });
    }

    logDiagnostic.info('GET_BALANCES', 'Fetching account balances');

    const balanceResponse = await plaidClient.accountsBalanceGet({
      access_token,
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

// Get accounts - provides account list for frontend (gracefully handles missing access_token)
app.get("/api/accounts", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const access_token = authHeader ? authHeader.replace('Bearer ', '') : null;

    if (!access_token) {
      return res.status(200).json({ 
        success: false,
        accounts: [],
        message: "No access token provided. Please connect your bank account." 
      });
    }

    const balanceResponse = await plaidClient.accountsBalanceGet({
      access_token,
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
    const { access_token, start_date, end_date } = req.body;

    if (!access_token) {
      logDiagnostic.error('GET_TRANSACTIONS', 'Missing access_token in request');
      return res.status(400).json({ 
        success: false,
        error: "Access token is required. Please connect your bank account first." 
      });
    }

    // Default to last 30 days if no dates provided
    const endDate = end_date || new Date().toISOString().split('T')[0];
    const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    logDiagnostic.info('GET_TRANSACTIONS', `Fetching transactions from ${startDate} to ${endDate}`);

    const transactionsResponse = await plaidClient.transactionsGet({
      access_token,
      start_date: startDate,
      end_date: endDate,
      options: {
        count: 100,
        offset: 0,
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
