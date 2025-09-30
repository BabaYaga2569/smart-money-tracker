# Testing Guide - Recurring Bills Workflow Enhancements

## Test Scenarios

### 1. Bulk Delete Functionality

#### Test 1.1: Delete All with Items
**Steps:**
1. Navigate to Recurring page with existing items
2. Click "🗑️ Delete All" button
3. Verify confirmation modal appears
4. Read warning message
5. Click "Delete All" button

**Expected Results:**
- Modal shows item count
- Warning message is clear
- After deletion, all items are removed
- Counter shows 0 items
- Success notification appears
- "↩️ Undo Delete" button appears (pulsing orange)

#### Test 1.2: Undo Bulk Delete
**Steps:**
1. After deleting all items (Test 1.1)
2. Click "↩️ Undo Delete" button
3. Wait for operation to complete

**Expected Results:**
- All items are restored
- Counter shows correct count
- Success notification: "Items restored successfully!"
- Undo button disappears
- Items display in their original state

#### Test 1.3: Delete All Button Visibility
**Steps:**
1. Delete all items (without undo)
2. Verify button disappears
3. Add a new item
4. Check if button reappears

**Expected Results:**
- Delete All button hidden when no items
- Button reappears when items exist

### 2. CSV Import Error Handling

#### Test 2.1: Import CSV with Errors
**Steps:**
1. Create a CSV file with:
   - Valid rows with name, amount, date
   - Invalid rows (missing amount, invalid date, etc.)
2. Click "📊 Import from CSV"
3. Select the CSV file
4. Wait for preview to load

**Expected Results:**
- Preview loads successfully
- Error section appears at top
- Shows error count (e.g., "⚠️ Import Errors (3)")
- Lists errors with row numbers
- Warning message: "⚠️ You must fix or clear these errors before continuing."
- "Continue" button is disabled (grayed out)
- Valid items shown in preview with status badges

#### Test 2.2: Clear Errors
**Steps:**
1. In preview with errors (Test 2.1)
2. Click "Clear Errors" button
3. Observe changes

**Expected Results:**
- Error section disappears
- "Continue" button becomes enabled
- Valid items remain in preview
- Can proceed with import

#### Test 2.3: Try to Continue with Errors
**Steps:**
1. In preview with errors
2. Try clicking "Continue" button
3. Verify it's disabled

**Expected Results:**
- Button is disabled (cursor: not-allowed)
- Tooltip or visual feedback shows it's blocked
- Cannot proceed while errors exist

### 3. Enhanced Preview Controls

#### Test 3.1: Status Badges
**Steps:**
1. Import CSV with mix of new and duplicate items
2. Review preview screen
3. Check each item's status badge

**Expected Results:**
- New items show green "New" badge
- High similarity duplicates show orange "Will Merge" badge
- Medium similarity show yellow "Potential Duplicate" badge
- Badges are clearly visible and color-coded

#### Test 3.2: Approve All
**Steps:**
1. In preview with valid items (no errors)
2. Click "✓ Approve All" button
3. Complete import flow

**Expected Results:**
- Proceeds to account mapping or conflicts
- All items are included
- No items skipped

#### Test 3.3: Skip All
**Steps:**
1. In preview screen
2. Click "✕ Skip All" button
3. Observe result

**Expected Results:**
- All items removed from preview
- Message: "All items skipped. Please upload a new file."
- Preview is empty
- Cannot continue without items

#### Test 3.4: Approve All with Errors
**Steps:**
1. In preview with errors present
2. Try clicking "✓ Approve All"
3. Check result

**Expected Results:**
- Button is disabled
- Error message appears if clicked
- Cannot proceed until errors cleared

### 4. Duplicate Resolution

#### Test 4.1: Smart Default Resolution
**Steps:**
1. Import CSV with duplicates
2. Proceed to conflicts screen
3. Check default resolution for each conflict

**Expected Results:**
- High similarity (≥90%): Defaults to "merge"
- Medium similarity (<90%): Defaults to "keep_both"
- Recommended actions marked with ⭐

