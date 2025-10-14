# Automatic Migration Implementation - Transaction mask & institution_name

## Overview

This implementation adds automatic migration to ensure all transactions have `mask` and `institution_name` fields. This is critical for the account matching feature that allows pending transactions to be properly tracked across multiple bank accounts.

## Features Implemented

### 1. **Startup Migration** (One-Time Backfill)

A migration function `migrateTransactionsAddMaskAndInstitution()` that:
- Runs automatically on server startup in production
- Can be manually enabled in development with `RUN_MIGRATION=true`
- Checks all transactions for missing `mask` or `institution_name` fields
- Fetches account information from Plaid to get mask data
- Updates transactions in batches (500 transactions per batch)
- Is idempotent - safe to run multiple times
- Has proper error handling - continues on individual errors

### 2. **Smart Sync Enhancement** (Ongoing Auto-Fix)

Updated the `/api/plaid/sync_transactions` endpoint to:
- Fetch account information from Plaid on each sync
- Create an `accountsMap` with mask data for each account
- Add `mask` to transactions when mapping them
- Always include `mask` and `institution_name` in saved transaction data
- Use `merge: true` when updating existing transactions

## Code Changes

### File: `backend/server.js`

#### Change 1: Fetch Accounts for Mask Data
```javascript
// In sync_transactions endpoint, for each item:
// Fetch accounts for this item to get mask information
let accountsMap = {};
try {
  const accountsResponse = await plaidClient.accountsGet({
    access_token: item.accessToken,
  });
  accountsResponse.data.accounts.forEach(account => {
    accountsMap[account.account_id] = {
      mask: account.mask || null,
      name: account.name,
      type: account.type
    };
  });
  logDiagnostic.info('SYNC_TRANSACTIONS', `Fetched ${accountsResponse.data.accounts.length} accounts for item ${item.itemId}`);
} catch (accountError) {
  logDiagnostic.error('SYNC_TRANSACTIONS', `Failed to fetch accounts for item ${item.itemId}`, accountError);
  // Continue without account mask data
}
```

#### Change 2: Add Mask to Transaction Mapping
```javascript
// Add institution info and mask to transactions
const addedWithInstitution = response.data.added.map(tx => ({
  ...tx,
  institution_name: item.institutionName,
  institution_id: item.institutionId,
  item_id: item.itemId,
  mask: accountsMap[tx.account_id]?.mask || null
}));

const modifiedWithInstitution = response.data.modified.map(tx => ({
  ...tx,
  institution_name: item.institutionName,
  institution_id: item.institutionId,
  item_id: item.itemId,
  mask: accountsMap[tx.account_id]?.mask || null
}));
```

#### Change 3: Update Transaction Data Structure
```javascript
const transactionData = {
  transaction_id: plaidTx.transaction_id,
  account_id: plaidTx.account_id,
  amount: -plaidTx.amount,
  date: plaidTx.date,
  name: plaidTx.name,
  merchant_name: plaidTx.merchant_name || plaidTx.name,
  category: autoCategorizTransaction(plaidTx.merchant_name || plaidTx.name),
  pending: isPending,
  payment_channel: plaidTx.payment_channel || 'other',
  source: 'plaid',
  // ✅ Always include mask and institution_name for account matching
  mask: plaidTx.mask || null,
  institution_name: plaidTx.institution_name || null,
  item_id: plaidTx.item_id || null,
  timestamp: admin.firestore.FieldValue.serverTimestamp(),
  lastSyncedAt: admin.firestore.FieldValue.serverTimestamp()
};
```

#### Change 4: Migration Function
```javascript
async function migrateTransactionsAddMaskAndInstitution() {
  // Iterates through all users
  // For each user's Plaid items:
  //   - Fetches accounts from Plaid
  //   - Gets transactions missing mask/institution_name
  //   - Updates them in batches (500 at a time)
  //   - Logs progress
  //   - Handles errors gracefully
}
```

