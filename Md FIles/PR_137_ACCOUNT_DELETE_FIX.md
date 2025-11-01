# PR #137 - Fix Account Deletion Logic

## Problem Summary

PR #136 fixed the delete button but introduced a critical bug: it deletes **entire banks** (all accounts) instead of **individual accounts**.

### User Impact

**Before this fix:**
1. User has USAA with 2 accounts:
   - USAA Checking ✅ (wants to keep)
   - USAA Savings ❌ (wants to delete)
2. User clicks Delete on USAA Savings
3. **BOTH accounts deleted** 💀
4. USAA Checking is gone too (unintended)

### Root Cause

The PR #136 code filtered by `item_id`, which represents the entire bank connection:

```javascript
// ❌ WRONG - Deleted ALL accounts from the bank
const updatedPlaidAccounts = (currentData.plaidAccounts || []).filter(
  acc => acc.item_id !== itemId  // Removes all accounts with same item_id
);

// Always deleted plaid_items (even if other accounts exist)
await batch.commit();
```

**Why this was wrong:**
- One bank (USAA) = one `item_id` = multiple accounts (Checking, Savings)
- Filtering by `item_id` removes ALL accounts from that bank
- User wants to delete ONLY one specific account, not all of them

---

## Solution

### Key Changes in `frontend/src/pages/Accounts.jsx`

#### 1. Filter by `account_id` instead of `item_id`

```javascript
// ✅ CORRECT - Delete ONLY the specific account
const updatedPlaidAccounts = (currentData.plaidAccounts || []).filter(
  acc => acc.account_id !== accountKey  // Filter by account_id, not item_id
);
```

#### 2. Check if other accounts from the same bank exist

```javascript
// Check if any OTHER accounts from this bank still exist
const remainingAccountsFromBank = updatedPlaidAccounts.filter(
  acc => acc.item_id === itemId
);
```

#### 3. Only delete `plaid_items` if NO accounts remain

```javascript
// Only delete plaid_items if NO accounts remain from this bank
if (remainingAccountsFromBank.length === 0) {
  // All accounts from this bank deleted - remove plaid_items
  const plaidItemsRef = collection(db, 'users', userId, 'plaid_items');
  const plaidItemsQuery = query(plaidItemsRef, where('itemId', '==', itemId));
  const plaidItemsSnapshot = await getDocs(plaidItemsQuery);
  
  const batch = writeBatch(db);
  plaidItemsSnapshot.forEach(doc => {
    batch.delete(doc.ref);
  });
  await batch.commit();
  
  console.log(`Deleted plaid_items for ${itemId} (no accounts remaining)`);
} else {
  console.log(`Kept plaid_items for ${itemId} (${remainingAccountsFromBank.length} accounts remaining)`);
}
```

---

## Expected Behavior After Fix

### Scenario 1: Delete one account, keep others

**User has USAA with 2 accounts:**
1. Click Delete on USAA Savings
2. ✅ USAA Savings removed
3. ✅ USAA Checking stays
4. ✅ `plaid_items` NOT deleted (other accounts remain)
5. ✅ Page refresh - USAA Checking still there

### Scenario 2: Delete all accounts from a bank

**User has SoFi with 2 accounts:**
1. Click Delete on SoFi Savings
2. ✅ SoFi Savings removed
3. ✅ SoFi Checking stays
4. Later: Click Delete on SoFi Checking
5. ✅ SoFi Checking removed
6. ✅ `plaid_items` deleted (no accounts left)
7. ✅ Entire bank connection cleaned up

---

## Technical Implementation

### Data Structure

```javascript
// Plaid Account Structure
{
  account_id: "abc123",      // Unique account identifier
  item_id: "item_xyz",       // Bank connection identifier (shared across accounts)
  name: "USAA Checking",
  balance: "1000.00",
  // ... other fields
}
```

### Key Insight

- **`account_id`** = Individual account (Checking, Savings, etc.)
- **`item_id`** = Bank connection (all accounts from one bank share this)

**Example:**
- USAA Checking: `account_id = "acc_1"`, `item_id = "item_usaa"`
- USAA Savings: `account_id = "acc_2"`, `item_id = "item_usaa"`

Deleting by `account_id` = Delete one account
Deleting by `item_id` = Delete all accounts from that bank ❌

---

## Why This Fix is Critical

### User Story

**Problem:**
- User has 4 banks connected
- Each bank has Checking + Savings
- Savings accounts empty/unused
- User wants to hide Savings, keep Checking
- **Can't do this with PR #136** ❌

**Solution:**
- With this fix, user can delete individual accounts
- Keeps bank connection alive if accounts remain
- Cleaner, more predictable behavior ✅

### Data Integrity

- ✅ Individual account deletion = proper granularity
- ✅ Only delete access tokens when truly needed
- ✅ Keeps bank connection alive if accounts remain
- ✅ Cleaner, more predictable behavior

---

## Testing Validation

### Build Status
✅ Frontend builds successfully with no errors
✅ No syntax errors or linting issues introduced
✅ Existing functionality preserved

### Manual Testing Steps

**Test 1: Delete one account, keep others**
1. Go to `/accounts`
2. Find bank with 2+ accounts (e.g., USAA: Checking + Savings)
3. Click Delete on one account (e.g., USAA Savings)
4. Confirm deletion
5. ✅ Verify: Only selected account deleted
6. ✅ Verify: Other accounts still visible
7. Refresh page
8. ✅ Verify: Other accounts still present

**Test 2: Delete all accounts from a bank**
1. Continue from Test 1
2. Click Delete on remaining account (e.g., USAA Checking)
3. ✅ Verify: Account deleted
4. Check Firebase Console:
   - ✅ `plaid_items` for bank deleted
   - ✅ `settings/personal` - no accounts for that bank
5. Refresh page
6. ✅ Verify: Bank completely gone

**Test 3: Reconnect works normally**
1. Reconnect the bank
2. ✅ Verify: All accounts appear
3. ✅ Verify: Transactions load correctly

---

## Files Changed

- `frontend/src/pages/Accounts.jsx` - Updated `deleteAccount` function (lines 336-410)

## Changes Summary

- **Lines 360-363**: Filter by `account_id` instead of `item_id`
- **Lines 365-368**: Check for remaining accounts from same bank
- **Lines 370-386**: Conditionally delete `plaid_items` only if no accounts remain
- **Lines 388-393**: Update settings with correct filtered accounts
- **Lines 395-401**: Update local state and recalculate balance
- **Line 403**: Updated notification message

---

## Priority

**CRITICAL** - PR #136 broke multi-account bank deletion. Users can't selectively remove accounts without losing everything.

## Context

- PR #136 merged with the bug
- User tested immediately and discovered the issue
- Blocking user from cleaning up unused accounts
- Needs individual account deletion capability

---

## Verification

✅ Code review completed
✅ Build successful
✅ Linting passed (no new issues)
✅ Logic validated against requirements
✅ Edge cases considered

---

## Next Steps

1. Deploy PR #137
2. Perform manual testing on staging
3. Verify both scenarios work as expected
4. Monitor for any edge cases
5. Close issue once verified

---

## Related Issues

- Fixes the bug introduced in PR #136
- Restores expected account deletion behavior
- Enables granular account management
