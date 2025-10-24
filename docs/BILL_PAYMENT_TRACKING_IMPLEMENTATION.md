# Bill Payment Tracking & Overdue Management Implementation

## Overview

This document describes the implementation of the bill payment tracking and overdue management features that fix two critical bugs:

1. **Bills not being marked as paid** - No payment history or proof
2. **Overdue unpaid bills disappearing** - Users forget to pay, incur late fees

## Architecture Changes

### 1. Payment History System

**New Firebase Collection Structure:**
```
users/{userId}/bill_payments/{paymentId}
```

**Payment Record Schema:**
```javascript
{
  billId: string,              // Reference to the bill
  billName: string,            // Bill name for easy reference
  amount: number,              // Amount paid
  dueDate: string,             // Original due date (YYYY-MM-DD)
  paidDate: string,            // Date payment was made (YYYY-MM-DD)
  paymentMonth: string,        // Month of payment (YYYY-MM) for filtering
  paymentMethod: string,       // "Auto", "Manual", etc.
  category: string,            // Bill category
  linkedTransactionId: string, // Plaid transaction ID (if auto-matched)
  isOverdue: boolean,          // Whether payment was late
  daysPastDue: number,         // Days late (0 if on time)
  createdAt: Date              // Timestamp
}
```

### 2. Core Functions

#### `loadPaidThisMonth()`
Queries the `bill_payments` collection for the current month and calculates:
- Total amount paid this month
- Number of bills paid

```javascript
const currentMonth = new Date().toISOString().slice(0, 7); // "2025-10"
const paymentsRef = collection(db, 'users', currentUser.uid, 'bill_payments');
const q = query(paymentsRef, where('paymentMonth', '==', currentMonth));
```

#### `processBillPaymentInternal(bill, paymentData)`
Records payment in three places:
1. **Transactions collection** - Creates expense transaction
2. **bill_payments collection** - Records payment history with metadata
3. **Bills document** - Updates bill status and advances due date

Key enhancements:
- Calculates `daysPastDue` to track late payments
- Links auto-matched transactions via `linkedTransactionId`
- Stores `paymentMonth` for efficient querying
- Calls `loadPaidThisMonth()` to refresh stats

### 3. Bill Sorting Manager Updates

**Critical Fix: Keep overdue bills at top**

```javascript
// Priority 1: Separate paid from unpaid
const aPaid = a.status === 'paid' || a.isPaid;
const bPaid = b.status === 'paid' || b.isPaid;

// Paid bills always go to bottom
if (aPaid && !bPaid) return 1;
if (!aPaid && bPaid) return -1;

// Priority 2: Overdue bills at top
const aOverdue = aDays < 0;
const bOverdue = bDays < 0;

if (aOverdue && !bOverdue) return -1;
if (!aOverdue && bOverdue) return 1;

// Priority 3: Most overdue first (most negative days)
if (aOverdue && bOverdue) {
  return aDays - bDays;
}
```

**Sorting Order:**
1. Overdue bills (most overdue first)
2. Due today
3. Urgent (≤3 days)
4. This week (≤7 days)
5. Pending/upcoming
6. Paid bills (most recent first)

### 4. UI Components

#### Payment History Modal
- **File:** `frontend/src/components/PaymentHistoryModal.jsx`
- **Features:**
  - Filter by month
  - Shows all payment details
  - Highlights late payments
  - Displays auto-matched transactions
  - Export to CSV functionality

#### Visual Indicators

**Overdue Bills:**
```css
.bill-item.overdue {
  border: 3px solid #ff073a;
  background: rgba(255, 7, 58, 0.1);
  animation: pulse-red 2s infinite;
}
```
- Red pulsing border
- Warning badge: "⚠️ LATE FEES MAY APPLY!"
- Shake animation on status badge

**Paid Bills:**
```css
.bill-item.paid {
  border: 2px solid #00ff88;
  background: rgba(0, 255, 136, 0.05);
  opacity: 0.9;
  order: 999;
}
```
- Green border
- Status badge: "✅ PAID [date]"
- Moved to bottom of list

**Clickable "Paid This Month" Tile:**
- Shows total paid from payment history
- Displays bill count
- Opens PaymentHistoryModal on click
- Hover effect for interactivity

### 5. Animations

**Pulse Red (Overdue Bills):**
```css
@keyframes pulse-red {
  0%, 100% { 
    box-shadow: 0 0 20px rgba(255, 7, 58, 0.4);
    border-color: #ff073a;
  }
  50% { 
    box-shadow: 0 0 40px rgba(255, 7, 58, 0.6);
    border-color: #ff3355;
  }
}
```

**Shake (Overdue Badge):**
```css
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-2px); }
  75% { transform: translateX(2px); }
}
```

**Pulse (Warning Text):**
```css
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
```

## User Experience Flow

