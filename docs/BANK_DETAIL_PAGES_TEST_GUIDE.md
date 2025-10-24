# Bank Detail Pages - Testing Guide

## Quick Test Checklist

### 1. Account Tiles on Accounts Page ✓
- [ ] Navigate to `/accounts`
- [ ] Verify all bank account tiles are displayed
- [ ] Hover over a bank tile - should see lift effect and glow
- [ ] Cursor should change to pointer on hover
- [ ] Click on a bank tile - should navigate to bank detail page
- [ ] Try clicking delete button - should NOT navigate (delete modal should open)

### 2. Bank Detail Page Navigation ✓
- [ ] After clicking tile, URL should be `/bank/{account_id}`
- [ ] Page should load without errors
- [ ] Back button should be visible at top
- [ ] Click back button - should return to `/accounts`

### 3. Bank Header Display ✓
- [ ] Account icon should match account type (🦁 for checking, 💰 for savings, etc.)
- [ ] Account name should display correctly (official name or formatted name)
- [ ] Account type and mask should show (e.g., "checking ••4589")
- [ ] Current balance should display in green with $ format

### 4. Monthly Statistics ✓
- [ ] Three stat cards should be visible: Income, Expenses, Net
- [ ] Income card has green border with 💰 icon
- [ ] Expenses card has red border with 💸 icon
- [ ] Net card has orange border with 📊 icon
- [ ] Stats should show correct calculated values for current month
- [ ] Net should be green if positive, red if negative

### 5. Transaction Filtering ✓
- [ ] Only transactions from selected bank account should display
- [ ] Transaction count should match (e.g., "Showing 47 of 47 transactions")
- [ ] Maximum of 500 transactions should be displayed
- [ ] Transactions should be ordered by date (most recent first)

### 6. Search Functionality ✓
- [ ] Type in search box
- [ ] Transactions should filter in real-time
- [ ] Search should match: merchant name, transaction name, or category
- [ ] Transaction count should update (e.g., "Showing 5 of 47 transactions")
- [ ] Clear search - all transactions should reappear

### 7. Type Filter ✓
- [ ] Select "Income" from dropdown - only income transactions should show
- [ ] Select "Expense" from dropdown - only expense transactions should show
- [ ] Select "All Types" - all transactions should show

### 8. Date Range Filter ✓
- [ ] Select "From Date" - transactions before this date should be hidden
- [ ] Select "To Date" - transactions after this date should be hidden
- [ ] Use both - only transactions in range should show
- [ ] Transaction count should update accordingly

### 9. Clear Filters Button ✓
- [ ] Apply search, type filter, and date filters
- [ ] Click "Clear Filters" button
- [ ] All filters should reset
- [ ] All transactions should be visible again

### 10. Transaction Display ✓
- [ ] Each transaction should show:
  - [ ] Icon (💰 for income, 💸 for expense)
  - [ ] Merchant/transaction name
  - [ ] Category (smaller text below name)
  - [ ] Amount (green for income, red for expense, with +/- sign)
  - [ ] Date (formatted as "Mon DD, YYYY")
- [ ] Pending transactions should show "Pending" badge
- [ ] Hover over transaction - should highlight with green border and slide right

### 11. Real-time Updates ✓
- [ ] Keep page open
- [ ] In another tab, add a transaction for this account (if testing with backend)
- [ ] Return to bank detail page
- [ ] New transaction should appear automatically (no refresh needed)
- [ ] Monthly stats should update automatically

### 12. Responsive Design ✓
- [ ] **Desktop (> 768px):**
  - [ ] Stats cards in 3-column grid
  - [ ] Filters in one row
  - [ ] Full transaction details visible
- [ ] **Mobile (≤ 768px):**
  - [ ] Stats cards stacked vertically
  - [ ] Filters stacked vertically
  - [ ] Transaction cards compact but readable
  - [ ] All buttons touch-friendly
  - [ ] Back button easy to tap

### 13. Error Handling ✓
- [ ] Navigate to `/bank/invalid-account-id`
- [ ] Should show "Account Not Found" message
- [ ] Back button should still work

