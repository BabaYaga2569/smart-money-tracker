# Quick Reference: Duplicate Account Prevention & Health Monitoring

## What's New? 🎉

### 1. **No More Duplicate Accounts** 🚫
When you reconnect a bank, the same account won't appear twice anymore.

### 2. **Connection Health Monitoring** 🏥
The app now automatically detects when your bank connections expire and alerts you.

### 3. **Visual Warnings** ⚠️
Clear banners and badges tell you exactly which banks need reconnection.

---

## For Users

### How to Reconnect a Bank

1. If you see a warning banner or red badge, your bank needs reconnection
2. Click **"Reconnect Banks"** in the banner OR go to the Accounts page
3. Click **"Connect Bank"** and follow the Plaid prompts
4. Select the same bank you want to reconnect
5. Authorize the connection
6. ✅ Done! The old duplicate is automatically removed

### What You'll See

**Transactions Page**:
- Orange warning banner at the top (if banks need reconnection)
- Lists all affected banks
- "Reconnect Banks" button to fix it

**Accounts Page**:
- Red "⚠️ Reconnection Required" badge on affected accounts
- Account still shows balance and details
- Just needs to be reconnected to stay synced

---

## For Developers

### Backend Changes

#### 1. New Function: `deduplicateAndSaveAccounts()`
**Location**: `backend/server.js` (line ~229)

**What it does**:
- Prevents duplicate accounts when reconnecting
- Matches accounts by `institution_name` + `mask`
- Removes old account if same institution + mask exists
- Adds new account with updated `item_id`

**Usage**:
```javascript
const result = await deduplicateAndSaveAccounts(
  userId, 
  accounts, 
  institutionName, 
  itemId
);
// Returns: { added: 2, deduplicated: 1, total: 5 }
```

#### 2. New Endpoint: `/api/plaid/health_check`
**Method**: POST  
**Location**: `backend/server.js` (line ~1544)

**Request**:
```json
{
  "userId": "user123"
}
```

**Response**:
```json
{
  "status": "needs_reauth",  // or "healthy", "no_connections"
  "message": "1 bank connection(s) need reconnection",
  "items": [
    {
      "itemId": "item_...",
      "institutionName": "Chase",
      "status": "NEEDS_REAUTH",
      "needsReauth": true,
      "error": {...}
    }
  ],
  "summary": {
    "total": 2,
    "healthy": 1,
    "needsReauth": 1
  }
}
```

#### 3. Webhook Enhancement
**Location**: `backend/server.js` (line ~1491)

**What changed**:
- Webhook now detects token expiration error codes
- Marks items as `NEEDS_REAUTH` for these codes:
  - `ITEM_LOGIN_REQUIRED`
  - `INVALID_CREDENTIALS`
  - `ITEM_LOCKED`
  - `ITEM_NO_LONGER_AVAILABLE`

**Firebase Update**:
```javascript
await itemDoc.ref.update({
  status: 'NEEDS_REAUTH',
  error: error,
  updatedAt: admin.firestore.FieldValue.serverTimestamp()
});
```

### Frontend Changes

#### 1. Transactions.jsx

**New State**:
```javascript
const [healthStatus, setHealthStatus] = useState(null);
const [showHealthBanner, setShowHealthBanner] = useState(false);
```

**New Function**: `checkConnectionHealth()`
- Runs on page load
- Calls `/api/plaid/health_check`
- Sets health status state
- Shows banner if any connections need reauth

**New Banner Component**:
- Orange gradient background
- Lists affected banks
- "Reconnect Banks" and "Dismiss" buttons
- Auto-shows when status is "needs_reauth"

**Enhanced Logging**: `handleDeleteAllTransactions()`
- Logs before confirmation: user intent, user ID, transaction count
- Logs cancellation at each step
- Logs final confirmation before deletion

#### 2. Accounts.jsx

**New State**:
```javascript
const [healthStatus, setHealthStatus] = useState(null);
```

**New Function**: `checkConnectionHealth()`
- Same as Transactions.jsx
- Runs on page load
- Stores health status

**New Badge Component**:
- Red "⚠️ Reconnection Required" badge
- Appears next to account name
- Only shows for accounts with `needsReauth: true`

---

## Code Examples

### Backend: Check if Item Needs Reauth

