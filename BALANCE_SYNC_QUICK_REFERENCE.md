# Quick Reference: Smart Background Balance Sync

## What This PR Does
Adds automatic background syncing of Plaid account balances to the Accounts page.

## Key Files
1. `frontend/src/hooks/useSmartBalanceSync.js` - The hook implementation
2. `frontend/src/pages/Accounts.jsx` - Integration point
3. `frontend/src/hooks/useSmartBalanceSync.test.md` - Testing guide
4. `IMPLEMENTATION_SUMMARY_BALANCE_SYNC.md` - Full documentation

## Features
✅ Syncs every 5 minutes automatically  
✅ Pauses when tab is hidden (saves battery/API calls)  
✅ Waits minimum 2 minutes between syncs  
✅ Checks network status before syncing  
✅ Uses Firestore for cross-session rate limiting  
✅ Silent error handling (production-ready)  
✅ Comprehensive console logging  

## How It Works

### Initial Page Load
```
User opens Accounts → Hook checks Firestore → If data > 2 min old → Sync
```

### Background Refresh
```
Every 5 minutes → If page visible AND online → Sync
```

### Tab Visibility
```
User switches away → Pause auto-refresh
User returns → Resume + check if sync needed
```

### Rate Limiting
```
Sync attempt → Check last attempt (local) → Check Firestore → Decide
```

## Console Output Examples

### Successful Sync
```
[BalanceSync] Hook initialized for user: abc123
[BalanceSync] Last sync from Firestore: 10/17/2025, 2:15:30 PM
[BalanceSync] Starting sync... (reason: initial-mount, last sync: 180s ago)
[BalanceSync] ✅ Sync successful - 3 accounts updated
[BalanceSync] Updated last sync time in Firestore: 10/17/2025, 2:18:30 PM
[BalanceSync] Auto-refresh enabled (every 5 minutes)
```

### Rate Limited
```
[BalanceSync] Data is fresh (synced 45s ago), skipping
```

### Offline
```
[BalanceSync] Offline, skipping sync
```

### Page Hidden
```
[BalanceSync] Page hidden, pausing auto-refresh
```

## Testing

### Quick Test
1. Open browser console
2. Navigate to Accounts page
3. Look for `[BalanceSync]` logs
4. Wait 5 minutes - should see auto-refresh
5. Switch tabs - should pause
6. Return - should resume

### Verify Firestore
1. Go to Firebase Console
2. Navigate to `users/{userId}/metadata/sync`
3. Check `lastBalanceSync` timestamp

### Check Network Handling
1. Open DevTools → Network tab
2. Set to "Offline"
3. Try to trigger sync
4. Should see "Offline, skipping sync"

## Configuration

### Constants (in hook)
```javascript
MIN_REFRESH_INTERVAL = 2 * 60 * 1000  // 2 minutes
AUTO_REFRESH_INTERVAL = 5 * 60 * 1000 // 5 minutes
```

### Firestore Path
```
users/{userId}/metadata/sync
{
  lastBalanceSync: Timestamp
}
```

### Backend Endpoint
```
POST /api/plaid/get_balances
Body: { userId: "..." }
```

## Benefits
- 🔄 Fresh balances without manual refresh
- 💰 Reduced API costs (smart polling vs aggressive polling)
- 🔋 Battery friendly (pauses when hidden)
- 🌐 Network aware (skips when offline)
- 📊 Cross-session rate limiting (via Firestore)
- 🐛 Easy debugging (console logs)

## Related Work
- Depends on: PR #182 (Backend `/api/plaid/get_balances` endpoint)
- Replaces: Manual refresh button requirement
- Complements: Real-time transaction listeners

## Code Quality
✅ Passes `npm run build`  
✅ Passes `npm run lint`  
✅ No new dependencies  
✅ Follows React hooks best practices  
✅ Comprehensive documentation  
✅ Production-ready error handling  

## Usage in Code
```javascript
import { useSmartBalanceSync } from '../hooks/useSmartBalanceSync';

function MyComponent() {
  const { currentUser } = useAuth();
  
  // That's it! Hook runs automatically
  useSmartBalanceSync(currentUser?.uid);
  
  // Optional: Use sync status
  const { isSyncing } = useSmartBalanceSync(currentUser?.uid);
}
```

## Troubleshooting

### No sync happening?
- Check console for `[BalanceSync]` logs
- Verify user is authenticated
- Check if data is already fresh (< 2 min old)
- Verify backend endpoint is working

### Too many syncs?
- Should be rate limited to 2 min minimum
- Check Firestore document is being updated
- Verify MIN_REFRESH_INTERVAL constant

### Sync not pausing when hidden?
- Check browser supports Visibility API
- Look for "Page hidden" console log

## Future Enhancements
- [ ] Visual sync indicator in UI
- [ ] User preference to disable auto-sync
- [ ] Sync success/failure notifications
- [ ] Metrics tracking (success rate, duration)
- [ ] Exponential backoff on errors
