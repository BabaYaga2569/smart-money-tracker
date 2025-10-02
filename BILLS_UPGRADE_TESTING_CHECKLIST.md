# Bills Management Comprehensive Upgrade - Testing Checklist

## 🎯 Testing Overview

This checklist covers all features implemented in the Bills Management comprehensive upgrade. Use this to verify functionality before and after deployment.

---

## 🏗️ Pre-Testing Setup

### Environment Preparation

- [ ] Clone repository
- [ ] Install dependencies: `npm install`
- [ ] Build project: `npm run build`
- [ ] Start dev server: `npm run dev`
- [ ] Open browser to localhost
- [ ] Open browser DevTools (check for console errors)

### Test Data Preparation

- [ ] Prepare sample CSV file with bills
- [ ] Prepare CSV with custom column names
- [ ] Prepare CSV with duplicates
- [ ] Prepare CSV with invalid data
- [ ] Prepare CSV with 50+ bills (stress test)

---

## 📊 Feature 1: CSV Template Download

### Test Case 1.1: Download Template

**Steps:**
1. Navigate to Bills page
2. Click "📊 Import from CSV"
3. In upload screen, click "📥 Download Template"
4. Verify file downloads
5. Open downloaded file in spreadsheet software
6. Verify structure matches documentation

**Expected Results:**
- ✅ File downloads as `bills_template.csv`
- ✅ Contains header row: name,amount,category,dueDate,recurrence
- ✅ Contains 3 example bill rows
- ✅ Opens correctly in Excel/Google Sheets
- ✅ Data format is correct

**Pass/Fail:** [ ]

---

## 🗂️ Feature 2: Advanced Column Mapping

### Test Case 2.1: Auto-Detection Success

**Steps:**
1. Create CSV with standard column names (name, amount, etc.)
2. Upload CSV via import modal
3. Verify auto-detection succeeds
4. Verify mapping step is skipped
5. Verify preview screen shows immediately

**Expected Results:**
- ✅ Columns detected automatically
- ✅ Mapping step skipped
- ✅ Preview shows correct data
- ✅ No errors displayed

**Pass/Fail:** [ ]

### Test Case 2.2: Manual Mapping Required

**Steps:**
1. Create CSV with custom column names (e.g., "bill_name", "cost", "type")
2. Upload CSV via import modal
3. Verify mapping screen appears
4. Select correct column for each field from dropdowns
5. Verify "Continue to Preview" button is disabled until name and amount mapped
6. Map required fields (name and amount)
7. Click "Continue to Preview"
8. Verify preview shows correct data

**Expected Results:**
- ✅ Mapping screen appears
- ✅ Dropdowns show all CSV columns
- ✅ Required fields marked with *
- ✅ Button disabled until requirements met
- ✅ Mapping saved correctly
- ✅ Data parsed using manual mapping
- ✅ Preview shows correct values

**Pass/Fail:** [ ]

### Test Case 2.3: Back Button from Mapping

**Steps:**
1. Upload CSV that requires mapping
2. On mapping screen, click "← Back"
3. Verify returns to upload screen
4. Upload same file again
5. Verify mapping screen appears again

**Expected Results:**
- ✅ Back button returns to upload
- ✅ No data loss
- ✅ Can re-upload file

**Pass/Fail:** [ ]

---

## 🏷️ Feature 3: Auto-Tagging

### Test Case 3.1: Utility Bills

**Steps:**
1. Create CSV with bills named:
   - "Electric Bill"
   - "Power Company"
   - "Internet Service"
   - "Phone Bill"
2. Upload CSV
3. Check preview
4. Verify all assigned to "Bills & Utilities"

**Expected Results:**
- ✅ All utility bills auto-tagged correctly
- ✅ Category shown in preview

**Pass/Fail:** [ ]

### Test Case 3.2: Other Categories

**Steps:**
1. Create CSV with bills named:
   - "Rent Payment" (should be Housing)
   - "Car Insurance" (should be Insurance)
   - "Gym Membership" (should be Health & Fitness)
   - "Netflix Subscription" (should be Entertainment)
2. Upload CSV
3. Verify categories in preview

**Expected Results:**
- ✅ Rent → Housing
- ✅ Insurance → Insurance
- ✅ Gym → Health & Fitness
- ✅ Netflix → Entertainment

**Pass/Fail:** [ ]

### Test Case 3.3: Unknown Bill Name

**Steps:**
1. Create CSV with bill named "Mystery Payment"
2. Upload CSV
3. Verify default category assigned

**Expected Results:**
- ✅ Bill assigned to "Bills & Utilities" (default)

**Pass/Fail:** [ ]

