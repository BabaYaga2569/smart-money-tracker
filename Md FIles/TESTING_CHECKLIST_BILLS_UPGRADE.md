# Bills Management Upgrade - Testing Checklist

## Pre-Testing Setup

1. ✅ Ensure the frontend is built successfully
2. ✅ Start the development server
3. ✅ Navigate to the Bills page
4. ✅ Have at least 3-5 test bills in the system

---

## Feature 1: Bulk Delete Bills

### Test Case 1.1: Delete All Bills
**Steps:**
1. Navigate to Bills page
2. Locate the "🗑️ Delete All Bills" button (red button in controls area)
3. Click the button
4. Verify confirmation modal appears
5. Check that the modal shows:
   - ⚠️ Warning icon and title
   - Correct count of bills to delete
   - Warning message about permanent deletion
   - Information about undo capability
   - Cancel and Delete All buttons
6. Click "Delete All"
7. Verify modal closes
8. Verify all bills are removed from the list
9. Verify bill counter updates to 0

**Expected Result:** ✅ All bills deleted, confirmation shown, counter updated

### Test Case 1.2: Undo Bulk Delete
**Steps:**
1. After completing Test Case 1.1
2. Verify "↩️ Undo Delete" button appears (orange with pulsing animation)
3. Click the "Undo Delete" button
4. Verify all bills are restored
5. Verify bill counter updates to correct count
6. Verify "Undo Delete" button disappears

**Expected Result:** ✅ Bills restored successfully, UI updates correctly

### Test Case 1.3: Cancel Bulk Delete
**Steps:**
1. Click "🗑️ Delete All Bills"
2. In the confirmation modal, click "Cancel"
3. Verify modal closes
4. Verify no bills are deleted
5. Verify bill list remains unchanged

**Expected Result:** ✅ Deletion cancelled, no changes made

---

## Feature 2: CSV Import for Bills

### Test Case 2.1: Upload Valid CSV
**Steps:**
1. Navigate to Bills page
2. Click "📊 Import from CSV" button (blue button)
3. Verify upload modal appears with:
   - File picker button
   - CSV format example
   - Instructions about required columns
4. Create a test CSV file with content:
   ```csv
   name,amount,category,dueDate,recurrence
   Test Electric,100.00,Bills & Utilities,2025-03-01,monthly
   Test Internet,75.50,Bills & Utilities,2025-03-05,monthly
   Test Insurance,250.00,Insurance,2025-03-10,monthly
   ```
5. Click "Choose CSV File" and select the test file
6. Verify parsing completes successfully
7. Verify preview screen appears

**Expected Result:** ✅ File uploaded and parsed, preview shown

### Test Case 2.2: Preview Imported Bills
**Steps:**
1. After completing Test Case 2.1
2. Verify preview screen shows:
   - Correct count (3 bills to import)
   - "✓ Approve All" button
   - "✕ Skip All" button
   - Each bill with proper formatting:
     - Icon based on category
     - Bill name
     - Amount with currency format
     - Due date
     - Recurrence frequency
     - "✕ Skip" button
3. Verify no duplicate warnings (assuming no duplicates exist)

**Expected Result:** ✅ Preview displays correctly with all bill details

### Test Case 2.3: Bulk Actions in Preview
**Steps:**
1. In preview screen, click "✕ Skip All"
2. Verify all bills are marked as skipped (opacity reduced, button changes to "✓ Include")
3. Verify import button shows "Import 0 Bills" and is disabled
4. Click "✓ Approve All"
5. Verify all bills are marked as included
6. Verify import button shows "Import 3 Bills" and is enabled

**Expected Result:** ✅ Bulk actions work correctly, UI updates

### Test Case 2.4: Individual Skip/Include
**Steps:**
1. In preview screen, click "✕ Skip" on the second bill
2. Verify that bill's opacity reduces and button changes to "✓ Include"
3. Verify import button shows "Import 2 Bills"
4. Click "✓ Include" on the same bill
5. Verify bill is included again
6. Verify import button shows "Import 3 Bills"

**Expected Result:** ✅ Individual controls work, counter updates

### Test Case 2.5: Complete Import
**Steps:**
1. In preview screen, ensure all 3 bills are included
2. Click "Import 3 Bills"
3. Verify success screen appears with:
   - ✅ Green checkmark
   - "Import Complete!" message
   - Count of imported bills
   - Close button
4. Click "Close"
5. Verify modal closes
6. Verify all 3 bills appear in the bills list
7. Verify bill counter increased by 3

**Expected Result:** ✅ Bills imported successfully and visible in list

