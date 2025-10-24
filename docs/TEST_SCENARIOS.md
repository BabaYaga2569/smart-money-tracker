# Banner Fix - Test Scenarios

## Overview
This document provides step-by-step test scenarios to verify the banner visibility fix works correctly.

---

## Test Scenario 1: Fresh User with No Accounts

### Setup
- Clear browser localStorage: `localStorage.clear()`
- Clear Firebase data for test user (or use fresh test user)
- Reload page

### Expected State
```
plaidAccounts = []
plaidStatus.hasError = false
```

### Expected UI
```
┌─────────────────────────────────────────────────────────┐
│ ⚠️  No Bank Connected                                   │
│ Connect your bank to automatically sync balances and   │
│ transactions                         [🔗 Connect Now]  │
└─────────────────────────────────────────────────────────┘

💳 Bank Accounts
┌─────────────────────────────────────────────────────────┐
│  No accounts yet - connect your bank to get started    │
└─────────────────────────────────────────────────────────┘
```

### Verification Checklist
- [ ] Orange warning banner is visible
- [ ] Banner shows "No Bank Connected" message
- [ ] "Connect Now" button is present
- [ ] No other banners are visible
- [ ] No conflicting messages

**Expected Result**: ✅ PASS

---

## Test Scenario 2: User Connects Plaid Account

### Setup
- Start from Scenario 1 (no accounts)
- Click "🔗 Connect Now" button
- Authenticate with Plaid sandbox credentials:
  - Username: `user_good`
  - Password: `pass_good`
  - Bank: Any sandbox institution

### Steps
1. Click "Connect Now"
2. Plaid Link modal opens
3. Select bank
4. Enter sandbox credentials
5. Select accounts to connect
6. Complete authentication

### Expected Behavior
**Immediately after accounts are added** (no delay):

```
plaidAccounts = [Account1, Account2, ...]
plaidStatus.hasError = false
```

### Expected UI (Immediate Update)
```
┌─────────────────────────────────────────────────────────┐
│ ✅ Bank Connected - Live balance syncing enabled       │
└─────────────────────────────────────────────────────────┘

💳 Bank Accounts                            Total: $X,XXX.XX
┌─────────────────────────────────────────────────────────┐
│ 🏦 Chase Checking ••1234                                │
│ 🔗 Live Balance: $3,142.56                             │
│ 🔄 Auto-synced                                          │
└─────────────────────────────────────────────────────────┘
```

### Verification Checklist
- [ ] Orange warning banner disappears **immediately**
- [ ] Green success banner appears **immediately**
- [ ] No delay (< 1 second)
- [ ] Accounts display correctly
- [ ] Balances show correct values
- [ ] No warning banner visible
- [ ] No conflicting banners

**Expected Result**: ✅ PASS

---

## Test Scenario 3: User with Existing Plaid Accounts

### Setup
- Accounts already connected from previous session
- Reload page (fresh load)

### Expected State
```
plaidAccounts = [Account1, Account2, ...]
plaidStatus.hasError = false
```

### Expected UI (On Page Load)
```
┌─────────────────────────────────────────────────────────┐
│ ✅ Bank Connected - Live balance syncing enabled       │
└─────────────────────────────────────────────────────────┘

💳 Bank Accounts                            Total: $X,XXX.XX
[Accounts listed here]
```

### Verification Checklist
- [ ] Green success banner visible
- [ ] No warning banner visible
- [ ] Accounts load correctly
- [ ] Banner visible from page load (no flashing)

**Expected Result**: ✅ PASS

---

## Test Scenario 4: API Error with Existing Accounts

### Setup
- User has Plaid accounts
- Simulate API error (disconnect network, or use dev tools to block API calls)

### Expected State
```
plaidAccounts = [Account1, Account2, ...]
plaidStatus.hasError = true
plaidStatus.errorMessage = "Unable to connect to Plaid API..."
```

### Expected UI
```
┌─────────────────────────────────────────────────────────┐
│ ❌ Connection Error                                     │
│ Unable to connect to Plaid API. This may be a CORS     │
│ configuration issue.                  [View Details]   │
└─────────────────────────────────────────────────────────┘

💳 Bank Accounts                            Total: $X,XXX.XX
┌─────────────────────────────────────────────────────────┐
│ 🏦 Chase Checking ••1234                                │
│ 🔗 Live Balance: $3,142.56                             │
│ ⏸️  Sync Paused (connection error)                      │
└─────────────────────────────────────────────────────────┘
```

### Verification Checklist
- [ ] Red error banner visible
- [ ] No warning banner visible
- [ ] No success banner visible
- [ ] Accounts still display (from cached data)
- [ ] "View Details" button works
- [ ] Only one banner visible (error takes precedence)

**Expected Result**: ✅ PASS

---

## Test Scenario 5: API Error with No Accounts

### Setup
- Clear all accounts
- Simulate API error
- Reload page

### Expected State
```
plaidAccounts = []
plaidStatus.hasError = true
```

### Expected UI
```
┌─────────────────────────────────────────────────────────┐
│ ❌ Connection Error                                     │
│ Unable to connect to Plaid API. This may be a CORS     │
│ configuration issue.                  [View Details]   │
└─────────────────────────────────────────────────────────┘

💳 Bank Accounts
[No accounts display]
```

