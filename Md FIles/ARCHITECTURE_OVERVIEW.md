# Smart Money Tracker - Architecture Overview

This document provides a comprehensive overview of the Smart Money Tracker application architecture, deployment, and Plaid integration.

## Table of Contents
1. [System Architecture](#system-architecture)
2. [Deployment Architecture](#deployment-architecture)
3. [Frontend-Backend Connection](#frontend-backend-connection)
4. [Plaid Integration](#plaid-integration)
5. [Environment Variables](#environment-variables)
6. [API Endpoints](#api-endpoints)
7. [Troubleshooting Guide](#troubleshooting-guide)
8. [Setup Guide](#setup-guide)

---

## System Architecture

### Overview
Smart Money Tracker is a full-stack web application that helps users manage their finances by connecting to bank accounts via Plaid, tracking bills, and visualizing spending.

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER BROWSER                              │
│                  (React SPA - Vite Build)                        │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NETLIFY (Frontend Host)                       │
│  • Serves static React application                              │
│  • URL: https://[your-app].netlify.app                          │
│  • Environment: VITE_API_URL points to backend                  │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ API Calls
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    RENDER (Backend Host)                         │
│  • Express.js REST API                                           │
│  • URL: https://smart-money-tracker-09ks.onrender.com          │
│  • Handles Plaid integration                                     │
│  • Environment: PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV        │
└─────────────────────────────────────────────────────────────────┘
                            │
                            │ API Calls
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                        PLAID API                                 │
│  • Financial data aggregation                                    │
│  • Bank account connections                                      │
│  • Transaction retrieval                                         │
└─────────────────────────────────────────────────────────────────┘
```

### Technology Stack

**Frontend:**
- React 19 with Vite
- React Router for navigation
- Firebase for user data persistence
- Chart.js for data visualization
- React Plaid Link for bank connections

**Backend:**
- Node.js with Express
- Plaid Node.js SDK
- CORS enabled for cross-origin requests

---

## Deployment Architecture

### Frontend (Netlify)
- **Repository**: BabaYaga2569/smart-money-tracker
- **Build Command**: `npm run build` (in frontend directory)
- **Publish Directory**: `frontend/dist`
- **Branch**: `main` (auto-deploys on push)

### Backend (Render)
- **Repository**: BabaYaga2569/smart-money-tracker
- **Build Command**: `npm install` (in backend directory)
- **Start Command**: `npm start`
- **Branch**: `main` (auto-deploys on push)
- **Environment**: Node 18+

---

## Frontend-Backend Connection

### How Frontend Connects to Backend

The frontend uses the `VITE_API_URL` environment variable to determine the backend URL:

```javascript
// Frontend code (e.g., PlaidLink.jsx)
const apiUrl = import.meta.env.VITE_API_URL || 'https://smart-money-tracker-09ks.onrender.com';
const response = await fetch(`${apiUrl}/api/plaid/create_link_token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ userId: 'steve-colburn' })
});
```

### Environment Configuration

**Development (Local):**
```bash
# frontend/.env.local
VITE_API_URL=http://localhost:5000
```

**Production (Netlify):**
```bash
# Configured in Netlify dashboard
VITE_API_URL=https://smart-money-tracker-09ks.onrender.com
```

### CORS Configuration

The backend is configured to accept requests from any origin:

```javascript
// backend/server.js
app.use(cors());
```

For production, you may want to restrict this:

```javascript
app.use(cors({
  origin: 'https://[your-app].netlify.app'
}));
```

---

## Plaid Integration

### What is Plaid?

Plaid is a financial data aggregation service that connects to thousands of banks and financial institutions. It provides:
- Secure bank account authentication
- Real-time balance information
- Transaction history
- Account metadata

### How Plaid Integration Works

```
┌─────────────┐        ┌─────────────┐        ┌─────────────┐        ┌─────────────┐
│   Frontend  │        │   Backend   │        │  Plaid API  │        │    Bank     │
└─────────────┘        └─────────────┘        └─────────────┘        └─────────────┘
      │                       │                       │                       │
      │ 1. Request Link Token │                       │                       │
      │──────────────────────>│                       │                       │
      │                       │ 2. Create Link Token  │                       │
      │                       │──────────────────────>│                       │
      │                       │<──────────────────────│                       │
      │<──────────────────────│  (link_token)         │                       │
      │                       │                       │                       │
      │ 3. Open Plaid Link UI │                       │                       │
      │ (User authenticates)  │                       │                       │
      │                       │                       │ 4. User Login         │
      │                       │                       │──────────────────────>│
      │                       │                       │<──────────────────────│
      │ 5. public_token       │                       │                       │
      │──────────────────────>│                       │                       │
      │                       │ 6. Exchange Token     │                       │
      │                       │──────────────────────>│                       │
      │                       │<──────────────────────│                       │
      │                       │  (access_token)       │                       │
      │                       │ 7. Store in Firestore │                       │
      │                       │   (server-side only)  │                       │
      │<──────────────────────│  (accounts, NO token) │                       │
      │                       │                       │                       │
      │ 8. Get Balances       │                       │                       │
      │ (send userId only)    │                       │                       │
      │──────────────────────>│ 9. Get token from     │                       │
      │                       │    Firestore          │                       │
      │                       │ 10. Get Balances      │                       │
      │                       │──────────────────────>│                       │
      │                       │<──────────────────────│                       │
      │<──────────────────────│  (account data)       │                       │
```

### Plaid Credentials Storage

**Backend (Render Environment Variables):**
- `PLAID_CLIENT_ID`: Your Plaid application client ID
- `PLAID_SECRET`: Your Plaid secret (sandbox/development/production)
- `PLAID_ENV`: Environment (`sandbox`, `development`, or `production`)
- `FIREBASE_SERVICE_ACCOUNT`: Firebase Admin SDK credentials for Firestore access

**Server-Side Secure Storage (Firestore):**
- `users/{userId}/plaid/credentials`
  - `accessToken`: Plaid access token (encrypted at rest)
  - `itemId`: Plaid item ID
  - `updatedAt`: Last update timestamp
- ✅ **Never exposed to frontend**
- ✅ **Per-user isolation**
- ✅ **Multi-user safe**

**Frontend (User Data):**
- ❌ `plaid_access_token`: **NO LONGER STORED** (security improvement)
- ✅ Account data: Stored in Firebase for display only (no sensitive tokens)
- ✅ Frontend only sends `userId` for API calls

### Plaid Security Best Practices

1. **Never expose Plaid secrets in frontend code** ✅
2. **Always exchange tokens server-side** ✅
3. **Store access tokens securely** ✅ (Server-side Firestore only)
4. **Never send tokens to frontend** ✅ (Tokens stay server-side)
5. **Use per-user storage isolation** ✅ (Separate Firestore documents)
5. **Implement token refresh** (Plaid tokens can expire)

---

## Environment Variables

### Backend Environment Variables

Set these in your Render dashboard or local `.env` file:

```bash
# backend/.env
PLAID_CLIENT_ID=your_client_id_from_plaid_dashboard
PLAID_SECRET=your_secret_from_plaid_dashboard
PLAID_ENV=sandbox  # or 'development' or 'production'
PORT=5000
NODE_ENV=production
```

**To get Plaid credentials:**
1. Sign up at https://dashboard.plaid.com/signup
2. Create a new application
3. Navigate to "Keys" section
4. Copy your Client ID and Secret

**Environment values:**
- `sandbox`: Use test credentials (user_good/pass_good)
- `development`: Use real credentials with select test banks
- `production`: Live production environment

### Frontend Environment Variables

Set these in your Netlify dashboard or local `.env.local` file:

```bash
# frontend/.env.local
VITE_API_URL=https://smart-money-tracker-09ks.onrender.com

# Firebase configuration (if using Firebase)
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
VITE_FIREBASE_PROJECT_ID=your_firebase_project_id
```

---

## API Endpoints

### Backend API Endpoints

All endpoints are prefixed with the backend URL: `https://smart-money-tracker-09ks.onrender.com`

#### Health Check Endpoints

**GET /healthz**
- Simple health check
- Returns: `"ok"`

**GET /api/plaid/health**
- Comprehensive Plaid health check
- Verifies credentials, configuration, and API connectivity
- Returns:
  ```json
  {
    "status": "healthy",  // or "unhealthy", "degraded"
    "timestamp": "2024-01-01T00:00:00.000Z",
    "checks": {
      "credentials": { "status": "ok", "message": "..." },
      "api_connectivity": { "status": "ok", "message": "..." },
      "configuration": { "status": "ok", "message": "..." }
    },
    "environment": {
      "plaid_env": "sandbox",
      "has_client_id": true,
      "has_secret": true,
      "node_env": "production"
    }
  }
  ```

#### Plaid Integration Endpoints

**POST /api/plaid/create_link_token**
- Creates a Plaid Link token for initializing Plaid Link UI
- Request:
  ```json
  {
    "userId": "user-id"
  }
  ```
- Response:
  ```json
  {
    "link_token": "link-sandbox-xxx-xxx",
    "expiration": "2024-01-01T00:00:00Z"
  }
  ```

**POST /api/plaid/exchange_token**
- Exchanges public token for access token and stores it securely server-side
- **Security:** Access token is stored in Firestore and never returned to frontend
- Request:
  ```json
  {
    "public_token": "public-sandbox-xxx-xxx",
    "userId": "firebase-user-uid"
  }
  ```
- Response:
  ```json
  {
    "success": true,
    "item_id": "item-id",
    "accounts": [...]
  }
  ```
  Note: `access_token` is NOT in response (stored securely server-side)

**POST /api/plaid/get_balances**
- Fetches current account balances
- **Security:** Retrieves access token from Firestore using userId
- Request:
  ```json
  {
    "userId": "firebase-user-uid"
  }
  ```
- Response:
  ```json
  {
    "success": true,
    "accounts": [
      {
        "account_id": "xxx",
        "name": "Checking Account",
        "balances": {
          "current": 1000.00,
          "available": 950.00
        },
        "type": "depository",
        "subtype": "checking"
      }
    ]
  }
  ```

**POST /api/plaid/get_transactions**
- Fetches transaction history
- **Security:** Retrieves access token from Firestore using userId
- Request:
  ```json
  {
    "userId": "firebase-user-uid",
    "start_date": "2024-01-01",
    "end_date": "2024-01-31"
  }
  ```
- Response:
  ```json
  {
    "success": true,
    "transactions": [...],
    "accounts": [...],
    "total_transactions": 42
  }
  ```

**GET /api/accounts**
- Fetches accounts (gracefully handles missing token)
- Headers:
  ```
  Authorization: Bearer access-sandbox-xxx-xxx
  ```
- Response:
  ```json
  {
    "success": true,
    "accounts": [...]
  }
  ```

---

## Troubleshooting Guide

### Common Issues and Solutions

#### 1. "Connect Bank" Button Not Working

**Symptoms:**
- Button is disabled or shows loading state indefinitely
- Error message about failing to create link token

**Diagnostic Steps:**
1. Check backend logs for errors
2. Verify backend is running: `curl https://smart-money-tracker-09ks.onrender.com/healthz`
3. Check Plaid health: `curl https://smart-money-tracker-09ks.onrender.com/api/plaid/health`
4. Verify frontend can reach backend: Check browser console for CORS/network errors

**Common Causes:**
- Backend not running or crashed
- Invalid Plaid credentials
- CORS configuration issue
- Network connectivity problem

**Solutions:**
```bash
# 1. Check Plaid health endpoint
curl https://smart-money-tracker-09ks.onrender.com/api/plaid/health

# 2. Verify backend logs in Render dashboard
# Look for:
# [ERROR] [CREATE_LINK_TOKEN] Failed to create link token
# [ERROR] [NETWORK] Cannot reach Plaid API

# 3. Check Plaid credentials in Render
# Ensure PLAID_CLIENT_ID and PLAID_SECRET are set and not demo values

# 4. Test locally
cd backend
npm start
# Then test: curl http://localhost:5000/api/plaid/health
```

#### 2. CORS Errors

**Symptoms:**
- Browser console shows: "Access to fetch blocked by CORS policy"
- Network tab shows failed requests with CORS error

**Diagnostic Steps:**
1. Check browser console for exact error message
2. Verify `VITE_API_URL` is set correctly in Netlify
3. Check backend CORS configuration

**Solutions:**
```javascript
// backend/server.js - Restrict CORS to specific origin
app.use(cors({
  origin: 'https://your-app.netlify.app',
  credentials: true
}));
```

#### 3. Plaid Connection Expired

**Symptoms:**
- Account tiles show "Sync Paused" badge
- Error message: "Your bank connection has expired"
- API returns 401 status code

**Diagnostic Steps:**
1. Check error type in PlaidConnectionManager
2. Look for `ITEM_LOGIN_REQUIRED` or `INVALID_ACCESS_TOKEN` in backend logs

**Solutions:**
1. Go to Accounts page
2. Click "Reconnect Bank" button
3. Complete Plaid authentication flow
4. New access token will be saved

#### 4. Backend Logs Not Showing

**Where to Find Backend Logs:**
- **Render Dashboard**: Go to your service → Logs tab
- **Local Development**: Check terminal where `npm start` is running

**What to Look For:**
```
[INFO] [CREATE_LINK_TOKEN] Creating link token for user: steve-colburn
[REQUEST] /api/plaid/create_link_token { userId: 'steve-colburn' }
[RESPONSE] /api/plaid/create_link_token [200] { success: true, has_link_token: true }
```

**Troubleshooting Log Issues:**
```bash
# Verify backend is running
curl https://smart-money-tracker-09ks.onrender.com/healthz

# Check Plaid health with detailed output
curl https://smart-money-tracker-09ks.onrender.com/api/plaid/health | jq

# Test link token creation
curl -X POST https://smart-money-tracker-09ks.onrender.com/api/plaid/create_link_token \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-user"}'
```

#### 5. Accounts Not Showing After Connection

**Symptoms:**
- Successfully connected to Plaid
- No accounts visible in UI
- Frontend shows "No accounts available"

**Diagnostic Steps:**
1. Check localStorage for `plaid_access_token`
2. Verify Firebase has account data
3. Check backend logs for token exchange success
4. Test balance endpoint manually

**Solutions:**
```bash
# Test balance endpoint with your access token
curl -X POST https://smart-money-tracker-09ks.onrender.com/api/plaid/get_balances \
  -H "Content-Type: application/json" \
  -d '{"access_token":"your-access-token-here"}'

# If this returns accounts, the issue is in frontend data flow
# Check PlaidConnectionManager.js and Firebase integration
```

#### 6. Environment Variable Issues

**Symptoms:**
- Health check shows "credentials not configured"
- Backend logs show "demo_client_id" or "demo_secret"

**Solutions:**
1. **Render Dashboard:**
   - Go to your service → Environment tab
   - Add/update: `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV`
   - Click "Save Changes"
   - Redeploy if necessary

2. **Local Development:**
   ```bash
   cd backend
   cp .env.example .env
   # Edit .env with your credentials
   nano .env
   ```

3. **Netlify Dashboard:**
   - Go to Site settings → Build & deploy → Environment
   - Add/update: `VITE_API_URL`
   - Trigger new deployment

---

## Setup Guide

### Step-by-Step Setup for New Developers

#### 1. Get Plaid Credentials

1. Sign up at https://dashboard.plaid.com/signup
2. Create a new application
3. Navigate to "Keys" section
4. Copy your Client ID and Sandbox Secret

#### 2. Clone Repository

```bash
git clone https://github.com/BabaYaga2569/smart-money-tracker.git
cd smart-money-tracker
```

#### 3. Setup Backend

```bash
cd backend
npm install

# Create .env file
cat > .env << EOF
PLAID_CLIENT_ID=your_client_id_here
PLAID_SECRET=your_sandbox_secret_here
PLAID_ENV=sandbox
PORT=5000
EOF

# Start backend
npm start
```

Verify backend is running:
```bash
curl http://localhost:5000/healthz
curl http://localhost:5000/api/plaid/health
```

#### 4. Setup Frontend

```bash
cd ../frontend
npm install

# Create .env.local file
cat > .env.local << EOF
VITE_API_URL=http://localhost:5000
EOF

# Start frontend
npm run dev
```

#### 5. Test Plaid Connection

1. Open browser to `http://localhost:5173` (or the port shown)
2. Navigate to Accounts page
3. Click "Connect Bank"
4. Use Plaid sandbox credentials:
   - Institution: Any bank
   - Username: `user_good`
   - Password: `pass_good`
5. Complete flow and verify accounts appear

#### 6. Deploy to Production

**Backend (Render):**
1. Connect GitHub repository
2. Set root directory to `backend`
3. Set environment variables in dashboard
4. Deploy

**Frontend (Netlify):**
1. Connect GitHub repository
2. Set build command: `cd frontend && npm install && npm run build`
3. Set publish directory: `frontend/dist`
4. Set `VITE_API_URL` environment variable
5. Deploy

### Verification Checklist

After setup, verify:

- [ ] Backend health check returns "healthy": `/api/plaid/health`
- [ ] Frontend can connect to backend (no CORS errors)
- [ ] Plaid Link opens successfully
- [ ] Can connect to test bank with `user_good`/`pass_good`
- [ ] Accounts appear after connection
- [ ] Balance information is displayed
- [ ] Frontend error handling works (test by disconnecting backend)
- [ ] Backend logging shows detailed diagnostic information

---

## Debugging Tips

### Enable Verbose Logging

Backend logging is automatic. Look for these patterns:

```
[INFO] [CATEGORY] Message
[ERROR] [CATEGORY] Message
[REQUEST] /endpoint { data }
[RESPONSE] /endpoint [status] { data }
```

### Test Individual Components

**Test Backend Only:**
```bash
# Health check
curl http://localhost:5000/healthz

# Plaid health
curl http://localhost:5000/api/plaid/health

# Create link token
curl -X POST http://localhost:5000/api/plaid/create_link_token \
  -H "Content-Type: application/json" \
  -d '{"userId":"test"}'
```

**Test Frontend Only:**
1. Open browser DevTools (F12)
2. Go to Console tab
3. Check for errors
4. Go to Network tab
5. Monitor API calls

### Common Error Messages

| Error Message | Cause | Solution |
|--------------|-------|----------|
| "Unable to connect to Plaid API" | Backend can't reach Plaid | Check credentials, network |
| "CORS policy blocked" | Frontend can't reach backend | Fix CORS config or VITE_API_URL |
| "Access token expired" | Plaid token needs refresh | Reconnect bank account |
| "Failed to create link token" | Invalid Plaid credentials | Check PLAID_CLIENT_ID and PLAID_SECRET |
| "Network error" | Backend down or unreachable | Verify backend is running |

---

## Additional Resources

- [Plaid Documentation](https://plaid.com/docs/)
- [Plaid Sandbox Testing Guide](./PLAID_SANDBOX_TESTING_GUIDE.md)
- [Plaid Setup Guide](./PLAID_SETUP.md)
- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md)
- [Plaid Status Behavior](./PLAID_STATUS_BEHAVIOR.md)

---

## Support

For issues or questions:
1. Check this documentation
2. Review backend logs in Render dashboard
3. Check `/api/plaid/health` endpoint
4. Review browser console for frontend errors
5. Create an issue on GitHub

---

**Last Updated**: 2024
**Maintained by**: Smart Money Tracker Team
