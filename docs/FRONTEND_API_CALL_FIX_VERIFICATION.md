# Frontend API Call Fix - Verification Guide

## Summary
Fixed frontend to call backend `/api/accounts` endpoint instead of loading stale cached data from Firebase.

## Changes Made
**File:** `frontend/src/pages/Accounts.jsx`
**Function:** `loadAccounts()` (lines 141-290)

### Before (❌ Wrong)
```javascript
const loadAccounts = async () => {
  // Load accounts from Firebase Firestore (stale cached data)
  const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
  const settingsDocSnap = await getDoc(settingsDocRef);
  
  if (settingsDocSnap.exists()) {
    const data = settingsDocSnap.data();
    const plaidAccountsList = data.plaidAccounts || []; // ❌ OLD cached data
    setPlaidAccounts(plaidAccountsList);
  }
}
```

### After (✅ Correct)
```javascript
const loadAccounts = async () => {
  // Call backend API to get FRESH balances (uses transactionsSync from PR #130)
  const apiUrl = import.meta.env.VITE_API_URL || 'https://smart-money-tracker-09ks.onrender.com';
  const response = await fetch(`${apiUrl}/api/accounts?userId=${currentUser.uid}&_t=${Date.now()}`);
  const data = await response.json();

  if (data.success && data.accounts && data.accounts.length > 0) {
    // Format backend accounts for frontend display
    const formattedPlaidAccounts = data.accounts.map(account => ({
      account_id: account.account_id,
      name: account.name,
      official_name: account.official_name,
      type: account.subtype || account.type,
      balance: account.balances.current.toString(), // ✅ FRESH balance from transactionsSync
      available: account.balances.available?.toString() || '0',
      mask: account.mask,
      isPlaid: true,
      item_id: account.item_id,
      institution_name: account.institution_name,
      institution_id: account.institution_id
    }));
    
    setPlaidAccounts(formattedPlaidAccounts);
    console.log('✅ Loaded fresh balances from backend API:', formattedPlaidAccounts.length, 'accounts');
  } else {
    // Fallback to Firebase if API fails
    console.warn('⚠️ Backend returned no accounts, falling back to Firebase');
    // ... Firebase fallback code ...
  }
}
```

## Key Improvements

### 1. Backend API Call (Primary Source)
✅ Calls `/api/accounts?userId=${userId}&_t=${timestamp}`
✅ Backend uses `transactionsSync()` for fresh balance data
✅ Cache-busting with timestamp parameter
✅ Proper error handling

### 2. Firebase Fallback (Secondary Source)
✅ Falls back to Firebase if API fails or returns no accounts
✅ Preserves existing manual account functionality
✅ Graceful degradation when backend is unavailable

### 3. Auto-Refresh Preserved
✅ Auto-refresh continues working (30s intervals → 60s after 5 minutes)
✅ Concurrent request prevention still active
✅ Last refresh timestamp updated correctly

### 4. Console Logging
✅ Success: "✅ Loaded fresh balances from backend API: X accounts"
✅ Warning: "⚠️ Backend returned no accounts, falling back to Firebase"
✅ Error: "Error loading accounts:" with stack trace

## Testing Checklist

### Manual Testing Steps

1. **Deploy and Access**
   - [ ] Wait for Netlify deploy to complete (~2 min)
   - [ ] Open app in browser
   - [ ] Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)

2. **Browser Console Verification**
   - [ ] Open DevTools Console (F12)
   - [ ] Navigate to Accounts page
   - [ ] Verify log appears: "✅ Loaded fresh balances from backend API: X accounts"
   - [ ] Verify NO error messages about Firebase

3. **Network Tab Verification**
   - [ ] Open DevTools Network tab (F12 → Network)
   - [ ] Navigate to Accounts page
   - [ ] Verify request to `/api/accounts?userId=...&_t=...` appears
   - [ ] Check response status: should be 200 OK
   - [ ] Check response body: should have `success: true` and `accounts` array

