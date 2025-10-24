# Account Delete Fix - Quick Reference

## What Changed

**File:** `frontend/src/pages/Accounts.jsx` (lines 336-410)

**Function:** `deleteAccount(accountKey)`

---

## The Fix in 3 Steps

### 1. Filter by Account ID (Not Bank ID)
```javascript
// ❌ BEFORE: Deleted all accounts from bank
acc => acc.item_id !== itemId

// ✅ AFTER: Delete only the specific account
acc => acc.account_id !== accountKey
```

### 2. Check Remaining Accounts
```javascript
const remainingAccountsFromBank = updatedPlaidAccounts.filter(
  acc => acc.item_id === itemId
);
```

### 3. Conditional plaid_items Deletion
```javascript
if (remainingAccountsFromBank.length === 0) {
  // Delete plaid_items (no accounts left)
} else {
  // Keep plaid_items (other accounts remain)
}
```

---

## Expected Behavior

### Delete One Account
✅ Selected account removed  
✅ Other accounts preserved  
✅ Bank connection kept alive  

### Delete All Accounts
✅ All accounts removed sequentially  
✅ Bank connection cleaned up when last account deleted  
✅ Access tokens properly removed  

---

## Key Differences

| Aspect | Before | After |
|--------|--------|-------|
| **Filter** | `item_id` | `account_id` |
| **Scope** | All bank accounts | Single account |
| **plaid_items** | Always deleted | Conditionally deleted |
| **Notification** | "Bank disconnected" | "Account deleted" |

---

## Testing

**Quick Test:**
1. Have 2+ accounts from same bank
2. Delete one account
3. ✅ Only that account should disappear
4. ✅ Other accounts should remain
5. ✅ Refresh - other accounts still there

**Full Test:**
1. Delete all accounts one by one
2. ✅ Each deletion removes only that account
3. ✅ Last deletion cleans up plaid_items
4. ✅ Bank connection fully removed

---

## Data Structure

```javascript
// Account Object
{
  account_id: "unique_per_account",  // ← Use this for deletion
  item_id: "shared_across_bank",     // ← Don't use this!
  name: "Account Name",
  balance: "1000.00"
}
```

**Remember:**
- `account_id` = Individual account identifier ✅
- `item_id` = Bank connection identifier (shared) ❌

---

## Common Scenarios

### Scenario: User has USAA Checking + Savings
**Want:** Delete Savings only  
**Before:** Both deleted ❌  
**After:** Only Savings deleted ✅  

### Scenario: User wants to disconnect entire bank
**Want:** Remove all accounts  
**Before:** Delete any account → all deleted ❌  
**After:** Delete each account → proper cleanup ✅  

---

## Verification

✅ Build successful  
✅ No linting errors  
✅ Logic validated  
✅ Documentation complete  

---

## Files

- `frontend/src/pages/Accounts.jsx` - Fixed deletion logic
- `PR_137_ACCOUNT_DELETE_FIX.md` - Detailed explanation
- `ACCOUNT_DELETE_FIX_VISUAL.md` - Visual comparison
- `ACCOUNT_DELETE_QUICK_REF.md` - This file

---

## Priority

**CRITICAL** - Fixes PR #136 bug that deletes entire banks instead of individual accounts.

---

## Summary

**Problem:** PR #136 deleted entire banks when user tried to delete one account

**Solution:** Filter by `account_id` instead of `item_id`, conditionally delete `plaid_items`

**Result:** Granular account deletion that preserves other accounts ✅
