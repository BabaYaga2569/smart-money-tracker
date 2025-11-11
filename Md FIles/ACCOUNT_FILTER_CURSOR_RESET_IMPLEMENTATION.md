# Account Filter Dropdown Fix + Cursor Reset System Implementation

## Overview
This PR fixes two critical issues:
1. **Account Filter Dropdown** - Returns 0 results when filtering by account
2. **Cursor Reset System** - No way to reset Plaid sync cursors after deleting transactions

## Changes Made

### Part 1: Fixed Account Filter Logic
**File:** `frontend/src/pages/Transactions.jsx` (Lines 1093-1119)

**Problem:** 
- Dropdown sets `filters.account = account_key`
- Filter only checked `t.account === filters.account`
- Transactions have `t.account_id` which doesn't match
- Result: 0 transactions shown

**Solution:**
- Match by `account_id` OR `account` (primary keys)
- Fallback to match by `institution_name`
- Fallback to match by `mask` (last 4 digits)

**Code:**
```javascript
if (filters.account) {
  filtered = filtered.filter(t => {
    // Match by account_id (primary key)
    if (t.account_id === filters.account || t.account === filters.account) {
      return true;
    }
    
    // Fallback: Match by institution name
    const txAccountObj = currentAccounts[t.account_id] || currentAccounts[t.account];
    const selectedAccountObj = currentAccounts[filters.account];
    
    if (txAccountObj && selectedAccountObj) {
      // Match if same institution
      if (txAccountObj.institution_name === selectedAccountObj.institution_name) {
        return true;
      }
      
      // Match if same account mask (last 4 digits)
      if (txAccountObj.mask && selectedAccountObj.mask && 
          txAccountObj.mask === selectedAccountObj.mask) {
        return true;
      }
    }
    
    return false;
  });
}
```

---

### Part 2: Backend Cursor Reset Endpoint
**File:** `backend/server.js` (Lines 1687-1733)

**Added:** `POST /api/plaid/reset_cursors`

**Functionality:**
- Takes `userId` in request body
- Retrieves all `plaid_items` for user
- Deletes `cursor` field from each item (using Firebase batch)
- Forces full re-sync on next Plaid sync
- Returns success with count of cursors reset

**Code:**
```javascript
app.post('/api/plaid/reset_cursors', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    logDiagnostic.info('RESET_CURSORS', `Resetting sync cursors for user: ${userId}`);
    
    // Get all plaid_items for user
    const plaidItemsRef = db.collection('users').doc(userId).collection('plaid_items');
    const snapshot = await plaidItemsRef.get();
    
    if (snapshot.empty) {
      logDiagnostic.info('RESET_CURSORS', 'No plaid_items found for user');
      return res.json({ success: true, reset_count: 0, message: 'No items to reset' });
    }
    
    // Reset cursor field for each item
    const batch = db.batch();
    let resetCount = 0;
    
    snapshot.docs.forEach(doc => {
      batch.update(doc.ref, { 
        cursor: admin.firestore.FieldValue.delete() 
      });
      resetCount++;
      logDiagnostic.info('RESET_CURSORS', `Reset cursor for item: ${doc.id}`);
    });
    
    await batch.commit();
    
    logDiagnostic.info('RESET_CURSORS', `Successfully reset ${resetCount} cursors`);
    
    res.json({ 
      success: true, 
      reset_count: resetCount,
      message: `Reset ${resetCount} sync cursor(s). Next sync will fetch all transactions.`
    });
    
  } catch (error) {
    logDiagnostic.error('RESET_CURSORS', 'Failed to reset cursors', error);
    res.status(500).json({ error: error.message });
  }
});
```

---

### Part 3: Frontend Reset Cursors Handler
**File:** `frontend/src/pages/Transactions.jsx` (Lines 565-594)

**Added:** `handleResetCursors()` function

**Functionality:**
- Confirms with user before resetting
- Calls backend API endpoint
- Shows success/error notifications
- Uses `setSaving(true)` to disable buttons during operation

**Code:**
```javascript
const handleResetCursors = async () => {
  if (!window.confirm('Reset sync cursors? This will force a full re-sync of all transactions on next sync.')) {
    return;
  }
  
  try {
    setSaving(true);
    console.log('🔄 [ResetCursors] Resetting Plaid sync cursors...');
    
    const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/plaid/reset_cursors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.uid })
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('✅ [ResetCursors] Success:', data);
      showNotification(`${data.message}`, 'success');
    } else {
      throw new Error(data.error || 'Failed to reset cursors');
    }
  } catch (error) {
    console.error('❌ [ResetCursors] Error:', error);
    showNotification(`Failed to reset cursors: ${error.message}`, 'error');
  } finally {
    setSaving(false);
  }
};
```

---

### Part 4: Reset Sync Cursors Button
**File:** `frontend/src/pages/Transactions.jsx` (Lines 1539-1549)

**Added:** Purple "Reset Sync Cursors" button after "Force Bank Check"