4. **Balance Accuracy**
   - [ ] Compare displayed balances with real bank accounts
   - [ ] Total balance should be accurate (not stale)
   - [ ] Individual account balances should match banks

5. **Auto-Refresh Verification**
   - [ ] Leave Accounts page open for 1 minute
   - [ ] Watch console for "Auto-refresh attempt X" messages
   - [ ] Verify `/api/accounts` is called again (check Network tab)
   - [ ] Verify balances update if changed

6. **Error Handling**
   - [ ] Disconnect internet temporarily
   - [ ] Wait for next auto-refresh attempt
   - [ ] Verify Firebase fallback works
   - [ ] Verify error message appears in console
   - [ ] Reconnect internet
   - [ ] Verify app recovers on next refresh

## Expected Results

### Before Fix (Using Firebase Cache)
```
Console:
  (No API call, just Firebase reads)
  
Network:
  ❌ No /api/accounts request
  
Balances:
  ❌ Total: $1,794.87 (stale)
  ❌ BofA: $506.34 (stale)
  ❌ Cap One: $566.98 (stale)
  ❌ SoFi: $195.09 (stale)
  ✅ USAA: $526.46 (correct by coincidence)
```

### After Fix (Using Backend API)
```
Console:
  ✅ Loaded fresh balances from backend API: 4 accounts
  Auto-refresh attempt 1 (30s interval)
  Auto-refresh attempt 2 (30s interval)
  ...
  
Network:
  ✅ GET /api/accounts?userId=...&_t=... (200 OK)
  
Balances:
  ✅ Total: ~$1,458 (fresh from backend)
  ✅ BofA: $281 (fresh from transactionsSync)
  ✅ Cap One: $488 (fresh from transactionsSync)
  ✅ SoFi: $163 (fresh from transactionsSync)
  ✅ USAA: $526.46 (fresh from transactionsSync)
```

## Integration with Previous PRs

This fix completes the full solution:

### PR #130: Backend transactionsSync ✅
- Backend `/api/accounts` uses `transactionsSync()` for fresh balance data
- No more stale balances from cached `accountsBalanceGet()` responses

### PR #129: Frontend Auto-Refresh ✅
- Frontend refreshes every 30-60 seconds
- Keeps balances up-to-date automatically

### PR #131: Frontend API Calls ✅ (THIS PR)
- Frontend calls backend API instead of Firebase cache
- Actually uses the fresh data from PR #130
- Completes the full data flow

## Full Data Flow (After All Fixes)

```
User Opens Accounts Page
   ↓
Frontend loadAccounts() called
   ↓
Fetch /api/accounts?userId=X&_t=timestamp
   ↓
Backend receives request
   ↓
Backend calls transactionsSync() [PR #130]
   ↓
Plaid returns FRESH balance data
   ↓
Backend formats and returns to frontend
   ↓
Frontend formats for display
   ↓
UI shows ACCURATE balances ✅
   ↓
(30-60 seconds later)
   ↓
Auto-refresh triggers [PR #129]
   ↓
(Loop back to fetch /api/accounts)
```

## Rollback Plan

If issues are discovered:

1. Revert this commit: `git revert ccd5bae`
2. Frontend will fall back to Firebase cache
3. Balances will be stale but app will still function
4. Fix can be re-applied after debugging

## Success Metrics

✅ `/api/accounts` endpoint called on every page load
✅ Console shows "Loaded fresh balances from backend API"
✅ Network tab shows API request with 200 OK response
✅ Balances match real bank accounts
✅ Auto-refresh continues working every 30-60 seconds
✅ Firebase fallback works if API fails
✅ No crashes or errors in console (except expected fallback warnings)

## Additional Notes

- The fix is **minimal and surgical** - only changed the `loadAccounts()` function
- **No breaking changes** to other components
- **Backward compatible** - Firebase fallback ensures app works even if backend is down
- **Cache-busting** with timestamp prevents browser/CDN caching of stale balances
- **Existing tests** still pass (no test infrastructure changes needed)
