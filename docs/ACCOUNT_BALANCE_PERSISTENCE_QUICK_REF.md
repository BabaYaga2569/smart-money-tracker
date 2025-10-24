# Account Balance Persistence - Quick Reference

## What Changed

### New Function: `updateAccountBalances(userId, accounts)`
- **Location:** `/backend/server.js` (line ~357)
- **Purpose:** Persist fresh Plaid balances to Firebase settings/personal
- **Called By:** `/api/plaid/get_balances` and `/api/accounts` endpoints

### Updated Endpoints
1. **POST /api/plaid/get_balances** - Now persists balances to Firebase
2. **GET /api/accounts** - Now persists balances to Firebase

## Key Features

✅ **Automatic Persistence**: Every balance fetch now writes to Firebase
✅ **Fast Page Loads**: Balances load from Firebase cache instantly
✅ **Always Fresh**: Background sync keeps Firebase up-to-date
✅ **Safe Updates**: Only updates balances, preserves account metadata
✅ **Error Resilient**: Continues even if Firebase write fails

## Firebase Structure Updated

```javascript
// users/{userId}/settings/personal
{
  plaidAccounts: [
    {
      balance: 1234.56,        // ← Updated on every fetch
      current_balance: 1234.56, // ← Updated on every fetch
      available_balance: 1234.56, // ← Updated on every fetch
      lastUpdated: "2025-10-17T13:30:00Z", // ← New timestamp
      // ... other fields preserved
    }
  ],
  lastBalanceUpdate: Timestamp // ← New field tracking last update
}
```

## Testing Quick Steps

1. **Connect bank** → Check Firebase has `plaidAccounts`
2. **Refresh page** → Balances should load instantly
3. **Check logs** → Look for `"Persisted balances to Firebase"`
4. **Firebase Console** → Verify `lastBalanceUpdate` is recent

## Backend Logs to Watch

```
✅ Success:
[INFO] [UPDATE_BALANCES] Updated 3 account balances
[INFO] [GET_BALANCES] Persisted balances to Firebase: 3 accounts updated

❌ Error:
[ERROR] [GET_BALANCES] Failed to persist balances to Firebase
```

## Common Issues

**Problem:** Balances not updating in Firebase
- Check backend logs for errors
- Verify Firebase permissions
- Confirm Plaid credentials are valid

**Problem:** Page loads slowly
- Check network tab - should load from Firebase first
- Look for `"Data is fresh"` message in console
- Verify `lastBalanceUpdate` is recent in Firebase

## Benefits

- **Better UX**: Page loads fast with cached data
- **Reliability**: Works even with poor network
- **Consistency**: Balances persist across sessions
- **Efficiency**: Fewer API calls to Plaid
