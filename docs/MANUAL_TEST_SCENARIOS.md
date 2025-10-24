# Manual Test Scenarios for Automatic Bill Sync

## Prerequisites
1. Start the application: `npm run dev` in the `frontend` directory
2. Navigate to the Recurring page
3. Ensure you have Firebase configured and can save data

## Test Scenario 1: Creating a New Recurring Template
**Goal**: Verify that bills are automatically generated when creating a new template

### Steps:
1. Click "Add New Recurring Item" button
2. Fill in the form:
   - Name: "Spotify Premium"
   - Type: Expense
   - Amount: $10.99
   - Category: Subscriptions
   - Frequency: Monthly
   - Status: Active
3. Click "Save"

### Expected Results:
- ✅ Success notification appears: "Recurring item added! Bills: 3 added"
- ✅ Navigate to Bills Management page
- ✅ Should see 3 new bills for Spotify Premium with future dates
- ✅ All bills show 🔄 Auto badge

---

## Test Scenario 2: Updating Template Amount
**Goal**: Verify that unpaid bills are updated when amount changes

### Steps:
1. Edit the "Spotify Premium" template
2. Change amount from $10.99 to $11.99
3. Click "Save"

### Expected Results:
- ✅ Success notification: "Recurring item updated! Bills: 3 updated"
- ✅ Navigate to Bills Management
- ✅ All future Spotify bills now show $11.99
- ✅ If any bills were already paid, they keep the old amount ($10.99)

---

## Test Scenario 3: Custom Month Selection
**Goal**: Verify adding and removing months updates bills correctly

### Steps - Part A: Create with Selected Months:
1. Click "Add New Recurring Item"
2. Fill in:
   - Name: "Sports Season Tickets"
   - Amount: $500
   - Frequency: Monthly
   - Check "Custom monthly recurrence"
   - Select only: Nov, Dec, Jan
3. Click "Save"

### Expected Results Part A:
- ✅ Notification: "Recurring item added! Bills: X added" (only for Nov, Dec, Jan)
- ✅ Bills Management shows bills only for selected months

### Steps - Part B: Add More Months:
1. Edit "Sports Season Tickets"
2. Additionally select: Feb, Mar
3. Click "Save"

### Expected Results Part B:
- ✅ Notification: "Recurring item updated! Bills: 2 added, 3 updated"
- ✅ Bills Management now shows bills for Nov, Dec, Jan, Feb, Mar

### Steps - Part C: Remove Months:
1. Edit "Sports Season Tickets"
2. Uncheck: Feb, Mar
3. Click "Save"

### Expected Results Part C:
- ✅ Notification: "Recurring item updated! Bills: 2 removed, 3 updated"
- ✅ Bills Management shows only Nov, Dec, Jan bills
- ✅ Bills for Feb and Mar are removed (if unpaid)

---

## Test Scenario 4: Paid Bill Preservation
**Goal**: Verify that paid bills are preserved when template changes

### Steps:
1. Navigate to Bills Management
2. Mark one "Sports Season Tickets" bill as paid (e.g., November)
3. Go back to Recurring page
4. Edit "Sports Season Tickets" template
5. Uncheck November
6. Click "Save"

### Expected Results:
- ✅ Notification includes: "X preserved" (1 preserved)
- ✅ Navigate to Bills Management
- ✅ The paid November bill still exists
- ✅ Future unpaid bills for November are not generated
- ✅ Paid bill shows as historical record

---

## Test Scenario 5: Pausing a Template
**Goal**: Verify that future bills are removed when template is paused

### Steps:
1. On Recurring page, find "Spotify Premium"
2. Click "Pause" button
3. Check notification

### Expected Results:
- ✅ Notification: "Item paused (X future bills removed)"
- ✅ Template shows "⏸️ Paused" status
- ✅ Navigate to Bills Management
- ✅ Future Spotify bills are removed
- ✅ Any paid Spotify bills remain for history

---

## Test Scenario 6: Resuming a Template
**Goal**: Verify that bills are regenerated when template is resumed

### Steps:
1. On Recurring page, find paused "Spotify Premium"
2. Click "Resume" button
3. Check notification

### Expected Results:
- ✅ Notification: "Item resumed (3 bills generated)"
- ✅ Template shows "Active" status
- ✅ Navigate to Bills Management
- ✅ 3 new future bills for Spotify are created

---

## Test Scenario 7: Deleting Template (Keep Bills)
**Goal**: Verify template deletion without affecting bills

### Steps:
1. On Recurring page, click delete on "Spotify Premium"
2. In the confirmation modal, uncheck "Also delete generated bills"
3. Click "Delete"

