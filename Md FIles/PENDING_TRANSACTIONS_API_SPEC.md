# Pending Transactions Feature - API Specification

## Overview
This document provides the technical API specification for the pending transactions feature.

---

## Backend API Endpoints

### 1. POST `/api/plaid/sync_transactions`

**Purpose**: Sync both posted and pending transactions from Plaid to Firebase.

#### Request
```json
{
  "userId": "string (required)",
  "start_date": "string (optional, YYYY-MM-DD, default: 30 days ago)",
  "end_date": "string (optional, YYYY-MM-DD, default: today)"
}
```

#### Response - Success
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

#### Response - Error
```json
{
  "success": false,
  "error": "Error message",
  "error_code": "PLAID_ERROR_CODE",
  "error_type": "PLAID_ERROR_TYPE"
}
```

#### Status Codes
- `200` - Success
- `400` - Bad Request (missing userId)
- `401` - Unauthorized (expired token, invalid credentials)
- `404` - Not Found (no Plaid connection)
- `500` - Internal Server Error
- `503` - Service Unavailable (Plaid data not ready)

#### Implementation Details
```javascript
// Plaid API call
const transactionsResponse = await plaidClient.transactionsGet({
  access_token: credentials.accessToken,
  start_date: startDate,
  end_date: endDate,
  options: {
    count: 500,
    offset: 0,
    include_personal_finance_category: true
  }
});

// Firebase batch write
const batch = db.batch();
for (const plaidTx of plaidTransactions) {
  const txDocRef = transactionsRef.doc(plaidTx.transaction_id);
  batch.set(txDocRef, transactionData, { merge: true });
}
await batch.commit();
```

---

### 2. POST `/api/plaid/get_transactions` (Updated)

**Purpose**: Get transactions from Plaid (backward compatible).

#### Changes Made
- Added `include_personal_finance_category: true` for better categorization
- No breaking changes to request/response format

#### Request
```json
{
  "userId": "string (required)",
  "start_date": "string (optional)",
  "end_date": "string (optional)"
}
```

#### Response
```json
{
  "success": true,
  "transactions": [
    {
      "transaction_id": "tx_123",
      "account_id": "acc_456",
      "amount": 14.36,
      "date": "2025-01-07",
      "name": "Amazon Purchase",
      "merchant_name": "Amazon",
      "category": ["Shopping", "Online"],
      "pending": true,
      "payment_channel": "online"
    }
  ],
  "accounts": [...],
  "total_transactions": 20
}
```

---

## Firebase Data Structure

### Collection Path
```
users/{userId}/transactions/{transactionId}
```

### Document Schema
```typescript
interface Transaction {
  // Core fields
  transaction_id: string;      // Plaid transaction ID (document ID)
  account_id: string;          // Plaid account ID
  amount: number;              // Transaction amount (positive = debit/expense)
  date: string;                // Transaction date (YYYY-MM-DD)
  name: string;                // Transaction name
  merchant_name: string;       // Merchant name (may be same as name)
  
  // Status field (KEY!)
  pending: boolean;            // True if transaction is pending
  
  // Metadata
  category: string[];          // Transaction categories
  payment_channel: string;     // 'online', 'in store', 'other'
  timestamp: Timestamp;        // Firestore server timestamp
  lastSyncedAt: Timestamp;     // Last time this transaction was synced
  
  // Optional fields
  location?: {
    address?: string;
    city?: string;
    region?: string;
    postal_code?: string;
    country?: string;
    lat?: number;
    lon?: number;
  };
}
```

### Example Document
```json
{
  "transaction_id": "plaid_tx_abc123xyz",
  "account_id": "bofa_checking_789",
  "amount": 14.36,
  "date": "2025-01-07",
  "name": "Amazon.com",
  "merchant_name": "Amazon",
  "pending": true,
  "category": ["Shopping", "Online Marketplaces"],
  "payment_channel": "online",
  "timestamp": {
    "_seconds": 1704628800,
    "_nanoseconds": 0
  },
  "lastSyncedAt": {
    "_seconds": 1704628900,
    "_nanoseconds": 0
  }
}
```

