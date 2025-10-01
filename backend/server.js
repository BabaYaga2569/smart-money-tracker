import express from "express";
import cors from "cors";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const app = express();
app.use(cors());
app.use(express.json());

// Plaid configuration
const configuration = new Configuration({
  basePath: PlaidEnvironments.sandbox, // Use sandbox for development
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID || "demo_client_id",
      "PLAID-SECRET": process.env.PLAID_SECRET || "demo_secret",
    },
  },
});

const plaidClient = new PlaidApi(configuration);

// Test route
app.get("/api/hello", (req, res) => {
  res.json({ message: "Backend is working!" });
});

// Create Plaid Link token
app.post("/api/plaid/create_link_token", async (req, res) => {
  try {
    const { userId } = req.body;
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
    res.json(createTokenResponse.data);
  } catch (error) {
    console.error("Error creating link token:", error);
    res.status(500).json({ error: error.message });
  }
});

// Exchange public token for access token
app.post("/api/plaid/exchange_token", async (req, res) => {
  try {
    const { public_token } = req.body;

    if (!public_token) {
      return res.status(400).json({ error: "public_token is required" });
    }

    // Exchange public token for access token
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token,
    });

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;

    // Get account information
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken,
    });

    const accounts = accountsResponse.data.accounts;

    // Get account balances
    const balanceResponse = await plaidClient.accountsBalanceGet({
      access_token: accessToken,
    });

    res.json({
      success: true,
      access_token: accessToken,
      item_id: itemId,
      accounts: balanceResponse.data.accounts,
    });
  } catch (error) {
    console.error("Error exchanging token:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get account balances
app.post("/api/plaid/get_balances", async (req, res) => {
  try {
    const { access_token } = req.body;

    if (!access_token) {
      return res.status(400).json({ error: "access_token is required" });
    }

    const balanceResponse = await plaidClient.accountsBalanceGet({
      access_token,
    });

    res.json({
      success: true,
      accounts: balanceResponse.data.accounts,
    });
  } catch (error) {
    console.error("Error getting balances:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get transactions for bill matching
app.post("/api/plaid/get_transactions", async (req, res) => {
  try {
    const { access_token, start_date, end_date } = req.body;

    if (!access_token) {
      return res.status(400).json({ 
        success: false,
        error: "Access token is required. Please connect your bank account first." 
      });
    }

    // Default to last 30 days if no dates provided
    const endDate = end_date || new Date().toISOString().split('T')[0];
    const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    console.log(`Fetching transactions from ${startDate} to ${endDate}`);

    const transactionsResponse = await plaidClient.transactionsGet({
      access_token,
      start_date: startDate,
      end_date: endDate,
      options: {
        count: 100,
        offset: 0,
      }
    });

    console.log(`Successfully fetched ${transactionsResponse.data.transactions.length} transactions`);

    res.json({
      success: true,
      transactions: transactionsResponse.data.transactions,
      accounts: transactionsResponse.data.accounts,
      total_transactions: transactionsResponse.data.total_transactions
    });
  } catch (error) {
    console.error("Error getting transactions:", error);
    
    // Provide more detailed error information
    let errorMessage = "Failed to fetch transactions from your bank";
    let statusCode = 500;
    
    if (error.response) {
      // Plaid API error
      const plaidError = error.response.data;
      statusCode = error.response.status;
      
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
    
    res.status(statusCode).json({ 
      success: false,
      error: errorMessage,
      error_code: error.response?.data?.error_code,
      error_type: error.response?.data?.error_type
    });
  }
});

// Health check
app.get("/healthz", (req, res) => res.send("ok"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