### Test Case 2.6: Duplicate Detection
**Steps:**
1. Import a CSV with a bill that already exists (same name and amount)
2. Verify preview screen shows:
   - ⚠️ Warning at top: "Some bills appear to be duplicates"
   - Orange border around duplicate bill
   - "⚠️ Possible Duplicate" label on the bill
3. Verify user can still choose to import or skip

**Expected Result:** ✅ Duplicates detected and highlighted

### Test Case 2.7: Invalid CSV Handling
**Steps:**
1. Create an invalid CSV (missing required columns)
2. Upload the file
3. Verify error section appears with clear error messages
4. Create a CSV with invalid data (e.g., negative amounts)
5. Verify errors are displayed

**Expected Result:** ✅ Errors caught and displayed clearly

### Test Case 2.8: Cancel Import
**Steps:**
1. Click "📊 Import from CSV"
2. Upload a valid CSV
3. In preview screen, click "Cancel"
4. Verify modal closes
5. Verify no bills were imported

**Expected Result:** ✅ Import cancelled, no changes made

---

## Feature 3: Recurring-Bill Relationship Management

### Test Case 3.1: Visual Badge for Auto-Generated Bills
**Steps:**
1. Manually create a bill with `recurringTemplateId` field set to any value
   (This simulates an auto-generated bill)
2. Navigate to Bills page
3. Locate the bill
4. Verify purple badge appears next to bill name with text "🔄 Auto"
5. Hover over the badge
6. Verify tooltip appears: "Generated from recurring template"

**Expected Result:** ✅ Badge visible and tooltip works

### Test Case 3.2: Delete Recurring with Generated Bills Option
**Steps:**
1. Navigate to Recurring page
2. Ensure at least one recurring item exists
3. Click the 🗑️ delete button on any recurring item
4. Verify enhanced confirmation modal appears with:
   - Item name in title
   - Confirmation message
   - Checkbox: "Also delete bills generated from this template"
   - Description explaining what the checkbox does
   - Cancel and Delete buttons
5. Check the checkbox
6. Verify checkbox is checked
7. Click "Cancel"
8. Verify modal closes and no action taken

**Expected Result:** ✅ Modal displays correctly with checkbox option

### Test Case 3.3: Delete Recurring Without Generated Bills
**Steps:**
1. Click delete on a recurring item
2. In the modal, ensure checkbox is unchecked
3. Click "Delete"
4. Verify recurring item is deleted
5. Verify success notification shows item count
6. Navigate to Bills page
7. Verify any bills with matching `recurringTemplateId` still exist

**Expected Result:** ✅ Only recurring item deleted, bills preserved

### Test Case 3.4: Delete Recurring With Generated Bills
**Steps:**
1. Create a recurring item with a unique ID
2. Create 2-3 bills with `recurringTemplateId` matching the recurring item ID
3. Navigate to Recurring page
4. Click delete on the recurring item
5. Check the "Also delete bills generated from this template" checkbox
6. Click "Delete"
7. Verify success notification shows count of both recurring item and bills deleted
8. Navigate to Bills page
9. Verify the linked bills are also deleted

**Expected Result:** ✅ Both recurring item and generated bills deleted

### Test Case 3.5: Cleanup Menu - Open/Close
**Steps:**
1. Navigate to Recurring page
2. Ensure at least one recurring item exists
3. Locate the "🔧 Cleanup" button (gray button)
4. Click the button
5. Verify dropdown menu appears below the button with:
   - "Delete All Generated Bills" option
   - Description text
6. Click outside the dropdown
7. Verify dropdown closes
8. Click "Cleanup" again
9. Verify dropdown opens
10. Press Escape key
11. Verify dropdown closes

**Expected Result:** ✅ Dropdown opens/closes correctly

### Test Case 3.6: Delete All Generated Bills
**Steps:**
1. Create several recurring items with unique IDs
2. Create bills with `recurringTemplateId` matching those IDs
3. Create some bills without `recurringTemplateId` (manual bills)
4. Navigate to Recurring page
5. Click "🔧 Cleanup"
6. Click "Delete All Generated Bills"
7. Verify browser confirmation dialog appears
8. Click "Cancel" first to test
9. Verify no action taken
10. Click "Cleanup" and "Delete All Generated Bills" again
11. Click "OK" in confirmation
12. Verify success notification shows count of deleted bills
13. Navigate to Bills page
14. Verify only bills WITH `recurringTemplateId` are deleted
15. Verify manual bills (without `recurringTemplateId`) remain

**Expected Result:** ✅ Only auto-generated bills deleted, manual bills preserved

---

## Edge Cases and Error Handling

### Edge Case 1: Bulk Delete with No Bills
**Steps:**
1. Delete all bills (or start with empty bills list)
2. Verify "Delete All Bills" button does not appear

