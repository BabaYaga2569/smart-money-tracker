# Diagnostic Features Testing Guide

This document provides comprehensive testing instructions for the new Plaid diagnostic logging and health check features.

## Table of Contents
1. [Backend Diagnostic Logging](#backend-diagnostic-logging)
2. [Health Check Endpoint](#health-check-endpoint)
3. [Frontend Error Display](#frontend-error-display)
4. [Testing Scenarios](#testing-scenarios)
5. [Log Examples](#log-examples)

---

## Backend Diagnostic Logging

### Features Added

The backend now includes comprehensive diagnostic logging for all Plaid operations:

**Log Categories:**
- `[INFO]` - Informational messages about successful operations
- `[ERROR]` - Error messages with detailed error information
- `[REQUEST]` - Incoming API requests with sanitized data
- `[RESPONSE]` - API responses with status codes

**What Gets Logged:**
1. **Startup Configuration** - Environment variables (with masked secrets)
2. **All Plaid Requests** - Endpoint, request body (tokens redacted)
3. **All Plaid Responses** - Status code, response data (tokens redacted)
4. **Errors** - Full error details including:
   - Error message
   - Error code
   - Plaid API response data
   - Stack trace (first 3 lines)
5. **Network Issues** - CORS errors, connection timeouts, DNS failures

### Viewing Backend Logs

**Local Development:**
```bash
cd backend
npm start
# Logs appear in terminal
```

**Production (Render):**
1. Go to Render Dashboard
2. Select your service
3. Click "Logs" tab
4. View real-time logs

### Example Log Output

**Successful Operation:**
```
========================================
PLAID CONFIGURATION
========================================
PLAID_CLIENT_ID: 12345678...
PLAID_SECRET: abcdef12...
PLAID_ENV: sandbox
NODE_ENV: production
========================================

[REQUEST] /api/plaid/create_link_token { userId: 'steve-colburn' }
[INFO] [CREATE_LINK_TOKEN] Creating link token for user: steve-colburn
[INFO] [CREATE_LINK_TOKEN] Successfully created link token
[RESPONSE] /api/plaid/create_link_token [200] { success: true, has_link_token: true }
```

**Error with Network Issue:**
```
[REQUEST] /api/plaid/create_link_token { userId: 'test-user' }
[INFO] [CREATE_LINK_TOKEN] Creating link token for user: test-user
[ERROR] [CREATE_LINK_TOKEN] Failed to create link token {
  message: 'getaddrinfo ENOTFOUND sandbox.plaid.com',
  code: 'ENOTFOUND',
  response: undefined,
  stack: 'Error: getaddrinfo ENOTFOUND sandbox.plaid.com...'
}
[ERROR] [NETWORK] Cannot reach Plaid API - network issue
[RESPONSE] /api/plaid/create_link_token [503] { error: 'Cannot connect to Plaid API...' }
```

---

## Health Check Endpoint

### Endpoint: `/api/plaid/health`

**Method:** GET  
**Authentication:** None required  
**Purpose:** Verify Plaid integration is properly configured and operational

### Health Check Stages

The health check performs three checks:

1. **Credentials Check** - Verifies PLAID_CLIENT_ID and PLAID_SECRET are configured
2. **Configuration Check** - Validates PLAID_ENV setting
3. **API Connectivity Check** - Tests live connection to Plaid API

### Response Format

```json
{
  "status": "healthy",  // "healthy", "unhealthy", or "degraded"
  "timestamp": "2024-01-01T00:00:00.000Z",
  "checks": {
    "credentials": {
      "status": "ok",  // "ok", "error", or "warning"
      "message": "Plaid credentials configured"
    },
    "api_connectivity": {
      "status": "ok",
      "message": "Successfully connected to Plaid API"
    },
    "configuration": {
      "status": "ok",
      "message": "Environment set to: sandbox"
    }
  },
  "environment": {
    "plaid_env": "sandbox",
    "has_client_id": true,
    "has_secret": true,
    "node_env": "production"
  }
}
```

### Testing the Health Check

**Using curl:**
```bash
# Local
curl http://localhost:5000/api/plaid/health | jq

# Production
curl https://smart-money-tracker-09ks.onrender.com/api/plaid/health | jq
```

**Using browser:**
```
http://localhost:5000/api/plaid/health
```

### Health Status Meanings

| Status | Meaning | Action Required |
|--------|---------|----------------|
| `healthy` | All checks passed | None - system operational |
| `degraded` | Some warnings but mostly working | Review warnings in response |
| `unhealthy` | Critical checks failed | Fix configuration issues |

### Common Health Check Results

**1. Missing Credentials:**
```json
{
  "status": "unhealthy",
  "checks": {
    "credentials": {
      "status": "error",
      "message": "PLAID_CLIENT_ID not configured or using demo value"
    },
    "api_connectivity": {
      "status": "skipped",
      "message": "Skipped due to invalid credentials"
    }
  }
}
```
**Solution:** Set PLAID_CLIENT_ID and PLAID_SECRET in environment variables

**2. Network Issue:**
```json
{
  "status": "unhealthy",
  "checks": {
    "credentials": { "status": "ok" },
    "api_connectivity": {
      "status": "error",
      "message": "getaddrinfo ENOTFOUND sandbox.plaid.com",
      "error_code": "ENOTFOUND"
    }
  }
}
```
**Solution:** Check network connectivity and firewall settings

**3. Invalid Credentials:**
```json
{
  "status": "unhealthy",
  "checks": {
    "credentials": { "status": "ok" },
    "api_connectivity": {
      "status": "error",
      "message": "invalid_credentials",
      "error_code": "INVALID_CREDENTIALS"
    }
  }
}
```
**Solution:** Verify PLAID_CLIENT_ID and PLAID_SECRET are correct

---

## Frontend Error Display

### Enhanced PlaidLink Component

The PlaidLink component now provides:
- **Detailed error categorization** (timeout, CORS, network, API)
- **Contextual troubleshooting steps** for each error type
- **Better visual presentation** of errors
- **Console logging** for debugging

### Error Types and Messages

**1. Timeout Error**
```
Unable to connect to Plaid. Connection timeout. The backend server may be slow or unreachable.

Troubleshooting Steps:
• Check if the backend server is running
• Verify VITE_API_URL is set correctly
• The server may be slow to respond - try again in a moment
```

**2. CORS Error**
```
Unable to connect to Plaid. CORS configuration issue. This typically indicates a server configuration problem.

Troubleshooting Steps:
• This is a server configuration issue
• Check backend CORS settings
• Verify the backend URL is correct
• Contact support if the problem persists
```

**3. Network Error**
```
Unable to connect to Plaid. Network error. Please check your internet connection or the backend may be down.

Troubleshooting Steps:
• Check your internet connection
• Verify the backend server is running
• Try accessing the backend directly to test connectivity
• Check browser console for detailed network errors
```

**4. API Error**
```
Unable to connect to Plaid. Failed to create link token: 500

Troubleshooting Steps:
• The Plaid API may be experiencing issues
• Check Plaid status page
• Verify Plaid credentials are configured correctly
• Try again in a few minutes
```

### Console Logging

The frontend now logs detailed information to the browser console:

```javascript
[PlaidLink] Creating link token for user: steve-colburn
[PlaidLink] Backend API URL: https://smart-money-tracker-09ks.onrender.com
[PlaidLink] Successfully created link token
[PlaidLink] Opening Plaid Link UI
```

Or on error:
```javascript
[PlaidLink] Creating link token for user: steve-colburn
[PlaidLink] Backend API URL: https://smart-money-tracker-09ks.onrender.com
[PlaidLink] Failed to create link token: 500 { error: 'Cannot connect to Plaid API' }
[PlaidLink] Network error - backend may be unreachable
```

### PlaidConnectionManager Logging

```javascript
[PlaidConnectionManager] [2024-01-01T00:00:00.000Z] Checking Plaid connection { forceRefresh: false }
[PlaidConnectionManager] [2024-01-01T00:00:00.000Z] Access token check { hasToken: true }
[PlaidConnectionManager] [2024-01-01T00:00:00.000Z] Testing API connectivity { apiUrl: 'https://...' }
[PlaidConnectionManager] [2024-01-01T00:00:00.000Z] API response received { status: 200, ok: true }
[PlaidConnectionManager] [2024-01-01T00:00:00.000Z] Successfully retrieved accounts { accountCount: 3 }
```

---

## Testing Scenarios

### Scenario 1: Healthy System (All Working)

**Setup:**
- Backend running with valid Plaid credentials
- Frontend configured with correct API URL

**Expected Results:**
- Health check returns `"status": "healthy"`
- "Connect Bank" button works
- No errors in console
- Backend logs show successful operations

**Test:**
```bash
# 1. Check health
curl https://smart-money-tracker-09ks.onrender.com/api/plaid/health

# 2. Open app in browser
# 3. Click "Connect Bank"
# 4. Verify Plaid Link opens
```

### Scenario 2: Missing Credentials

**Setup:**
- Backend running without PLAID_CLIENT_ID or PLAID_SECRET

**Expected Results:**
- Health check returns `"status": "unhealthy"`
- Credentials check shows error
- API connectivity check is skipped
- Frontend shows API error with troubleshooting steps

**Test:**
```bash
# 1. Remove credentials from backend .env
unset PLAID_CLIENT_ID
unset PLAID_SECRET

# 2. Restart backend
npm start

# 3. Check health
curl http://localhost:5000/api/plaid/health
```

**Expected Log:**
```
[ERROR] [HEALTH_CHECK] Invalid PLAID_CLIENT_ID configuration
[INFO] [HEALTH_CHECK] Health check completed: unhealthy
```

### Scenario 3: Backend Unreachable

**Setup:**
- Frontend configured with API URL
- Backend stopped or unreachable

**Expected Results:**
- Frontend shows timeout or network error
- Error includes troubleshooting steps
- Console shows detailed error

**Test:**
```bash
# 1. Stop backend server
# 2. Open app in browser
# 3. Click "Connect Bank"
```

**Expected Frontend:**
- Error box with timeout message
- Troubleshooting steps displayed
- "Try Again" button visible

**Expected Console:**
```
[PlaidLink] Request timed out after 10 seconds
[PlaidConnectionManager] Connection timeout { error: 'Request timed out' }
```

### Scenario 4: CORS Configuration Issue

**Setup:**
- Backend CORS not configured for frontend domain
- Different origin than expected

**Expected Results:**
- Frontend shows CORS error
- Specific CORS troubleshooting steps
- Console shows CORS policy error

**Expected Frontend:**
- Error: "CORS configuration issue"
- Troubleshooting mentions server configuration
- Suggests contacting support

**Expected Browser Console:**
```
Access to fetch at '...' from origin '...' has been blocked by CORS policy
[PlaidLink] CORS error detected
```

### Scenario 5: Network Disconnected

**Setup:**
- Disconnect network/internet

**Expected Results:**
- Frontend shows network error
- Troubleshooting suggests checking connection
- Console shows network failure

**Test:**
1. Disconnect internet
2. Try to connect bank
3. Observe error message

**Expected:**
- Error: "Network error. Please check your internet connection"
- Console: `[PlaidLink] Network error - backend may be unreachable`

### Scenario 6: Invalid Plaid Credentials

**Setup:**
- Backend running with wrong PLAID_SECRET

**Expected Results:**
- Health check shows API connectivity error
- Error code from Plaid API
- Backend logs show Plaid error response

**Expected Backend Log:**
```
[ERROR] [CREATE_LINK_TOKEN] Failed to create link token {
  message: 'invalid_credentials',
  code: undefined,
  response: {
    error_code: 'INVALID_CREDENTIALS',
    error_type: 'INVALID_INPUT'
  }
}
```

---

## Log Examples

### Complete Successful Flow

```
========================================
PLAID CONFIGURATION
========================================
PLAID_CLIENT_ID: 12345678...
PLAID_SECRET: abcdef12...
PLAID_ENV: sandbox
NODE_ENV: production
========================================

Server running on 5000

[REQUEST] /api/plaid/create_link_token { userId: 'steve-colburn' }
[INFO] [CREATE_LINK_TOKEN] Creating link token for user: steve-colburn {}
[INFO] [CREATE_LINK_TOKEN] Successfully created link token {}
[RESPONSE] /api/plaid/create_link_token [200] { success: true, has_link_token: true }

[REQUEST] /api/plaid/exchange_token { public_token: '[REDACTED]' }
[INFO] [EXCHANGE_TOKEN] Exchanging public token for access token {}
[INFO] [EXCHANGE_TOKEN] Successfully exchanged token, item_id: item-sandbox-xxx {}
[INFO] [EXCHANGE_TOKEN] Fetching account information {}
[INFO] [EXCHANGE_TOKEN] Retrieved 3 accounts {}
[RESPONSE] /api/plaid/exchange_token [200] { 
  success: true, 
  item_id: 'item-sandbox-xxx',
  account_count: 3 
}

[REQUEST] /api/plaid/get_balances { access_token: '[REDACTED]' }
[INFO] [GET_BALANCES] Fetching account balances {}
[INFO] [GET_BALANCES] Successfully fetched balances for 3 accounts {}
[RESPONSE] /api/plaid/get_balances [200] { success: true, account_count: 3 }

[REQUEST] /api/plaid/get_transactions { access_token: '[REDACTED]', start_date: '2024-01-01', end_date: '2024-01-31' }
[INFO] [GET_TRANSACTIONS] Fetching transactions from 2024-01-01 to 2024-01-31 {}
[INFO] [GET_TRANSACTIONS] Successfully fetched 42 of 42 transactions {}
[RESPONSE] /api/plaid/get_transactions [200] { 
  success: true, 
  transaction_count: 42,
  total_transactions: 42 
}
```

### Error with Invalid Token

```
[REQUEST] /api/plaid/get_balances { access_token: '[REDACTED]' }
[INFO] [GET_BALANCES] Fetching account balances {}
[ERROR] [GET_BALANCES] Failed to fetch balances {
  message: 'the provided access token is not valid',
  code: undefined,
  response: {
    error_code: 'INVALID_ACCESS_TOKEN',
    error_type: 'INVALID_INPUT',
    error_message: 'the provided access token is not valid'
  },
  stack: 'AxiosError: Request failed with status code 400...'
}
[RESPONSE] /api/plaid/get_balances [400] { error: 'the provided access token is not valid' }
```

### Health Check Logs

```
[INFO] [HEALTH_CHECK] Running Plaid health check {}
[INFO] [HEALTH_CHECK] Testing Plaid API connectivity { apiUrl: 'https://sandbox.plaid.com' }
[INFO] [HEALTH_CHECK] Plaid API connectivity verified {}
[INFO] [HEALTH_CHECK] Health check completed: healthy {}
[RESPONSE] /api/plaid/health [200] { status: 'healthy' }
```

---

## Troubleshooting Tips

### Finding Logs

**Backend Logs:**
1. **Local**: Check terminal where `npm start` was run
2. **Render**: Dashboard → Service → Logs tab
3. **Search**: Use browser search (Ctrl+F) for error categories: `[ERROR]`, `[NETWORK]`, `[CORS]`

**Frontend Logs:**
1. Open browser DevTools (F12)
2. Go to Console tab
3. Filter by: `PlaidLink`, `PlaidConnectionManager`

### Using Logs to Diagnose Issues

**Problem: "Connect Bank" button not working**

1. Check health endpoint: `curl .../api/plaid/health`
2. Look for `[ERROR]` in backend logs
3. Check frontend console for network errors
4. Verify environment variables are set

**Problem: Accounts not appearing**

1. Check backend logs for successful token exchange
2. Look for `[INFO] [EXCHANGE_TOKEN] Retrieved X accounts`
3. Verify Firebase is working
4. Check PlaidConnectionManager logs

**Problem: Timeout errors**

1. Check if backend is responding: `curl .../healthz`
2. Verify API URL is correct in frontend
3. Check network connectivity
4. Look for slow response times in logs

---

## Best Practices

### Monitoring Production

1. **Regular Health Checks**: Set up monitoring to call `/api/plaid/health` every 5 minutes
2. **Log Aggregation**: Use Render's log viewing or set up external log aggregation
3. **Error Alerts**: Monitor for `[ERROR]` patterns in logs
4. **Response Times**: Track how long Plaid API calls take

### Development

1. **Always check logs first** when debugging Plaid issues
2. **Use health check** before starting development
3. **Test with sandbox** credentials before production
4. **Clear localStorage** when testing connection flows

### Debugging

1. **Enable browser console** to see frontend logs
2. **Check backend logs** for API errors
3. **Use health check** to verify configuration
4. **Test network connectivity** with curl commands

---

## Additional Resources

- [ARCHITECTURE_OVERVIEW.md](./ARCHITECTURE_OVERVIEW.md) - Complete architecture and setup guide
- [PLAID_SETUP.md](./PLAID_SETUP.md) - Plaid integration setup
- [PLAID_STATUS_BEHAVIOR.md](./PLAID_STATUS_BEHAVIOR.md) - Connection status handling

---

**Last Updated**: 2024
**Version**: 1.0
