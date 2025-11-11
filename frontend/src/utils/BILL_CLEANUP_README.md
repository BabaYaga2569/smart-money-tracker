# Bill Cleanup Migration Utility

## Problem Solved

The recurring bill payment system was creating NEW bill instances every month instead of updating existing ones, resulting in duplicate bills (e.g., 119 bills where there should be 6-8).

## Solution

This utility provides two key fixes:

### 1. Fixed Bill Payment Logic

In `Bills.jsx`, the `updateBillAsPaid` function now:

- **For RECURRING bills**: Updates the same bill instance with the next due date (doesn't create duplicates)
- **For ONE-TIME bills**: Deletes the bill after payment
- Records all payments in the `bill_payments` collection for history

### 2. Cleanup Utility

The `billCleanupMigration.js` utility provides functions to clean up existing duplicates:

#### Key Functions

- `groupBillsByIdentity(bills)`: Groups bills by name, amount, and frequency
- `selectBillToKeep(billsInGroup)`: Selects which bill to keep from a group
  - Priority: Next upcoming unpaid bill → Most recent unpaid → Latest paid
- `analyzeForCleanup(bills)`: Analyzes bills and generates a cleanup report
- `executeCleanup(...)`: Deletes duplicate bills (Firebase-dependent)

## Usage

### In the UI

1. Navigate to the Bills page
2. Click the **"🧹 Cleanup Duplicates"** button
3. Review the preview showing which bills will be kept/removed
4. Confirm to execute the cleanup

### Programmatically

```javascript
import { analyzeForCleanup } from './utils/billCleanupMigration';

// Load your bills
const bills = [...]; // Array of bill objects

// Analyze for cleanup
const report = analyzeForCleanup(bills);

console.log(`Total bills: ${report.totalBills}`);
console.log(`Unique groups: ${report.uniqueGroups}`);
console.log(`Duplicates found: ${report.duplicatesFound}`);
console.log(`Bills to keep: ${report.billsToKeep.length}`);
console.log(`Bills to remove: ${report.billsToRemove.length}`);

// Group details show which bills had duplicates
report.groupDetails.forEach(group => {
  console.log(`${group.name}: ${group.totalCount} bills, ${group.duplicateCount} duplicates`);
});
```

## How It Works

### Grouping Logic

Bills are grouped by a composite key:
```
name|amount|frequency
```

Example:
- `netflix|15.99|monthly`
- `spotify|9.99|monthly`

### Selection Priority

From each group, the utility keeps:

1. **Next upcoming unpaid bill** (future due date closest to today)
2. If no future unpaid bills → **Most recent unpaid bill**
3. If all paid → **Latest paid bill**

All other bills in the group are marked for removal.

## Expected Results

After running cleanup on a typical scenario:
- **Before**: 119 bills (many duplicates)
- **After**: 6-8 unique bills

Example cleanup:
- claude.ai: 39 instances → 1 instance (38 removed)
- google one: 39 instances → 1 instance (38 removed)
- siriusxm: 39 instances → 1 instance (38 removed)

**Total**: 119 bills → 8 bills (111 duplicates removed)

## Testing

Run the test suite:
```bash
node src/utils/billCleanupMigration.test.js
```

All 8 tests should pass:
- ✅ groupBillsByIdentity: groups bills correctly
- ✅ selectBillToKeep: keeps the right bill
- ✅ analyzeForCleanup: generates correct reports

## Future Bill Payments

After cleanup, future bill payments will work correctly:
- Recurring bills update with next due date (no new instances created)
- One-time bills are deleted after payment
- Payment history is preserved in `bill_payments` collection
