# Bill Structure Migration Guide

## Overview

This guide explains the unified bill structure migration implemented to fix the "Mark as Paid" functionality for subscription bills and create a single source of truth for all bill instances.

## Problem Statement

### Before Migration

The app had **TWO separate bill systems** that didn't work together:

1. **Regular Bills** - Stored in `users/{userId}/settings/personal/bills` (array)
   - "Mark as Paid" button: ✅ WORKED
   - Examples: Charger Payment, Courtney Payment, Bankruptcy Payment

2. **Subscription Bills** - Stored in `users/{userId}/subscriptions/{subscriptionId}` (collection)
   - "Mark as Paid" button: ❌ BROKEN
   - Examples: Google One, Sirius XM, CVS ExtraCare, CloudCall, Southwest Gas

### The Issue

When users clicked "Mark as Paid" on subscription bills in Spendability.jsx:
- The code only updated `settings/personal/bills` array
- Subscription bills lived in a separate `subscriptions` collection
- Result: Button showed "success" but nothing actually happened

## Solution: Unified Bill Structure

### New Collection: `billInstances`

All bill instances (both regular and subscription) now live in:
```
users/{userId}/billInstances/{billInstanceId}
```

### Schema

```javascript
{
  // Identification
  id: "bill_1762234567890_abc123",
  name: "Google One",
  
  // Amounts and dates
  amount: 9.99,
  dueDate: "2025-11-16",           // Next due date
  originalDueDate: "2025-10-16",   // First/original due date
  
  // Status tracking
  isPaid: false,
  status: "pending" | "overdue" | "paid" | "skipped",
  lastPaidDate: timestamp,
  
  // Categorization
  category: "Subscriptions",
  recurrence: "monthly",
  
  // Subscription linking
  isSubscription: true,
  subscriptionId: "google-one-sub-id",
  
  // Payment tracking
  paymentHistory: [
    {
      paidDate: timestamp,
      amount: 9.99,
      transactionId: "plaid_transaction_id",
      paymentMethod: "auto" | "manual",
      source: "plaid" | "manual"
    }
  ],
  linkedTransactionIds: ["trans_123", "trans_456"],
  
  // Auto-detection
  merchantNames: ["GOOGLE", "GOOGLE ONE", "GOOGLE*ONE"],
  accountId: "plaid_account_id",
  
  // Metadata
  createdAt: timestamp,
  updatedAt: timestamp,
  recurringTemplateId: "template_123"
}
```

## Migration Process

### Automatic Migration

The migration runs **automatically once per user** when they load Spendability.jsx:

```javascript
import { autoMigrateBills } from '../utils/FirebaseMigration';

// In fetchFinancialData()
await autoMigrateBills(currentUser.uid);
```

### Migration Steps

1. **Check if already migrated**
   - Reads `users/{userId}/metadata/system`
   - If `billsMigrated: true`, skips migration

2. **Migrate subscription bills**
   - Query `users/{userId}/subscriptions` where `status == 'active'`
   - For each subscription:
     - Check if billInstance already exists (by subscriptionId)
     - Create new billInstance with `isSubscription: true`
     - Link back to subscription via `subscriptionId`

3. **Migrate regular bills**
   - Read `users/{userId}/settings/personal/bills` array
   - For each unpaid bill:
     - Check if billInstance already exists (by name + dueDate)
     - Create new billInstance with `isSubscription: false`

4. **Mark migration complete**
   - Set `users/{userId}/metadata/system/billsMigrated: true`
   - Add migration timestamp

### Duplicate Prevention

The migration prevents duplicates by checking:
- For subscriptions: `subscriptionId` + `isPaid: false`
- For regular bills: `name` + `dueDate`

If a bill instance already exists, it's skipped.

## Updated Functionality

### Spendability.jsx Changes

#### Before (Lines 206-279)
```javascript
// Load bills from THREE different places
const oneTimeBills = settingsData.bills || [];
const recurringBillInstances = await getDocs(...); // billInstances
const subscriptionBills = await getDocs(...); // subscriptions

// Merge and deduplicate
const allBills = [...oneTimeBills, ...recurringBillInstances, ...subscriptionBills];
```

#### After (Lines 206-240)
```javascript
// Load bills from ONE place
const billInstancesSnapshot = await getDocs(
  query(
    collection(db, 'users', currentUser.uid, 'billInstances'),
    where('isPaid', '==', false),
    where('status', '!=', 'skipped')
  )
);

const allBills = billInstancesSnapshot.docs.map(doc => ({
  id: doc.id,
  ...doc.data()
}));
```

