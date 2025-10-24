# Auto-Sync 5-Minute Testing Guide

## Overview
This guide provides manual testing scenarios for the new 5-minute auto-sync feature implemented in PR #159.

## Feature Summary
- **Auto-syncs Plaid transactions** when app loads if data is stale (> 5 minutes old)
- **Skips sync** when data is fresh (< 5 minutes old) for fast loading
- **Shared timestamp** across Accounts and Transactions pages
- **Manual sync** button still works and updates timestamp

---

## Testing Scenarios

### Test 1: Auto-Sync on Stale Data (First Load)

**Scenario:** User opens app for first time or after clearing localStorage

**Steps:**
1. Clear localStorage (in browser console):
   ```javascript
   localStorage.removeItem('lastPlaidSync');
   ```
2. Navigate to Accounts page or Transactions page
3. Check browser console for logs

**Expected Behavior:**
- Console shows: `[AutoSync] Data stale, triggering auto-sync...`
- UI shows: "🔄 Auto-syncing transactions..." status
- After sync completes: `[AutoSync] Complete`
- Timestamp is saved to localStorage
- Latest pending transactions appear (e.g., Walmart, Starbucks, Zelle)

**Success Criteria:**
- ✅ Auto-sync triggers automatically
- ✅ No manual button click needed
- ✅ All pending transactions visible
- ✅ Timestamp saved to localStorage

---

### Test 2: Skip Sync on Fresh Data

**Scenario:** User opens app within 5 minutes of last sync

**Steps:**
1. Open app (triggers auto-sync from Test 1)
2. Close tab/window
3. Immediately reopen app (within 2 minutes)
4. Check browser console for logs

**Expected Behavior:**
- Console shows: `[AutoSync] Data fresh (synced X min ago), skipping sync`
- Page loads quickly without sync delay
- Existing transactions remain visible
- No API call is made to Plaid

**Success Criteria:**
- ✅ Sync is skipped
- ✅ Fast page load
- ✅ No API call overhead
- ✅ Console confirms fresh data

---

### Test 3: Auto-Sync After 5+ Minutes

**Scenario:** User opens app after 5+ minutes since last sync

**Steps:**
1. Open app (auto-sync happens)
2. Note the timestamp
3. Wait 6+ minutes (or simulate by manually editing localStorage)
   ```javascript
   // Simulate 10 minutes ago
   const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
   localStorage.setItem('lastPlaidSync', tenMinutesAgo.toString());
   ```
4. Refresh page
5. Check browser console

**Expected Behavior:**
- Console shows: `[AutoSync] Data stale, triggering auto-sync...`
- UI shows auto-sync status
- New transactions are fetched
- Timestamp updates to current time

**Success Criteria:**
- ✅ Auto-sync triggers after 5+ minutes
- ✅ New data fetched from Plaid
- ✅ Timestamp updated
- ✅ Pending transactions refreshed

---

### Test 4: Manual Sync Updates Timestamp

**Scenario:** User manually clicks sync button on Transactions page

**Steps:**
1. Navigate to Transactions page
2. Click "🔄 Sync Plaid Transactions" button
3. Wait for sync to complete
4. Check localStorage:
   ```javascript
   const lastSync = localStorage.getItem('lastPlaidSync');
   const date = new Date(parseInt(lastSync));
   console.log('Last synced:', date);
   ```
5. Navigate to Accounts page

**Expected Behavior:**
- Manual sync completes successfully
- Timestamp is updated to current time
- When navigating to Accounts page, auto-sync is skipped (data is fresh)

**Success Criteria:**
- ✅ Manual sync updates timestamp
- ✅ Timestamp is shared across pages
- ✅ Auto-sync respects manual sync timestamp

---

### Test 5: Cross-Page Synchronization

**Scenario:** Sync on one page affects other page

**Steps:**
1. Clear localStorage
2. Open Accounts page (auto-sync happens)
3. Immediately open Transactions page in new tab
4. Check console on Transactions page

**Expected Behavior:**
- Accounts page auto-syncs (first load)
- Transactions page sees fresh timestamp
- Transactions page skips auto-sync: `[AutoSync] Data fresh (synced 0 min ago), skipping sync`

**Success Criteria:**
- ✅ Timestamp is shared across tabs
- ✅ Only one page syncs
- ✅ Other pages respect shared timestamp

---

### Test 6: Force Bank Check (Transactions Page)

**Scenario:** User wants to force Plaid to check bank RIGHT NOW

**Steps:**
1. Navigate to Transactions page
2. Note existing pending transactions
3. Click "🔄 Force Bank Check" button
4. Wait 3-4 seconds for process to complete
5. Check for new pending transactions

**Expected Behavior:**
- Button shows: "⏳ Checking Bank..."
- Plaid refresh is triggered
- After 3 seconds, sync runs
- New pending transactions appear
- Timestamp is updated

