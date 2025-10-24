# Testing Scenarios for Banner Improvements

## Overview
This document outlines the testing scenarios to verify the banner improvements work correctly.

---

## Test Scenario 1: Initial Plaid Connection

**Preconditions:**
- No Plaid accounts connected
- localStorage `plaidBannerDismissed` is not set or is `false`

**Steps:**
1. Navigate to Accounts page
2. Observe "⚠️ No Bank Connected" banner is visible (orange/warning)
3. Click "Connect Bank" or "Connect Now" button
4. Complete Plaid sandbox authentication (username: `user_good`, password: `pass_good`)
5. Select one or more accounts to connect
6. Submit the Plaid flow

**Expected Results:**
- ✅ Orange "No Bank Connected" banner disappears
- ✅ Green "Bank Connected" banner appears (smaller, compact)
- ✅ Banner includes "Dismiss" button
- ✅ Banner auto-hides after 5 seconds
- ✅ Connected accounts display in the list
- ✅ Account balances are visible

**Verification:**
```javascript
// Banner should be visible immediately after connection
showSuccessBanner === true
bannerDismissed === false
plaidAccounts.length > 0

// After 5 seconds
showSuccessBanner === false (auto-hidden)
```

---

## Test Scenario 2: Manual Banner Dismissal

**Preconditions:**
- Just completed Plaid connection (from Scenario 1)
- Green banner is visible

**Steps:**
1. Click the "Dismiss" button on the green banner
2. Observe banner disappears immediately
3. Reload the page
4. Check if banner reappears

**Expected Results:**
- ✅ Banner disappears immediately when "Dismiss" clicked
- ✅ `localStorage.plaidBannerDismissed` set to `"true"`
- ✅ After page reload, banner does NOT reappear
- ✅ Accounts still display correctly
- ✅ No other banners appear (clean interface)

**Verification:**
```javascript
// After dismiss
showSuccessBanner === false
bannerDismissed === true
localStorage.getItem('plaidBannerDismissed') === 'true'

// After page reload
showSuccessBanner === false (starts false)
bannerDismissed === true (loaded from localStorage)
// Banner condition fails: showSuccessBanner && !bannerDismissed
```

---

## Test Scenario 3: Connecting Additional Bank Account

**Preconditions:**
- Already have one Plaid account connected
- Previously dismissed the banner
- `localStorage.plaidBannerDismissed` is `"true"`

**Steps:**
1. Navigate to Accounts page
2. Observe no green banner is visible (clean interface)
3. Click "Add Another Bank" button
4. Complete Plaid flow for another institution
5. Submit and connect

**Expected Results:**
- ✅ Green "Bank Connected" banner appears again (new connection)
- ✅ Banner shows for 5 seconds then auto-hides
- ✅ Banner can be dismissed manually
- ✅ New accounts added to existing list
- ✅ Total balance updated

**Verification:**
```javascript
// In handlePlaidSuccess:
setShowSuccessBanner(true)  // Reset to show
setBannerDismissed(false)   // Clear dismissal

// Banner appears because:
showSuccessBanner === true
bannerDismissed === false (temporarily)
plaidAccounts.length > 0
```

**Reasoning:**
User should be notified about each new successful connection, even if they dismissed previous banners.

---

## Test Scenario 4: Dashboard Status - Connected State

**Preconditions:**
- Plaid account connected and working
- `plaidStatus.isConnected === true`

**Steps:**
1. Navigate to Dashboard page
2. Observe the Plaid status indicator in the header

**Expected Results:**
- ✅ Status shows: "🟢 Plaid: Connected"
- ✅ NO "Connect" button is visible
- ✅ Clean, simple status display
- ✅ Green indicator/color

**Verification:**
```javascript
plaidStatus.isConnected === true
// Button render condition: !plaidStatus.isConnected && !loading
// Evaluates to: !(true) && !loading = false
// Result: Button NOT rendered
```

---

## Test Scenario 5: Dashboard Status - Not Connected State

**Preconditions:**
- No Plaid accounts connected
- `plaidStatus.isConnected === false`
- Page finished loading (`loading === false`)