#### Test 4.2: Bulk Merge All
**Steps:**
1. On conflicts screen with multiple conflicts
2. Click "🔀 Merge All" button
3. Complete import

**Expected Results:**
- All conflicts set to "merge"
- Existing items updated with new data
- Import count shows merge count
- Success notification mentions merged count

#### Test 4.3: Bulk Skip All
**Steps:**
1. On conflicts screen
2. Click "⏭️ Skip All" button
3. Complete import

**Expected Results:**
- All conflicts set to "skip"
- No new items imported
- Existing items unchanged
- Success message reflects no imports

#### Test 4.4: Bulk Keep All Separate
**Steps:**
1. On conflicts screen
2. Click "➕ Keep All Separate" button
3. Complete import

**Expected Results:**
- All conflicts set to "keep_both"
- New items imported as separate entries
- Duplicates exist in system
- Success message shows import count

### 5. Counter Sync

#### Test 5.1: Counter After Single Delete
**Steps:**
1. Note current item count
2. Delete one item
3. Check counter immediately

**Expected Results:**
- Counter decreases by 1 instantly
- No refresh needed
- Counter accurate

#### Test 5.2: Counter After Bulk Delete
**Steps:**
1. Note current item count (e.g., 10)
2. Click "Delete All"
3. Confirm deletion
4. Check counter

**Expected Results:**
- Counter shows 0 immediately
- "No items found" message appears
- Undo button visible

#### Test 5.3: Counter After Undo
**Steps:**
1. After bulk delete (Test 5.2)
2. Click "Undo Delete"
3. Check counter

**Expected Results:**
- Counter restores to original count
- All items visible
- Counter matches item count

#### Test 5.4: Counter After CSV Import
**Steps:**
1. Note current count (e.g., 5)
2. Import 3 new items from CSV
3. Complete import
4. Check counter

**Expected Results:**
- Counter shows 8 (5 + 3)
- Updates immediately
- Notification shows correct count

#### Test 5.5: Counter After Merge
**Steps:**
1. Note current count (e.g., 5)
2. Import CSV with 2 duplicates (will merge)
3. Complete import with merge
4. Check counter

**Expected Results:**
- Counter remains 5 (no new items added)
- Notification mentions merge count
- Existing items updated

#### Test 5.6: Counter with Filters
**Steps:**
1. Apply filter (e.g., "Expenses only")
2. Note filtered count
3. Delete an expense item
4. Check counter

**Expected Results:**
- Counter updates immediately
- Reflects filtered count
- Still shows correct total when filter removed

## Edge Cases

### Edge Case 1: Empty State
**Test:** Delete all items, then try actions
**Expected:** Appropriate messages, disabled states, no errors

### Edge Case 2: Single Item
**Test:** Bulk delete with only 1 item
**Expected:** Modal shows "1 item", works correctly

### Edge Case 3: Large Dataset
**Test:** Import CSV with 100+ items
**Expected:** Performance acceptable, counter accurate

### Edge Case 4: Network Failure
**Test:** Simulate network failure during operations
**Expected:** Error notification, state remains consistent

### Edge Case 5: Rapid Actions
**Test:** Quickly perform multiple actions
**Expected:** Loading states prevent conflicts, operations queue correctly

## Regression Testing

Ensure existing functionality still works:
1. Add individual item
2. Edit existing item
3. Pause/Resume item
4. View item history
5. Search and filter
6. Sort items
7. Account linking
8. Settings migration

## Browser Compatibility

Test in:
- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Mobile Testing

Test on mobile devices:
1. Responsive layout
2. Touch interactions
3. Modal displays
4. Button sizing
5. Error messages visible

## Performance Testing

Monitor:
1. Import time for large CSV files
2. Counter update speed
3. Bulk delete operation time
4. Memory usage with many items
5. UI responsiveness during operations

## Accessibility Testing

Verify:
1. Keyboard navigation works
2. Screen reader compatibility
3. Color contrast meets standards
4. Focus indicators visible
5. Error messages announced

## Summary

All tests should complete successfully with:
- No console errors
- Correct visual feedback
- Accurate data updates
- Proper state management
- Good user experience