**Features:**
- Purple background (`#9c27b0`)
- Disabled when `saving` is true
- Positioned after Force Bank Check button
- Clear icon and label: 🔄 Reset Sync Cursors

**Code:**
```jsx
<button
  className="btn-secondary"
  onClick={handleResetCursors}
  disabled={saving}
  style={{ 
    background: '#9c27b0',
    marginLeft: '10px'
  }}
>
  🔄 Reset Sync Cursors
</button>
```

---

### Part 5: Auto-Reset Cursors on Delete All
**File:** `frontend/src/pages/Transactions.jsx` (Lines 1007-1025)

**Modified:** `handleDeleteAllTransactions()` function

**Added:** Automatic cursor reset after deleting all transactions

**Functionality:**
- Runs after successful deletion of all transactions
- Calls reset cursors endpoint
- Logs success/warnings but doesn't fail if reset fails
- Ensures next sync will fetch all transactions again

**Code:**
```javascript
// After deleting all transactions, reset Plaid cursors to force full re-sync
console.log('🔄 [DeleteAll] Resetting Plaid sync cursors...');
try {
  const resetResponse = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/plaid/reset_cursors`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: currentUser.uid })
  });
  
  const resetData = await resetResponse.json();
  if (resetData.success) {
    console.log('✅ [DeleteAll] Cursors reset successfully:', resetData);
  } else {
    console.warn('⚠️ [DeleteAll] Failed to reset cursors:', resetData.error);
  }
} catch (error) {
  console.error('❌ [DeleteAll] Error resetting cursors:', error);
  // Don't fail the whole operation if cursor reset fails
}
```

---

## Testing

### Test 1: Account Filter ✅
1. Select account from "All Accounts" dropdown
2. Verify transactions are filtered correctly
3. Verify "Showing X of Y transactions" displays correctly

**Expected:** Transactions filtered by account, not 0 results

---

### Test 2: Manual Cursor Reset ✅
1. Click "Reset Sync Cursors" button
2. Confirm dialog appears
3. Click OK
4. Verify success notification appears
5. Click "Force Bank Check"
6. Verify full sync happens (all transactions re-synced)

**Expected:** Cursors reset, next sync fetches all transactions

---

### Test 3: Auto Cursor Reset ✅
1. Click "Delete All Transactions"
2. Confirm deletion
3. Check console logs
4. Verify cursor reset log messages appear
5. Click "Force Bank Check"
6. Verify transactions re-sync

**Expected:** Cursors automatically reset after deletion

---

## Files Modified

### Backend
- `backend/server.js` - Added cursor reset endpoint (+48 lines)

### Frontend
- `frontend/src/pages/Transactions.jsx` - Fixed filter + added reset system (+113 lines)

---

## Success Criteria

✅ Account dropdown filter works correctly
✅ Manual cursor reset button available
✅ Cursors auto-reset when deleting all transactions
✅ Clear user feedback for all operations
✅ Prevents future "0 transactions synced" issues
✅ Build passes without errors
✅ Lint passes without new warnings

---

## Technical Notes

### Why Reset Cursors?
Plaid uses cursors to track incremental sync position. When cursors aren't reset after deleting transactions:
- Plaid thinks it already synced those transactions
- Next sync returns 0 new transactions
- User sees empty transaction list even though transactions exist

### How Cursor Reset Works
1. Delete `cursor` field from `plaid_items/{itemId}` documents
2. Next sync will have `cursor: null`
3. Plaid treats this as "start from beginning"
4. All transactions re-synced

### Fallback Strategy
The account filter uses multiple matching strategies:
1. **Primary:** Match by `account_id` or `account` field
2. **Fallback 1:** Match by `institution_name`
3. **Fallback 2:** Match by `mask` (last 4 digits)

This handles cases where:
- Transactions from reconnected banks have different account IDs
- Account structure changed but institution remains same
- Multiple accounts exist with same institution

---

## Deployment Notes

### Environment Variables Required
- `VITE_BACKEND_URL` - Frontend needs this to call backend API

### No Database Migrations Required
- Uses existing Firestore collections
- No schema changes needed

### Backward Compatible
- New endpoint doesn't affect existing functionality
- Old transactions still work with new filter logic
- No breaking changes

---

## Related Issues

- Account filter returning 0 results (User screenshot: "Adv Plus Banking")
- Plaid sync returning 0 transactions after deleting all transactions
- Need manual way to force full re-sync

---

## Future Enhancements

1. **Automatic Cursor Reset Detection**
   - Detect when transaction count drops significantly
   - Suggest cursor reset to user

2. **Per-Account Cursor Reset**
   - Allow resetting cursor for specific bank
   - Don't affect other connected banks

3. **Cursor Reset History**
   - Track when cursors were last reset
   - Show in diagnostics/health check

4. **Smart Filter Suggestions**
   - Suggest matching accounts when filter returns 0 results
   - Show "Did you mean: Bank of America?" hints