**Expected Result:** ✅ Button hidden when no bills exist

### Edge Case 2: Import Empty CSV
**Steps:**
1. Create CSV with only headers, no data rows
2. Upload the file
3. Verify error message: "No valid bills found in CSV"

**Expected Result:** ✅ Error displayed, no crash

### Edge Case 3: Import CSV with Only Invalid Rows
**Steps:**
1. Create CSV with rows that all fail validation (e.g., missing name or amount)
2. Upload the file
3. Verify error messages list all invalid rows
4. Verify no preview is shown

**Expected Result:** ✅ Errors listed, graceful handling

### Edge Case 4: Undo After Page Refresh
**Steps:**
1. Bulk delete bills
2. Verify "Undo Delete" button appears
3. Refresh the page (F5)
4. Verify "Undo Delete" button no longer appears
5. Verify bills remain deleted

**Expected Result:** ✅ Undo state not persisted across page refresh (by design)

### Edge Case 5: Multiple Imports in Succession
**Steps:**
1. Import 3 bills from CSV
2. Close the import modal
3. Immediately click "Import from CSV" again
4. Import 3 more bills
5. Verify all 6 bills exist in the list
6. Verify no duplicates (assuming different data)

**Expected Result:** ✅ Multiple imports work correctly

---

## Performance Tests

### Performance Test 1: Large CSV Import
**Steps:**
1. Create CSV with 50-100 bills
2. Upload the file
3. Verify parsing completes in reasonable time (<3 seconds)
4. Verify preview renders smoothly
5. Verify scrolling in preview is smooth
6. Complete the import
7. Verify all bills are imported correctly

**Expected Result:** ✅ Handles large files efficiently

### Performance Test 2: Bulk Delete with Many Bills
**Steps:**
1. Ensure 50+ bills in the system
2. Click "Delete All Bills"
3. Confirm deletion
4. Verify operation completes quickly (<2 seconds)
5. Verify UI remains responsive

**Expected Result:** ✅ Bulk operations are performant

---

## Browser Compatibility

Test all features in:
- ✅ Chrome/Edge (Chromium-based)
- ✅ Firefox
- ✅ Safari (if available)
- ✅ Mobile browsers (responsive design)

---

## Accessibility Tests

### Test 1: Keyboard Navigation
1. Navigate to Bills page using only keyboard
2. Tab through all buttons and controls
3. Verify all interactive elements are reachable
4. Verify focus indicators are visible
5. Use Enter/Space to activate buttons
6. Use Escape to close modals

**Expected Result:** ✅ Full keyboard accessibility

### Test 2: Screen Reader (if available)
1. Use screen reader software
2. Navigate through the Bills page
3. Verify all buttons have descriptive labels
4. Verify badges and tooltips are announced
5. Verify modal content is read correctly

**Expected Result:** ✅ Screen reader compatible

---

## Final Verification

- ✅ All features work as documented
- ✅ No console errors in browser DevTools
- ✅ No breaking changes to existing functionality
- ✅ Build completes without errors: `npm run build`
- ✅ Lint check passes: `npm run lint` (only pre-existing warnings/errors)
- ✅ All confirmation dialogs require explicit user action
- ✅ All destructive actions have undo or clear warnings
- ✅ UI is responsive on different screen sizes
- ✅ Documentation is complete and accurate

---

## Test Results Summary

After completing all tests, use this checklist:

### Critical Features:
- [ ] Bulk Delete Bills - All tests passed
- [ ] Undo Bulk Delete - All tests passed
- [ ] CSV Import Upload - All tests passed
- [ ] CSV Import Preview - All tests passed
- [ ] CSV Import Complete - All tests passed
- [ ] Duplicate Detection - All tests passed
- [ ] Auto-Generated Badge - All tests passed
- [ ] Delete with Generated Bills Option - All tests passed
- [ ] Cleanup Menu - All tests passed

### Edge Cases:
- [ ] Empty states handled correctly
- [ ] Invalid data handled gracefully
- [ ] Multiple operations work correctly
- [ ] Large datasets perform well

### Cross-Cutting Concerns:
- [ ] No regressions in existing features
- [ ] UI is responsive
- [ ] Keyboard accessible
- [ ] No console errors
- [ ] Build successful

---

## Sign-Off

**Tester Name:** _____________________  
**Date:** _____________________  
**Overall Status:** [ ] PASS  [ ] FAIL  
**Notes:**

_________________________________________________________________

_________________________________________________________________

_________________________________________________________________

---

## Quick Test Commands

```bash
# Install dependencies (if not already done)
cd frontend
npm install

# Run linter
npm run lint

# Build project
npm run build

# Start development server
npm run dev
```

---

**End of Testing Checklist**