---

## Frontend Integration

### Transactions.jsx - syncPlaidTransactions()

#### Updated Implementation
```javascript
const syncPlaidTransactions = async () => {
  try {
    setSyncingPlaid(true);
    
    // Determine backend URL
    const backendUrl = window.location.hostname === 'localhost' 
      ? 'http://localhost:5000' 
      : 'https://smart-money-tracker-09ks.onrender.com';

    // Call new sync endpoint
    const response = await fetch(`${backendUrl}/api/plaid/sync_transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.uid,
        start_date: startDate,
        end_date: endDate
      })
    });

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to sync transactions');
    }

    // Reload transactions from Firebase
    await loadTransactions();
    
    // Show success notification with pending count
    const { added, pending } = data;
    const pendingText = pending > 0 ? ` (${pending} pending)` : '';
    showNotification(
      `Successfully synced ${added} new transactions${pendingText}.`,
      'success'
    );
  } catch (error) {
    console.error('Error syncing:', error);
    showNotification(`Error: ${error.message}`, 'error');
  } finally {
    setSyncingPlaid(false);
  }
};
```

---

### BalanceCalculator.js - calculateProjectedBalance()

#### Updated Implementation
```javascript
export const calculateProjectedBalance = (accountId, liveBalance, transactions) => {
  if (!transactions || transactions.length === 0) {
    return liveBalance;
  }

  // Filter transactions for this account
  const accountTransactions = transactions.filter(
    (t) => t.account === accountId || t.account_id === accountId
  );

  // Calculate pending adjustments
  const pendingAdjustments = accountTransactions.reduce((sum, transaction) => {
    // Only include pending transactions
    if (transaction.pending === true) {
      const amount = parseFloat(transaction.amount) || 0;
      // Plaid uses positive for debits, so negate it
      return sum - amount;
    }
    return sum;
  }, 0);

  return liveBalance + pendingAdjustments;
};
```

#### Logic Explanation
1. **Live Balance**: Current cleared balance from bank (Plaid)
2. **Pending Charges**: Transactions that haven't cleared yet
3. **Projected Balance**: `Live Balance - Pending Charges`

#### Example Calculation
```
Live Balance:        $1,992.98
Pending Charge 1:    -$14.36   (Amazon)
Pending Charge 2:    -$32.50   (Gas Station)
                     ----------
Projected Balance:   $1,946.12
```

---

## Data Flow Diagram

```
┌─────────────┐
│   Plaid     │
│   Bank      │
└──────┬──────┘
       │ 1. Fetch transactions
       │    (GET /transactions)
       ▼
┌─────────────────────┐
│   Backend           │
│   server.js         │
│                     │
│  POST /api/plaid/   │
│  sync_transactions  │
└──────┬──────────────┘
       │ 2. Save to Firebase
       │    (batch write)
       ▼
┌─────────────────────┐
│   Firebase          │
│   Firestore         │
│                     │
│  users/{uid}/       │
│  transactions/{id}  │
└──────┬──────────────┘
       │ 3. Load transactions
       │    (query)
       ▼
┌─────────────────────┐
│   Frontend          │
│   Transactions.jsx  │
│                     │
│  - Display list     │
│  - Show pending     │
│  - Calculate balance│
└─────────────────────┘
```

---

## Security Considerations

### Access Token Storage
- ✅ Plaid access tokens stored in Firestore (server-side)
- ✅ Never exposed to client-side code
- ✅ Retrieved only by authenticated backend

### User Authentication
- ✅ All API calls require valid userId
- ✅ Firebase authentication checks user permissions
- ✅ User can only access their own transactions

### Data Privacy
- ✅ Transaction data encrypted at rest (Firebase)
- ✅ HTTPS for all API communications
- ✅ Sensitive fields redacted in logs

---

## Performance Optimization

### Batch Writes
```javascript
// ✅ Efficient: Single batch write
const batch = db.batch();
for (const tx of transactions) {
  batch.set(txRef, data);
}
await batch.commit();

