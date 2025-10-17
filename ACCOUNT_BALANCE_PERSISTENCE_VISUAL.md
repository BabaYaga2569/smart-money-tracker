# Account Balance Persistence - Visual Flow

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER ACTIONS                                  │
└─────────────────────────────────────────────────────────────────┘
           │                    │                    │
           │                    │                    │
    ┌──────▼──────┐      ┌─────▼──────┐     ┌──────▼──────┐
    │  Connect    │      │  Refresh   │     │   Page      │
    │  New Bank   │      │  Balances  │     │   Load      │
    └──────┬──────┘      └─────┬──────┘     └──────┬──────┘
           │                    │                    │
           │                    │                    │
┌──────────▼────────────────────▼────────────────────▼──────────┐
│                    BACKEND API ENDPOINTS                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  POST /api/plaid/exchange_token (Initial Connection)            │
│  ────────────────────────────────────────────────────           │
│  1. Exchange public token                                       │
│  2. Get institution info                                        │
│  3. Fetch account data from Plaid                               │
│  4. ✅ deduplicateAndSaveAccounts()                             │
│     └─> Adds accounts + initial balances to Firebase           │
│                                                                  │
│  POST /api/plaid/get_balances (Explicit Refresh)                │
│  ──────────────────────────────────────────────                 │
│  1. Get all Plaid items for user                                │
│  2. Fetch fresh balances via transactionsSync                   │
│  3. ✅ updateAccountBalances()                                  │
│     └─> Updates ONLY balances in Firebase                       │
│                                                                  │
│  GET /api/accounts (Page Load / Background Sync)                │
│  ──────────────────────────────────────────────                 │
│  1. Get all Plaid items for user                                │
│  2. Fetch fresh balances via transactionsSync                   │
│  3. ✅ updateAccountBalances()                                  │
│     └─> Updates ONLY balances in Firebase                       │
│                                                                  │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       │
┌──────────────────────▼──────────────────────────────────────────┐
│              FIREBASE FIRESTORE                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  users/{userId}/settings/personal                                │
│  {                                                               │
│    plaidAccounts: [                                              │
│      {                                                           │
│        account_id: "abc123",                                     │
│        name: "Checking",                                         │
│        mask: "1234",                                             │
│        institution_name: "Chase",                                │
│        balance: 1234.56,          ← Updated by updateAccountBalances() │
│        current_balance: 1234.56,  ← Updated by updateAccountBalances() │
│        available_balance: 1234.56,← Updated by updateAccountBalances() │
│        lastUpdated: "2025-10-17T...", ← New timestamp            │
│        ...other metadata preserved                               │
│      }                                                           │
│    ],                                                            │
│    lastBalanceUpdate: Timestamp  ← Tracks last balance update    │
│  }                                                               │
│                                                                  │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       │
┌──────────────────────▼──────────────────────────────────────────┐
│                 FRONTEND DISPLAY                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Initial Load:                                                   │
│  1. Check if data is stale (>10 min)                             │
│  2. If fresh: Load from Firebase cache immediately ⚡           │
│  3. If stale: Trigger background refresh                         │
│                                                                  │
│  Display:                                                        │
│  - Shows balances instantly from Firebase                        │
│  - Updates in background if needed                               │
│  - Real-time listener keeps UI in sync                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Function Comparison

### `deduplicateAndSaveAccounts()` - Initial Setup
```javascript
// Called ONLY during initial bank connection
// Purpose: Add accounts to Firebase, handle reconnections

Input:  userId, newAccounts[], institutionName, itemId
Action: 
  - Remove duplicates (by institution + mask)
  - Add new accounts with initial balances
  - Merge with existing accounts
Output: { added: 2, deduplicated: 0, total: 5 }
```

### `updateAccountBalances()` - Ongoing Updates
```javascript
// Called on every balance fetch
// Purpose: Keep balances fresh in Firebase

Input:  userId, accounts[] (with fresh balances)
Action:
  - Find matching accounts by account_id
  - Update ONLY balance fields
  - Preserve all other metadata
Output: { updated: 5, total: 5 }
```

## Before vs After Fix

### ❌ Before (Problem)
```
User connects bank
  → Balances saved to Firebase
  
User refreshes page (next day)
  → Firebase has STALE balances from yesterday
  → Page loads with old data
  → User sees incorrect balance
  
User must manually sync to see current balance
```

### ✅ After (Fixed)
```
User connects bank
  → Balances saved to Firebase
  
Backend fetches fresh balances
  → Calls updateAccountBalances()
  → Firebase updated with FRESH balances
  
User refreshes page (next day)
  → Firebase has FRESH balances (updated 10min ago)
  → Page loads instantly with current data ⚡
  → User sees correct balance immediately
```

## Key Benefits

1. **Fast Page Loads** 🚀
   - Balances load from Firebase cache in milliseconds
   - No waiting for Plaid API on every page load

2. **Always Current** 📊
   - Background sync keeps Firebase updated
   - 10-minute refresh interval ensures freshness

3. **Offline Support** 📱
   - Works even with poor/no internet
   - Shows last known balances from Firebase

4. **Better UX** ✨
   - No loading spinners on page refresh
   - Seamless experience across sessions

## Testing Checklist

- [ ] Connect new bank → Balances appear
- [ ] Check Firebase → `plaidAccounts` has balance data
- [ ] Refresh page → Balances load instantly
- [ ] Wait 10+ min, refresh → Background sync updates Firebase
- [ ] Check logs → See `"Persisted balances to Firebase"`
- [ ] Firebase Console → `lastBalanceUpdate` is recent
- [ ] Multiple banks → All balances persist correctly
- [ ] Network offline → Page still loads with cached balances

## Troubleshooting Flow

```
Problem: Balances not persisting?
│
├─> Check backend logs
│   └─> Look for: "Persisted balances to Firebase"
│       │
│       ├─> Found? → Firebase write succeeded
│       └─> Not found? → Check next step
│
├─> Check Firebase permissions
│   └─> Verify: users/{userId}/settings/personal is writable
│       │
│       ├─> OK? → Check next step
│       └─> Denied? → Fix Firebase security rules
│
├─> Check Plaid connection
│   └─> Call: POST /api/plaid/health_check
│       │
│       ├─> Healthy? → Check next step
│       └─> Error? → Reconnect bank
│
└─> Check function parameters
    └─> Verify: userId is valid, accounts[] is populated
        │
        ├─> Valid? → Contact support
        └─> Invalid? → Check frontend code sending request
```

## Related Documentation

- [ACCOUNT_BALANCE_PERSISTENCE_TESTING.md](./ACCOUNT_BALANCE_PERSISTENCE_TESTING.md) - Detailed testing guide
- [ACCOUNT_BALANCE_PERSISTENCE_QUICK_REF.md](./ACCOUNT_BALANCE_PERSISTENCE_QUICK_REF.md) - Quick reference