### Verification Checklist
- [ ] Red error banner visible
- [ ] No warning banner visible
- [ ] No success banner visible
- [ ] Error takes precedence over warning

**Expected Result**: ✅ PASS

---

## Test Scenario 6: Manual Accounts (No Plaid)

### Setup
- No Plaid accounts connected
- User adds manual accounts (if feature exists)

### Expected State
```
plaidAccounts = []
manualAccounts = [Account1, Account2, ...]
plaidStatus.hasError = false
```

### Expected UI
```
┌─────────────────────────────────────────────────────────┐
│ ⚠️  No Bank Connected                                   │
│ Connect your bank to automatically sync balances and   │
│ transactions                         [🔗 Connect Now]  │
└─────────────────────────────────────────────────────────┘

💳 Bank Accounts (Manual)                   Total: $X,XXX.XX
┌─────────────────────────────────────────────────────────┐
│ 🏦 Bank of America Checking                             │
│ Balance: $1,127.68              [✏️ Edit] [🗑️ Delete]   │
└─────────────────────────────────────────────────────────┘
```

### Verification Checklist
- [ ] Warning banner still shows (encourages Plaid connection)
- [ ] Manual accounts display correctly
- [ ] Manual account edit/delete works
- [ ] No regression in manual account functionality

**Expected Result**: ✅ PASS

---

## Test Scenario 7: Banner Priority (All States)

### Test A: Error Overrides Success
```
plaidAccounts = [Account1]  ← has accounts
plaidStatus.hasError = true ← but has error

Expected: ❌ Error banner (not success banner)
```

### Test B: Success Shows When Has Accounts
```
plaidAccounts = [Account1]   ← has accounts
plaidStatus.hasError = false ← no error

Expected: ✅ Success banner
```

### Test C: Warning Shows When No Accounts
```
plaidAccounts = []           ← no accounts
plaidStatus.hasError = false ← no error

Expected: ⚠️ Warning banner
```

### Test D: Error Overrides Warning
```
plaidAccounts = []          ← no accounts
plaidStatus.hasError = true ← has error

Expected: ❌ Error banner (not warning banner)
```

### Verification Checklist
- [ ] Only ONE banner visible at a time
- [ ] Error has highest priority
- [ ] Success shows when appropriate
- [ ] Warning shows when appropriate
- [ ] No conflicting banners

**Expected Result**: ✅ PASS

---

## Test Scenario 8: Rapid State Changes

### Steps
1. Start with no accounts
2. Connect Plaid (adds accounts)
3. Immediately check banner

### Expected Behavior
- Warning banner → Success banner transition is **instant**
- No flashing or multiple banners
- No "stuck" warning banner

### Verification Checklist
- [ ] Smooth transition
- [ ] No visual glitches
- [ ] No delay
- [ ] Correct banner shows immediately

**Expected Result**: ✅ PASS

---

## Regression Tests

### Test: Manual Account Add/Remove
1. With no Plaid accounts, add manual account
2. Verify warning banner still shows (correct - encourages Plaid)
3. Remove manual account
4. Verify warning banner still shows

**Expected**: ✅ Manual accounts don't affect banner

### Test: Plaid Disconnect (if feature exists)
1. Start with Plaid accounts connected
2. Disconnect Plaid
3. Clear plaidAccounts
4. Verify warning banner appears

**Expected**: ✅ Banner correctly shows warning

### Test: Multiple Plaid Connections
1. Connect first bank
2. Banner shows success
3. Connect second bank (add another)
4. Banner still shows success

**Expected**: ✅ Banner stays success

---

## Performance Test

### Scenario: Page Load Performance
1. Load page with 5 Plaid accounts
2. Measure time until banner appears

**Expected**: 
- Banner appears within 1 second
- No delay waiting for API check

---

## Browser Compatibility

Test in:
- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari
- [ ] Mobile browsers

**Expected**: ✅ Works consistently across browsers

---

## Summary

### Pass Criteria
- ✅ Warning banner only shows when `plaidAccounts.length === 0` and no error
- ✅ Success banner shows when `plaidAccounts.length > 0` and no error
- ✅ Error banner shows when error exists (takes precedence)
- ✅ Banner updates immediately when accounts are added
- ✅ No conflicting banners
- ✅ No regressions in manual account flows
- ✅ Works with Plaid sandbox credentials

### Test Result Template
```
Scenario 1: ✅ PASS / ❌ FAIL
Scenario 2: ✅ PASS / ❌ FAIL
Scenario 3: ✅ PASS / ❌ FAIL
Scenario 4: ✅ PASS / ❌ FAIL
Scenario 5: ✅ PASS / ❌ FAIL
Scenario 6: ✅ PASS / ❌ FAIL
Scenario 7: ✅ PASS / ❌ FAIL
Scenario 8: ✅ PASS / ❌ FAIL
Regressions: ✅ PASS / ❌ FAIL
Performance: ✅ PASS / ❌ FAIL
```

---

**Testing Complete When**: All scenarios pass ✅
