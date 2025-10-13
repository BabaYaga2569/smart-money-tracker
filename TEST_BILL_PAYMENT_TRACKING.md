# Test Guide: Bill Payment Tracking & Overdue Management

## Quick Test Checklist

Use this guide to manually verify all the new features work correctly.

---

## Test 1: Payment Recording ✅

### Steps:
1. Navigate to Bills page
2. Find an unpaid bill
3. Click "Mark Paid" button
4. Wait for success notification

### Expected Results:
- ✅ Success notification appears
- ✅ Bill moves to bottom of list
- ✅ Bill shows green border
- ✅ Status badge shows "✅ PAID [today's date]"
- ✅ "Paid This Month" tile increases by bill amount
- ✅ Bill count in "Paid This Month" increases by 1

### Firebase Verification:
1. Open Firebase Console
2. Navigate to: `users/{yourUserId}/bill_payments`
3. Find the latest payment record
4. Verify it contains:
   - `billId`
   - `billName`
   - `amount`
   - `dueDate`
   - `paidDate` (today)
   - `paymentMonth` (current month, format: YYYY-MM)
   - `paymentMethod`
   - `category`
   - `isOverdue` (false if paid on time)
   - `daysPastDue` (0 if on time)
   - `createdAt`

---

## Test 2: Overdue Bill Visibility 🚨

### Setup:
1. Create a test bill with due date = yesterday
2. Save the bill
3. Wait for page to reload

### Expected Results:
- ✅ Bill appears at TOP of list
- ✅ Bill has red pulsing border (3px solid)
- ✅ Background is light red/pink
- ✅ Status badge shows "OVERDUE by 1 day" with shake animation
- ✅ Warning message appears: "⚠️ LATE FEES MAY APPLY!"
- ✅ Bill does NOT move to bottom automatically
- ✅ Overdue Bills summary card shows red border
- ✅ Overdue Bills tile shows amount and count

### Verification:
```
Count overdue bills at top of list = 1
Bill position = First in list
Border animation = Pulsing red
Warning visible = Yes
```

---

## Test 3: Overdue Bill Payment 💰

### Steps:
1. Take the overdue bill from Test 2
2. Click "Mark Paid" button
3. Observe the changes

### Expected Results:
- ✅ Bill moves to bottom of list
- ✅ Red border changes to green
- ✅ Status changes to "✅ PAID [date]"
- ✅ Warning message disappears
- ✅ "Paid This Month" increases

### Firebase Verification:
Check the payment record has:
- `isOverdue: true`
- `daysPastDue: 1` (or more if created earlier)

---

## Test 4: Payment History Modal 📊

### Steps:
1. Click on "💵 Paid This Month" tile
2. Modal should open

### Expected Results:
- ✅ Modal displays with title "💵 Payment History"
- ✅ Current month selected by default
- ✅ Summary section shows:
  - Total Paid: correct amount
  - Bills Paid: correct count
  - On Time: count of on-time payments
  - Late: count of late payments
- ✅ List of payments displays
- ✅ Each payment shows:
  - Bill name
  - Amount (green)
  - Due date
  - Paid date
  - Payment method
  - Category
  - Late indicator (if applicable)

### Month Filter Test:
1. Change month selector to previous month
2. Verify payments update (may be empty)
3. Change back to current month

### Export Test:
1. Click "📊 Export to CSV" button
2. Verify file downloads
3. Open CSV file
4. Verify columns: Bill Name, Amount, Due Date, Paid Date, Payment Method, Category, Status

---

## Test 5: Paid Bill Sorting 🔽

### Setup:
Pay 3 bills at different times

### Expected Results:
- ✅ All paid bills appear at bottom of list
- ✅ Paid bills have green border
- ✅ Paid bills have opacity 0.9 (slightly transparent)
- ✅ Paid bills show "✅ PAID [date]" badge
- ✅ Most recently paid appears first among paid bills
- ✅ Unpaid bills remain at top

---

## Test 6: Bill Sorting Priority Order 📋

### Setup:
Create test bills with various due dates:
1. Bill A: Due date = 5 days ago (overdue)
2. Bill B: Due date = 2 days ago (overdue)
3. Bill C: Due date = today (due today)
4. Bill D: Due date = 2 days from now (urgent)
5. Bill E: Due date = 10 days from now (upcoming)
6. Bill F: Already paid

### Expected Order:
1. Bill A (most overdue - 5 days)
2. Bill B (overdue - 2 days)
3. Bill C (due today)
4. Bill D (urgent)
5. Bill E (upcoming)
6. Bill F (paid - at bottom)

### Verification:
```
Position 1: Most overdue bill (red pulsing border)
Position 2: Less overdue bill (red pulsing border)
Position 3-5: Upcoming bills (yellow/orange/green borders)
Last position: Paid bill (green border)
```

---

## Test 7: Auto-Matching (Plaid Integration) 🔗

**Prerequisites:** Plaid account connected

### Steps:
1. Have an unpaid bill ($50.00 - "Netflix")
2. Connect Plaid sandbox account
3. Click "Match Transactions" button
4. Wait for matching to complete

### Expected Results:
- ✅ Notification: "Matched X bills from Y transactions"
- ✅ Netflix bill marked as paid
- ✅ Bill shows "✓ Auto-matched Transaction" badge
- ✅ Badge shows transaction details
- ✅ Payment history shows `linkedTransactionId`