---

## 📦 Feature 4: Bulk Category Assignment

### Test Case 4.1: Assign Category to All

**Steps:**
1. Upload CSV with 5+ bills
2. In preview, find "🏷️ Bulk Assign Category" dropdown
3. Select "Housing" from dropdown
4. Verify all non-skipped bills updated to Housing
5. Skip one bill
6. Select "Insurance" from dropdown
7. Verify skipped bill unchanged

**Expected Results:**
- ✅ Dropdown shows all categories
- ✅ Selection updates all non-skipped bills
- ✅ Skipped bills remain unchanged
- ✅ Dropdown resets after selection

**Pass/Fail:** [ ]

---

## ✏️ Feature 5: Individual Category Editing

### Test Case 5.1: Edit Individual Bill

**Steps:**
1. Upload CSV with bills
2. In preview, find category dropdown for first bill
3. Change category to different value
4. Verify only that bill's category changed
5. Skip the bill
6. Verify dropdown disabled
7. Include the bill again
8. Verify dropdown enabled

**Expected Results:**
- ✅ Dropdown shows all categories
- ✅ Selection updates only that bill
- ✅ Other bills unchanged
- ✅ Dropdown disabled when skipped
- ✅ Dropdown enabled when included

**Pass/Fail:** [ ]

---

## 📜 Feature 6: Import History

### Test Case 6.1: First Import

**Steps:**
1. Clear all bills if any exist
2. Import CSV with 3 bills
3. Verify "📜 Import History" button appears
4. Verify button shows "(1)"
5. Verify "↩️ Undo Last Import" button appears

**Expected Results:**
- ✅ History button appears after first import
- ✅ Count is correct (1)
- ✅ Undo button appears
- ✅ Undo button has pulsing animation

**Pass/Fail:** [ ]

### Test Case 6.2: View History

**Steps:**
1. Click "📜 Import History" button
2. Verify modal opens
3. Check displayed information:
   - Timestamp
   - Bill count
   - Bill names
   - Most recent highlighted
4. Click "Close"
5. Verify modal closes

**Expected Results:**
- ✅ Modal displays correctly
- ✅ Timestamp formatted properly
- ✅ Bill count matches import
- ✅ Bill names listed
- ✅ Most recent has "(Most Recent)" label
- ✅ Modal closes correctly

**Pass/Fail:** [ ]

### Test Case 6.3: Multiple Imports

**Steps:**
1. Import CSV 1 (3 bills)
2. Import CSV 2 (5 bills)
3. Import CSV 3 (2 bills)
4. Open Import History
5. Verify 3 entries shown
6. Verify most recent is CSV 3
7. Verify counts: 2, 5, 3 (reverse order)

**Expected Results:**
- ✅ All 3 imports tracked
- ✅ Correct chronological order (newest first)
- ✅ Correct bill counts
- ✅ All timestamps unique

**Pass/Fail:** [ ]

### Test Case 6.4: History Limit

**Steps:**
1. Import CSV 12 times
2. Open Import History
3. Count entries
4. Verify only 10 shown
5. Verify oldest 2 not shown

**Expected Results:**
- ✅ Exactly 10 entries displayed
- ✅ Newest 10 imports kept
- ✅ Oldest imports discarded

**Pass/Fail:** [ ]

---

## ↩️ Feature 7: Undo Last Import

### Test Case 7.1: Undo Import

**Steps:**
1. Note current bill count (e.g., 10 bills)
2. Import CSV with 5 bills
3. Verify bill count is 15
4. Click "↩️ Undo Last Import"
5. Verify bill count returns to 10
6. Verify imported bills removed
7. Verify other bills intact
8. Verify Undo button disappears (or shows count - 1)

**Expected Results:**
- ✅ Bills from last import removed
- ✅ Other bills unchanged
- ✅ Count accurate
- ✅ Notification shown
- ✅ Button state updates

**Pass/Fail:** [ ]

### Test Case 7.2: Undo from History Modal

**Steps:**
1. Import CSV
2. Open Import History
3. Click "↩️ Undo Last Import" in modal
4. Verify modal closes
5. Verify bills removed
6. Verify history updated

**Expected Results:**
- ✅ Undo works from modal
- ✅ Modal closes
- ✅ Bills removed correctly
- ✅ History entry removed

**Pass/Fail:** [ ]

### Test Case 7.3: Undo Updates History

**Steps:**
1. Import CSV 1
2. Import CSV 2
3. Verify history shows 2 entries
4. Undo last import
5. Open history
6. Verify only 1 entry shown
7. Verify it's CSV 1

