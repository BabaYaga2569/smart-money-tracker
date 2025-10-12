# Testing Guide: Duplicate Account Prevention & Health Check Monitoring

## Overview
This document provides comprehensive testing scenarios for the new duplicate account prevention and connection health monitoring features.

## Features to Test

### 1. Duplicate Account Prevention
### 2. Connection Health Monitoring (/api/plaid/health_check)
### 3. Webhook Token Expiration Handling
### 4. Frontend Health Check Banner
### 5. Reconnection Required Badges

---

## Test Scenarios

### Scenario 1: Reconnect Bank (No Duplicates Created)

**Objective**: Verify that reconnecting a bank doesn't create duplicate accounts

**Steps**:
1. Connect a bank account through Plaid (e.g., Chase with checking account ending in 1234)
2. Navigate to Accounts page and verify account is visible
3. Note the `item_id` in browser console or Firebase
4. Disconnect the bank (delete the account)
5. Reconnect the same bank through Plaid
6. Verify in Firebase `settings/personal/plaidAccounts`:
   - Only ONE account with mask "1234" exists
   - No duplicate entries with different `item_id`

**Expected Result**: ✅ No duplicate accounts created, account matches by institution + mask

**Backend Logs to Check**:
```
[INFO] [DEDUPLICATE_ACCOUNTS] Deduplicating N accounts for user: <userId>
[INFO] [DEDUPLICATE_ACCOUNTS] Removing duplicate account: Chase ...1234
[INFO] [DEDUPLICATE_ACCOUNTS] Saved N accounts, deduplicated M
```

---

### Scenario 2: Health Check with All Connections Healthy

**Objective**: Verify health check returns correct status when all connections are working

**Steps**:
1. Ensure you have at least one active Plaid connection
2. Open browser DevTools Network tab
3. Navigate to Transactions or Accounts page
4. Look for POST request to `/api/plaid/health_check`
5. Inspect the response

**Expected Response**:
```json
{
  "status": "healthy",
  "message": "All bank connections are healthy",
  "items": [
    {
      "itemId": "item_123",
      "institutionName": "Chase",
      "status": "active",
      "needsReauth": false,
      "error": null
    }
  ],
  "summary": {
    "total": 1,
    "healthy": 1,
    "needsReauth": 0
  }
}
```

**Expected Result**: ✅ Status is "healthy", no banner shows, no reconnection badges

---

### Scenario 3: Simulate Token Expiration (via Webhook)

**Objective**: Verify webhook marks items as NEEDS_REAUTH on token expiration

**Manual Simulation**:
1. Manually update a Plaid item in Firebase:
   - Go to Firebase Console
   - Navigate to: `users/{userId}/plaid_items/{itemId}`
   - Set `status` to `"NEEDS_REAUTH"`
   - Set `error` to `{"error_code": "ITEM_LOGIN_REQUIRED"}`

2. Refresh the Accounts or Transactions page

**Expected Results**:
- ✅ Health check detects the NEEDS_REAUTH status
- ✅ Warning banner appears in Transactions page
- ✅ Affected bank is listed in the banner
- ✅ "Reconnection Required" badge appears on account in Accounts page

**Alternative (Production webhook test)**:
- Use Plaid sandbox environment
- Trigger an ITEM_LOGIN_REQUIRED error through Plaid dashboard
- Verify webhook handler updates the item status

---

### Scenario 4: Health Check Banner Display

**Objective**: Verify the health check banner appears and functions correctly

**Steps**:
1. Set up NEEDS_REAUTH status as in Scenario 3
2. Navigate to Transactions page
3. Observe the warning banner

**Expected Banner Content**:
- ⚠️ Icon
- "Bank Connection Needs Reconnection" heading
- List of affected banks (e.g., "Chase", "Bank of America")
- "Reconnect Banks →" button (links to /accounts)
- "Dismiss" button

