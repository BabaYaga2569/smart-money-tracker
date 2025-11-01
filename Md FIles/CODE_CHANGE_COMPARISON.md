# Code Change Comparison - PR #137

## The Critical Line That Was Fixed

### Before (PR #136) ❌
```javascript
const updatedPlaidAccounts = (currentData.plaidAccounts || []).filter(
  acc => acc.item_id !== itemId  // ❌ WRONG - Deletes ALL accounts from bank
);
```

### After (PR #137) ✅
```javascript
const updatedPlaidAccounts = (currentData.plaidAccounts || []).filter(
  acc => acc.account_id !== accountKey  // ✅ CORRECT - Deletes ONLY this account
);
```

---

## Full Function Comparison

### Before (PR #136) - Lines 336-396

```javascript
const deleteAccount = async (accountKey) => {
  try {
    setSaving(true);
    const userId = currentUser.uid;

    const accountToDelete = plaidAccounts.find(acc => acc.account_id === accountKey);
    
    if (accountToDelete) {
      const itemId = accountToDelete.item_id;

      if (!itemId) {
        console.error('Account does not have item_id');
        showNotification('Cannot delete account: missing item_id', 'error');
        setSaving(false);
        return;
      }

      // ❌ STEP 1: Delete plaid_items IMMEDIATELY (wrong order)
      const plaidItemsRef = collection(db, 'users', userId, 'plaid_items');
      const plaidItemsQuery = query(plaidItemsRef, where('itemId', '==', itemId));
      const plaidItemsSnapshot = await getDocs(plaidItemsQuery);
      
      const batch = writeBatch(db);
      plaidItemsSnapshot.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      // ❌ STEP 2: Remove ALL accounts with same item_id
      const settingsDocRef = doc(db, 'users', userId, 'settings', 'personal');
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      const updatedPlaidAccounts = (currentData.plaidAccounts || []).filter(
        acc => acc.item_id !== itemId  // ❌ DELETES ALL ACCOUNTS
      );
      
      await updateDoc(settingsDocRef, {
        ...currentData,
        plaidAccounts: updatedPlaidAccounts,
        lastUpdated: new Date().toISOString()
      });
      
      // ❌ STEP 3: Update state (all accounts gone)
      setPlaidAccounts(updatedPlaidAccounts);
      PlaidConnectionManager.setPlaidAccounts(updatedPlaidAccounts);
      
      const plaidTotal = updatedPlaidAccounts.reduce((sum, acc) => sum + parseFloat(acc.balance || 0), 0);
      setTotalBalance(plaidTotal);
      
      showNotification('Bank disconnected successfully', 'success');
    } else {
      // Manual accounts handling...
    }
    
    // Cleanup other locations...
    
  } catch (error) {
    console.error('Error deleting account:', error);
    showNotification('Failed to delete account. Please try again.', 'error');
  } finally {
    setSaving(false);
  }
};
```

### After (PR #137) - Lines 336-410

```javascript
const deleteAccount = async (accountKey) => {
  try {
    setSaving(true);
    const userId = currentUser.uid;

    const accountToDelete = plaidAccounts.find(acc => acc.account_id === accountKey);
    
    if (accountToDelete) {
      const itemId = accountToDelete.item_id;

      if (!itemId) {
        console.error('Account does not have item_id');
        showNotification('Cannot delete account: missing item_id', 'error');
        setSaving(false);
        return;
      }

      // ✅ STEP 1: Load current settings
      const settingsDocRef = doc(db, 'users', userId, 'settings', 'personal');
      const currentDoc = await getDoc(settingsDocRef);
      const currentData = currentDoc.exists() ? currentDoc.data() : {};
      
      // ✅ STEP 2: Remove ONLY this specific account
      const updatedPlaidAccounts = (currentData.plaidAccounts || []).filter(
        acc => acc.account_id !== accountKey  // ✅ DELETES ONLY THIS ACCOUNT
      );
      
      // ✅ STEP 3: Check if other accounts from this bank exist
      const remainingAccountsFromBank = updatedPlaidAccounts.filter(
        acc => acc.item_id === itemId
      );

      // ✅ STEP 4: Conditionally delete plaid_items
      if (remainingAccountsFromBank.length === 0) {
        // All accounts from this bank deleted - safe to remove plaid_items
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

      // ✅ STEP 5: Update settings
      await updateDoc(settingsDocRef, {
        ...currentData,
        plaidAccounts: updatedPlaidAccounts,
        lastUpdated: new Date().toISOString()
      });
      
      // ✅ STEP 6: Update local state (only deleted account removed)
      setPlaidAccounts(updatedPlaidAccounts);
      PlaidConnectionManager.setPlaidAccounts(updatedPlaidAccounts);
      
      const plaidTotal = updatedPlaidAccounts.reduce((sum, acc) => sum + parseFloat(acc.balance || 0), 0);
      setTotalBalance(plaidTotal);
      
      showNotification('Account deleted successfully', 'success');
    } else {
      // Manual accounts handling...
    }
    
    // Cleanup other locations...
    
  } catch (error) {
    console.error('Error deleting account:', error);
    showNotification('Failed to delete account. Please try again.', 'error');
  } finally {
    setSaving(false);
  }
};
```

