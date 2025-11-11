# JSX Stale Closure Fix - Quick Reference

## Problem
After PR #146, transactions STILL showed "| Account" instead of bank names.

## Root Cause
**PR #146 fixed `applyFilters()` but missed the JSX render closure!**

The JSX at line ~1762 had a stale closure over `accounts`:
```javascript
// ❌ BEFORE: Stale closure
{getAccountDisplayName(accounts[transaction.account_id] || {})}
// ↑ Captures empty accounts = {} from initial render
```

## Solution
Pre-compute account names in `applyFilters()`, attach to transactions, read in JSX.

## Changes

### 1. applyFilters() - Add after sorting (Line 1009)
```javascript
// ✅ Attach account display names
filtered = filtered.map(t => ({
  ...t,
  _accountDisplayName: getAccountDisplayName(
    currentAccounts[t.account_id] || 
    currentAccounts[t.account] || 
    {}
  )
}));
```

### 2. JSX Render - Simplify (Line 1771)
```javascript
// ✅ AFTER: Use pre-computed value
{transaction._accountDisplayName || 'Account'}
```

## Impact
- **Before:** Shows "| Account" forever ❌
- **After:** Shows "| USAA CLASSIC CHECKING" after accounts load ✅

## Files Modified
1. `frontend/src/pages/Transactions.jsx` - 2 locations (16 lines added, 5 removed)
2. `frontend/src/pages/TransactionAccountNameRaceCondition.test.js` - Updated property names

## Test Results
✅ All 5 tests pass
✅ Build successful

## Why It Works
**Instead of:**
```
JSX renders → Looks up accounts[id] → Uses stale closure ❌
```

**Now:**
```
applyFilters() → Pre-computes name → Attaches to transaction ✅
JSX renders → Reads pre-computed value ✅
```

**The JSX no longer needs to look up accounts!**

## Related
- **PR #146:** Fixed `applyFilters()` stale closure
- **This PR (PR #147):** Fixed JSX render stale closure

Both fixes were needed because they're in different scopes!