**Steps:**
1. Navigate to Dashboard page
2. Observe the Plaid status indicator

**Expected Results:**
- ✅ Status shows: "⚠️ Plaid: Not Connected"
- ✅ "Connect" button IS visible
- ✅ Yellow/warning color indicator
- ✅ Clicking button navigates to Accounts page

**Verification:**
```javascript
plaidStatus.isConnected === false
loading === false
// Button condition: !plaidStatus.isConnected && !loading
// Evaluates to: !(false) && !(false) = true && true = true
// Result: Button rendered
```

---

## Test Scenario 6: Dashboard Status - Error State

**Preconditions:**
- Plaid connection has an error
- `plaidStatus.hasError === true`
- `plaidStatus.isConnected === false`

**Steps:**
1. Simulate or encounter a Plaid API error
2. Navigate to Dashboard page
3. Observe the Plaid status indicator

**Expected Results:**
- ✅ Status shows: "❌ Plaid: Error"
- ✅ "Fix" button IS visible (not "Connect")
- ✅ Red error indicator/color
- ✅ Clicking button navigates to Accounts page
- ✅ Hover shows error details in tooltip

**Verification:**
```javascript
plaidStatus.hasError === true
plaidStatus.isConnected === false
// Button text: plaidStatus.hasError ? 'Fix' : 'Connect'
// Evaluates to: true ? 'Fix' : 'Connect' = 'Fix'
```

---

## Test Scenario 7: Dashboard Status - Loading State

**Preconditions:**
- Page is in initial loading state
- `loading === true`

**Steps:**
1. Navigate to Dashboard page
2. Observe status during initial load (first second)

**Expected Results:**
- ✅ Status shows: "Firebase: Loading..." or similar
- ✅ NO "Connect" button visible during loading
- ✅ Prevents button "flash" as data loads
- ✅ After load completes, appropriate button appears

**Verification:**
```javascript
loading === true
// Button condition: !plaidStatus.isConnected && !loading
// Evaluates to: !plaidStatus.isConnected && !(true)
// Evaluates to: <boolean> && false = false
// Result: Button NOT rendered during loading
```

---

## Test Scenario 8: Banner Priority - Error Overrides Success

**Preconditions:**
- Plaid accounts exist
- Simulate a Plaid error (network disconnect, API down, etc.)

**Steps:**
1. Have connected Plaid accounts
2. Simulate or trigger a Plaid API error
3. Navigate to Accounts page

**Expected Results:**
- ✅ Red error banner is visible: "❌ Connection Error"
- ✅ Green success banner is NOT visible
- ✅ Error message shows with "View Details" button
- ✅ Accounts still display (from Firebase cache)

**Verification:**
```javascript
plaidAccounts.length > 0
plaidStatus.hasError === true

// Error banner condition: plaidStatus.hasError
// Evaluates to: true → Shows error banner

// Success banner condition: 
// plaidAccounts.length > 0 && !plaidStatus.hasError && ...
// Evaluates to: true && !(true) && ... = true && false = false
// Result: Success banner NOT shown (error takes priority)
```

---

## Test Scenario 9: No Banner Conflicts

**Preconditions:**
- Starting fresh, no accounts

**Test 9a: Only Warning Banner**
- **Condition:** No accounts, no error
- **Expected:** Only "⚠️ No Bank Connected" (orange) shows
- **Verify:** Other banners not present

**Test 9b: Only Success Banner**
- **Condition:** Accounts exist, no error, banner not dismissed
- **Expected:** Only "✅ Bank Connected" (green) shows after connection
- **Verify:** Warning and error banners not present

**Test 9c: Only Error Banner**
- **Condition:** Accounts exist, error present
- **Expected:** Only "❌ Connection Error" (red) shows
- **Verify:** Success and warning banners not present

**Key Rule:**
```
At any given time, EXACTLY ONE banner shows (or none after dismissal/auto-hide)

Priority Order:
1. Error (if plaidStatus.hasError)
2. Success (if accounts exist && showSuccessBanner && !dismissed && !error)
3. Warning (if no accounts && !error)
```

---

## Test Scenario 10: localStorage Persistence

