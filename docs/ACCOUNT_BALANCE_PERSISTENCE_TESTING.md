# Account Balance Persistence Testing Guide

## Overview
This guide explains how to test the account balance persistence fix that ensures Plaid balances are saved to Firebase and remain available after page refresh.

## What Was Fixed

### Problem
Account balances were not persisting to Firebase after being fetched from Plaid. When users refreshed the page, balances would be lost and need to be re-fetched from Plaid, causing slow page loads and potential stale data.

### Solution
Added `updateAccountBalances()` helper function that:
1. Fetches fresh account balances from Plaid via `transactionsSync` API
2. Updates the `settings/personal` collection in Firebase with fresh balance data
3. Preserves existing account information (account_id, mask, institution_name)
4. Updates only the balance fields: `balance`, `current_balance`, `available_balance`

### Changes Made

#### 1. New Helper Function: `updateAccountBalances()`
**Location:** `/backend/server.js` (after `deduplicateAndSaveAccounts()` function)

**Purpose:** Updates account balances in Firebase settings/personal collection without adding/removing accounts

**Parameters:**
- `userId` (string): User's Firebase UID
- `accounts` (array): Array of account objects with fresh balance data from Plaid

**Returns:**
```javascript
{
  updated: number,  // Number of accounts with updated balances
  total: number     // Total number of accounts in settings
}
```

#### 2. Updated API Endpoints

**`/api/plaid/get_balances` (POST)**
- Now calls `updateAccountBalances()` after fetching balances
- Persists fresh balances to Firebase automatically
- Logs success/failure to diagnostic output

**`/api/accounts` (GET)**
- Now calls `updateAccountBalances()` after fetching accounts
- Persists fresh balances to Firebase automatically
- Logs success/failure to diagnostic output

## Testing Instructions

### Prerequisites
1. Backend server running with valid Plaid credentials
2. Firebase Admin SDK initialized with service account
3. At least one Plaid bank connection established

### Manual Testing Steps

#### Test 1: Initial Balance Fetch and Persistence
1. **Connect a bank account** via Plaid Link
   - Expected: Accounts appear on Accounts page
   - Check: Firebase Console -> `users/{userId}/settings/personal` should contain `plaidAccounts` array

2. **Verify balances are displayed**
   - Expected: Each account shows current balance
   - Check: Balance values match your actual bank account

3. **Check Firebase persistence**
   - Go to Firebase Console
   - Navigate to: `users/{userId}/settings/personal`
   - Verify `plaidAccounts` array contains:
     ```javascript
     {
       account_id: "...",
       name: "Checking Account",
       balance: 1234.56,
       current_balance: 1234.56,
       available_balance: 1234.56,
       lastUpdated: "2025-10-17T...",
       ...
     }
     ```

#### Test 2: Page Refresh Persistence
1. **Note current balances** on Accounts page
2. **Refresh the page** (Ctrl+R or F5)
3. **Observe behavior:**
   - Expected: Balances load immediately from Firebase cache
   - Expected: Page does NOT show loading spinner for long time
   - Expected: Balances remain visible during any background refresh

4. **Check browser console logs:**
   - Look for: `"✅ Loaded fresh balances from backend API"`
   - Look for: `"[REFRESH] Data is fresh (<10 min old)"`

#### Test 3: Balance Update Workflow
1. **Make a transaction** in your real bank account (or use Plaid Sandbox test modes)
2. **Click "Sync Transactions"** button in the app
3. **Verify balance updates:**
   - Expected: Balance changes to reflect new transaction
   - Check: Firebase Console shows updated balance value
   - Check: `lastBalanceUpdate` timestamp is recent

4. **Refresh the page**
   - Expected: Updated balance persists across refresh
   - Expected: No need to re-sync to see the balance

#### Test 4: Multiple Bank Accounts
1. **Connect multiple banks** (e.g., Chase + Bank of America)
2. **Verify all balances persist:**
   - Check Firebase: `plaidAccounts` array should have multiple entries
   - Check: Each account has unique `account_id` and `item_id`

3. **Refresh the page**
   - Expected: All account balances load from Firebase
   - Expected: Total balance is calculated correctly

