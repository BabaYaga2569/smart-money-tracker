# Quick Start Guide: Testing PR #132 Fix

## What This PR Fixes
- ❌ **Before:** Plaid API returned 400 errors, causing stale balances ($1,794)
- ✅ **After:** Plaid API works correctly, showing accurate balances ($1,458)

## Step 1: Merge & Deploy (5 minutes)

1. **Merge this PR**
2. **Wait for Render to deploy** (~3 minutes)
   - Check: https://dashboard.render.com
   - Look for: "Deploy succeeded" ✅

## Step 2: Verify Fix Works (2 minutes)

1. **Open your app:** https://smart-money-tracker.netlify.app
2. **Hard refresh:** Press `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
3. **Open DevTools:** Press `F12`
4. **Check Console tab:**

### Expected Console Output:
```
✅ Loaded fresh balances from backend API: 4 accounts
✅ Total calculated from API data: $1,458.00
```

### What You Should NOT See:
```
❌ Backend returned no accounts, falling back to Firebase
```

5. **Verify Balances:**
   - **Total:** Should be ~$1,458 (not $1,794) ✅
   - **Bank of America:** ~$281 (not $506) ✅
   - **Capital One:** ~$488 (not $567) ✅
   - **SoFi:** ~$163 (not $195) ✅
   - **USAA:** ~$526 (should still be correct) ✅

## Step 3: Check Backend Logs (1 minute)

1. **Open Render Dashboard:** https://dashboard.render.com
2. **Click on your backend service**
3. **Click "Logs"**
4. **Look for:**

```
✅ [INFO] [GET_BALANCES] Successfully fetched 4 accounts
✅ [RESPONSE] /api/plaid/get_balances [200] { success: true }
```

### What You Should NOT See:
```
❌ Error from Plaid API: 'UNKNOWN_FIELDS'
❌ error_message: 'the following fields are not recognized by this endpoint: options.count'
```

## Step 4: Set Up Webhooks (10 minutes) - OPTIONAL

This enables real-time balance updates (like Rocket Money).

1. **Log into Plaid Dashboard:** https://dashboard.plaid.com
2. **Navigate to:** API → Webhooks
3. **Click:** "Add Webhook"
4. **Enter these details:**
   ```
   Webhook URL: https://smart-money-tracker-09ks.onrender.com/api/plaid/webhook
   ```
5. **Enable these events:**
   - ☑️ `DEFAULT_UPDATE`
   - ☑️ `INITIAL_UPDATE`
   - ☑️ `HISTORICAL_UPDATE`
   - ☑️ `TRANSACTIONS_REMOVED`
   - ☑️ `ERROR`
6. **Click "Save"**

### Test Webhook (After Setup)
1. Make a small transaction at your bank
2. Wait 1-2 minutes
3. Check Render logs for:
   ```
   ✅ [INFO] [WEBHOOK] Received webhook: TRANSACTIONS - DEFAULT_UPDATE
   ✅ [INFO] [WEBHOOK] Successfully processed webhook update
   ```
4. Refresh app → Balance should be updated! 🎉

---

## Troubleshooting

### Problem: Balances still show $1,794

**Solution:**
1. Hard refresh browser (Ctrl+Shift+R)
2. Check Render logs for Plaid errors
3. Verify environment variables in Render:
   - `PLAID_CLIENT_ID` is set
   - `PLAID_SECRET` is set
   - `PLAID_ENV` is set to "sandbox" or "production"

### Problem: Console shows "Backend returned no accounts"

**Solution:**
1. Check Render logs for errors
2. Verify backend is deployed and running
3. Check that API URL in frontend is correct:
   - Should be: `https://smart-money-tracker-09ks.onrender.com`

### Problem: Webhook not working

**Solution:**
1. Verify webhook URL is exactly: `https://smart-money-tracker-09ks.onrender.com/api/plaid/webhook`
2. Check that events are enabled in Plaid Dashboard
3. Use Plaid's webhook test tool to send test event
4. Check Render logs for POST requests to `/api/plaid/webhook`

---

## Success Criteria

You'll know the fix is working when:
- ✅ Total balance shows ~$1,458 (not $1,794)
- ✅ Individual account balances are accurate
- ✅ Console shows "Loaded fresh balances from backend API"
- ✅ No "Backend returned no accounts" warning
- ✅ Render logs show successful Plaid API calls
- ✅ (Optional) Webhooks appear in Render logs after bank transactions

---

## Questions?

If you encounter issues:
1. Check `PLAID_FIX_PR132_SUMMARY.md` for detailed troubleshooting
2. Check `PLAID_FIX_VISUAL_COMPARISON.md` for before/after comparison
3. Review Render logs for specific error messages

---

**Estimated Time:** 5-10 minutes (+ 10 minutes for optional webhook setup)  
**Difficulty:** Easy  
**Impact:** High (fixes critical balance accuracy issue)