```javascript
// In Firebase: users/{userId}/plaid_items/{itemId}
const itemDoc = await db.collection('users').doc(userId)
  .collection('plaid_items').doc(itemId).get();

const needsReauth = itemDoc.data().status === 'NEEDS_REAUTH';
```

### Frontend: Trigger Health Check Manually

```javascript
const checkHealth = async () => {
  const response = await fetch(`${apiUrl}/api/plaid/health_check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser.uid })
  });
  const data = await response.json();
  console.log('Health status:', data);
};
```

### Frontend: Check if Account Needs Reauth

```javascript
const accountNeedsReauth = healthStatus?.items?.find(item => 
  item.itemId === account.item_id && item.needsReauth
);

if (accountNeedsReauth) {
  // Show badge or warning
}
```

---

## File Changes Summary

### Backend
- **File**: `backend/server.js`
- **Lines Changed**: ~213 additions, 36 deletions
- **New Functions**: `deduplicateAndSaveAccounts()`
- **New Endpoints**: POST `/api/plaid/health_check`
- **Enhanced**: Webhook handler, exchange_token endpoint

### Frontend
- **File**: `frontend/src/pages/Transactions.jsx`
- **Lines Changed**: ~107 additions
- **New Functions**: `checkConnectionHealth()`
- **New Components**: Health warning banner
- **Enhanced**: Safety logging in delete operations

- **File**: `frontend/src/pages/Accounts.jsx`
- **Lines Changed**: ~52 additions
- **New Functions**: `checkConnectionHealth()`
- **New Components**: "Reconnection Required" badge

---

## Database Schema Updates

### plaid_items Collection
**Path**: `users/{userId}/plaid_items/{itemId}`

**New/Updated Fields**:
```javascript
{
  status: 'NEEDS_REAUTH',  // NEW: Was just 'active' or 'error'
  error: {
    error_code: 'ITEM_LOGIN_REQUIRED',
    error_type: 'ITEM_ERROR',
    error_message: '...'
  }
}
```

**Status Values**:
- `'active'` - Connection is healthy
- `'NEEDS_REAUTH'` - Connection expired, needs reconnection
- `'error'` - Other error (non-auth related)

### settings/personal Collection
**Path**: `users/{userId}/settings/personal`

**Deduplication Logic**:
- Accounts matched by: `institution_name` + `mask`
- Old accounts removed before adding new ones
- No duplicates possible on reconnection

---

## Testing Quick Checklist

- [ ] Reconnect a bank → No duplicates created
- [ ] Manually set item status to 'NEEDS_REAUTH' → Health check detects it
- [ ] Health check → Warning banner appears in Transactions
- [ ] Health check → Red badge appears in Accounts
- [ ] Banner lists correct banks
- [ ] "Reconnect Banks" button works
- [ ] "Dismiss" button hides banner
- [ ] Delete all transactions → Logs appear in console
- [ ] Multiple banks → Each handled independently

---

## Common Issues & Solutions

### Issue: Banner doesn't appear
**Solution**: Check browser console for health check response. Ensure item status is 'NEEDS_REAUTH' in Firebase.

### Issue: Duplicates still created
**Solution**: Check backend logs for `[DEDUPLICATE_ACCOUNTS]`. Ensure `institution_name` and `mask` are properly set.

### Issue: Badge doesn't show
**Solution**: Verify health check runs on Accounts page load. Check `healthStatus` state in React DevTools.

### Issue: Health check fails
**Solution**: Check API endpoint is accessible. Verify userId is correct. Check backend logs for errors.

---

## Performance Notes

- Health check runs once per page load
- Results cached in component state (not localStorage)
- No impact on page load time (runs asynchronously)
- Deduplication happens server-side (no frontend overhead)
- Banner dismissal is temporary (not persisted)

---

## Security Notes

- Health check requires valid userId (passed from authenticated frontend)
- No sensitive data exposed in health check response
- Access tokens never sent to frontend
- Status changes logged server-side
- Safety logging only in browser console (not sent to server)

---

## Next Steps

1. Deploy to production
2. Monitor backend logs for deduplication activity
3. Monitor user reports of duplicates (should be zero)
4. Watch for health check errors
5. Gather user feedback on banner UX

---

## Support

- **Issues**: Report in GitHub Issues
- **Questions**: Contact development team
- **Documentation**: See `DUPLICATE_PREVENTION_HEALTH_CHECK_TESTING.md`