**Success Criteria:**
- ✅ Force refresh works independently
- ✅ Updates timestamp
- ✅ New pending transactions visible
- ✅ Auto-sync respects new timestamp

---

### Test 7: Error Handling

**Scenario:** Network error during auto-sync

**Steps:**
1. Clear localStorage
2. Disconnect internet or block API endpoint
3. Open app
4. Check console

**Expected Behavior:**
- Console shows: `[AutoSync] Error: ...`
- Page still loads (doesn't hang)
- User can navigate and use app
- Manual sync button is available

**Success Criteria:**
- ✅ Error logged but doesn't break app
- ✅ Page loads normally
- ✅ User can retry manually
- ✅ Non-blocking behavior

---

### Test 8: User Scenario (From Problem Statement)

**Scenario:** Reproduce user's reported issue

**Setup:**
- Bank has 3 pending: Walmart -$18.13, Zelle -$25.00, Starbucks -$12.03
- App last synced 10+ minutes ago

**Steps:**
1. Simulate stale data:
   ```javascript
   const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
   localStorage.setItem('lastPlaidSync', tenMinutesAgo.toString());
   ```
2. Open Accounts page
3. Check transactions list

**Expected Behavior:**
- Auto-sync triggers automatically
- All 3 pending transactions appear:
  - Walmart -$18.13 ✅
  - Zelle -$25.00 ✅
  - Starbucks -$12.03 ✅
- No manual "Force Bank Check" needed

**Success Criteria:**
- ✅ User issue is resolved
- ✅ All pending transactions visible on load
- ✅ No manual intervention required

---

## Console Log Reference

### When Auto-Sync Triggers:
```
[AutoSync] Data stale, triggering auto-sync...
[Accounts] Syncing from: https://smart-money-tracker-09ks.onrender.com/api/plaid/sync_transactions
✅ [Accounts] Real-time update: 45 transactions
[AutoSync] Complete
```

### When Auto-Sync Skips:
```
[AutoSync] Data fresh (synced 3 min ago), skipping sync
```

### Manual Sync:
```
[Accounts] Syncing from: https://smart-money-tracker-09ks.onrender.com/api/plaid/sync_transactions
✅ [Accounts] Real-time update: 45 transactions
```

---

## localStorage Inspection

Check current sync status:
```javascript
// Get last sync timestamp
const lastSync = localStorage.getItem('lastPlaidSync');

if (lastSync) {
  const date = new Date(parseInt(lastSync));
  const minutesAgo = Math.floor((Date.now() - parseInt(lastSync)) / (60 * 1000));
  
  console.log('Last synced:', date.toLocaleString());
  console.log('Minutes ago:', minutesAgo);
  console.log('Will auto-sync?', minutesAgo > 5 ? 'YES' : 'NO');
} else {
  console.log('No previous sync - will auto-sync on next page load');
}
```

Clear timestamp to force auto-sync:
```javascript
localStorage.removeItem('lastPlaidSync');
console.log('Timestamp cleared - refresh to trigger auto-sync');
```

Simulate stale data:
```javascript
const minutesAgo = 10; // Change this value
const timestamp = Date.now() - (minutesAgo * 60 * 1000);
localStorage.setItem('lastPlaidSync', timestamp.toString());
console.log(`Simulated: Last synced ${minutesAgo} minutes ago`);
```

---

## Troubleshooting

### Auto-sync doesn't trigger
1. Check localStorage: `localStorage.getItem('lastPlaidSync')`
2. Verify Plaid accounts are connected
3. Check console for errors
4. Try manual sync button

### Auto-sync always triggers
1. Verify timestamp is being saved
2. Check if timestamp is being cleared somewhere
3. Ensure shared key name is correct: `'lastPlaidSync'`

### Sync button doesn't update timestamp
1. Check `syncPlaidTransactions()` function
2. Verify timestamp update line exists
3. Check for JavaScript errors in console

---

## Performance Expectations

### With Auto-Sync (Data Stale):
- Initial load: ~2-3 seconds
- Shows: "🔄 Auto-syncing transactions..."
- Data appears fresh

### With Auto-Sync (Data Fresh):
- Initial load: ~500ms
- No sync overhead
- Shows: "Last updated: X min ago"
- Fast experience

### Manual Sync:
- Duration: ~2-3 seconds
- User-initiated
- Always runs regardless of timestamp

---

## Success Criteria Summary

✅ **Feature Complete:**
- Auto-sync on stale data (> 5 minutes)
- Skip sync on fresh data (< 5 minutes)
- Manual sync still works
- Shared timestamp across pages
- Error handling is graceful
- Console logs are helpful
- User issue is resolved

✅ **User Experience:**
- No manual button click needed for fresh data
- Pending transactions always visible
- Fast load on fresh data
- Clear status indicators

✅ **Technical:**
- localStorage used for timestamp
- 5-minute threshold configurable
- Non-blocking implementation
- Cross-page synchronization
- Unit tests pass