**Interactions to Test**:
- Click "Reconnect Banks →" → Should navigate to Accounts page
- Click "Dismiss" → Banner should disappear
- Refresh page → Banner should reappear (not permanently dismissed)

**Expected Result**: ✅ Banner displays correctly with proper styling and functionality

---

### Scenario 5: Reconnection Required Badge

**Objective**: Verify the badge appears on accounts needing reconnection

**Steps**:
1. Set up NEEDS_REAUTH status as in Scenario 3
2. Navigate to Accounts page
3. Locate the account card for the affected bank

**Expected Badge Appearance**:
- Red gradient background (#dc2626 to #991b1b)
- White text: "⚠️ Reconnection Required"
- Positioned next to account name
- Proper font sizing and padding

**Expected Result**: ✅ Badge is visible and clearly indicates reconnection needed

---

### Scenario 6: Multiple Banks with Mixed Status

**Objective**: Verify health check handles multiple banks with different statuses

**Setup**:
1. Connect Bank A (e.g., Chase) - keep healthy
2. Connect Bank B (e.g., Bank of America) - mark as NEEDS_REAUTH

**Expected Health Check Response**:
```json
{
  "status": "needs_reauth",
  "message": "1 bank connection(s) need reconnection",
  "items": [
    {
      "itemId": "item_chase",
      "institutionName": "Chase",
      "status": "active",
      "needsReauth": false
    },
    {
      "itemId": "item_bofa",
      "institutionName": "Bank of America",
      "status": "NEEDS_REAUTH",
      "needsReauth": true
    }
  ],
  "summary": {
    "total": 2,
    "healthy": 1,
    "needsReauth": 1
  }
}
```

**Expected Frontend Behavior**:
- ✅ Warning banner shows "1 bank connection needs to be reconnected"
- ✅ Banner lists only "Bank of America"
- ✅ Chase account has no badge
- ✅ Bank of America account has "Reconnection Required" badge

---

### Scenario 7: Delete All Transactions Safety Logging

**Objective**: Verify safety logging captures user actions

**Steps**:
1. Navigate to Transactions page
2. Open browser console
3. Click "Delete All Transactions" button (don't confirm)
4. Observe console logs

**Expected Console Logs**:
```
⚠️ [DELETE_ALL] User initiated delete all transactions
[DELETE_ALL] Current user: <userId>
[DELETE_ALL] Current transaction count: 42
[DELETE_ALL] User cancelled at first confirmation
```

**If user proceeds through both confirmations**:
```
[DELETE_ALL] User confirmed - proceeding with deletion
```

**Expected Result**: ✅ All user actions are logged for debugging/auditing

---

## Backend API Testing

### Test Health Check Endpoint Directly

**Using curl**:
```bash
curl -X POST https://smart-money-tracker-09ks.onrender.com/api/plaid/health_check \
  -H "Content-Type: application/json" \
  -d '{"userId": "YOUR_USER_ID"}'
```

**Using Postman/Thunder Client**:
- Method: POST
- URL: `/api/plaid/health_check`
- Body (JSON):
  ```json
  {
    "userId": "YOUR_USER_ID"
  }
  ```

**Expected Responses**:

**No connections**:
```json
{
  "status": "no_connections",
  "message": "No bank connections found",
  "items": []
}
```

**All healthy**:
```json
{
  "status": "healthy",
  "message": "All bank connections are healthy",
  "items": [...],
  "summary": {
    "total": 2,
    "healthy": 2,
    "needsReauth": 0
  }
}
```

**Some need reauth**:
```json
{
  "status": "needs_reauth",
  "message": "1 bank connection(s) need reconnection",
  "items": [...],
  "summary": {
    "total": 2,
    "healthy": 1,
    "needsReauth": 1
  }
}
```

---

## Firebase Data Validation

### Check plaid_items Collection

**Path**: `users/{userId}/plaid_items/{itemId}`

**Expected Fields**:
```json
{
  "accessToken": "access-...",
  "itemId": "item_...",
  "institutionId": "ins_...",
  "institutionName": "Chase",
  "cursor": "...",
  "status": "active",  // or "NEEDS_REAUTH"
  "createdAt": Timestamp,
  "updatedAt": Timestamp,
  "error": null  // or error object if NEEDS_REAUTH
}
```

### Check settings/personal Collection

**Path**: `users/{userId}/settings/personal`

**Expected Fields**:
```json
{
  "plaidAccounts": [
    {
      "account_id": "acc_...",
      "name": "Chase Checking",
      "mask": "1234",
      "institution_name": "Chase",
      "item_id": "item_...",
      "balance": "1234.56",
      "type": "checking",
      ...
    }
  ],
  "lastUpdated": Timestamp
}
```

**Validation**:
- ✅ No duplicate accounts with same institution_name + mask
- ✅ Each account has proper item_id reference
- ✅ Institution names are properly stored

---

## Edge Cases to Test

### Edge Case 1: Reconnect Multiple Times
1. Connect bank A
2. Disconnect bank A
3. Reconnect bank A
4. Disconnect bank A again
5. Reconnect bank A again
6. Verify only ONE account exists (no duplicates from multiple reconnections)

### Edge Case 2: Different Banks with Same Mask
1. Connect Chase account ending in 1234
2. Connect Bank of America account ending in 1234
3. Verify BOTH accounts exist (different institutions)

### Edge Case 3: Same Bank, Different Accounts
1. Connect Chase checking ending in 1234
2. Connect Chase savings ending in 5678
3. Disconnect Chase checking
4. Reconnect Chase checking
5. Verify BOTH Chase accounts exist (different masks)

### Edge Case 4: No Plaid Connections
1. Ensure no Plaid connections exist
2. Navigate to Transactions page
3. Verify no health check banner appears
4. Verify health check returns "no_connections"

---

## Success Criteria

All features are working correctly if:

- ✅ Reconnecting a bank never creates duplicate accounts
- ✅ Health check correctly identifies all connection statuses
- ✅ Webhook handler marks items as NEEDS_REAUTH on token expiration
- ✅ Warning banner appears when banks need reconnection
- ✅ Banner lists only affected banks
- ✅ "Reconnection Required" badge appears on affected accounts
- ✅ Safety logging captures all delete operations
- ✅ All edge cases pass without errors

---

## Rollback Plan

If issues are found:

1. **Identify the specific problem**:
   - Check browser console for errors
   - Check backend logs for errors
   - Check Firebase data structure

2. **Disable health check temporarily** (if needed):
   - Comment out `checkConnectionHealth()` calls in frontend
   - Deploy hotfix

3. **Revert changes** (if major issues):
   ```bash
   git revert HEAD~2..HEAD
   git push origin copilot/fix-duplicate-accounts-monitoring
   ```

4. **Report issues**:
   - Include console logs
   - Include backend logs
   - Include steps to reproduce

---

## Monitoring in Production

After deployment, monitor for:

1. **Backend Logs**:
   - Search for `[DEDUPLICATE_ACCOUNTS]` - verify deduplication is working
   - Search for `[HEALTH_CHECK_USER]` - verify health checks are successful
   - Search for `[WEBHOOK]` - verify NEEDS_REAUTH marking works

2. **Firebase Console**:
   - Check `plaid_items` for proper status values
   - Check `settings/personal` for duplicate accounts
   - Monitor for unexpected data structures

3. **User Reports**:
   - Watch for reports of duplicate accounts
   - Watch for reports of missing reconnection warnings
   - Watch for unexpected banner behavior

---

## Additional Notes

- Health checks run automatically on page load (Transactions and Accounts pages)
- Health check results are cached in component state (not persisted)
- Banner dismissal is temporary (reappears on page reload)
- Safety logging only logs to browser console (not sent to backend)
- Deduplication happens server-side during token exchange

