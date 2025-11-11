# Account Delete Fix - Visual Comparison

## Before Fix (PR #136) ❌

### Code
```javascript
// ❌ WRONG - Filters by item_id
const updatedPlaidAccounts = (currentData.plaidAccounts || []).filter(
  acc => acc.item_id !== itemId  // Deletes ALL accounts from bank
);

// Always deletes plaid_items
const batch = writeBatch(db);
plaidItemsSnapshot.forEach(doc => {
  batch.delete(doc.ref);
});
await batch.commit();
```

### User Flow
```
Initial State:
┌─────────────────────────────────────┐
│ USAA (item_id: "item_usaa")         │
├─────────────────────────────────────┤
│ ✅ USAA Checking (acc_1) $1,127.68 │
│ ✅ USAA Savings  (acc_2)   $234.29 │
└─────────────────────────────────────┘

User Action: Delete USAA Savings
                    ↓
                    
After Delete:
┌─────────────────────────────────────┐
│ USAA (item_id: "item_usaa")         │
├─────────────────────────────────────┤
│ ❌ USAA Checking - GONE!            │
│ ❌ USAA Savings  - GONE!            │
└─────────────────────────────────────┘

Result: BOTH accounts deleted 💀
User wanted: Delete Savings only
User lost: Checking account too
```

---

## After Fix (PR #137) ✅

### Code
```javascript
// ✅ CORRECT - Filters by account_id
const updatedPlaidAccounts = (currentData.plaidAccounts || []).filter(
  acc => acc.account_id !== accountKey  // Deletes ONLY this account
);

// Check if other accounts remain
const remainingAccountsFromBank = updatedPlaidAccounts.filter(
  acc => acc.item_id === itemId
);

// Only delete plaid_items if NO accounts remain
if (remainingAccountsFromBank.length === 0) {
  // Delete plaid_items
  const batch = writeBatch(db);
  plaidItemsSnapshot.forEach(doc => {
    batch.delete(doc.ref);
  });
  await batch.commit();
  console.log('Deleted plaid_items (no accounts remaining)');
} else {
  console.log(`Kept plaid_items (${remainingAccountsFromBank.length} accounts remaining)`);
}
```

### User Flow - Scenario 1: Delete One Account
```
Initial State:
┌─────────────────────────────────────┐
│ USAA (item_id: "item_usaa")         │
├─────────────────────────────────────┤
│ ✅ USAA Checking (acc_1) $1,127.68 │
│ ✅ USAA Savings  (acc_2)   $234.29 │
└─────────────────────────────────────┘

User Action: Delete USAA Savings
                    ↓
                    
After Delete:
┌─────────────────────────────────────┐
│ USAA (item_id: "item_usaa")         │
├─────────────────────────────────────┤
│ ✅ USAA Checking (acc_1) $1,127.68 │  ← Still there!
│ ❌ USAA Savings  - DELETED          │
└─────────────────────────────────────┘

✅ Result: Only Savings deleted
✅ Checking account preserved
✅ plaid_items NOT deleted (other accounts remain)
```

### User Flow - Scenario 2: Delete All Accounts
```
Initial State:
┌─────────────────────────────────────┐
│ SoFi (item_id: "item_sofi")         │
├─────────────────────────────────────┤
│ ✅ SoFi Checking (acc_3)   $500.00 │
│ ✅ SoFi Savings  (acc_4)   $200.00 │
└─────────────────────────────────────┘

User Action: Delete SoFi Savings
                    ↓
                    
After First Delete:
┌─────────────────────────────────────┐
│ SoFi (item_id: "item_sofi")         │
├─────────────────────────────────────┤
│ ✅ SoFi Checking (acc_3)   $500.00 │  ← Still there!
│ ❌ SoFi Savings  - DELETED          │
└─────────────────────────────────────┘

✅ Checking preserved
✅ plaid_items NOT deleted (1 account remains)

User Action: Delete SoFi Checking
                    ↓
                    
After Second Delete:
┌─────────────────────────────────────┐
│ SoFi - COMPLETELY REMOVED           │
├─────────────────────────────────────┤
│ ❌ SoFi Checking - DELETED          │
│ ❌ SoFi Savings  - DELETED          │
└─────────────────────────────────────┘

✅ All accounts deleted
✅ plaid_items DELETED (no accounts remain)
✅ Bank connection cleaned up properly
```

---

## Key Differences

### Filter Logic

| Aspect | Before (❌) | After (✅) |
|--------|-------------|-----------|
| **Filter Key** | `item_id` | `account_id` |
| **Scope** | All accounts from bank | Single account |
| **Behavior** | Deletes all | Deletes one |

### plaid_items Deletion

| Aspect | Before (❌) | After (✅) |
|--------|-------------|-----------|
| **When deleted** | Always | Conditionally |
| **Logic** | Immediate | Check remaining accounts |
| **Risk** | Loses access to all accounts | Safe deletion |

---

## Data Structure Explanation

### Account Data
```javascript
{
  account_id: "acc_1",           // ← Unique per account
  item_id: "item_usaa",          // ← Shared across all USAA accounts
  name: "USAA Checking",
  balance: "1127.68",
  official_name: "USAA Federal Savings Bank - Checking",
  type: "checking",
  mask: "1234"
}
```

