# Auto-Sync Quick Start Guide

## What is Auto-Sync?

Auto-sync automatically refreshes your Plaid transactions when you log in, but only if your data is older than 6 hours. This means you always see fresh transaction data without having to manually click the sync button.

---

## How It Works (Simple)

```
You log in → Are transactions older than 6 hours?
             ↓                           ↓
           Yes                          No
             ↓                           ↓
    Auto-sync runs              Nothing happens
    (2-3 seconds)               (instant load)
```

---

## What You'll See

### Scenario 1: First Time Login

When you log in for the first time (or on a new device):

1. **You'll see:** Purple banner saying "Auto-syncing transactions..."
2. **Button shows:** "🔄 Auto-syncing..." (grayed out)
3. **After 2-3 seconds:** Success notification "✓ Successfully synced X transactions"
4. **Then:** Everything looks normal

### Scenario 2: You Logged In Recently (< 6 hours ago)

When you log in and you synced less than 6 hours ago:

1. **You'll see:** Nothing different! Page loads normally
2. **Behind the scenes:** Auto-sync checks timestamp and skips
3. **Result:** Instant load, no waiting

### Scenario 3: It's Been a While (> 6 hours ago)

When you log in after 6+ hours:

1. **You'll see:** Purple banner saying "Auto-syncing transactions..."
2. **Button shows:** "🔄 Auto-syncing..." (grayed out)  
3. **After 2-3 seconds:** Your transactions are updated!
4. **Notification:** Shows how many new transactions were found

---

## Visual Guide

### Normal State (No Sync Needed)
```
┌─────────────────────────────────────┐
│ 💰 Transactions                     │
│                                     │
│ [+ Add] [⏳ Pending] [🔄 Sync]     │
│                                     │
│ Your Transactions:                  │
│ ├─ Coffee Shop      -$4.50         │
│ ├─ Gas Station      -$35.00        │
│ └─ Grocery Store    -$67.23        │
└─────────────────────────────────────┘
```

### Auto-Syncing State
```
┌─────────────────────────────────────┐
│ 💰 Transactions                     │
│                                     │
│ [+ Add] [⏳ Pending] [Auto-sync...] │ ← Disabled
│                                     │
│ ╔═══════════════════════════════╗  │
│ ║ ⏳ Auto-syncing transactions  ║  │ ← Purple banner
│ ║    from your bank accounts... ║  │
│ ╚═══════════════════════════════╝  │
│                                     │
│ Your Transactions:                  │
│ ├─ Coffee Shop      -$4.50         │
│ ├─ Gas Station      -$35.00        │
│ └─ Grocery Store    -$67.23        │
└─────────────────────────────────────┘
```

---

## Key Benefits

### For You (The User)
✅ **Always Fresh Data** - Never see outdated transactions  
✅ **Zero Effort** - Works automatically, no button clicking  
✅ **Smart** - Only syncs when needed (> 6 hours old)  
✅ **Fast** - Skips sync if data is recent  
✅ **Transparent** - Shows you when it's syncing  

### For the System
✅ **Efficient** - Uses existing sync infrastructure  
✅ **Cost-Effective** - Smart throttling prevents excess API calls  
✅ **Reliable** - Fails gracefully if something goes wrong  

---

## Manual Testing Steps

Want to see it in action? Here's how:

### Test 1: Force Auto-Sync (First Login)

1. Open browser console (F12)
2. Run: `localStorage.removeItem('plaidLastSync_YOUR_USER_ID')`
3. Refresh the page or navigate to Transactions
4. **You should see:**
   - Console: "🔄 Auto-syncing Plaid transactions (data is stale)..."
   - Purple banner appears
   - Button shows "Auto-syncing..."
   - After sync: "✅ Auto-sync complete!"

### Test 2: See Skip Behavior (Recent Sync)

1. After Test 1 completes, refresh the page immediately
2. **You should see:**
   - Console: "ℹ️ Plaid data is fresh (synced 0h ago), skipping auto-sync"
   - No banner appears
   - Page loads instantly
   - Everything works normally

### Test 3: Simulate Stale Data (> 6 hours)

1. Open browser console (F12)
2. Run: 
   ```javascript
   const eightHoursAgo = Date.now() - (8 * 60 * 60 * 1000);
   localStorage.setItem('plaidLastSync_YOUR_USER_ID', eightHoursAgo.toString());
   ```
3. Refresh the page
4. **You should see:**
   - Console: "🔄 Auto-syncing Plaid transactions (data is stale)..."
   - Purple banner appears
   - Auto-sync runs
   - Transactions update

### Test 4: Manual Sync Still Works

1. After auto-sync completes (or is skipped)
2. Click the "🔄 Sync Plaid Transactions" button manually
3. **You should see:**
   - Button shows "🔄 Syncing..." (not "Auto-syncing")
   - Manual sync works as before
   - Timestamp updates
   - Affects next auto-sync timing

---

## Console Messages Reference

