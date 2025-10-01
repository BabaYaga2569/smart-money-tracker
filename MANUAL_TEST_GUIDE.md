# Manual Testing Guide - Plaid Banner Fix

## Overview
This guide helps verify that Plaid connection banners and buttons now correctly hide when Plaid accounts are present and syncing.

## Prerequisites
- Access to the Smart Money Tracker application
- Plaid sandbox credentials (optional, for full flow testing)
- Browser with developer tools

---

## Test Case 1: Fresh User (No Plaid Accounts)

### Setup
1. Clear browser localStorage: `localStorage.clear()`
2. Clear Firebase user data (or use test account with no Plaid accounts)
3. Refresh the application

### Expected Results

**Dashboard Page**
- [ ] Plaid indicator shows yellow ⚠️ "Not Connected"
- [ ] "Connect" button is visible next to Plaid indicator
- [ ] Clicking "Connect" navigates to Accounts page

**Bills Page**
- [ ] Purple banner "🔗 Connect Your Bank" is visible
- [ ] Banner includes "Connect Bank →" button
- [ ] "Match Transactions" button shows "🔒 Connect Plaid" (disabled, gray)

**Transactions Page**
- [ ] Orange banner "⚠️ Plaid Not Connected" is visible
- [ ] Banner includes "Connect Bank →" button
- [ ] "Sync Plaid Transactions" button shows "🔒 Sync Plaid (Not Connected)" (disabled, gray)

**Accounts Page**
- [ ] Orange banner "⚠️ No Bank Connected" is visible
- [ ] Banner includes "🔗 Connect Now" button
- [ ] "Connect Bank" button visible in header

---

## Test Case 2: User with Plaid Accounts (Simulated)

### Setup
1. Simulate Plaid accounts by adding to Firebase:
```javascript
// In browser console
const settingsRef = firebase.firestore()
  .collection('users')
  .doc('steve-colburn')
  .collection('settings')
  .doc('personal');

settingsRef.update({
  plaidAccounts: [
    {
      account_id: 'test_account_1',
      name: 'Test Checking',
      official_name: 'Test Checking Account',
      type: 'checking',
      balance: '1234.56',
      mask: '1234'
    }
  ]
});
```
2. Refresh the application

### Expected Results (IMMEDIATELY AFTER REFRESH)

**Dashboard Page**
- [ ] Plaid indicator shows green ✅ "Connected"
- [ ] NO "Connect" button visible
- [ ] Status background is green (rgba(16, 185, 129, 0.1))

**Bills Page**
- [ ] NO purple "Connect Your Bank" banner
- [ ] Green banner "✅ Plaid Connected - Automated bill matching enabled" is visible
- [ ] "Match Transactions" button shows "🔄 Match Transactions" (enabled, blue)

**Transactions Page**
- [ ] NO orange "Plaid Not Connected" banner
- [ ] Green banner "✅ Plaid Connected - Auto-sync enabled" is visible
- [ ] "Sync Plaid Transactions" button shows "🔄 Sync Plaid Transactions" (enabled, blue)

**Accounts Page**
- [ ] NO orange "No Bank Connected" banner (unless recently connected, then dismissible green banner)
- [ ] Plaid account(s) visible in account list with "🔗 Live Balance" indicator
- [ ] "Add Another Bank" button visible in header

---

## Test Case 3: API Temporarily Unavailable (Simulated)

### Setup
1. Have Plaid accounts in Firebase (from Test Case 2)
2. Block API requests in browser DevTools:
   - Open DevTools → Network tab
   - Click "Add request blocking" pattern
   - Add: `*/api/*`
3. Refresh the application

### Expected Results

**All Pages**
- [ ] Plaid accounts still visible in UI
- [ ] Green "Connected" status still showing (because `hasPlaidAccounts` is true)
- [ ] Buttons remain enabled
- [ ] If API error is detected by PlaidConnectionManager, red error banner may appear
- [ ] Even with error banner, features remain accessible if accounts exist

---

## Test Case 4: API Error State

### Setup
1. Set up PlaidConnectionManager to return error:
```javascript
// In browser console
localStorage.setItem('plaid_access_token', 'invalid_token');
```
2. Refresh the application

### Expected Results

**All Pages (if accounts exist in Firebase)**
- [ ] Red error banner "❌ Connection Error" may be visible
- [ ] BUT green "Connected" status still showing (accounts take precedence)
- [ ] Buttons remain enabled (features still accessible)
- [ ] Error banner shows specific error message with troubleshooting

**All Pages (if NO accounts in Firebase)**
- [ ] Red error banner visible
- [ ] Yellow "Not Connected" status
- [ ] Buttons disabled
- [ ] Clear guidance to fix connection

---

## Test Case 5: Manual Account Management (Regression Test)

### Setup
1. Clear all Plaid accounts from Firebase
2. Add manual accounts through UI

### Expected Results