### Marking a Bill as Paid

1. User clicks "Mark Paid" button
2. `handleMarkAsPaid()` called
3. `processBillPaymentInternal()` executes:
   - Creates transaction
   - Records payment in `bill_payments` collection
   - Updates bill with new due date
   - Calculates overdue status
4. `loadPaidThisMonth()` refreshes stats
5. UI updates:
   - Bill moves to bottom with green border
   - "Paid This Month" tile increases
   - Status badge shows "✅ PAID"

### Auto-Matching (Plaid Integration)

1. Plaid transaction detected
2. `PlaidIntegrationManager.autoMarkBillAsPaid()` called
3. `processBillPaymentInternal()` executes with:
   - `source: 'plaid'`
   - `transactionId: transaction.transaction_id`
   - `linkedTransactionId` recorded
4. Bill shows "✓ Auto-matched Transaction" badge

### Overdue Bill Behavior

**Before Fix (WRONG):**
- Due date auto-updates past current date
- Bill moves to bottom as "upcoming"
- User forgets to pay
- Late fees incurred

**After Fix (CORRECT):**
- Due date STAYS the same until paid
- Bill STAYS at top with red pulsing border
- Status shows "OVERDUE by X days"
- Warning: "⚠️ LATE FEES MAY APPLY!"
- Only moves when marked paid

## Testing

### Manual Test Scenarios

1. **Payment Recording:**
   ```
   - Mark a bill as paid
   - Check bill_payments collection in Firebase
   - Verify payment record exists with correct metadata
   - Verify "Paid This Month" tile updates
   ```

2. **Overdue Visibility:**
   ```
   - Create bill with past due date
   - Verify it appears at top with red border
   - Verify warning message displays
   - Verify pulse/shake animations work
   - Mark as paid and verify it moves to bottom
   ```

3. **Payment History:**
   ```
   - Click "Paid This Month" tile
   - Verify modal opens
   - Change month filter
   - Verify payments display correctly
   - Export to CSV and verify data
   ```

4. **Auto-Matching:**
   ```
   - Connect Plaid account
   - Trigger transaction match
   - Verify payment records with linkedTransactionId
   - Verify "Auto-matched" badge displays
   ```

## Migration Notes

### Existing Bills
No migration required. Existing bills will work as-is:
- Old bills without payment history continue to work
- New payments start recording in bill_payments collection
- "Paid This Month" will show 0 initially until new payments recorded

### Backwards Compatibility
- Code checks for `bill.lastPaidDate` and `bill.status === 'paid'`
- Works with both old payment tracking and new system
- Graceful fallback if bill_payments collection doesn't exist

## Performance Considerations

### Query Optimization
- `bill_payments` indexed by `paymentMonth` for fast filtering
- `orderBy('paidDate', 'desc')` for chronological display
- Pagination supported (not yet implemented in UI)

### Real-time Updates
- `loadPaidThisMonth()` called after each payment
- Consider real-time listener for multi-device sync (future enhancement)

## Security

### Firebase Rules (Recommended)
```javascript
match /users/{userId}/bill_payments/{paymentId} {
  allow read, write: if request.auth.uid == userId;
}
```

## Future Enhancements

1. **Payment Reminders:**
   - Email/SMS notifications for overdue bills
   - Reminders X days before due date

2. **Payment Analytics:**
   - Late payment trends
   - Average days late per bill
   - On-time payment percentage

3. **Recurring Payment Detection:**
   - Auto-detect recurring payment patterns
   - Suggest bill creation from transactions

4. **Payment Proof Export:**
   - PDF export for payment records
   - Include transaction details and proof

5. **Multi-month View:**
   - See payment history across multiple months
   - Year-end summary report

## Troubleshooting

### "Paid This Month" shows $0.00
- Check if bill_payments collection exists
- Verify payments have correct `paymentMonth` format
- Check Firebase console for payment records

### Overdue bills not staying at top
- Verify `BillSortingManager` is imported correctly
- Check bill has correct `status` field
- Verify `determineBillStatus()` logic

### Payment history modal empty
- Check Firebase query permissions
- Verify `currentMonth` format (YYYY-MM)
- Check browser console for errors

## Files Changed

- `frontend/src/components/PaymentHistoryModal.jsx` (new)
- `frontend/src/components/PaymentHistoryModal.css` (new)
- `frontend/src/pages/Bills.jsx` (modified)
- `frontend/src/pages/Bills.css` (modified)
- `frontend/src/utils/BillSortingManager.js` (modified)

## Conclusion

This implementation provides a robust payment tracking system that:
- ✅ Records all payments with full metadata
- ✅ Keeps overdue bills visible at top
- ✅ Provides payment proof and history
- ✅ Supports auto-matching with Plaid
- ✅ Prevents forgotten payments and late fees
- ✅ Maintains backwards compatibility