### Mark as Paid Functionality

#### Before
```javascript
const updateBillAsPaid = async (bill) => {
  // Only updates settings/personal/bills array
  const settingsDocRef = doc(db, 'users', userId, 'settings', 'personal');
  const bills = currentData.bills || [];
  const updatedBills = bills.map(b => 
    b.name === bill.name ? {...b, isPaid: true} : b
  );
  await updateDoc(settingsDocRef, { bills: updatedBills });
};
```

#### After
```javascript
const updateBillAsPaid = async (bill) => {
  // Update billInstances collection
  const billRef = doc(db, 'users', userId, 'billInstances', bill.id);
  
  await updateDoc(billRef, {
    isPaid: true,
    status: 'paid',
    lastPaidDate: serverTimestamp(),
    paymentHistory: arrayUnion({
      paidDate: new Date().toISOString(),
      amount: bill.amount,
      paymentMethod: 'manual',
      source: 'manual'
    })
  });
  
  // Auto-generate next month's bill if recurring
  if (bill.recurrence === 'monthly' || bill.isSubscription) {
    const nextDueDate = new Date(bill.dueDate);
    nextDueDate.setMonth(nextDueDate.getMonth() + 1);
    
    await setDoc(
      doc(db, 'users', userId, 'billInstances', nextBillId),
      { ...bill, dueDate: nextDueDate, isPaid: false, status: 'pending' }
    );
  }
};
```

## Firebase Indexes

The following indexes are configured in `firestore.indexes.json`:

```json
{
  "collectionGroup": "billInstances",
  "fields": [
    { "fieldPath": "isPaid", "order": "ASCENDING" },
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "dueDate", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "billInstances",
  "fields": [
    { "fieldPath": "isPaid", "order": "ASCENDING" },
    { "fieldPath": "dueDate", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "billInstances",
  "fields": [
    { "fieldPath": "subscriptionId", "order": "ASCENDING" },
    { "fieldPath": "isPaid", "order": "ASCENDING" }
  ]
}
```

## Testing Checklist

- [x] Build passes with no errors
- [x] Linter shows no new errors
- [x] CodeQL security scan passes (0 vulnerabilities)
- [ ] Manual testing: Load Spendability page
- [ ] Manual testing: Verify all bills load correctly
- [ ] Manual testing: Click "Mark as Paid" on subscription bill
- [ ] Manual testing: Verify bill disappears from list
- [ ] Manual testing: Verify next month's bill appears
- [ ] Manual testing: Check Firebase Console for correct data

## Backwards Compatibility

### Data Preservation

The migration **does NOT delete** original data:
- `subscriptions` collection remains intact
- `settings/personal/bills` array remains intact
- Bills can be rolled back if needed

### Other Pages

- **Bills.jsx** - Still manages bill templates in `settings/personal/bills` (unchanged)
- **Recurring.jsx** - Still manages recurring items in `settings/personal/recurringItems` (unchanged)
- **Spendability.jsx** - Now uses unified `billInstances` (updated)

## Future Enhancements

1. **Auto-detection** - Use `merchantNames` array to match Plaid transactions
2. **Payment linking** - Link bills to actual transactions via `linkedTransactionIds`
3. **Analytics** - Track payment history and patterns
4. **Reminders** - Send notifications based on `dueDate` and `status`

## Troubleshooting

### Migration doesn't run
- Check browser console for errors
- Verify Firebase permissions allow read/write to billInstances
- Check if migration flag is stuck: `users/{userId}/metadata/system/billsMigrated`

### Duplicate bills appear
- Clear browser cache and reload
- Check for multiple migration runs
- Verify deduplication logic in FirebaseMigration.js

### Bills don't disappear after payment
- Check Firebase Console for bill status
- Verify `isPaid: true` and `status: 'paid'` are set
- Ensure query filters out paid bills: `where('isPaid', '==', false)`

## Support

For issues or questions, refer to:
- [FirebaseMigration.js](../frontend/src/utils/FirebaseMigration.js) - Migration logic
- [Spendability.jsx](../frontend/src/pages/Spendability.jsx) - Updated bill loading
- [GitHub Issues](https://github.com/BabaYaga2569/smart-money-tracker/issues) - Report bugs