**All Pages**
- [ ] Connection banners still show (encouraging Plaid connection)
- [ ] Manual accounts work correctly
- [ ] Can add, edit, delete manual accounts without issues
- [ ] Balance updates work for manual accounts
- [ ] No regression in any manual account functionality

---

## Test Case 6: Full Plaid Connection Flow

### Setup
1. Use Plaid sandbox credentials
2. Start from fresh state (no Plaid accounts)

### Steps
1. Navigate to Accounts page
2. Click "Connect Bank" button
3. Complete Plaid Link flow with sandbox credentials
4. Return to application

### Expected Results

**Immediately After Connection**
- [ ] Accounts page shows green "Bank Connected" banner (can be dismissed)
- [ ] Plaid accounts visible in account list
- [ ] Navigate to Dashboard → Shows green ✅ "Connected", NO Connect button
- [ ] Navigate to Bills → Shows green banner, Match button enabled
- [ ] Navigate to Transactions → Shows green banner, Sync button enabled

**Within 5-10 Seconds**
- [ ] No visual change (already showing as connected)
- [ ] Background API validation completes
- [ ] `plaidStatus.isConnected` becomes true
- [ ] Everything continues working as expected

---

## Test Case 7: Banner Visibility Timing

### Purpose
Verify banners update immediately, not after API check

### Steps
1. Clear localStorage and Firebase data
2. Open browser DevTools → Network tab → Throttle to "Slow 3G"
3. Add Plaid accounts to Firebase (simulated)
4. Refresh application

### Expected Results
- [ ] Page loads
- [ ] As soon as component mounts and Firebase data loads (~1-2 seconds):
  - [ ] Green banners appear IMMEDIATELY
  - [ ] Buttons enabled IMMEDIATELY
- [ ] API check still in progress (visible in Network tab as pending)
- [ ] After API check completes (~10-15 seconds on Slow 3G):
  - [ ] No visual change
  - [ ] Status remains the same

**Key Point**: Banners should update based on Firebase data, NOT waiting for API check

---

## Test Case 8: Cross-Page Consistency

### Steps
1. Set up user with Plaid accounts
2. Open application
3. Navigate between pages: Dashboard → Accounts → Bills → Transactions → Dashboard

### Expected Results
- [ ] ALL pages show consistent Plaid connection state
- [ ] If connected on one page, connected on all pages
- [ ] No page shows "Not Connected" while others show "Connected"
- [ ] Navigation doesn't cause state changes
- [ ] State persists across page navigation

---

## Bug Scenarios (Should NOT Happen)

### Scenario A: Contradictory State
- ❌ Accounts visible but banner says "Not Connected"
- ❌ Green status on one page, yellow on another
- ❌ Enabled button on one page, disabled on another

### Scenario B: Stuck State
- ❌ Banners never update after connecting Plaid
- ❌ Status stays yellow despite visible accounts
- ❌ Buttons remain disabled with accounts present

### Scenario C: Flickering
- ❌ Banners appear then disappear rapidly
- ❌ Status changes color multiple times on load
- ❌ Buttons enable/disable repeatedly

---

## Success Criteria

✅ **All test cases pass**  
✅ **Banners update immediately when accounts load**  
✅ **Consistent state across all pages**  
✅ **No contradictory UI states**  
✅ **Features accessible when accounts present**  
✅ **Clear error messages when problems occur**  
✅ **No regression in manual account flows**

---

## Debugging Tips

### Check State in Console
```javascript
// View PlaidConnectionManager status
PlaidConnectionManager.getStatus()

// Check if component has accounts
// On any page with hasPlaidAccounts:
// Find component in React DevTools and check state
```

### Common Issues

**Issue**: Banners still showing after adding accounts
- Check: Are accounts actually in Firebase?
- Check: Is `hasPlaidAccounts` state variable set?
- Check: Is component re-rendering after data load?

**Issue**: Buttons remain disabled
- Check: Button's `disabled` prop condition
- Check: Both `plaidStatus.isConnected` and `hasPlaidAccounts` values
- Check: Error state (`plaidStatus.hasError`)

**Issue**: Inconsistent states across pages
- Check: Each page loading accounts from Firebase correctly
- Check: Each page setting `hasPlaidAccounts` state
- Check: Not using cached/stale data

---

## Reporting Issues

If you find issues during testing, please report with:

1. **Test Case**: Which test case failed
2. **Expected**: What should have happened
3. **Actual**: What actually happened
4. **Screenshot**: Visual evidence
5. **Console**: Any errors in browser console
6. **Network**: API calls in Network tab
7. **State**: Component state from React DevTools
8. **Steps**: Exact steps to reproduce

---

## Sign-Off

Tester Name: _______________  
Date: _______________  
Browser: _______________  
OS: _______________  

Test Results:
- [ ] All test cases passed
- [ ] Issues found (see attached bug reports)
- [ ] Ready for production
- [ ] Needs fixes (specify)

Notes:
_______________________________________
_______________________________________
_______________________________________
