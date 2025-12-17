# Migration Script 09: billInstances → financialEvents

## Purpose

This script migrates any remaining bills from the **billInstances** collection to the **financialEvents** collection, establishing financialEvents as the ONE source of truth for bill data.

## Background

After the Firebase data migration, some bills (8 docs) were still in the old `billInstances` collection. This caused issues where:
- Bills marked as paid in `financialEvents` didn't show up as paid in the UI
- The UI was reading from the wrong collection
- Data was fragmented across multiple collections

## What This Script Does

1. **Reads** all documents from `billInstances` collection
2. **Checks** if each bill already exists in `financialEvents` (by name + dueDate)
3. **Transforms** bill data to `financialEvents` structure:
   - Adds `type: 'bill'` field
   - Normalizes field names (`recurringTemplateId` → `recurringPatternId`)
   - Adds missing fields (`paidAmount`, `linkedTransactionId`, etc.)
   - Generates `merchantNames` if not present
4. **Migrates** only new/missing bills to avoid duplicates
5. **Preserves** original `billInstances` collection as backup

## Usage

```bash
cd backend
node scripts/09-migrate-billInstances-to-financialEvents.js USER_ID
```

Or with environment variable:
```bash
USER_ID=MQWMkJUjTpTYVNJZAMWiSEk0ogj1 node scripts/09-migrate-billInstances-to-financialEvents.js
```

## Expected Output

```
═══════════════════════════════════════════════════════════════
  📦 MIGRATE BILLINSTANCES TO FINANCIALEVENTS
═══════════════════════════════════════════════════════════════
  User ID: MQWMkJUjTpTYVNJZAMWiSEk0ogj1
  Started: 2025-01-XX...
═══════════════════════════════════════════════════════════════

📊 Step 1: Loading billInstances...
   Found 8 billInstances

📊 Step 2: Checking existing financialEvents...
   Found 76 existing bill events

📝 Step 3: Processing billInstances...
   ✅ Migrated: Netflix - 2025-01-15
   ⏭️  Skipped (duplicate): Rent - 2025-01-01
   ...

═══════════════════════════════════════════════════════════════
  📊 MIGRATION SUMMARY
═══════════════════════════════════════════════════════════════
  Total billInstances: 8
  ✅ Migrated: 5
  ⏭️  Skipped (duplicates): 3
═══════════════════════════════════════════════════════════════

✅ Migrated Bills:
   - Netflix ($15.99) - 2025-01-15 [⏳ UNPAID]
   - Electric Bill ($125.00) - 2025-01-10 [⏳ UNPAID]
   ...

⏭️  Skipped Bills:
   - Rent ($1200.00) - 2025-01-01 (Already exists in financialEvents)
   ...

📝 Note: Original billInstances collection has NOT been deleted.
   It remains as a backup. You can delete it manually after verification.

═══════════════════════════════════════════════════════════════
  ✅ MIGRATION COMPLETE
═══════════════════════════════════════════════════════════════
```

## Data Transformation

### Before (billInstances)
```javascript
{
  id: "bill_123",
  name: "Netflix",
  amount: 15.99,
  dueDate: "2025-01-15",
  nextDueDate: "2025-01-15",
  isPaid: false,
  status: "pending",
  recurringTemplateId: "template_456",
  category: "Entertainment",
  linkedTransactionIds: ["txn_789"],
  merchantNames: ["netflix", "netflix.com"]
}
```

### After (financialEvents)
```javascript
{
  id: "bill_123",  // Same ID for traceability
  type: "bill",    // ← NEW: Required for financialEvents
  name: "Netflix",
  amount: 15.99,
  dueDate: "2025-01-15",
  originalDueDate: "2025-01-15",
  status: "pending",
  isPaid: false,
  paidDate: null,
  paidAmount: null,
  linkedTransactionId: "txn_789",  // ← Normalized from array
  recurringPatternId: "template_456",  // ← Renamed field
  category: "Entertainment",
  recurrence: "monthly",
  merchantNames: ["netflix", "netflix.com"],
  autoPayEnabled: false,
  paymentHistory: [],
  notes: null,
  createdAt: <timestamp>,
  updatedAt: <timestamp>,
  migratedFrom: "billInstances",
  originalId: "bill_123",
  createdFrom: "migration-09"
}
```

## Key Changes

1. **type**: Added `"bill"` to distinguish from other financial events
2. **recurringPatternId**: Renamed from `recurringTemplateId` to match new data model
3. **linkedTransactionId**: Converted from array to single value
4. **paidDate/paidAmount**: Explicitly set to null if not paid
5. **merchantNames**: Auto-generated if missing
6. **Metadata**: Added migration tracking fields

## After Running

1. **Verify** bills appear correctly in Bills.jsx UI
2. **Test** marking bills as paid
3. **Test** auto-detection workflow
4. **Confirm** recurring pattern advancement works
5. **Optionally** delete `billInstances` collection after verification

## Rollback

If something goes wrong:
1. The original `billInstances` collection is preserved as backup
2. You can delete migrated documents from `financialEvents` by filtering:
   ```javascript
   where('migratedFrom', '==', 'billInstances')
   ```

## Related Scripts

- **05-merge-collections.js**: Initial merge of bill collections into financialEvents
- **08-auto-clear-paid-bills.js**: Auto-clears paid bills using financialEvents

## References

- Problem Statement: "Fix Bills.jsx to Read from financialEvents"
- Data Model: `financialEvents` collection = ONE source of truth
- UI Component: `frontend/src/pages/Bills.jsx`
- Service: `frontend/src/utils/AutoBillClearingService.js`