**Expected Results:**
- ✅ History updated after undo
- ✅ Correct entry removed
- ✅ Other entries intact

**Pass/Fail:** [ ]

---

## ❓ Feature 8: Help Modal

### Test Case 8.1: Open Help

**Steps:**
1. Navigate to Bills page
2. Click "❓ Help" button in header
3. Verify modal opens
4. Check all sections present:
   - CSV Import
   - Import History
   - Transaction Matching
   - Recurring Bills
   - Bulk Operations
   - Tips & Best Practices
5. Scroll through content
6. Click "Got it!"
7. Verify modal closes

**Expected Results:**
- ✅ Help button visible
- ✅ Modal opens
- ✅ All sections present
- ✅ Content readable and formatted
- ✅ Modal scrollable
- ✅ Close button works

**Pass/Fail:** [ ]

### Test Case 8.2: Help Content Accuracy

**Steps:**
1. Open help modal
2. Read each section
3. Verify accuracy against actual features
4. Check for typos or errors
5. Verify instructions are clear

**Expected Results:**
- ✅ All content accurate
- ✅ No typos
- ✅ Instructions match UI
- ✅ Clear and helpful

**Pass/Fail:** [ ]

---

## 💬 Feature 9: Tooltips

### Test Case 9.1: Button Tooltips

**Steps:**
1. Navigate to Bills page
2. Hover over each button:
   - Import from CSV
   - Import History
   - Undo Last Import
   - Help
   - Delete All Bills
   - Undo Delete
   - Match Transactions
3. Verify tooltip appears for each
4. Verify tooltip text is helpful

**Expected Results:**
- ✅ All buttons have tooltips
- ✅ Tooltips appear on hover
- ✅ Text is clear and helpful
- ✅ No broken tooltips

**Pass/Fail:** [ ]

### Test Case 9.2: CSV Import Tooltips

**Steps:**
1. Open CSV import modal
2. Hover over:
   - Download Template button
   - Choose CSV File button
   - Approve All button
   - Skip All button
   - Bulk Assign Category dropdown
   - Individual Skip/Include buttons
   - Category dropdowns
3. Verify tooltips present

**Expected Results:**
- ✅ All elements have tooltips
- ✅ Tooltips accurate
- ✅ Helpful guidance provided

**Pass/Fail:** [ ]

---

## 🔄 Feature 10: Transaction Matching Clarity

### Test Case 10.1: Not Connected State

**Steps:**
1. Ensure Plaid not connected
2. Navigate to Bills page
3. Locate "Match Transactions" button
4. Verify button is grey/disabled
5. Hover over button
6. Read tooltip
7. Verify tooltip explains connection needed

**Expected Results:**
- ✅ Button disabled when not connected
- ✅ Visual state indicates disabled
- ✅ Tooltip explains why disabled
- ✅ Tooltip guides to Accounts page

**Pass/Fail:** [ ]

### Test Case 10.2: Connected State

**Steps:**
1. Connect Plaid (if available)
2. Navigate to Bills page
3. Verify button is enabled (blue/green)
4. Hover over button
5. Read tooltip
6. Verify tooltip explains process

**Expected Results:**
- ✅ Button enabled when connected
- ✅ Visual state indicates active
- ✅ Tooltip explains matching process
- ✅ Clear what will happen

**Pass/Fail:** [ ]

### Test Case 10.3: Help Modal Content

**Steps:**
1. Open help modal
2. Find Transaction Matching section
3. Read workflow explanation
4. Verify step-by-step process clear

**Expected Results:**
- ✅ Section explains full workflow
- ✅ Steps are numbered
- ✅ Process is clear
- ✅ Helpful for new users

**Pass/Fail:** [ ]

---

## 🎨 Feature 11: UI/UX Polish

### Test Case 11.1: Responsive Design

**Steps:**
1. Open Bills page on desktop
2. Resize browser to tablet width
3. Verify layout adapts
4. Resize to mobile width
5. Verify layout adapts
6. Test all buttons clickable
7. Test modals display correctly

**Expected Results:**
- ✅ Layout responsive at all sizes
- ✅ Buttons accessible
- ✅ Text readable
- ✅ Modals fit screen
- ✅ No horizontal scroll

**Pass/Fail:** [ ]

### Test Case 11.2: Loading States

**Steps:**
1. Import large CSV (50+ bills)
2. Verify loading indicator shown
3. Verify buttons disabled during load
4. Wait for completion
5. Verify UI enables after load

**Expected Results:**
- ✅ Loading states visible
- ✅ Buttons disabled during operations
- ✅ User cannot double-click
- ✅ Smooth transitions

**Pass/Fail:** [ ]

### Test Case 11.3: Error States

