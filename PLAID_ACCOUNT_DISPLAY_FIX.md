# Plaid Account Display Fix - Implementation Summary

## Problem Statement

After reconnecting banks, transactions were displaying Plaid account IDs (e.g., `jZJlaLAn46TK4VJOQKwtbmZLNL6slI1wmfBy`) instead of readable bank names (e.g., "Bank of America", "SoFi Checking").

### Root Cause

When banks were reconnected, the `/api/plaid/exchange_token` endpoint:
1. ✅ Saved credentials to `users/{userId}/plaid_items/{itemId}` (backend storage)
2. ❌ Did NOT update `users/{userId}/settings/personal` with `plaidAccounts` array (frontend display data)

The frontend's transaction display code (Transactions.jsx line 1693) tries to look up bank names from the `plaidAccounts` array:

```javascript
<span className="transaction-account-inline">
  | {accounts[transaction.account_id]?.name || 
     accounts[transaction.account]?.name || 
     transaction.account_id ||  // ← Falls back to showing ID
     'Unknown Account'}
</span>
```

Without `plaidAccounts` in settings/personal, the lookup fails and shows raw account_id.

## Solution

### Backend Changes (`backend/server.js`)

Modified the `/api/plaid/exchange_token` endpoint to:

1. **Update settings/personal with display metadata** (after line 430):
   - Fetches current settings to preserve existing data
   - Formats account data with all fields needed by frontend:
     - `account_id`, `name`, `official_name`, `mask`
     - `type`, `subtype`, `balance`
     - `institution_name`, `item_id`
   - Removes old accounts with same `item_id` (handles reconnection)
   - Merges new accounts into `plaidAccounts` array
   - Uses server timestamp for `lastUpdated`

2. **Enhance API response** (before line 497):
   - Adds `institution_name` to each account object
   - Includes `institution_name` at the response root level
   - Ensures frontend has all data needed for display

3. **Added diagnostic logging**:
   - Logs when updating settings/personal
   - Logs number of accounts added
   - Helps with debugging in production

### Frontend Changes (`frontend/src/pages/Accounts.jsx`)

Updated the `handlePlaidSuccess` function to:

1. **Include institution_name** (line 478):
   - Extracts `institution_name` from account or response
   - Ensures formatted accounts have institution data

2. **Prevent duplicate accounts** (lines 488-490):
   - Filters out existing accounts with same `item_id`
   - Prevents duplication when backend has already updated
   - Maintains data consistency between backend and frontend

3. **Update state correctly** (line 499):
   - Uses `filteredAccounts` instead of `plaidAccounts`
   - Avoids duplicate accounts in UI state

## Data Flow

### Connection/Reconnection Flow:

1. **User initiates Plaid Link** → Gets `public_token`
2. **Frontend calls** `/api/plaid/exchange_token` with `public_token` and `userId`
3. **Backend exchanges token**:
   - Gets `access_token`, `item_id`, `institution_name`
   - Stores to `plaid_items` (secure credentials)
   - Fetches account details from Plaid
   - **NEW:** Updates `settings/personal` with display data
   - Returns accounts with `institution_name`
4. **Frontend receives response**:
   - Formats accounts with `institution_name`
   - **NEW:** Deduplicates by `item_id` before updating
   - Updates Firebase settings (backup/sync)
   - Updates UI state

### Transaction Display Flow:

1. **Transactions page loads** → Calls `loadAccounts()`
2. **loadAccounts** tries API → Falls back to Firebase
3. **loadFirebaseAccounts** reads `settings/personal`:
   - Extracts `plaidAccounts` array
   - Maps by `account_id` → `{name, type, balance, mask, institution}`
4. **Transaction rendering** uses `accounts[transaction.account_id].name`
5. **Result:** Shows "Bank of America" instead of account ID ✅

## Files Modified

1. **backend/server.js**
   - Lines 446-502: Added settings/personal update logic
   - Lines 484-501: Enhanced response with institution_name

2. **frontend/src/pages/Accounts.jsx**
   - Line 478: Added institution_name to formatted accounts
   - Lines 488-496: Added deduplication logic
   - Line 499: Fixed state update to use filtered accounts

## Testing Steps

### After Deployment:

1. **Reconnect all banks** (one by one or all at once via Plaid Link)
2. **Check Render logs** for:
   ```
   [INFO] [EXCHANGE_TOKEN] Updated settings/personal with X accounts for frontend display
   ```
3. **Check Firebase Console**:
   - Navigate to `users/{userId}/settings/personal`
   - Verify `plaidAccounts` array exists
   - Verify each account has `institution_name`
4. **Refresh Transactions page**
5. **Verify bank names** display correctly:
   - "Bank of America" instead of `jZJlaLAn46TK4VJOQKwtbmZLNL6slI1wmfBy`
   - "SoFi Checking" instead of random IDs

### Expected Firestore Structure:

```
users/
  {userId}/
    plaid_items/
      {itemId}/  # Secure credentials (backend only)
        accessToken: "..."
        itemId: "..."
        institutionName: "Bank of America"
        institutionId: "ins_..."
        status: "active"
        
    settings/
      personal/  # Display data (frontend accessible)
        plaidAccounts: [
          {
            account_id: "Qp7Bx..."
            name: "Plaid Checking"
            official_name: "Plaid Gold Standard 0% Interest Checking"
            mask: "0000"
            type: "depository"
            subtype: "checking"
            balance: 100
            institution_name: "Bank of America"  # ← Key field!
            item_id: "..."
          },
          ...
        ]
```

## Benefits

1. **Proper Two-Phase Storage Pattern**:
   - **Phase 1 (Secure):** Backend stores credentials in `plaid_items` (not accessible to frontend)
   - **Phase 2 (Display):** Backend stores metadata in `settings/personal` (frontend reads this)

2. **Permanent Fix**:
   - Future bank connections automatically work correctly
   - Reconnections properly replace old account data
   - No manual intervention needed

3. **Data Consistency**:
   - Both backend and frontend deduplicate by `item_id`
   - No duplicate accounts in storage or UI
   - Settings preserved across updates (merge: true)

4. **Better User Experience**:
   - Transactions show readable bank names
   - Clear account identification
   - Professional appearance

## Related Files

- **Transaction Display:** `frontend/src/pages/Transactions.jsx` (line 1690-1696)
- **Account Loading:** `frontend/src/pages/Transactions.jsx` (line 273-301)
- **Backend API:** `backend/server.js` (line 386-503)
- **Secure Storage:** `backend/server.js` (line 123-145)

## References

- Issue: After reconnecting banks, transactions showing account IDs instead of bank names
- Solution: Update `settings/personal` with `plaidAccounts` array during token exchange
- Pattern: Two-phase storage (secure credentials + display metadata)
