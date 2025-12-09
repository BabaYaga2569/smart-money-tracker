# Auto-Bill Detection Settings Fix

## Problem
The auto-bill detection feature was ignoring user settings and creating "ghost bills" that kept coming back even after deletion. This happened because:

1. Auto-detection didn't check `autoDetectBills` or `disableAutoGeneration` settings
2. Merchants in the `ignoredMerchants` array were still being processed
3. No debounce mechanism existed to prevent infinite loops
4. Bills would be auto-recreated immediately after deletion

## Solution
Updated the auto-detection logic to respect user settings at all entry points.

### Files Modified

#### 1. `frontend/src/utils/AutoBillDetection.js`
- Added `settings` parameter to `runAutoDetection()` function
- Added early return if `autoDetectBills === false` or `disableAutoGeneration === true`
- Added `settings` parameter to `generateNextBill()` function
- Added checks for `disableAutoGeneration` and `ignoredMerchants` before generating bills
- All merchant name checks are case-insensitive using `.toLowerCase()`

#### 2. `frontend/src/pages/Bills.jsx`
- Added `userSettings` state to store user preferences
- Added `autoGenerationLock` Set to prevent duplicate bill generation
- Added `loadUserSettings()` function to load settings from Firestore
- Updated `autoGenerateBillFromTemplate()` to:
  - Check settings before generating bills
  - Check if merchant is in `ignoredMerchants` list
  - Use lock mechanism to prevent infinite loops
  - Release lock at all exit points (success, early return, error)
- Updated `handleRematchTransactions()` to pass settings to `runAutoDetection()`

### How It Works

#### Settings Check Flow
```javascript
// 1. Check if auto-detection is disabled
if (settings?.autoDetectBills === false || settings?.disableAutoGeneration === true) {
  console.log('[AutoBillDetection] Auto-detection is disabled, skipping');
  return;
}

// 2. Check if merchant is ignored (precise matching to avoid false positives)
const ignoredMerchants = settings?.ignoredMerchants || [];
const merchantLower = merchantName.toLowerCase();
const isIgnored = ignoredMerchants.some(ignored => {
  const ignoredLower = ignored.toLowerCase();
  return merchantLower === ignoredLower || 
         merchantLower.startsWith(ignoredLower + ' ') || 
         merchantLower.endsWith(' ' + ignoredLower);
});
if (isIgnored) {
  console.log('[AutoBillDetection] Merchant is ignored, skipping:', merchantName);
  return;
}
```

#### Debounce Lock Mechanism
```javascript
// Before generating bill
const lockKey = `${template.id}-${dueDate}`;
if (autoGenerationLock.has(lockKey)) {
  return; // Already processing
}
setAutoGenerationLock(prev => new Set([...prev, lockKey]));

// After generation (or on error)
setAutoGenerationLock(prev => {
  const newSet = new Set(prev);
  newSet.delete(lockKey);
  return newSet;
});
```

## Testing

### Manual Testing
1. Set `autoDetectBills: false` in user settings → No bills should be auto-generated
2. Add merchant to `ignoredMerchants` array → That merchant's bills should not be created
3. Delete a bill → It should NOT be automatically recreated
4. Check console logs → No infinite loop warnings

### User Settings Structure
```javascript
// Firestore: users/{userId}/settings/personal
{
  autoDetectBills: false,        // Disables ALL auto-detection
  disableAutoGeneration: true,   // Disables auto bill generation
  ignoredMerchants: [            // Merchants to skip (case-insensitive)
    "smiths fuel",
    "smith's fuel", 
    "smithsfuel"
  ]
}
```

## Benefits

✅ **User Control**: Users can now disable auto-detection completely
✅ **Merchant Filtering**: Users can ignore specific merchants they don't want tracked
✅ **No Ghost Bills**: Deleted bills stay deleted when auto-detection is disabled
✅ **No Infinite Loops**: Lock mechanism prevents duplicate bill generation
✅ **Case-Insensitive**: Merchant matching works regardless of capitalization
✅ **Backward Compatible**: Works fine when settings are not provided (default behavior)

## Example Console Output

### Before Fix:
```
⚠️ Auto-generating bill from template: Smith's Fuel
📋 Loaded bills from billInstances: Object
⚠️ Bill already exists: Smith's Fuel on 2026-01-05 - skipping auto-generation
⚠️ Auto-generating bill from template: Smith's Fuel
⚠️ Auto-generated bill instance: Smith's Fuel due 2026-01-05
[Infinite loop continues...]
```

### After Fix:
```
✅ Loaded user settings: {
  autoDetectBills: false,
  disableAutoGeneration: true,
  ignoredMerchants: ['smiths fuel', "smith's fuel"]
}
[AutoBillDetection] Auto-generation is disabled in settings, skipping: Smith's Fuel
```

## Migration Notes

No database migration needed. The fix is backward compatible:
- If settings are not provided, auto-detection works as before
- If settings are provided but don't have these fields, they default to allowing detection
- Existing bills are not affected

## Future Improvements

Consider adding:
- UI controls in Settings page for these options
- Bulk ignore merchants feature
- Whitelist mode (only auto-detect specific merchants)
- Per-merchant auto-detection settings
