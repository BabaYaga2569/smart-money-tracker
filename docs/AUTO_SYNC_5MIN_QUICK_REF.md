# Auto-Sync 5-Minute - Quick Reference

## 🎯 Problem Solved
**User Issue:** "Bank shows 3 pending transactions, app shows 2. Have to manually click 'Force Bank Check' to see latest."

**Solution:** Auto-sync transactions on startup if data is stale (> 5 minutes old).

---

## ✨ What Changed

### Before
```
User opens app → Shows stale data
Bank: 3 pending (Walmart, Zelle, Starbucks)
App: 2 pending (Zelle, Starbucks) ❌
User must click "Force Bank Check" to sync
```

### After
```
User opens app → Auto-syncs if stale
Bank: 3 pending (Walmart, Zelle, Starbucks)
App: 3 pending (all visible) ✅
No manual click needed!
```

---

## 📁 Files Changed

### 1. `frontend/src/pages/Accounts.jsx`
**Added:**
- `syncingPlaid` state
- `autoSyncing` state
- `syncPlaidTransactions()` function
- Auto-sync useEffect hook
- Updated UI status indicators

### 2. `frontend/src/pages/Transactions.jsx`
**Changed:**
- Threshold: 6 hours → 5 minutes
- localStorage key: `plaidLastSync_${userId}` → `lastPlaidSync` (shared)
- Log format: consistent `[AutoSync]` prefix

### 3. `frontend/src/pages/AutoSync5MinuteLogic.test.js`
**Added:**
- Unit tests for 5-minute logic
- 8 test cases covering edge cases

### 4. Documentation
**Added:**
- `AUTO_SYNC_5MIN_TESTING_GUIDE.md` - Manual testing scenarios
- `AUTO_SYNC_5MIN_QUICK_REF.md` - This file

---

## 🔧 Implementation Details

### Threshold
```javascript
const FIVE_MINUTES = 5 * 60 * 1000; // 300,000 milliseconds
```

### localStorage Key
```javascript
const key = 'lastPlaidSync'; // Shared across Accounts & Transactions
```

### Auto-Sync Logic (Accounts.jsx)
```javascript
useEffect(() => {
  const autoSyncOnStartup = async () => {
    if (!currentUser) return;
    if (plaidAccounts.length === 0) return; // No Plaid accounts
    
    const lastSync = localStorage.getItem('lastPlaidSync');
    const now = Date.now();
    const FIVE_MINUTES = 5 * 60 * 1000;
    
    if (!lastSync || (now - parseInt(lastSync)) > FIVE_MINUTES) {
      console.log('[AutoSync] Data stale, triggering auto-sync...');
      setAutoSyncing(true);
      await syncPlaidTransactions();
      localStorage.setItem('lastPlaidSync', now.toString());
      console.log('[AutoSync] Complete');
    } else {
      const minutesAgo = Math.floor((now - parseInt(lastSync)) / (60 * 1000));
      console.log(`[AutoSync] Data fresh (synced ${minutesAgo} min ago), skipping sync`);
    }
  };
  
  if (currentUser) {
    setTimeout(() => autoSyncOnStartup(), 1000); // Delay for plaidAccounts to load
  }
}, [currentUser]);
```

### Manual Sync (Transactions.jsx)
```javascript
const syncPlaidTransactions = async () => {
  // ... sync logic ...
  
  // Update timestamp after successful sync
  localStorage.setItem('lastPlaidSync', Date.now().toString());
};
```

---

## 🎨 UI Changes

### Status Indicators (Accounts.jsx)
```jsx
{autoSyncing && (
  <span className="refresh-spinner">
    🔄 Auto-syncing transactions...
  </span>
)}

{syncingPlaid && !autoSyncing && (
  <span className="refresh-spinner">
    🔄 Syncing transactions...
  </span>
)}
```

---

## 🧪 Testing

### Run Unit Tests
```bash
node frontend/src/pages/AutoSync5MinuteLogic.test.js
```

**Output:**
```
✅ Test 1: Syncs on first load
✅ Test 2: Skips sync when data is fresh
✅ Test 3: Syncs when data is stale
✅ Test 4: Minutes ago calculation correct
✅ Test 5: Shared localStorage key format
✅ Test 6: Edge case at exactly 5 minutes
✅ Test 7: Syncs at 5 min + 1 second
✅ Test 8: User scenario validated
```

