# Testing Checklist for Bill Management Fixes

Use this checklist to manually verify all fixes are working correctly.

## Prerequisites
- [ ] Access to the Bills page
- [ ] Firebase database access (for Issue 1 testing)
- [ ] Ability to connect/disconnect Plaid (for Issue 2 testing)
- [ ] Some existing bills in the system

---

## Issue 1: Unmark Paid Functionality

### Test 1.1: Successful Unmark
- [ ] Navigate to Bills page
- [ ] Create or find a bill that is currently marked as paid
- [ ] Verify bill shows "Already Paid" status
- [ ] Click "Unmark Paid" button
- [ ] Verify loading notification appears: "Unmarking [Bill Name] as paid..."
- [ ] Wait for operation to complete
- [ ] Verify success notification: "[Bill Name] unmarked as paid"
- [ ] Verify bill status changes to "Pending" or similar unpaid status
- [ ] Verify "Mark Paid" button is now available
- [ ] Try marking the bill as paid again to verify it works

**Expected Result:** ✅ Bill is successfully unmarked with clear feedback

### Test 1.2: Error Handling
- [ ] Clear browser console
- [ ] Click "Unmark Paid" on a bill
- [ ] If error occurs, verify:
  - [ ] Loading notification is closed
  - [ ] Error notification appears with specific message
  - [ ] Button returns to clickable state
  - [ ] No JavaScript errors in console

**Expected Result:** ✅ Errors are handled gracefully with clear messages

---

## Issue 2: Plaid Connection Handling

### Test 2.1: No Plaid Connection
- [ ] Open browser DevTools → Application → Local Storage
- [ ] Delete `plaid_access_token` key if it exists
- [ ] Reload Bills page
- [ ] Verify "Match Transactions" button shows: "🔒 Connect Plaid"
- [ ] Verify button appears grayed out/disabled
- [ ] Hover over button and verify tooltip: "Please connect Plaid from Settings to use this feature"
- [ ] Try clicking button
- [ ] Verify warning notification appears: "Plaid not connected" with message about connecting from Settings
- [ ] Verify button does NOT trigger loading state

**Expected Result:** ✅ Clear indication Plaid is not connected, helpful guidance provided

### Test 2.2: With Plaid Connection
- [ ] Connect Plaid account from Settings (or add `plaid_access_token` to localStorage)
- [ ] Reload Bills page
- [ ] Verify button shows: "🔄 Match Transactions"
- [ ] Verify button is enabled and blue colored
- [ ] Hover over button and verify tooltip: "Match bills with recent Plaid transactions"
- [ ] Click button
- [ ] Verify button changes to: "🔄 Matching..."
- [ ] Verify button becomes disabled during operation
- [ ] Wait for operation to complete
- [ ] Verify button returns to normal state

**Expected Result:** ✅ Button works correctly when Plaid is connected

### Test 2.3: Connection State Changes
- [ ] Start with Plaid not connected (button disabled)
- [ ] Open Settings page in another tab
- [ ] Connect Plaid
- [ ] Return to Bills page
- [ ] Reload page
- [ ] Verify button is now enabled

**Expected Result:** ✅ Button state reflects current Plaid connection

---

## Issue 3: Fuzzy Matching Enhancement

### Test 3.1: Exact Match Still Works
- [ ] Create bill: "Netflix" - $15.99
- [ ] Run Match Transactions
- [ ] If Plaid has transaction "Netflix" - $15.99 (within 5 days)
- [ ] Verify bill is auto-matched

**Expected Result:** ✅ Exact matches still work

### Test 3.2: Partial Name Matching (Primary Test Case)
- [ ] Create bill: "Geico" - $125.00, due date within next 5 days
- [ ] Ensure Plaid has transaction: "Geico Insurance" or "GEICO" - $125.00 (recent)
- [ ] Run Match Transactions
- [ ] Verify bill is auto-matched
- [ ] Verify bill shows as paid with transaction details

**Expected Result:** ✅ "Geico" matches "Geico Insurance" or "GEICO"

### Test 3.3: Abbreviated Name Matching
- [ ] Create bill: "AT&T" - $80.00
- [ ] Ensure Plaid has transaction: "ATT Wireless" - $80.00 (recent)
- [ ] Run Match Transactions
- [ ] Verify bill is auto-matched