### First Login
```
🔄 Auto-syncing Plaid transactions (data is stale)...
Syncing from: [API_URL]
✅ Auto-sync complete!
```

### Recent Sync (< 6 hours)
```
ℹ️ Plaid data is fresh (synced 3h ago), skipping auto-sync
```

### Stale Data (> 6 hours)
```
🔄 Auto-syncing Plaid transactions (data is stale)...
Syncing from: [API_URL]
✅ Auto-sync complete!
```

### Error (Graceful Failure)
```
🔄 Auto-syncing Plaid transactions (data is stale)...
❌ Auto-sync failed: [error message]
(Page still loads normally)
```

---

## Troubleshooting

### "Auto-sync isn't triggering"

**Check:**
1. Are you logged in? (currentUser exists)
2. Is Plaid connected? (has accounts)
3. When was last sync? (check localStorage)
4. Any errors in console?

**Fix:**
```javascript
// Clear timestamp to force sync
localStorage.removeItem('plaidLastSync_YOUR_USER_ID')
// Refresh page
```

### "Auto-sync runs every time I load the page"

**Possible Causes:**
1. Timestamp not being saved correctly
2. User ID changing between loads
3. localStorage being cleared

**Fix:**
- Check browser console for errors
- Verify localStorage has `plaidLastSync_` key after sync
- Make sure you're not in private/incognito mode

### "Auto-sync banner stays visible forever"

**Possible Causes:**
1. Sync is hanging (API not responding)
2. Error in sync function
3. setAutoSyncing(false) not being called

**Fix:**
- Check network tab for API call status
- Look for errors in console
- Refresh page (should reset state)

---

## Configuration Options

Want to change the sync interval? Edit this line in `Transactions.jsx`:

```javascript
const sixHours = 6 * 60 * 60 * 1000; // 6 hours in milliseconds
```

**Examples:**
- **1 hour:** `const oneHour = 1 * 60 * 60 * 1000;`
- **12 hours:** `const twelveHours = 12 * 60 * 60 * 1000;`
- **24 hours:** `const oneDay = 24 * 60 * 60 * 1000;`

---

## FAQ

### Q: Does auto-sync slow down page load?
**A:** No! If data is fresh (< 6 hours), it skips sync completely. If data is stale, it syncs in the background without blocking the page.

### Q: What if I have multiple accounts/devices?
**A:** Each device has its own localStorage, so each will sync independently. That's okay - Plaid's deduplication ensures no duplicates.

### Q: Can I disable auto-sync?
**A:** Currently no, but you can set a very long interval (like 24 hours) if you prefer manual control.

### Q: Does this use more API calls?
**A:** No! It actually may use fewer because it only syncs when needed, not every time you manually click.

### Q: What if Plaid is down?
**A:** Auto-sync fails gracefully. You'll see an error in the console, but the page loads normally and you can still use all features.

### Q: Does manual sync still work?
**A:** Yes! You can always manually sync whenever you want. Manual sync also updates the timestamp.

---

## Success Indicators

**You'll know it's working when:**

✅ First login shows auto-sync banner and console message  
✅ Subsequent logins within 6 hours skip auto-sync  
✅ Logins after 6+ hours trigger auto-sync  
✅ Manual sync still works as expected  
✅ Timestamp stored in localStorage after sync  
✅ Console logs show sync decisions  

---

## Quick Command Reference

### View Current Sync Timestamp
```javascript
// In browser console
const userId = 'YOUR_USER_ID'; // Get from currentUser.uid
const lastSync = localStorage.getItem(`plaidLastSync_${userId}`);
if (lastSync) {
  const date = new Date(parseInt(lastSync));
  console.log('Last synced:', date.toLocaleString());
  const hoursAgo = Math.floor((Date.now() - parseInt(lastSync)) / (1000 * 60 * 60));
  console.log(`That was ${hoursAgo} hours ago`);
} else {
  console.log('Never synced on this device');
}
```

### Force Auto-Sync (Clear Timestamp)
```javascript
// In browser console
const userId = 'YOUR_USER_ID';
localStorage.removeItem(`plaidLastSync_${userId}`);
console.log('Timestamp cleared. Refresh page to trigger auto-sync.');
```

### Simulate Stale Data (Set Old Timestamp)
```javascript
// In browser console
const userId = 'YOUR_USER_ID';
const hoursAgo = 8; // Change this number
const oldTimestamp = Date.now() - (hoursAgo * 60 * 60 * 1000);
localStorage.setItem(`plaidLastSync_${userId}`, oldTimestamp.toString());
console.log(`Set timestamp to ${hoursAgo} hours ago. Refresh to test.`);
```

---

## Related Documentation

- **Technical Details:** See `AUTO_SYNC_IMPLEMENTATION.md`
- **UI/UX Guide:** See `AUTO_SYNC_VISUAL_GUIDE.md`
- **Unit Tests:** See `frontend/src/pages/AutoSyncLogic.test.js`

---

**Status:** ✅ Production Ready  
**Version:** 1.0  
**Last Updated:** 2024