### Firebase Verification:
Payment record should have:
- `paymentMethod: "Auto"`
- `linkedTransactionId: "tx_xxxxx"`
- `source: "plaid"`

---

## Test 8: Overdue Summary Card 🚨

### Setup:
Have 2 overdue bills totaling $100

### Expected Results:
- ✅ Overdue Bills card has red border
- ✅ Background is light red
- ✅ Shows correct total: $100.00
- ✅ Shows correct count: 2 bills overdue
- ✅ Warning message: "⚠️ Pay now to avoid late fees!"
- ✅ Warning message has pulse animation

### No Overdue Bills:
When all bills paid:
- ✅ Card returns to normal styling
- ✅ Shows $0.00
- ✅ Shows 0 bills overdue
- ✅ Warning message disappears

---

## Test 9: Animation Verification 🎬

### Pulse Red Animation (Overdue):
1. Create overdue bill
2. Observe border for 5 seconds
3. Verify smooth pulsing (light → bright → light)

### Shake Animation (Badge):
1. Look at overdue badge
2. Should subtly shake left-right
3. Continuous animation

### Pulse Animation (Warning):
1. Look at "Pay now to avoid late fees!" text
2. Should fade in/out smoothly
3. Continuous animation

---

## Test 10: Clickable Interactions 🖱️

### Paid This Month Tile:
1. Hover over tile
2. ✅ Border changes to blue (#00d4ff)
3. ✅ Slight upward movement (transform: translateY(-2px))
4. ✅ Box shadow appears
5. Click tile
6. ✅ Payment history modal opens

### Modal Interactions:
1. Click outside modal → closes
2. Click X button → closes
3. Click month selector → updates payments
4. Click export → downloads CSV

---

## Test 11: Edge Cases 🔍

### No Payments This Month:
- ✅ "Paid This Month" shows $0.00
- ✅ Modal shows "No payments recorded" message

### No Overdue Bills:
- ✅ Overdue card shows normal styling
- ✅ Shows $0.00 and 0 bills

### First Payment Ever:
- ✅ Creates `bill_payments` collection
- ✅ Records payment successfully
- ✅ Modal displays correctly

### Multiple Payments Same Day:
- ✅ All recorded separately
- ✅ All show in payment history
- ✅ Total calculated correctly

---

## Test 12: Backwards Compatibility 🔄

### Old Bills (No Payment History):
1. Have bills created before this update
2. Mark one as paid
3. ✅ Creates new payment record
4. ✅ Bill updates correctly
5. ✅ No errors in console

---

## Visual Checklist 👁️

### Overdue Bill Should Have:
- [ ] Red border (3px solid #ff073a)
- [ ] Light red background (rgba(255, 7, 58, 0.1))
- [ ] Pulsing box shadow
- [ ] Red status badge with shake
- [ ] Warning message "⚠️ LATE FEES MAY APPLY!"
- [ ] At top of list

### Paid Bill Should Have:
- [ ] Green border (2px solid #00ff88)
- [ ] Light green background (rgba(0, 255, 136, 0.05))
- [ ] Green status badge "✅ PAID [date]"
- [ ] Slightly transparent (opacity 0.9)
- [ ] At bottom of list

### Upcoming Bill Should Have:
- [ ] Green border (default)
- [ ] Normal background
- [ ] Status badge showing days until due
- [ ] No warning messages

---

## Performance Tests ⚡

### Payment Recording Speed:
- Mark bill as paid
- Time from click to UI update
- ✅ Should complete within 2 seconds

### Modal Loading:
- Click "Paid This Month"
- Time to modal open and data display
- ✅ Should open within 1 second

### Month Filter Change:
- Change month in modal
- Time to update payment list
- ✅ Should update within 1 second

---

## Console Verification 🖥️

### No Errors:
Open browser console and verify:
- [ ] No red errors
- [ ] No warnings about missing data
- [ ] Firebase queries succeed
- [ ] All animations render smoothly

### Successful Logs:
Look for:
```
Successfully auto-marked [Bill Name] as paid
Payment recorded: [payment data]
Loaded X payments for [month]
```

---

## Mobile Responsive Test 📱

### Resize browser to mobile width (375px):
- [ ] Payment history modal fits screen
- [ ] Bill cards stack properly
- [ ] Buttons remain clickable
- [ ] Text remains readable
- [ ] Animations still work
- [ ] Modal can scroll if needed

---

## Known Limitations 🔧

1. **Real-time sync:** Payment history requires page refresh to sync across devices
2. **Pagination:** Payment history loads all payments (no pagination yet)
3. **Date range:** Can only view one month at a time
4. **Export format:** CSV only (no PDF yet)

---

## Reporting Issues 🐛

If any test fails, report with:
1. Test number and name
2. Steps to reproduce
3. Expected vs actual result
4. Browser console errors
5. Screenshot if visual issue
6. Firebase data snapshot

---

## Success Criteria ✨

All tests should pass with:
- ✅ No console errors
- ✅ Smooth animations
- ✅ Correct data in Firebase
- ✅ Accurate calculations
- ✅ Responsive UI
- ✅ Clear visual feedback
- ✅ Intuitive user experience

---

## Quick Smoke Test (5 minutes)

For rapid validation:
1. Create overdue bill → verify red border and top position ✅
2. Mark it paid → verify moves to bottom with green border ✅
3. Click "Paid This Month" → verify modal opens with payment ✅
4. Export to CSV → verify file downloads ✅
5. Check Firebase → verify payment record exists ✅

If all 5 pass, core functionality is working! 🎉