**Expected Result:** ✅ "AT&T" matches "ATT Wireless"

### Test 3.4: Common Word Matching
- [ ] Create bill: "Electric Bill" - $150.00
- [ ] Ensure Plaid has transaction: "PG&E Electric" - $150.00 (recent)
- [ ] Run Match Transactions
- [ ] Verify bill is auto-matched (due to common word "Electric")

**Expected Result:** ✅ Bills with common significant words match

### Test 3.5: No False Positives
- [ ] Create bill: "Verizon" - $100.00
- [ ] Ensure Plaid has transaction: "T-Mobile" - $100.00 (recent)
- [ ] Run Match Transactions
- [ ] Verify bill is NOT auto-matched (different companies)

**Expected Result:** ✅ Different companies do not incorrectly match

### Test 3.6: Case Insensitive
- [ ] Create bill: "geico sxs" - $125.00 (lowercase)
- [ ] Ensure Plaid has transaction: "GEICO" - $125.00 (uppercase, recent)
- [ ] Run Match Transactions
- [ ] Verify bill is auto-matched

**Expected Result:** ✅ Case differences do not prevent matching

### Test 3.7: Multiple Similar Bills
- [ ] Create two bills:
  - "Geico Auto" - $100.00
  - "Geico Rental" - $125.00
- [ ] Ensure Plaid has transaction: "Geico Insurance" - $125.00
- [ ] Run Match Transactions
- [ ] Verify only the $125.00 bill is matched (amount + name match)

**Expected Result:** ✅ Correct bill matched based on amount + name

---

## Integration Tests

### Test INT.1: Full Workflow
- [ ] Start fresh with unpaid bills
- [ ] Some bills should match transaction names partially
- [ ] Connect Plaid (if not connected)
- [ ] Click Match Transactions
- [ ] Verify appropriate bills are auto-matched
- [ ] Verify success notification with count
- [ ] Manually mark one remaining bill as paid
- [ ] Unmark that bill
- [ ] Verify it returns to unpaid state

**Expected Result:** ✅ Complete workflow functions smoothly

### Test INT.2: Error Recovery
- [ ] Disconnect internet
- [ ] Try to match transactions
- [ ] Verify graceful error handling
- [ ] Reconnect internet
- [ ] Retry operation
- [ ] Verify it now works

**Expected Result:** ✅ System recovers from errors gracefully

---

## Browser Compatibility

Test in multiple browsers:
- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari (if available)

Verify all features work in each browser.

---

## Performance Tests

### Test PERF.1: Many Bills
- [ ] Create 50+ bills
- [ ] Run Match Transactions
- [ ] Verify operation completes within reasonable time (< 10 seconds)
- [ ] Verify UI remains responsive

**Expected Result:** ✅ Performance is acceptable with many bills

---

## Regression Tests

Ensure existing functionality still works:
- [ ] Create new bill - works as before
- [ ] Edit existing bill - works as before
- [ ] Delete bill - works as before
- [ ] Filter bills by category - works as before
- [ ] Search bills - works as before
- [ ] Mark bill as paid manually - works as before
- [ ] Bill status badges display correctly
- [ ] Bill animations work (if applicable)

**Expected Result:** ✅ No regressions introduced

---

## Automated Test Results

Reference the automated test results:
- ✅ Fuzzy Matching Tests: 10/10 passed (100%)
- ✅ Syntax Validation: Passed
- ✅ No compilation errors

---

## Sign Off

After completing all tests:

**Tester Name:** _______________  
**Date:** _______________  
**Environment:** Production / Staging / Development (circle one)

**Overall Result:** Pass / Fail / Conditional Pass (circle one)

**Notes:**
```
[Add any issues found or additional notes here]
```

---

## Quick Test (5 Minutes)

If time is limited, run these critical tests:

1. **Plaid Button State:**
   - [ ] Remove Plaid token → button disabled
   - [ ] Add Plaid token → button enabled

2. **Fuzzy Matching:**
   - [ ] Create "Geico SXS" bill
   - [ ] Match with "Geico" transaction
   - [ ] Verify auto-match works

3. **Unmark Paid:**
   - [ ] Mark a bill as paid
   - [ ] Unmark it
   - [ ] Verify it returns to unpaid

If all three pass, core functionality is working. ✅

---

**Last Updated:** [Current Date]  
**Version:** 1.0
