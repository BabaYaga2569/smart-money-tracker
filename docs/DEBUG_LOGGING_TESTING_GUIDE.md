# Debug Logging Testing Guide

## Quick Start

After this PR is merged, follow these steps to diagnose the account loading issue:

### Step 1: Deploy and Access
1. Wait for deployment to complete (Netlify/Vercel)
2. Open the app in your browser
3. Navigate to the Transactions page

### Step 2: Open Developer Console
1. Press **F12** (Windows/Linux) or **Cmd+Option+I** (Mac)
2. Click on the **Console** tab
3. Clear any existing logs (click 🚫 icon)

### Step 3: Refresh and Observe
1. Hard refresh the page: **Ctrl+Shift+R** (Windows/Linux) or **Cmd+Shift+R** (Mac)
2. Wait for the page to fully load
3. Look for logs with emoji prefixes (🔄, ✅, ⚠️, etc.)

### Step 4: Capture Console Output
1. **Right-click** in the console area
2. Select **"Save as..."** or take a screenshot
3. Share the output for analysis

---

## What to Look For

### ✅ Expected Logs (Happy Path)

When everything works correctly, you should see:

```
🔄 [loadAccounts] Starting account load...
⏰ [loadAccounts] API request timed out after 3s, using Firebase
🔄 [loadFirebaseAccounts] Starting Firebase account load...
📊 [loadFirebaseAccounts] Firebase data retrieved: {...}
✅ [loadFirebaseAccounts] Updated PlaidConnectionManager with 4 accounts
✅ [loadFirebaseAccounts] Set accounts state from Firebase Plaid: {...}
🔍 [applyFilters] Running with: {...}
🔍 [applyFilters] First transaction account lookup: {...}
```

### 🔴 Problem Indicators

Look for these red flags:

1. **Account ID Mismatch**
   ```javascript
   🔍 [applyFilters] First transaction account lookup: {
     transaction_account_id: "RvVJ5Z7j4LT...",  // ID transaction is looking for
     availableAccountKeys: ["nepjkM0w7QC...", "zxydAykJ5DC..."],  // ❌ Missing the ID!
     foundAccount: null,  // ❌ Lookup failed!
     displayName: "unknown account"  // ❌ Fallback name!
   }
   ```
   **Problem:** Transaction references an account ID that's not in the loaded accounts.

2. **Empty Accounts State**
   ```javascript
   🔍 [applyFilters] Running with: {
     transactionsCount: 472,
     accountsCount: 0,  // ❌ No accounts loaded!
     accountIds: []
   }
   ```
   **Problem:** Accounts failed to load into state.

3. **No Firebase Data**
   ```javascript
   📊 [loadFirebaseAccounts] Firebase data retrieved: {
     plaidAccountsCount: 0,  // ❌ No accounts in Firebase!
     bankAccountsCount: 0,
     plaidAccountIds: []
   }
   ```
   **Problem:** Firebase has no account data.

4. **PlaidConnectionManager Not Updated**
   ```javascript
   // Missing this log:
   ✅ [loadFirebaseAccounts] Updated PlaidConnectionManager with X accounts
   ```
   **Problem:** PlaidConnectionManager.setPlaidAccounts() not called.

---

## Diagnostic Scenarios

### Scenario A: "| Account" Shows Instead of Bank Name

**Expected Console Output:**
```javascript
🔍 [applyFilters] First transaction account lookup: {
  transactionId: "...",
  transaction_account_id: "RvVJ5Z7j...",
  transaction_account: undefined,
  availableAccountKeys: ["nepjkM0w...", "zxydAykJ..."],  // ← Check if transaction ID is here
  foundAccount: null,  // ← null means not found
  displayName: "unknown account"  // ← This becomes "| Account" in UI
}
```

**Action:**
1. Compare `transaction_account_id` with `availableAccountKeys`
2. If ID is missing from available keys → **account ID mismatch**
3. Check Firebase data log to see what IDs Firebase has
4. Check if transactions and accounts have different account IDs

### Scenario B: No Accounts Load

**Expected Console Output:**
```javascript
🔄 [loadAccounts] Starting account load...
⏰ [loadAccounts] API request timed out after 3s, using Firebase
🔄 [loadFirebaseAccounts] Starting Firebase account load...
📊 [loadFirebaseAccounts] Firebase data retrieved: {
  plaidAccountsCount: 0,
  bankAccountsCount: 0,
  plaidAccountIds: []
}
```

**Action:**
1. Check if Firebase has data: Go to Firebase Console → Firestore
2. Navigate to: `users/{userId}/settings/personal`
3. Check if `plaidAccounts` array exists and has data
4. If no data → User needs to connect Plaid or add manual accounts

### Scenario C: Accounts Load But PlaidConnectionManager Doesn't See Them

**Expected Console Output:**
```javascript
✅ [loadFirebaseAccounts] Set accounts state from Firebase Plaid: {
  count: 4,
  accountIds: [...]
}
// ❌ Missing:
// ✅ [loadFirebaseAccounts] Updated PlaidConnectionManager with 4 accounts
```