---

## Key Differences Highlighted

### 1. Filter Logic
```diff
- acc => acc.item_id !== itemId
+ acc => acc.account_id !== accountKey
```

### 2. Order of Operations
**Before:**
1. Delete plaid_items (always)
2. Filter accounts by item_id
3. Update settings
4. Update state

**After:**
1. Filter accounts by account_id
2. Check remaining accounts
3. Conditionally delete plaid_items
4. Update settings
5. Update state

### 3. Conditional Logic Added
```javascript
// NEW: Check before deleting plaid_items
const remainingAccountsFromBank = updatedPlaidAccounts.filter(
  acc => acc.item_id === itemId
);

if (remainingAccountsFromBank.length === 0) {
  // Safe to delete
} else {
  // Keep it
}
```

### 4. Notification Message
```diff
- showNotification('Bank disconnected successfully', 'success');
+ showNotification('Account deleted successfully', 'success');
```

---

## Impact Analysis

### Lines Changed
- **Added:** 30 lines (conditional logic, checks)
- **Removed:** 16 lines (unconditional deletion)
- **Modified:** 4 lines (filter, notification)

### Logic Flow
**Before:** Linear, unconditional deletion  
**After:** Branching, conditional deletion based on remaining accounts

### Safety
**Before:** Always deletes access tokens (risky)  
**After:** Preserves access tokens when needed (safe)

---

## Why This Fix Works

### Data Model Understanding
```javascript
// Example data
[
  { account_id: "acc_1", item_id: "item_usaa", name: "USAA Checking" },
  { account_id: "acc_2", item_id: "item_usaa", name: "USAA Savings" },
  { account_id: "acc_3", item_id: "item_sofi", name: "SoFi Checking" }
]
```

### Old Logic Problem
```javascript
// User deletes "acc_2" (USAA Savings)
// Old filter: acc.item_id !== "item_usaa"
// Result: Removes acc_1 AND acc_2 (both have item_usaa)
```

### New Logic Solution
```javascript
// User deletes "acc_2" (USAA Savings)
// New filter: acc.account_id !== "acc_2"
// Result: Removes ONLY acc_2
// Remaining: acc_1 (USAA Checking) and acc_3 (SoFi Checking)
```

---

## Edge Cases Handled

### Case 1: Single Account Bank
```javascript
// Before: [{ account_id: "acc_1", item_id: "item_a" }]
// Delete acc_1
// remainingAccountsFromBank.length = 0
// Action: Delete plaid_items ✅
```

### Case 2: Multi-Account Bank (Delete One)
```javascript
// Before: [
//   { account_id: "acc_1", item_id: "item_a" },
//   { account_id: "acc_2", item_id: "item_a" }
// ]
// Delete acc_2
// remainingAccountsFromBank.length = 1 (acc_1 remains)
// Action: Keep plaid_items ✅
```

### Case 3: Multi-Account Bank (Delete All)
```javascript
// Delete acc_2 → 1 remains → Keep plaid_items
// Delete acc_1 → 0 remains → Delete plaid_items ✅
```

---

## Summary

**One Line Changed Everything:**
```javascript
// ❌ This deleted entire banks
acc.item_id !== itemId

// ✅ This deletes individual accounts
acc.account_id !== accountKey
```

**Added Safety:**
- Check remaining accounts before deleting access tokens
- Only cleanup when truly needed
- Preserve bank connection when accounts remain

**Result:**
- Users have granular control
- No accidental data loss
- Predictable, expected behavior