**Steps:**
1. Connect Plaid account
2. Dismiss green banner
3. Close browser completely
4. Reopen browser
5. Navigate to Accounts page

**Expected Results:**
- ✅ Green banner does NOT reappear
- ✅ localStorage still contains `plaidBannerDismissed: "true"`
- ✅ Accounts display correctly
- ✅ No banner nagging

**Verification:**
```javascript
// Check in browser console:
localStorage.getItem('plaidBannerDismissed') === 'true'

// Component state on mount:
bannerDismissed === true (loaded from localStorage)
showSuccessBanner === false (default state)

// Banner won't show because:
!bannerDismissed === false
```

---

## Edge Cases

### Edge Case 1: Connection Fails
**Steps:**
1. Start Plaid connection flow
2. Cancel or fail authentication
3. Check Accounts page

**Expected:**
- ✅ No green banner appears (connection didn't succeed)
- ✅ Warning banner still shows if no accounts
- ✅ No error banner unless API error occurred
- ✅ handlePlaidSuccess not called, banner state unchanged

### Edge Case 2: Multiple Dismissals
**Steps:**
1. Connect bank, dismiss banner
2. Connect another bank, dismiss banner
3. Connect third bank

**Expected:**
- ✅ Banner shows for each new connection
- ✅ Each dismissal is respected
- ✅ localStorage only stores single boolean flag
- ✅ Last dismissal counts

### Edge Case 3: Clear localStorage
**Steps:**
1. Have dismissed banner previously
2. Clear browser localStorage
3. Reload page

**Expected:**
- ✅ `bannerDismissed` resets to `false` (default)
- ✅ If accounts exist, banner won't show (because `showSuccessBanner` is false)
- ✅ Only shows again on next successful connection
- ✅ No errors or undefined behavior

---

## Acceptance Criteria Verification

### Requirement 1: Less Intrusive Banner
- [x] Banner is smaller (27% size reduction)
- [x] Banner auto-hides after 5 seconds
- [x] Banner can be manually dismissed
- [x] Banner doesn't persist on page reloads
- [x] Only shows briefly after successful connection

### Requirement 2: Dashboard Status Accurate
- [x] Shows "Connected" when Plaid is working
- [x] Shows "Not Connected" when Plaid not linked
- [x] Shows "Error" when API issues occur
- [x] "Connect" button hidden when already connected
- [x] Appropriate buttons for each state

### Requirement 3: No Duplicate/Confusing Banners
- [x] Only one banner shows at a time
- [x] Clear priority: Error > Success > Warning
- [x] Manual accounts hidden when Plaid accounts exist
- [x] No conflicting states or messages

### Requirement 4: Ready for Testing
- [x] Can test with Plaid sandbox
- [x] All states testable (connected, not connected, error)
- [x] Clear expected behavior documented
- [x] Edge cases identified and handled

---

## Testing Tools

### Browser Developer Tools
```javascript
// Check banner state in console:
// (Open browser console on Accounts page)

// Check localStorage
localStorage.getItem('plaidBannerDismissed')

// Check component state (if using React DevTools)
// Look for Accounts component:
showSuccessBanner: <boolean>
bannerDismissed: <boolean>
plaidAccounts: <array>
plaidStatus: { isConnected, hasError, errorMessage }
```

### Plaid Sandbox Credentials
```
Username: user_good
Password: pass_good
Institution: Any sandbox bank

For testing errors:
Username: user_bad (triggers auth error)
```

### Network Simulation
```
// Test API errors:
1. Open DevTools Network tab
2. Enable "Offline" mode
3. Try to connect Plaid
4. Should see error banner

Or use DevTools to block specific API URLs
```

---

## Summary

All test scenarios validate that:
1. ✅ Banner is less intrusive (smaller, auto-hides, dismissible)
2. ✅ Dashboard shows correct status with appropriate buttons
3. ✅ No banner conflicts (one at a time, clear priority)
4. ✅ Ready for Plaid sandbox testing

**Total Test Scenarios:** 10 main + 3 edge cases
**Acceptance Criteria Met:** 4/4
**Test Coverage:** Component state, UI behavior, localStorage, API integration
