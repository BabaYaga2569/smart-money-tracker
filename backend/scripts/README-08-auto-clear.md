# 08-auto-clear-paid-bills.js - Automatic Bill Clearing Cleanup Script

## Purpose
One-time cleanup script to fix bills that are showing as "OVERDUE" but have actually been paid. This script:
- Scans transactions from the last 60 days (configurable)
- Matches them to overdue bills using merchant aliases and fuzzy matching
- Auto-marks matched bills as PAID
- Advances recurring patterns to the correct next due date
- Generates next month's bill instances
- Provides a detailed report of all actions taken

## When to Use This Script
Run this script when:
- Bills are showing as overdue but have been paid
- After a Firebase migration
- Recurring patterns have incorrect next due dates
- You want to bulk-fix historical bill payment issues

## Requirements
- Node.js installed
- Firebase credentials configured (firebase-key.json or FIREBASE_SERVICE_ACCOUNT env var)
- User ID to process

## Usage

### Basic Usage
```bash
# From the backend directory
cd backend
node scripts/08-auto-clear-paid-bills.js YOUR_USER_ID
```

### Using Environment Variable
```bash
USER_ID=MQWMkJUjTpTYVNJZAMWiSEk0ogj1 node scripts/08-auto-clear-paid-bills.js
```

### Custom Lookback Period
```bash
# Look back 30 days instead of default 60
DAYS_LOOKBACK=30 node scripts/08-auto-clear-paid-bills.js YOUR_USER_ID
```

### Combined Options
```bash
USER_ID=YOUR_USER_ID DAYS_LOOKBACK=90 node scripts/08-auto-clear-paid-bills.js
```

## How It Works

### 1. Load Merchant Aliases
Loads merchant aliases from `aiLearning/merchantAliases` collection to improve matching accuracy.

Example aliases:
- "netflix" → ["netflix", "netflix.com", "netflix inc"]
- "geico" → ["geico", "geico insurance", "geico auto"]

### 2. Scan Transactions
Fetches all transactions from the specified lookback period (default 60 days).

### 3. Load Unpaid Bills
Gets all bills from `billInstances` collection where `isPaid = false`.

### 4. Match Transactions to Bills
Uses fuzzy matching algorithm with 67% confidence threshold (2 of 3 criteria):
- **Name Match**: 75%+ similarity or alias match
- **Amount Match**: Within $0.50
- **Date Match**: Within ±7 days of due date

### 5. Process Matches
For each matched bill:
1. Mark bill as PAID in `billInstances`
2. Record payment in `bill_payments` collection
3. Advance `recurringPatterns.nextOccurrence` (if applicable)
4. Generate next month's bill instance (if applicable)

### 6. Generate Report
Outputs detailed report showing:
- Number of transactions scanned
- Number of bills scanned
- Number of matches found
- Number of bills cleared
- Number of patterns advanced
- Number of next bills generated
- List of all cleared bills with details
- Any errors encountered

## Example Output

```
============================================================
CONFIGURATION
============================================================
User ID: MQWMkJUjTpTYVNJZAMWiSEk0ogj1
Days lookback: 60
============================================================

🚀 Starting automatic bill clearing cleanup...

📚 Loading merchant aliases...
✅ Loaded 25 merchant aliases

📊 Loading transactions from last 60 days...
✅ Loaded 927 transactions

📋 Loading unpaid bills...
✅ Loaded 15 unpaid bills

🔍 Matching transactions to bills...

💰 Match Found (100% confidence):
   Bill: Netflix ($15.99) due 2025-01-03
   Transaction: "NETFLIX.COM" ($15.99) on 2025-01-03
   ✓ Name: YES | Amount: YES | Date: YES

   ✅ Marked as PAID
   ✅ Advanced pattern: 2025-01-03 → 2025-02-03
   ✅ Generated next bill due 2025-02-03

[... more matches ...]

============================================================
📊 CLEANUP REPORT
============================================================
Transactions scanned: 927
Bills scanned: 15
Matches found: 8
Bills cleared: 8
Patterns advanced: 6
Next bills generated: 6
Errors: 0

✅ Bills cleared:
   - Netflix ($15.99) due 2025-01-03
     Paid on 2025-01-03 via "NETFLIX.COM" (100% match)
   - Geico ($125.50) due 2025-01-10
     Paid on 2025-01-09 via "GEICO INSURANCE" (100% match)
   [... more bills ...]

============================================================
✅ Cleanup complete!
============================================================

✨ Script completed successfully
```

## What Gets Updated

### Collections Modified
1. **billInstances**: Bills marked as `isPaid: true`
2. **bill_payments**: New payment records added
3. **paidBills**: Paid bills archived
4. **recurringPatterns**: `nextOccurrence` advanced to next due date
5. **billInstances**: New bill instances created for next month

### Fields Updated
- `billInstances[id].isPaid` → `true`
- `billInstances[id].status` → `'paid'`
- `billInstances[id].paidDate` → transaction date
- `billInstances[id].linkedTransactionId` → transaction ID
- `recurringPatterns[id].nextOccurrence` → next due date
- `recurringPatterns[id].lastPaidDate` → transaction date

## Safety Features
- ✅ **Read-only mode available**: Comment out write operations to see what would happen
- ✅ **Duplicate prevention**: Won't create duplicate next bills
- ✅ **Date validation**: Only advances patterns when dates match
- ✅ **Detailed logging**: See exactly what's happening at each step
- ✅ **Error handling**: Continues processing even if some bills fail
- ✅ **User ID validation**: Requires explicit user ID (no default)

## Troubleshooting

### "Firebase credentials not found"
Make sure you have either:
- `firebase-key.json` file in the backend directory
- `FIREBASE_SERVICE_ACCOUNT` environment variable set

### "Error: USER_ID is required"
You must specify a user ID:
```bash
node scripts/08-auto-clear-paid-bills.js YOUR_USER_ID
```

### No matches found
Possible reasons:
- All bills are already paid
- Transactions are outside the lookback period (try increasing DAYS_LOOKBACK)
- Merchant names don't match well (check merchant aliases)
- Amounts don't match within $0.50 tolerance
- Dates are more than 7 days apart

### Some bills not matching
Check:
1. Transaction merchant name vs bill name
2. Transaction amount vs bill amount (within $0.50?)
3. Transaction date vs bill due date (within ±7 days?)
4. Merchant aliases in `aiLearning/merchantAliases` collection

## After Running the Script

### Verify Results
1. Check the Bills page - overdue bills should be cleared
2. Check the Recurring page - next due dates should be correct
3. View payment history - payments should be recorded
4. Check for duplicate bills - shouldn't exist

### Test Automatic Clearing
1. Go to Bills page
2. Click "Re-match Transactions" button
3. System will automatically detect and clear new paid bills

## Notes
- This is a **one-time cleanup script** for fixing historical data
- **Ongoing automatic clearing** works via the "Re-match Transactions" button
- The script is **safe to run multiple times** (duplicate prevention)
- **Dry run mode**: Comment out write operations to test without changes

## Support
For issues or questions:
1. Check the detailed logs in the output
2. Verify your Firebase collections match the expected structure
3. Ensure merchant aliases are configured in `aiLearning/merchantAliases`
4. Review the confidence threshold logic in the code

## Related Files
- `frontend/src/utils/AutoBillDetection.js` - Automatic bill detection service
- `frontend/src/utils/AutoBillClearingService.js` - Alternative service implementation
- `frontend/src/utils/BillPaymentMatcher.js` - Matching algorithm
- `frontend/src/pages/Bills.jsx` - Bills page with "Re-match" button