### 14. Loading States ✓
- [ ] On first load, should show "Loading..." briefly
- [ ] Page should transition smoothly to content
- [ ] No flash of incorrect content

## Test Scenarios

### Scenario 1: User with Multiple Banks
1. User has 4 bank accounts
2. Clicks on "USAA CLASSIC CHECKING"
3. Sees only USAA transactions
4. Clicks back, then clicks on "Bank of America"
5. Sees only Bank of America transactions
6. Can easily compare each bank's transactions with their bank app

### Scenario 2: User Needs to Reconcile
1. User opens bank app on phone showing 47 transactions
2. Opens smart money tracker on computer
3. Clicks on corresponding bank account
4. Sees 47 transactions in app
5. Can compare line-by-line with bank app
6. Finds any discrepancies easily

### Scenario 3: User Tracking Monthly Spending
1. User clicks on checking account
2. Views monthly stats card showing expenses: $1,856.23
3. Uses search to find "Amazon" transactions
4. Sees all Amazon purchases for current month
5. Realizes they're spending too much on Amazon
6. Makes budgeting decisions

### Scenario 4: User Looking for Specific Transaction
1. User clicks on credit card account
2. Remembers purchase at Starbucks around Dec 10
3. Types "Starbucks" in search
4. Immediately sees all Starbucks transactions
5. Finds the one from Dec 10
6. Confirms amount matches credit card statement

## Expected Console Output

### On Page Load:
```
🔍 [BankDetail] Loading account details for: xyz123abc456
✅ [BankDetail] Account found: {account_id, name, balance, ...}
📡 [BankDetail] Setting up real-time listener for account: xyz123abc456
✅ [BankDetail] Loaded 47 transactions for account
```

### On Unmount:
```
🔌 [BankDetail] Cleaning up listener
```

### On Account Not Found:
```
⚠️ [BankDetail] Account not found
```

### On Error:
```
❌ [BankDetail] Error loading account: {error message}
❌ [BankDetail] Listener error: {error message}
```

## Performance Checks

- [ ] Page loads in < 2 seconds
- [ ] Search filters in real-time with no lag
- [ ] Scrolling through 500 transactions is smooth
- [ ] Hover effects are smooth (60fps)
- [ ] No memory leaks (listener cleanup works)
- [ ] Build size is reasonable (check dist/ folder)

## Browser Compatibility

Test in:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Mobile Chrome (Android)

## Accessibility

- [ ] All interactive elements are keyboard accessible
- [ ] Focus states are visible
- [ ] Color contrast is sufficient
- [ ] Screen reader friendly (semantic HTML)

## Edge Cases

- [ ] Account with 0 transactions - shows "No transactions found"
- [ ] Account with 1 transaction - displays correctly
- [ ] Account with exactly 500 transactions - shows all 500
- [ ] Account with > 500 transactions - limits to 500, shows correct count
- [ ] Search with no results - shows "No transactions found"
- [ ] Filter with no results - shows "No transactions found"
- [ ] Very long merchant names - truncate gracefully
- [ ] Very large transaction amounts - format correctly

## Known Limitations

1. **Transaction Limit:** Maximum 500 transactions per account
   - This is by design for performance
   - If user needs more, they can adjust date filters

2. **Current Month Only:** Stats only calculate for current calendar month
   - Future enhancement: Allow selecting different months

3. **No Transaction Editing:** View-only page
   - Users must go to Transactions page to edit
   - This is by design - focused on viewing per bank

## Success Criteria

✅ All 14 test checklist items pass  
✅ All 4 test scenarios work correctly  
✅ Console output matches expected patterns  
✅ Performance checks all pass  
✅ Works in all target browsers  
✅ Responsive design works on mobile  
✅ No errors in browser console  
✅ No memory leaks detected  

## Approval Checklist

Before marking complete:
- [ ] Manual testing completed
- [ ] Screenshots taken of key pages
- [ ] Mobile testing completed
- [ ] No console errors
- [ ] User feedback collected
- [ ] Any issues documented
- [ ] Ready for production deployment

---

**Status:** Ready for Manual Testing