### Expected Results:
- ✅ Notification: "Recurring item deleted"
- ✅ Template is removed from Recurring page
- ✅ Navigate to Bills Management
- ✅ Spotify bills still exist (no longer show 🔄 Auto badge)

---

## Test Scenario 8: Deleting Template (Delete Bills)
**Goal**: Verify smart deletion that preserves paid bills

### Steps - Setup:
1. Create a new template: "Test Subscription" ($5/month)
2. Navigate to Bills Management
3. Mark one bill as paid
4. Go back to Recurring page

### Steps - Delete:
1. Click delete on "Test Subscription"
2. Check "Also delete generated bills"
3. Click "Delete"

### Expected Results:
- ✅ Notification: "Recurring item deleted (X bill(s) removed, 1 paid bill(s) preserved)"
- ✅ Template is removed
- ✅ Navigate to Bills Management
- ✅ Unpaid Test Subscription bills are removed
- ✅ Paid Test Subscription bill remains for history

---

## Test Scenario 9: Multiple Templates Independence
**Goal**: Verify that editing one template doesn't affect others

### Steps:
1. Ensure you have at least 2 active templates
2. Edit one template (e.g., change amount)
3. Navigate to Bills Management

### Expected Results:
- ✅ Only bills from the edited template are updated
- ✅ Bills from other templates remain unchanged
- ✅ All bill counts are correct

---

## Test Scenario 10: Manual Bills Not Affected
**Goal**: Verify that manually created bills are not touched

### Steps - Setup:
1. Navigate to Bills Management
2. Manually add a bill: "One-time Payment" ($100)
3. Go back to Recurring page

### Steps - Template Operations:
1. Create/edit/delete any recurring template
2. Check Bills Management

### Expected Results:
- ✅ Manual "One-time Payment" bill remains unchanged
- ✅ Manual bill is never affected by template operations
- ✅ Only bills with 🔄 Auto badge are affected by sync

---

## Test Scenario 11: Rapid Sequential Edits
**Goal**: Verify system handles multiple quick edits correctly

### Steps:
1. Edit a template
2. Change amount to $15
3. Save immediately
4. Edit again
5. Change amount to $20
6. Save immediately

### Expected Results:
- ✅ Both notifications appear
- ✅ Final bill amounts are $20
- ✅ No duplicate bills created
- ✅ No race conditions or errors

---

## Test Scenario 12: No Manual Refresh Required
**Goal**: Verify Bills Management automatically reflects changes

### Steps:
1. Open application in two browser windows
2. Window 1: Bills Management page
3. Window 2: Recurring page
4. In Window 2: Edit a template
5. In Window 1: Refresh the page (or navigate away and back)

### Expected Results:
- ✅ Window 1 shows updated bills after refresh
- ✅ No "Generate Bills" button needed
- ✅ Data is in sync between pages

---

## Regression Tests

### RT1: CSV Import Still Works
1. Navigate to Recurring page
2. Click "Import from CSV"
3. Upload a valid CSV file
4. Verify import succeeds without errors

### RT2: Manual Bill Entry Still Works
1. Navigate to Bills Management
2. Add a manual bill
3. Edit the bill
4. Delete the bill
5. Verify all operations work correctly

### RT3: Existing "Generate Bills" Still Works
1. Navigate to Recurring page
2. Click cleanup menu (⚙️)
3. Click "Generate Bills from Templates"
4. Verify bills are generated (may show "No new bills" if already synced)

---

## Performance Test

### Load Test:
1. Create 10 recurring templates
2. Edit each template multiple times
3. Observe:
   - ✅ UI remains responsive
   - ✅ Notifications appear quickly
   - ✅ No lag or freezing
   - ✅ Database updates complete within 2 seconds

---

## Edge Cases

### EC1: Empty Active Months
1. Create template with custom recurrence
2. Uncheck all months (shouldn't be allowed)
3. Expected: Validation error prevents saving

### EC2: Future Date Beyond Generation Range
1. Create template with next occurrence 6 months in future
2. Expected: No bills generated (all beyond 3-month range)
3. Notification: "Bills: 0 added"

### EC3: Template Without ID
- Should not crash
- Error should be logged
- User sees generic error message

---

## Summary Checklist

After completing all tests, verify:
- [ ] Bills auto-sync on template create
- [ ] Bills auto-sync on template edit
- [ ] Bills auto-sync on pause/resume
- [ ] Bills auto-sync on delete (smart preservation)
- [ ] Paid bills always preserved
- [ ] Unpaid bills updated/removed correctly
- [ ] Custom month selection works
- [ ] Multiple templates don't interfere
- [ ] Manual bills unaffected
- [ ] No manual refresh needed
- [ ] Clear feedback messages
- [ ] No regression in existing features
- [ ] Performance is acceptable
