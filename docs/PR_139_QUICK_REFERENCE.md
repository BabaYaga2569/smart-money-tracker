# PR #139 - Quick Reference

## One-Line Summary
**Fix:** Account deletion now preserves `institution_name` by enriching Firebase data with local state before saving.

---

## The Problem
Deleting one account from a multi-account bank causes remaining accounts to lose their `institution_name` field in Firebase.

**Example:**
```
Before: "USAA CLASSIC CHECKING" ✅
After:  "Checking ••1783" ❌
```

---

## The Solution
**Key Change:** Enrich filtered accounts with local state data before saving to Firebase.

```javascript
// Before: Save filtered data directly
await updateDoc(settingsDocRef, {
  plaidAccounts: updatedPlaidAccounts  // ❌ May be missing fields
});

// After: Enrich then save
const enrichedPlaidAccounts = updatedPlaidAccounts.map(firebaseAcc => {
  const localAcc = plaidAccounts.find(acc => acc.account_id === firebaseAcc.account_id);
  return localAcc ? { ...firebaseAcc, ...localAcc } : firebaseAcc;
});

await updateDoc(settingsDocRef, {
  plaidAccounts: enrichedPlaidAccounts  // ✅ Complete data
});
```

---

## Files Changed
- **`frontend/src/pages/Accounts.jsx`** (lines 344-448)
  - Added data enrichment logic
  - Added validation and logging
  - Updated save logic

---

## Testing Quick Start

1. **Connect** bank with 2+ accounts
2. **Delete** one account
3. **Verify** remaining account shows bank name
4. **Refresh** page
5. **Verify** bank name still shows

**Expected console output:**
```
[DELETE] Starting account deletion: [account_id]
[DELETE] ✓ Account has institution_name: [account_id] [bank_name]
[DELETE] Account deletion completed successfully
```

---

## Lines Changed
- **Added:** 45 lines (enrichment, validation, logging)
- **Modified:** 10 lines (updated to use enriched data)
- **Total impact:** ~55 lines in one function

---

## Key Features

✅ Preserves `institution_name` on deletion
✅ Preserves all display fields (`institution_id`, `name`, `official_name`, `mask`)
✅ Validates data before saving
✅ Comprehensive logging for debugging
✅ Handles edge cases gracefully
✅ Backward compatible

---

## Rollback
If needed:
```bash
git revert 8f9c2f9
git push origin copilot/fix-bank-name-loss-on-deletion
```

---

## Related PRs
- PR #137 - Individual account deletion (introduced bug)
- PR #139 - Fix institution name preservation (this PR)

---

## Success Metrics
- ✅ Firebase preserves `institution_name` after deletion
- ✅ UI shows bank names after page refresh
- ✅ Works with multiple banks
- ✅ No console warnings about missing fields
