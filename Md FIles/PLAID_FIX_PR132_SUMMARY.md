# PR #132: Fix Plaid API Error + Add Webhook Handler

## Summary
Fixed the Plaid API 400 error by removing invalid `count` parameter from `transactionsSync` calls, and added webhook handler for real-time balance updates.

## Root Cause
The `count` parameter is **not supported** by Plaid's `/transactions/sync` endpoint. When included, Plaid returns:
```
error_code: 'UNKNOWN_FIELDS'
error_message: 'the following fields are not recognized by this endpoint: options.count'
status: 400
```

This caused the backend to catch the error and return an empty accounts array, forcing the frontend to fall back to stale Firebase data.

## Changes Made

### 1. Fixed `/api/plaid/get_balances` endpoint (Line 506)
**Removed:** `count: 1` parameter from transactionsSync options

**Before:**
```javascript
const syncResponse = await plaidClient.transactionsSync({
  access_token: item.accessToken,
  options: {
    include_personal_finance_category: true,
    count: 1 // ❌ INVALID
  }
});
```

**After:**
```javascript
const syncResponse = await plaidClient.transactionsSync({
  access_token: item.accessToken,
  options: {
    include_personal_finance_category: true
  }
});
```

### 2. Fixed `/api/accounts` endpoint (Line 591)
**Removed:** Same invalid `count: 1` parameter

### 3. Verified `/api/plaid/refresh_transactions` endpoint (PR #294 + Current PR)
**Status:** ✅ Correctly excludes unsupported `count` parameter
**Added:** Documentation comment to prevent reintroduction of the invalid parameter

The endpoint properly uses transactionsSync without the count option:
```javascript
const response = await plaidClient.transactionsSync({
  access_token: item.accessToken,
  options: {
    include_personal_finance_category: true
  }
});
```

### 4. Added `/api/plaid/webhook` endpoint (Lines 1183-1290)
**Added:** New POST endpoint to handle real-time updates from Plaid

**Features:**
- ✅ Handles TRANSACTIONS webhooks (DEFAULT_UPDATE, INITIAL_UPDATE, HISTORICAL_UPDATE)
- ✅ Handles ITEM ERROR webhooks (connection issues)
- ✅ Updates cursor for incremental syncing
- ✅ Comprehensive diagnostic logging
- ✅ Always returns 200 OK (prevents webhook retry storms)
- ✅ Graceful error handling

**Code Structure:**
```javascript
app.post("/api/plaid/webhook", async (req, res) => {
  const { webhook_type, webhook_code, item_id, error } = req.body;
  
  // Handle transaction/balance updates
  if (webhook_type === 'TRANSACTIONS') {
    // Find user who owns this Plaid item
    // Fetch fresh data using transactionsSync
    // Update cursor for next sync
  }
  
  // Handle connection issues
  if (webhook_type === 'ITEM' && webhook_code === 'ERROR') {
    // Mark item as needing reconnection
  }
  
  // Always return 200 OK
  res.json({ success: true });
});
```

## Files Modified
- `backend/server.js`:
  - Line 506: Removed invalid parameter
  - Line 591: Removed invalid parameter
  - Line 1826: Verified `/api/plaid/refresh_transactions` endpoint (PR #294 + added documentation)
  - Lines 1183-1290: Added webhook endpoint (108 lines)
  - **Total change:** +115 lines, -4 lines
- `Md FIles/PLAID_FIX_PR132_SUMMARY.md`:
  - Added documentation for refresh_transactions endpoint verification

## Expected Results

### Immediate Benefits (After Deploy)
✅ Plaid API accepts requests (no more 400 errors)  
✅ Backend returns fresh account balances  
✅ Frontend displays accurate balances  
✅ Total balance: $1,458 (correct!)  
✅ Individual accounts show correct values:
- BofA: $281 (was $506)
- Cap One: $488 (was $567)
- SoFi: $163 (was $195)
- USAA: $526 (already correct)

### After Webhook Setup (10 minutes)
✅ Real-time balance updates (like Rocket Money)  
✅ No manual refresh needed  
✅ Professional architecture  
✅ Production-ready solution  

## Testing Checklist

### Backend Testing
- [x] JavaScript syntax validated (`node --check server.js`)
- [x] No `count` parameter in any transactionsSync calls
- [x] Webhook endpoint properly structured
- [ ] Deploy to Render and verify no errors in logs
- [ ] Test `/api/accounts` endpoint returns fresh data
- [ ] Test `/api/plaid/get_balances` endpoint works

### Frontend Testing
- [ ] Hard refresh app (Ctrl+Shift+R)
- [ ] Check DevTools console for errors
- [ ] Verify balances are now accurate (~$1,458 total)
- [ ] Check that "Backend returned no accounts" warning is gone

### Webhook Testing (After Plaid Dashboard Setup)
- [ ] Configure webhook URL in Plaid Dashboard
- [ ] Make test transaction at bank
- [ ] Check backend logs for webhook received
- [ ] Verify balance auto-updates in app

## Setup Instructions for Webhook

### User must add webhook URL in Plaid Dashboard:

1. **Log into Plaid Dashboard:** https://dashboard.plaid.com
2. **Navigate to:** API → Webhooks
3. **Click:** "Add Webhook"
4. **Enter URL:** `https://smart-money-tracker-09ks.onrender.com/api/plaid/webhook`
5. **Enable events:**
   - `DEFAULT_UPDATE` (transaction updates)
   - `INITIAL_UPDATE` (initial sync complete)
   - `HISTORICAL_UPDATE` (historical data available)
   - `TRANSACTIONS_REMOVED` (transaction canceled)
   - `ERROR` (connection issues)
6. **Save**

### Test webhook:
```bash
# 1. Make a test transaction at your bank
# 2. Wait 1-2 minutes
# 3. Check Render logs for webhook:
[INFO] [WEBHOOK] Received webhook: TRANSACTIONS - DEFAULT_UPDATE

# 4. Verify balance updated in app
```

## Architecture Benefits

This brings the app up to industry standards:

| Feature | Before | After |
|---------|--------|-------|
| Balance Updates | Manual refresh only | Real-time via webhooks |
| Data Freshness | 1-6 hours old | Up-to-date (minutes) |
| User Experience | Must reconnect banks | Automatic |
| Architecture | Not production-ready | Professional |
| Similar to | - | Rocket Money, Mint, YNAB |
| Plaid Cost | Free | Free (webhooks are free) |

## Troubleshooting

### If balances still show as stale after deploy:
1. Check Render logs for Plaid API errors
2. Verify environment variables are set (PLAID_CLIENT_ID, PLAID_SECRET)
3. Hard refresh browser (Ctrl+Shift+R)
4. Check DevTools console for errors

### If webhook doesn't work:
1. Verify webhook URL is correct in Plaid Dashboard
2. Check that webhook events are enabled
3. Test webhook with Plaid's test tool in dashboard
4. Check Render logs for webhook POST requests

## References

- **Problem Statement:** Issue describing stale balances ($1,794 vs $1,458)
- **Plaid API Docs:** https://plaid.com/docs/api/products/transactions/#transactionssync
- **Plaid Webhooks:** https://plaid.com/docs/api/webhooks/
- **Related PRs:** PR #130 (introduced the bug), PR #131 (previous fixes)

---

**Status:** ✅ Ready for deploy  
**Version:** 1.0  
**Last Updated:** 2025-10-11