### Multiple Accounts Example
```javascript
[
  {
    account_id: "acc_1",         // Unique ID for Checking
    item_id: "item_usaa",        // Same item_id (same bank)
    name: "USAA Checking",
    balance: "1127.68"
  },
  {
    account_id: "acc_2",         // Unique ID for Savings
    item_id: "item_usaa",        // Same item_id (same bank)
    name: "USAA Savings",
    balance: "234.29"
  }
]
```

**Key Insight:**
- Filtering by `item_id` = Both deleted ❌
- Filtering by `account_id` = One deleted ✅

---

## Firebase Structure

### Before Delete (2 accounts)
```
users/
  userId/
    settings/
      personal/
        plaidAccounts: [
          { account_id: "acc_1", item_id: "item_usaa", ... },  // Checking
          { account_id: "acc_2", item_id: "item_usaa", ... }   // Savings
        ]
    plaid_items/
      doc123/
        itemId: "item_usaa"
        accessToken: "access-..."
```

### After Deleting Savings (PR #136 - WRONG) ❌
```
users/
  userId/
    settings/
      personal/
        plaidAccounts: []  // ❌ BOTH deleted!
    plaid_items/
      // ❌ Deleted (no accounts left)
```

### After Deleting Savings (PR #137 - CORRECT) ✅
```
users/
  userId/
    settings/
      personal/
        plaidAccounts: [
          { account_id: "acc_1", item_id: "item_usaa", ... }  // ✅ Checking remains!
        ]
    plaid_items/
      doc123/  // ✅ Still here (1 account remains)
        itemId: "item_usaa"
        accessToken: "access-..."
```

### After Deleting Checking Too (Final State) ✅
```
users/
  userId/
    settings/
      personal/
        plaidAccounts: []  // ✅ All accounts deleted
    plaid_items/
      // ✅ Now deleted (no accounts left)
```

---

## Code Flow Comparison

### Before (PR #136) ❌
```
User clicks Delete on Savings
         ↓
Find account by account_id
         ↓
Get item_id from account
         ↓
Filter plaidAccounts by item_id  ❌
         ↓
Delete ALL accounts with same item_id
         ↓
Delete plaid_items immediately
         ↓
Update state
         ↓
Both accounts gone 💀
```

### After (PR #137) ✅
```
User clicks Delete on Savings
         ↓
Find account by account_id
         ↓
Get item_id from account
         ↓
Filter plaidAccounts by account_id  ✅
         ↓
Check remaining accounts with same item_id
         ↓
If remaining.length === 0:
  → Delete plaid_items
Else:
  → Keep plaid_items
         ↓
Update state
         ↓
Only selected account deleted ✅
Other accounts preserved ✅
```

---

## Real-World Example

### User's Situation
```
Banks Connected:
├── USAA
│   ├── Checking: $1,127.68  (actively used)
│   └── Savings:    $234.29  (empty, unused)
├── SoFi
│   ├── Checking:   $500.00  (actively used)
│   └── Savings:    $200.00  (empty, unused)
├── Chase
│   ├── Checking: $2,500.00  (actively used)
│   └── Credit:     $750.00  (actively used)
└── Bank of America
    └── Checking:   $300.00  (actively used)
```

### User Goal
Delete unused Savings accounts (USAA, SoFi) but keep Checking

### With PR #136 (WRONG) ❌
```
Delete USAA Savings → Loses USAA Checking too 💀
Delete SoFi Savings → Loses SoFi Checking too 💀

Result: Lost 4 accounts instead of 2!
```

### With PR #137 (CORRECT) ✅
```
Delete USAA Savings → USAA Checking preserved ✅
Delete SoFi Savings → SoFi Checking preserved ✅

Result: Exactly what user wanted!
```

---

## Testing Scenarios

### Scenario A: Single Account Bank
```
Before:
└── Bank of America
    └── Checking: $300.00

Delete Checking:
✅ Account deleted
✅ plaid_items deleted (no accounts left)
✅ Bank connection removed

Result: Clean removal ✅
```

### Scenario B: Multi-Account Bank (Delete One)
```
Before:
└── Chase
    ├── Checking: $2,500.00
    └── Credit:     $750.00

Delete Credit:
✅ Credit account deleted
✅ Checking account preserved
✅ plaid_items preserved (1 account remains)

Result: Selective deletion ✅
```

### Scenario C: Multi-Account Bank (Delete All)
```
Before:
└── Chase
    ├── Checking: $2,500.00
    └── Credit:     $750.00

Delete Credit:
✅ Credit deleted
✅ Checking preserved

Delete Checking:
✅ Checking deleted
✅ plaid_items deleted (no accounts left)

Result: Complete cleanup ✅
```

---

## Summary

| Feature | Before (❌) | After (✅) |
|---------|-------------|-----------|
| **Granularity** | Bank-level | Account-level |
| **Deletion Target** | All accounts | Single account |
| **plaid_items Logic** | Always delete | Conditional delete |
| **User Control** | Limited | Full control |
| **Data Safety** | Risky | Safe |
| **Expected Behavior** | No | Yes |

---

## Impact

### Users Can Now:
- ✅ Delete individual unused accounts
- ✅ Keep accounts they want
- ✅ Clean up without losing data
- ✅ Have predictable, granular control

### System Benefits:
- ✅ Proper data granularity
- ✅ Safe access token management
- ✅ Clean state management
- ✅ Better user experience