#### Change 5: Startup Hook
```javascript
// Run migration on server startup (only in production or when explicitly enabled)
if (process.env.NODE_ENV === 'production' || process.env.RUN_MIGRATION === 'true') {
  console.log('[Migration] Starting automatic migration on server startup...');
  migrateTransactionsAddMaskAndInstitution()
    .then(() => console.log('[Migration] Startup migration completed'))
    .catch(err => console.error('[Migration] Startup migration error:', err));
} else {
  console.log('[Migration] Skipping migration (not in production and RUN_MIGRATION not set)');
}
```

## Environment Variables

Add to `.env`:

```bash
# Migration Control
NODE_ENV=production              # Automatically runs migration in production
RUN_MIGRATION=true               # Force migration in development
```

## Migration Behavior

### Production (NODE_ENV=production)
- ✅ Migration runs automatically on server startup
- ✅ All existing transactions are checked and updated
- ✅ Future syncs always include mask/institution_name

### Development (default)
- ⏸️ Migration is skipped by default
- ✅ Can be enabled with `RUN_MIGRATION=true`
- ✅ Future syncs always include mask/institution_name

## Safety Features

### Idempotent
- Safe to run multiple times
- Checks if fields already exist before updating
- Uses `undefined` check (not falsy check) to avoid overwriting `null` values

### Error Handling
- Continues processing if one user/item fails
- Logs all errors for debugging
- Doesn't crash the server if migration fails
- Can be re-run on next startup

### Performance
- Runs in background (doesn't block server initialization)
- Uses batched writes (500 transactions per batch)
- Only processes transactions that need updates
- Logs progress for monitoring

### Batch Operations
- Respects Firebase's 500 operation limit per batch
- Creates new batch after committing each 500 operations
- Commits remaining operations at the end

## Expected User Flow

### First-Time User
1. User signs up
2. Connects bank via Plaid
3. Transactions sync automatically with all fields ✅
4. Pending transactions match correctly ✅

### Existing User (After Deploy)
1. Backend deploys with migration
2. Migration runs on startup
3. All existing transactions updated in background
4. User logs in, everything works seamlessly ✅

### Edge Cases
- ✅ Server restart → Migration checks and runs if needed
- ✅ Manual sync → Updates any missing fields automatically
- ✅ Auto-sync → Updates any missing fields automatically
- ✅ New transactions → Always have complete data
- ✅ Old transactions → Automatically migrated

## Testing

### Manual Testing

**Test 1: Fresh Installation**
```bash
# 1. Deploy new code
# 2. Connect a new bank
# 3. Check Firebase console
# Expected: All transactions have mask and institution_name
```

**Test 2: Existing Users**
```bash
# 1. Check existing transactions (missing mask/institution_name)
# 2. Deploy new code
# 3. Server restarts → Migration runs
# 4. Check Firebase console
# Expected: Old transactions now have mask and institution_name
```

**Test 3: Sync After Migration**
```bash
# 1. Wait for auto-sync (5 minutes)
# 2. Check new transactions
# Expected: New transactions have mask and institution_name
```

**Test 4: Development Mode**
```bash
# 1. Set RUN_MIGRATION=true in .env
# 2. Restart server
# 3. Check logs
# Expected: Migration runs and updates transactions
```

## Success Criteria

After deployment:
- ✅ All transactions have mask and institution_name (old and new)
- ✅ Pending transactions match correctly across accounts
- ✅ Account matching strategies work properly
- ✅ System is truly "set it and forget it"
- ✅ No manual intervention needed

## Monitoring

Check server logs for:
```
🔄 [Migration] Checking transactions for mask/institution fields...
[Migration] Processing user: {userId}
[Migration] Fetched {count} accounts for item {itemId}
✅ [Migration] Updated {count} transactions for item {itemId}
✅ [Migration] Transaction migration complete!
```

## Rollback

If issues occur:
1. Set `RUN_MIGRATION=false` (or remove from .env)
2. Restart server
3. Migration will be skipped
4. Transactions will still be synced with new fields going forward
5. Old transactions can be manually updated or left until next deployment

## Future Improvements

Possible enhancements:
- Add migration status endpoint to check progress
- Add migration history tracking in Firestore
- Add migration rollback capability
- Add granular migration control per user
- Add migration dry-run mode