// ❌ Inefficient: Individual writes
for (const tx of transactions) {
  await txRef.set(data);
}
```

### Query Optimization
```javascript
// ✅ Indexed query with limit
const q = query(
  transactionsRef, 
  orderBy('timestamp', 'desc'), 
  limit(100)
);

// Firestore index required:
// - Collection: transactions
// - Field: timestamp (Descending)
```

### Caching Strategy
- Frontend caches transactions in React state
- Only refetch after sync or on page load
- Firebase provides automatic offline persistence

---

## Error Handling

### Backend Error Types

#### 1. Plaid API Errors
```javascript
// ITEM_LOGIN_REQUIRED
{
  error_code: "ITEM_LOGIN_REQUIRED",
  error_message: "Your bank connection has expired",
  resolution: "User must reconnect via Plaid Link"
}

// PRODUCT_NOT_READY
{
  error_code: "PRODUCT_NOT_READY",
  error_message: "Transaction data not yet available",
  resolution: "Wait a few moments and retry"
}
```

#### 2. Firebase Errors
```javascript
// Permission denied
{
  code: "permission-denied",
  message: "User lacks permission to write transactions"
}
```

#### 3. Validation Errors
```javascript
// Missing userId
{
  success: false,
  error: "userId is required. Please authenticate."
}
```

### Frontend Error Handling
```javascript
try {
  await syncPlaidTransactions();
} catch (error) {
  if (error.code === 'ITEM_LOGIN_REQUIRED') {
    showErrorModal('Please reconnect your bank account');
  } else {
    showNotification(`Error: ${error.message}`, 'error');
  }
}
```

---

## Testing

### Unit Tests
```javascript
// BalanceCalculator.test.js
test('Projected balance includes pending charges', () => {
  const liveBalance = 2000.00;
  const transactions = [
    { amount: 14.36, pending: true },
    { amount: 32.50, pending: true }
  ];
  
  const projected = calculateProjectedBalance(
    'account_id',
    liveBalance,
    transactions
  );
  
  expect(projected).toBe(1953.14);
});
```

### Integration Tests
```bash
# Test sync endpoint
curl -X POST http://localhost:5000/api/plaid/sync_transactions \
  -H "Content-Type: application/json" \
  -d '{"userId":"test_user_123","start_date":"2025-01-01","end_date":"2025-01-31"}'
```

### Manual Testing
1. Connect Plaid account
2. Click "Sync from Bank"
3. Verify pending transactions appear
4. Check Firebase for transaction documents
5. Verify balance calculations

---

## Monitoring & Logging

### Backend Logs
```javascript
logDiagnostic.info('SYNC_TRANSACTIONS', 
  `Synced ${addedCount} new, ${updatedCount} updated, ${pendingCount} pending`
);
```

### Frontend Logs
```javascript
console.log(`Synced ${data.added} transactions (${data.pending} pending)`);
```

### Metrics to Track
- Number of transactions synced per user
- Pending transaction count
- Sync success/failure rate
- API response times

---

## Deployment Checklist

- [ ] Backend deployed with new endpoint
- [ ] Frontend deployed with UI changes
- [ ] Firebase indexes created
- [ ] Plaid credentials configured
- [ ] Error monitoring enabled
- [ ] Performance metrics tracked
- [ ] Documentation updated

---

## Rollback Plan

If issues occur:
1. Revert frontend changes first (UI only)
2. Backend endpoint is backward compatible
3. Existing `/api/plaid/get_transactions` still works
4. No data loss risk (read-only from Plaid)

---

## Future API Enhancements

### v2.0 Considerations
1. **Webhooks**: Real-time updates when pending → cleared
2. **Pagination**: Support for > 500 transactions
3. **Filters**: Query pending-only or cleared-only
4. **Bulk operations**: Delete/update multiple transactions
5. **Transaction reconciliation**: Match manual entries with Plaid