**Action:**
1. Check if `PlaidConnectionManager.setPlaidAccounts()` is being called
2. Verify PlaidConnectionManager import is correct
3. Check for JavaScript errors that might prevent execution

### Scenario D: API Always Times Out

**Expected Console Output:**
```javascript
🔄 [loadAccounts] Starting account load...
// ... 3 seconds later ...
⏰ [loadAccounts] API request timed out after 3s, using Firebase
```

**Action:**
1. Check network tab for `/api/accounts` request
2. Verify API URL is correct: `import.meta.env.VITE_API_URL`
3. Check if backend is deployed and running
4. Check if auth token is valid

---

## Collecting Data for Bug Report

When reporting the issue, include:

### 1. Console Logs
Copy all logs from the console, or save as file:
```
Right-click in console → Save as... → logs.txt
```

### 2. Key Data Points

Extract these values from the logs:

**From Firebase:**
```javascript
📊 [loadFirebaseAccounts] Firebase data retrieved: {
  plaidAccountsCount: ???,  // ← How many?
  plaidAccountIds: [...]    // ← What IDs?
}
```

**From Accounts State:**
```javascript
✅ [loadFirebaseAccounts] Set accounts state from Firebase Plaid: {
  count: ???,               // ← Same as Firebase?
  accountIds: [...],        // ← Same IDs?
  firstAccount: { ... }     // ← What data?
}
```

**From Transaction:**
```javascript
🔍 [applyFilters] First transaction account lookup: {
  transaction_account_id: "???",  // ← What ID is transaction looking for?
  availableAccountKeys: [...],    // ← Does it include the transaction's ID?
  foundAccount: ???,              // ← null or object?
  displayName: "???"              // ← What name shows?
}
```

### 3. Expected vs Actual

**Expected:**
- Transaction `account_id`: `"RvVJ5Z7j..."`
- Available account keys: `["RvVJ5Z7j...", ...]` (includes it)
- Found account: `{ name: "USAA CLASSIC CHECKING", ... }`
- Display name: `"usaa classic checking"`

**Actual:**
- Transaction `account_id`: `"RvVJ5Z7j..."`
- Available account keys: `["nepjkM0w...", "zxydAykJ..."]` (❌ missing!)
- Found account: `null`
- Display name: `"unknown account"`

---

## Advanced Debugging

### Check PlaidConnectionManager State

In the console, run:
```javascript
PlaidConnectionManager.getStatus()
```

Expected output:
```javascript
{
  isApiWorking: true,
  hasToken: true,
  hasAccounts: true,  // ← Should be true if accounts loaded
  error: null
}
```

### Check Accounts State

In React DevTools:
1. Open React DevTools (Components tab)
2. Find `Transactions` component
3. Look at hooks → `accounts` state
4. Verify it has account objects with correct IDs

### Check Transactions Data

In the console, add temporary log:
```javascript
// In applyFilters or anywhere in Transactions component
console.log('All transactions:', transactions);
```

Look at first few transactions:
```javascript
{
  id: "...",
  account_id: "RvVJ5Z7j...",  // ← What ID?
  account: undefined,         // ← Old field?
  name: "Purchase",
  amount: -50.00,
  ...
}
```

---

## Expected Timeline

The logs should appear in this order:

```
1. 🔄 [loadAccounts] Starting account load...
2. ✅ [loadAccounts] API responded successfully
   OR
   ⏰ [loadAccounts] API request timed out after 3s, using Firebase
3. 🔄 [loadFirebaseAccounts] Starting Firebase account load...
4. 📊 [loadFirebaseAccounts] Firebase data retrieved: {...}
5. ✅ [loadFirebaseAccounts] Updated PlaidConnectionManager with X accounts
6. ✅ [loadFirebaseAccounts] Set accounts state from Firebase Plaid: {...}
7. 🔍 [applyFilters] Running with: {...}
8. 🔍 [applyFilters] First transaction account lookup: {...}
```

If any step is missing or shows an error, that's where the problem is!

---

## Common Solutions

Based on console output, here are likely fixes:

### If: Account ID Mismatch
**Fix:** Update transaction data to use correct account IDs, or ensure Firebase has all account IDs that transactions reference.

### If: Empty Firebase Data
**Fix:** User needs to reconnect Plaid or sync accounts from backend.

### If: API Timeout
**Fix:** 
- Check backend deployment
- Increase timeout (current: 3 seconds)
- Fix API performance issues

### If: PlaidConnectionManager Not Updated
**Fix:** Ensure `PlaidConnectionManager.setPlaidAccounts(plaidAccountsList)` is called after loading accounts.

---

## Summary Checklist

- [ ] Open browser console (F12)
- [ ] Navigate to Transactions page
- [ ] Hard refresh (Ctrl+Shift+R)
- [ ] Look for logs with emoji prefixes
- [ ] Capture all console output
- [ ] Check for account ID mismatch in "First transaction account lookup" log
- [ ] Compare transaction's account_id with availableAccountKeys
- [ ] Verify Firebase has account data
- [ ] Check if accounts state is populated
- [ ] Screenshot/save console output
- [ ] Report findings with data points extracted from logs

---

This logging will reveal the **exact point of failure** in the account loading flow!