#### Test 5: Error Handling
1. **Disconnect internet** temporarily
2. **Refresh the page**
   - Expected: App loads balances from Firebase cache
   - Expected: May show warning about stale data, but balances still display

3. **Reconnect internet**
   - Expected: Background sync updates balances
   - Expected: UI updates with fresh data

### Backend Logging Verification

When testing, check backend logs for these messages:

#### Successful Balance Update:
```
[INFO] [UPDATE_BALANCES] Updating balances for 3 accounts for user: abc123
[INFO] [UPDATE_BALANCES] Updating balance for account: Checking Account (...1234)
[INFO] [UPDATE_BALANCES] Updated 3 account balances
[INFO] [GET_BALANCES] Persisted balances to Firebase: 3 accounts updated
```

#### When No Accounts Exist:
```
[INFO] [UPDATE_BALANCES] No existing accounts to update
```

#### On Error:
```
[ERROR] [GET_BALANCES] Failed to persist balances to Firebase
```

## API Endpoint Details

### POST /api/plaid/get_balances
**Request:**
```json
{
  "userId": "firebase_user_uid"
}
```

**Response:**
```json
{
  "success": true,
  "accounts": [
    {
      "account_id": "abcd1234",
      "name": "Checking",
      "balances": {
        "available": 1234.56,
        "current": 1234.56
      },
      "institution_name": "Chase",
      ...
    }
  ]
}
```

**Side Effect:** Updates Firebase `users/{userId}/settings/personal` with fresh balances

### GET /api/accounts?userId={userId}
**Response:**
```json
{
  "success": true,
  "accounts": [
    {
      "account_id": "abcd1234",
      "name": "Checking",
      "balances": {
        "available": 1234.56,
        "current": 1234.56
      },
      ...
    }
  ]
}
```

**Side Effect:** Updates Firebase `users/{userId}/settings/personal` with fresh balances

## Firebase Data Structure

### Before Fix
```javascript
// users/{userId}/settings/personal
{
  plaidAccounts: [
    {
      account_id: "abc123",
      balance: 1000.00,  // STALE - never updated after initial connection
      // ... other fields
    }
  ]
}
```

### After Fix
```javascript
// users/{userId}/settings/personal
{
  plaidAccounts: [
    {
      account_id: "abc123",
      balance: 1234.56,        // FRESH - updated on every fetch
      current_balance: 1234.56, // FRESH
      available_balance: 1234.56, // FRESH
      lastUpdated: "2025-10-17T13:30:00Z", // NEW timestamp
      // ... other fields preserved
    }
  ],
  lastBalanceUpdate: Timestamp, // NEW - tracks when balances were last updated
  lastUpdated: Timestamp        // Existing field
}
```

## Troubleshooting

### Balances Not Updating
1. Check backend logs for `UPDATE_BALANCES` messages
2. Verify Firebase rules allow writes to `users/{userId}/settings/personal`
3. Confirm Plaid credentials are valid and not expired
4. Check that `userId` is correctly passed in API requests

### Firebase Permission Errors
If you see "PERMISSION_DENIED" errors:
1. Check Firebase Security Rules
2. Ensure Firebase Admin SDK has proper credentials
3. Verify service account has Firestore write permissions

### Plaid API Errors
If balances fail to fetch from Plaid:
1. Check Plaid credentials in `.env` file
2. Verify Plaid item is not in error state (check `/api/plaid/health_check`)
3. Check if bank requires re-authentication

## Success Criteria

✅ Account balances persist to Firebase after fetching from Plaid
✅ Page refresh loads balances immediately from Firebase cache
✅ Background sync updates balances without blocking UI
✅ Multiple bank accounts all persist correctly
✅ Error handling gracefully falls back to cached data
✅ Backend logs show successful balance updates
✅ Firebase Console shows recent `lastBalanceUpdate` timestamp

## Related Files
- `/backend/server.js` - Main backend file with `updateAccountBalances()` function
- `/frontend/src/pages/Accounts.jsx` - Frontend component that displays balances
- `/frontend/src/utils/BalanceCalculator.js` - Balance calculation utilities

## Notes
- Balance updates are idempotent - calling multiple times with same data is safe
- The function only updates balances, never adds/removes accounts
- Original account metadata (institution_name, mask, etc.) is preserved
- Firebase writes use merge mode to avoid overwriting other settings