### Manual Testing

**Test 1: Trigger Auto-Sync**
```javascript
localStorage.removeItem('lastPlaidSync');
// Refresh page → Auto-sync triggers
```

**Test 2: Skip Auto-Sync**
```javascript
// Open app once (syncs)
// Close and reopen within 5 min → Sync skipped
```

**Test 3: Manual Sync**
```javascript
// Click "Sync Plaid Transactions" button
// Timestamp updates → Auto-sync respects it
```

---

## 📊 Console Logs

### Auto-Sync Triggered
```
[AutoSync] Data stale, triggering auto-sync...
[Accounts] Syncing from: https://...
✅ [Accounts] Real-time update: 45 transactions
[AutoSync] Complete
```

### Auto-Sync Skipped
```
[AutoSync] Data fresh (synced 3 min ago), skipping sync
```

---

## 🎯 Success Criteria

✅ **Core Requirements Met:**
- [x] Auto-sync when data > 5 minutes old
- [x] Skip sync when data < 5 minutes old
- [x] Manual "Force Bank Check" still works
- [x] Shared timestamp across pages
- [x] Console logs for debugging

✅ **User Experience:**
- [x] Pending transactions always up-to-date
- [x] No manual clicks needed for fresh data
- [x] Fast load on fresh data (no sync overhead)
- [x] Clear status indicators

✅ **Technical Quality:**
- [x] Non-blocking (errors don't prevent page load)
- [x] Unit tests pass (8/8)
- [x] Build succeeds
- [x] No lint errors (only warnings)

---

## 🔍 Key Insights

### Why 5 Minutes?
- **5 minutes** balances freshness vs. performance
- Pending transactions update frequently (minutes, not hours)
- Prevents excessive API calls
- User opens app → sees recent data without delay

### Why Shared localStorage?
- **Single source of truth** for sync timestamp
- **Cross-page synchronization**: Sync on Accounts → Transactions sees fresh data
- **Prevents duplicate syncs**: If one page syncs, others skip

### Why Non-Blocking?
- **Graceful degradation**: Network errors don't break app
- **User can continue**: Page loads even if sync fails
- **Manual fallback**: User can click sync button if auto-sync fails

---

## 🚀 Quick Deploy Checklist

Before merging PR:
- [x] Code builds successfully
- [x] Unit tests pass
- [x] Auto-sync triggers on stale data
- [x] Auto-sync skips on fresh data
- [x] Manual sync updates timestamp
- [x] Console logs are helpful
- [x] Error handling is graceful
- [x] Documentation is complete

---

## 📝 Configuration

### Adjusting Threshold
To change sync threshold, edit both files:

**Accounts.jsx:**
```javascript
const FIVE_MINUTES = 5 * 60 * 1000; // Change '5' to desired minutes
```

**Transactions.jsx:**
```javascript
const FIVE_MINUTES = 5 * 60 * 1000; // Keep in sync with Accounts.jsx
```

### localStorage Key
```javascript
const key = 'lastPlaidSync'; // Change if needed (update both files)
```

---

## 🐛 Common Issues

### Auto-sync doesn't trigger
- Check: `localStorage.getItem('lastPlaidSync')`
- Verify: Plaid accounts connected
- Console: Check for errors

### Auto-sync always triggers
- Check: Timestamp is being saved
- Verify: Key name is `'lastPlaidSync'`
- Console: Check for clear/remove calls

### Manual sync doesn't update timestamp
- Check: `localStorage.setItem('lastPlaidSync', ...)` exists
- Verify: No errors in console
- Test: Check localStorage after sync

---

## 📚 Related Documentation

- `AUTO_SYNC_5MIN_TESTING_GUIDE.md` - Comprehensive manual testing scenarios
- `AUTO_SYNC_README.md` - Original 6-hour implementation (reference)
- `IMPLEMENTATION_COMPLETE_AUTO_SYNC.md` - Original implementation docs

---

**Implemented:** 2025-10-13  
**PR:** #159  
**Issue:** Pending transactions don't sync automatically  
**Solution:** 5-minute auto-sync on startup ✅