**Steps:**
1. Upload invalid CSV (no data)
2. Verify error message shown
3. Verify error is helpful
4. Upload CSV with errors in rows
5. Verify errors listed clearly

**Expected Results:**
- ✅ Errors displayed prominently
- ✅ Error messages helpful
- ✅ Recovery path clear
- ✅ UI not broken by errors

**Pass/Fail:** [ ]

---

## 🔒 Feature 12: Data Safety

### Test Case 12.1: Confirmation Dialogs

**Steps:**
1. Click "Delete All Bills"
2. Verify confirmation modal appears
3. Check modal content:
   - Warning icon
   - Bill count
   - Warning message
   - Undo information
4. Click "Cancel"
5. Verify no bills deleted

**Expected Results:**
- ✅ Confirmation required
- ✅ Clear warning shown
- ✅ Bill count accurate
- ✅ Cancel works
- ✅ No data lost on cancel

**Pass/Fail:** [ ]

### Test Case 12.2: Duplicate Warnings

**Steps:**
1. Add bill manually: "Test Bill", $100
2. Import CSV with same bill
3. In preview, verify duplicate warning
4. Verify visual indicator (orange border)
5. Verify "⚠️ Possible Duplicate" text

**Expected Results:**
- ✅ Duplicates detected
- ✅ Visual warning shown
- ✅ Text explanation present
- ✅ User can review before import

**Pass/Fail:** [ ]

---

## 📱 Cross-Browser Testing

### Test Case 13.1: Chrome/Edge

**Browser:** Chrome or Edge (latest)

- [ ] All features work
- [ ] No console errors
- [ ] Layout correct
- [ ] Performance acceptable

### Test Case 13.2: Firefox

**Browser:** Firefox (latest)

- [ ] All features work
- [ ] No console errors
- [ ] Layout correct
- [ ] Performance acceptable

### Test Case 13.3: Safari

**Browser:** Safari (latest)

- [ ] All features work
- [ ] No console errors
- [ ] Layout correct
- [ ] Performance acceptable

---

## 🎯 Edge Cases & Stress Tests

### Test Case 14.1: Large CSV Import

**Steps:**
1. Create CSV with 100+ bills
2. Upload via import
3. Verify preview renders
4. Verify scrolling works
5. Edit categories
6. Import all bills
7. Verify all imported correctly

**Expected Results:**
- ✅ Large file handled
- ✅ Preview scrollable
- ✅ No performance issues
- ✅ All bills imported

**Pass/Fail:** [ ]

### Test Case 14.2: Special Characters

**Steps:**
1. Create CSV with bills containing:
   - Quotes in names
   - Commas in names
   - Unicode characters
   - Special symbols
2. Upload and import
3. Verify all characters preserved

**Expected Results:**
- ✅ Special chars handled
- ✅ Names display correctly
- ✅ No parsing errors

**Pass/Fail:** [ ]

### Test Case 14.3: Empty/Invalid Data

**Steps:**
1. Upload CSV with empty rows
2. Verify errors shown
3. Upload CSV with no amount
4. Verify errors shown
5. Upload CSV with negative amount
6. Verify handled appropriately

**Expected Results:**
- ✅ Validation works
- ✅ Errors clear
- ✅ No crashes
- ✅ User can fix

**Pass/Fail:** [ ]

---

## ✅ Final Verification

### Build & Deploy Checks

- [ ] `npm run build` completes successfully
- [ ] `npm run lint` shows no new errors
- [ ] Bundle size acceptable
- [ ] No console errors in production build
- [ ] All documentation updated
- [ ] README reflects new features

### Regression Testing

- [ ] Existing bill features still work
- [ ] Add bill manually still works
- [ ] Edit bill still works
- [ ] Delete bill still works
- [ ] Mark paid still works
- [ ] Filters still work
- [ ] Search still works
- [ ] Recurring bills still work

---

## 📊 Test Results Summary

**Total Test Cases:** 50+  
**Passed:** ___  
**Failed:** ___  
**Blocked:** ___  
**Not Tested:** ___  

**Overall Status:** [ ] PASS [ ] FAIL [ ] PARTIAL

**Notes:**
_Add any observations, issues, or recommendations here_

---

## 🐛 Issues Found

| Issue # | Severity | Description | Steps to Reproduce | Status |
|---------|----------|-------------|-------------------|--------|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

---

## ✅ Sign-Off

**Tester Name:** ___________________  
**Date:** ___________________  
**Signature:** ___________________  

**Approved for Production:** [ ] YES [ ] NO  
**Comments:**

---

*Testing Checklist Version 1.0*  
*Created: January 2025*
