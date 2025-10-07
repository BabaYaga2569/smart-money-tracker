# Pending Transactions Feature - Testing Guide

## Overview
This guide explains how to test the new pending transactions sync feature that fixes the $46.86 balance discrepancy.

## What Changed

### Backend (server.js)
1. **New endpoint**: `/api/plaid/sync_transactions`
   - Fetches both posted AND pending transactions from Plaid
   - Saves all transactions to Firebase: `users/{userId}/transactions/{transactionId}`
   - Stores `pending: true/false` field for each transaction
   - Returns sync status with counts

2. **Updated endpoint**: `/api/plaid/get_transactions`
   - Now includes `include_personal_finance_category: true` for better categorization

### Frontend

#### Transactions.jsx
- Updated `syncPlaidTransactions()` to call new `/api/plaid/sync_transactions` endpoint
- Added visual indicator (⏳ Pending badge) for pending transactions
- Pending transactions are highlighted with orange badge and pulse animation

#### BalanceCalculator.js
- Updated to calculate projected balance including pending charges
- Pending transactions reduce the projected balance from live balance

#### Dashboard.jsx
- Already supports showing both Live and Projected balances
- Will display difference when pending transactions exist

## Manual Testing Steps

### 1. Backend API Testing

#### Test the new sync endpoint:
```bash
# Replace USER_ID with actual Firebase user ID
curl -X POST http://localhost:5000/api/plaid/sync_transactions \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "YOUR_USER_ID",
    "start_date": "2025-01-01",
    "end_date": "2025-01-31"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "added": 15,
  "updated": 5,
  "pending": 3,
  "total": 20,
  "message": "Synced 15 new transactions (3 pending)"
}
```

### 2. Frontend UI Testing

#### Step 1: Connect Plaid Account
1. Navigate to Settings page
2. Click "Connect Bank Account"
3. Complete Plaid Link flow
4. Verify accounts appear

#### Step 2: Sync Transactions
1. Navigate to Transactions page
2. Click "🔄 Sync from Bank" button
3. Wait for sync to complete (loading spinner shows)
4. Verify success notification: "Successfully synced X new transactions (Y pending)"

#### Step 3: Verify Pending Display
1. Check transaction list for ⏳ Pending badges
2. Pending transactions should have:
   - Orange badge with "⏳ Pending" text
   - Subtle pulse animation
   - Same data as cleared transactions (date, amount, description)

#### Step 4: Check Balance Calculations
1. Navigate to Dashboard
2. Check "Total Balance" tile
3. If pending transactions exist, you should see:
   ```
   Live: $1,992.98
   Projected: $1,946.12
   ```
4. The difference ($46.86) represents pending charges

### 3. Firebase Verification

#### Check Firebase Console:
1. Navigate to Firestore
2. Go to: `users/{userId}/transactions/`
3. Verify transaction documents have:
   - `transaction_id`: String (Plaid transaction ID)
   - `account_id`: String
   - `amount`: Number
   - `date`: String (YYYY-MM-DD)
   - `name`: String
   - `pending`: Boolean ← **KEY FIELD**
   - `timestamp`: Timestamp
   - `merchant_name`: String
   - `category`: Array

#### Example Pending Transaction:
```json
{
  "transaction_id": "plaid_tx_abc123",
  "account_id": "account_xyz789",
  "amount": 14.36,
  "date": "2025-01-07",
  "name": "Amazon Purchase",
  "merchant_name": "Amazon",
  "pending": true,
  "category": ["Shopping", "Online"],
  "payment_channel": "online",
  "timestamp": "2025-01-07T10:30:00Z"
}
```

## Expected Outcomes

### Before the Fix
- ❌ Pending transactions not fetched
- ❌ Balance shows $1,992.98 (missing $46.86)
- ❌ No visual indication of pending charges
- ❌ Spendability calculations incorrect

### After the Fix
- ✅ Pending transactions fetched and synced
- ✅ Live balance: $1,992.98, Projected: $1,946.12
- ✅ Pending transactions marked with ⏳ badge
- ✅ Accurate spendability calculations

## Testing with Plaid Sandbox

If testing in Plaid Sandbox environment:

1. Use test credentials from Plaid dashboard
2. Sandbox accounts come with pre-loaded transactions
3. Some transactions may be marked as pending by default
4. You can use Plaid's webhook simulator to test pending → cleared transitions

### Plaid Sandbox Test Account
- Username: `user_good`
- Password: `pass_good`
- This account includes various transaction types including pending ones

## Troubleshooting

### Issue: "No Plaid connection found"
**Solution**: Ensure user has completed Plaid Link flow in Settings

### Issue: "Failed to sync transactions"
**Solution**: 
- Check Plaid credentials are valid
- Verify Firebase permissions
- Check backend logs for detailed error

### Issue: Pending badge not showing
**Solution**: 
- Clear browser cache
- Check transaction has `pending: true` field in Firebase
- Verify CSS loaded correctly

### Issue: Balance calculation incorrect
**Solution**:
- Verify BalanceCalculator.js is using updated logic
- Check that transactions have correct `pending` field
- Run unit tests: `node BalanceCalculator.test.js`

## Performance Notes

- Batch writes used for Firebase updates (efficient for large syncs)
- Maximum 500 transactions per sync call (Plaid API limit)
- Pending transactions automatically update when they clear

## Next Steps

After verifying the feature works:
1. Monitor for any edge cases
2. Consider adding webhook support for real-time updates
3. Add filters to show/hide pending transactions
4. Consider adding pending transaction count to Dashboard tiles
