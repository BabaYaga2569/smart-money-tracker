# Migration Quick Reference - Transaction mask & institution_name

## What Was Changed?

### 1. Transaction Sync Now Includes mask
Every synced transaction now has:
- ✅ `mask` - Last 4 digits of account (e.g., "1234")
- ✅ `institution_name` - Bank name (e.g., "Chase", "Bank of America")
- ✅ `item_id` - Plaid item identifier

### 2. Automatic Backfill on Startup
Old transactions are automatically updated when the server starts in production.

### 3. Environment Control
```bash
# Production: Migration runs automatically
NODE_ENV=production

# Development: Force migration
RUN_MIGRATION=true
```

## How It Works

### On Server Startup (Production)
```
1. Server starts
2. Migration checks all transactions
3. Finds transactions missing mask/institution_name
4. Fetches account data from Plaid
5. Updates transactions in batches
6. Logs progress
7. Server ready for requests
```

### During Transaction Sync
```
1. User connects bank or auto-sync runs
2. Server fetches account information from Plaid
3. Creates map of account_id → mask
4. Syncs transactions from Plaid
5. Adds mask and institution_name to each transaction
6. Saves to Firebase
```

## What You'll See in Logs

### Migration Running
```
🔄 [Migration] Checking transactions for mask/institution fields...
[Migration] Processing user: xyz123
[Migration] Fetched 3 accounts for item inst_123
✅ [Migration] Updated 45 transactions for item inst_123
✅ [Migration] Transaction migration complete!
```

### Migration Skipped (Development)
```
[Migration] Skipping migration (not in production and RUN_MIGRATION not set)
```

### Transaction Sync
```
[SYNC_TRANSACTIONS] Fetched 3 accounts for item inst_123
[SYNC_TRANSACTIONS] Item inst_123: 5 added, 2 modified, 0 removed
```

## Verification

### Check Transaction in Firebase
```javascript
{
  "transaction_id": "tx_123",
  "account_id": "acc_456",
  "amount": -32.50,
  "name": "Starbucks",
  "mask": "1234",              // ← NEW
  "institution_name": "Chase",  // ← NEW
  "item_id": "inst_789",       // ← NEW
  "pending": true,
  "source": "plaid"
}
```

### Expected Behavior
- ✅ All new transactions have mask/institution_name
- ✅ Old transactions updated automatically in production
- ✅ Pending transactions match correctly
- ✅ No user intervention needed

## Troubleshooting

### Migration Not Running?
Check:
1. `NODE_ENV=production` in environment, OR
2. `RUN_MIGRATION=true` in .env file

### Transactions Still Missing Fields?
1. Check server logs for migration errors
2. Verify Plaid credentials are valid
3. Check that `item_id` exists on transactions
4. Restart server to re-run migration

### Performance Issues?
- Migration uses batches (500 at a time)
- Runs in background (doesn't block server)
- Only updates transactions that need it
- Safe to run during normal operation

## Impact on Frontend

### Account Matching (frontend/src/utils/AccountMatchingStrategies.js)
Now works reliably because:
- ✅ Strategy 1: Exact account_id match
- ✅ Strategy 2: Match by mask + institution (newly reliable!)
- ✅ Strategy 3: Match by institution (when only one account)

### Pending Transactions Display
- ✅ Correctly shows pending charges per account
- ✅ Matches across account_id changes (bank reconnects)
- ✅ No false positives from different institutions with same mask

## Deployment Checklist

### Before Deploy
- ✅ Code merged to main
- ✅ Environment variables set (NODE_ENV=production)
- ✅ Firebase credentials valid

### After Deploy
1. Check logs for migration start
2. Wait for migration to complete
3. Verify transactions in Firebase console
4. Test pending transaction matching
5. Monitor for errors

### If Issues
1. Check server logs
2. Migration is idempotent - safe to re-run
3. Can manually set RUN_MIGRATION=true and restart
4. Contact support with logs if needed

## Files Modified

1. **backend/server.js**
   - Added `migrateTransactionsAddMaskAndInstitution()` function
   - Updated sync_transactions to fetch accounts and add mask
   - Updated transactionData to include mask/institution_name
   - Added startup migration hook

2. **backend/.env.example**
   - Added NODE_ENV and RUN_MIGRATION variables

3. **Documentation**
   - AUTOMATIC_MIGRATION_IMPLEMENTATION.md (detailed)
   - MIGRATION_QUICK_REFERENCE.md (this file)

## Key Benefits

### For Users
- ✨ "Set it and forget it" - no manual syncing needed
- ✨ Pending transactions always accurate
- ✨ Works across multiple bank accounts
- ✨ Handles bank reconnections gracefully

### For Developers
- 🔧 Automatic data migration on deploy
- 🔧 Idempotent and safe migrations
- 🔧 Detailed logging for debugging
- 🔧 Environment-based control

### For Beta Testers
- 🎯 Connect bank once
- 🎯 Everything updates automatically
- 🎯 No manual intervention needed
- 🎯 Reliable pending transaction tracking
