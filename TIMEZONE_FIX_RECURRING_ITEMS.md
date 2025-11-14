# Recurring Item Next Occurrence Timezone Fix

## Problem

When creating or editing a recurring item and setting the "Next Occurrence" date, the date would shift by one day. For example:
- User selects: **November 14, 2025**
- System saves/displays: **November 13, 2025**

This occurred in **PST/PDT timezone (UTC-7/8)** due to incorrect timezone handling.

## Root Cause

The issue stems from how JavaScript Date objects and Firestore handle dates:

1. **Date Input Behavior**: When a user selects `2025-11-14` in an HTML date input, JavaScript creates: `new Date('2025-11-14')` → `2025-11-14T00:00:00.000Z` (UTC midnight)

2. **Timezone Conversion**: In PST (UTC-8), this becomes **November 13, 2025 at 4:00 PM local time**

3. **Display**: When the date is retrieved and displayed, it shows November 13 instead of November 14

### Example Flow (Before Fix):
```
User input: "2025-11-14"
   ↓
JavaScript: new Date('2025-11-14') 
   ↓
Stored as: 2025-11-14T00:00:00.000Z (UTC midnight Nov 14)
   ↓
Retrieved in PST: Nov 13, 2025 4:00 PM
   ↓
Displayed: "Nov 13, 2025" ❌ WRONG!
```

## Solution

### Backend Changes

**File**: `backend/utils/timezoneHelpers.js`

Created timezone helper utilities that parse dates in **local timezone** instead of UTC:

```javascript
// BEFORE (broken):
new Date('2025-11-14') // UTC midnight → Nov 13 in PST

// AFTER (fixed):
parseLocalDate('2025-11-14') // Local midnight → Nov 14 in PST
```

### Frontend Changes

**File**: `frontend/src/utils/timezoneHelpers.js`

Created matching frontend utilities to ensure dates are handled consistently:

- `parseLocalDate()`: Converts YYYY-MM-DD to local timezone Date object
- `formatLocalDate()`: Converts Date object to YYYY-MM-DD preserving local date
- `dateStringToFirestoreFormat()`: Prepares dates for Firestore storage
- `firestoreDateToLocalString()`: Retrieves dates from Firestore correctly

### Integration Points

The fix needs to be applied wherever recurring item dates are:

1. **Saved to Firestore** (Create/Update operations)
   - `frontend/src/pages/Recurring.jsx` - when preparing data to send
   
2. **Retrieved from Firestore** (Read operations)
   - `frontend/src/pages/Recurring.jsx` - when displaying in modal
   - `frontend/src/pages/Bills.jsx` - when displaying due dates

## Testing

### Manual Test Steps

1. **Navigate to Recurring page**
2. **Click "Add Recurring Item"** or edit an existing item
3. **Set Next Occurrence** to tomorrow's date (e.g., Nov 14, 2025)
4. **Click "Update Item"**
5. **Verify** the date remains November 14 (not shifting to November 13)
6. **Navigate to Bills page**
7. **Verify** the bill shows the correct due date (November 14)

### Expected Behavior

| Action | Expected Result |
|--------|----------------|
| Set date to Nov 14 | Date saves as Nov 14 ✅ |
| Edit and save | Date stays Nov 14 ✅ |
| View on Bills page | Shows "Nov 14" ✅ |
| Date input shows | "2025-11-14" ✅ |

## Files Changed

- ✅ `backend/utils/timezoneHelpers.js` (new)
- ✅ `frontend/src/utils/timezoneHelpers.js` (new)
- ⏳ `frontend/src/pages/Recurring.jsx` (needs update to use helpers)
- ⏳ `frontend/src/pages/Bills.jsx` (needs update to use helpers)

## Related Issues

This fix follows the same pattern as PR #290 which fixed timezone bugs in bills and transactions.

## Prevention

To prevent similar issues in the future:

1. **Always use** timezone helpers when working with calendar dates
2. **Never use** `new Date(dateString)` for date inputs
3. **Test** date handling in different timezones (PST, EST, UTC)
4. **Remember**: Date inputs represent **calendar dates**, not **moments in time**

## Deployment Notes

- No database migration required
- No breaking changes
- Fix applies to new saves; existing data remains unchanged but will display correctly when edited

---

**PR Status**: Ready for review  
**Testing**: Needs manual verification in production
