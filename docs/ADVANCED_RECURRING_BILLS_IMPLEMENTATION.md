# Advanced Recurring Bill Options - Implementation Summary

## Overview
This feature allows users to create recurring bills that are only active in specific months, addressing use cases like seasonal subscriptions or sports season tickets.

## Key Features

### 1. Custom Month Selection
- **Location**: Recurring page → Add/Edit recurring item modal
- **Trigger**: Checkbox "Custom monthly recurrence (select specific months)"
- **UI**: Grid of 12 month checkboxes (Jan-Dec)
- **Storage**: Array of month indexes (0-11) in `activeMonths` field

### 2. Bill Generation Logic
- **File**: `frontend/src/utils/RecurringBillManager.js`
- **Function**: `generateBillsFromTemplate()`
- **Behavior**: 
  - Checks if bill due date's month is in `activeMonths` array
  - Only creates bills for active months
  - Backward compatible (no `activeMonths` = all months)

### 3. Skip/Unskip Individual Bills
- **Location**: Bills page → Individual bill actions
- **Button**: "⏭️ Skip Month" / "↩️ Unskip"
- **Status**: Bills marked as `status: 'skipped'`
- **Behavior**: Skipped bills excluded from metrics and overdue calculations

### 4. Visual Indicators
- **Recurring List**: Badge showing "📅 Xmo" with tooltip of active months
- **Bills List**: Skipped bills show "⏭️ SKIPPED" status
- **Styling**: Purple theme for custom recurrence elements

## Data Structure

### Recurring Template with Custom Months
```javascript
{
  id: "recurring-123",
  name: "LA Rams Season Tickets",
  amount: 500,
  frequency: "monthly",
  nextOccurrence: "2025-11-01",
  customRecurrence: true,
  activeMonths: [10, 11, 0, 1, 2, 3, 4, 5, 6, 7], // Nov-Aug (indexes)
  // ... other fields
}
```

### Bill Instance (Generated)
```javascript
{
  id: "bill-456",
  name: "LA Rams Season Tickets",
  amount: 500,
  dueDate: "2025-11-15",
  status: "pending", // or "skipped", "paid"
  recurringTemplateId: "recurring-123",
  // ... other fields
}
```

## Month Index Reference
```
0  = January    6  = July
1  = February   7  = August
2  = March      8  = September
3  = April      9  = October
4  = May        10 = November
5  = June       11 = December
```

## Use Cases

### Example 1: Sports Season Tickets (Nov-Aug)
- Active: November through August (10 months)
- Inactive: September, October
- `activeMonths: [10, 11, 0, 1, 2, 3, 4, 5, 6, 7]`

### Example 2: Summer Program (Jun-Aug)
- Active: June through August (3 months)
- Inactive: Sep-May
- `activeMonths: [5, 6, 7]`

### Example 3: Quarterly but Skip December
- Active: Jan, Apr, Jul, Oct (4 months)
- Inactive: All other months
- `activeMonths: [0, 3, 6, 9]`

## Testing

### Test File
- `frontend/src/utils/CustomRecurrence.test.js`

### Test Coverage
1. ✅ Bills only generated in active months
2. ✅ Bills without activeMonths generate for all months
3. ✅ Empty activeMonths treated as no restriction
4. ✅ Consecutive months work correctly
5. ✅ Non-consecutive months work correctly
6. ✅ Year boundary handling (e.g., Nov-Feb)

### Running Tests
```bash
cd frontend/src/utils
NODE_ENV=test node --input-type=module -e "import { runCustomRecurrenceTests } from './CustomRecurrence.test.js'; runCustomRecurrenceTests();"
```

## API Changes

### RecurringBillManager
- **Modified**: `generateBillsFromTemplate(recurringTemplate, monthsAhead, generateBillId)`
  - Now checks `recurringTemplate.activeMonths` array
  - Filters out bills in inactive months
  - Backward compatible with existing templates

### Bills Page
- **Added**: `handleToggleSkipBill(bill)` - Toggle bill skip status
- **Modified**: `determineBillStatus(bill)` - Handles 'skipped' status
- **Modified**: `getStatusDisplayText(bill)` - Shows "⏭️ SKIPPED" text
- **Modified**: Metrics calculations exclude skipped bills

## UI/UX Details

### Custom Recurrence Form
- Checkbox must be enabled for monthly frequency only
- Month selector appears when checkbox is checked
- Selected months have purple border and background
- Active count shows at bottom: "✓ Active in X month(s)"
- Validation: At least one month must be selected

### Bills Page Actions
- Skip button only visible for recurring bills (`recurringTemplateId` present)
- Skip button hidden if bill is already paid
- Button color: Purple for skip, Green for unskip
- Tooltip explains the action

### Recurring Items List
- Badge appears next to frequency if `activeMonths` exists
- Badge format: "📅 Xmo" (e.g., "📅 10mo")
- Hover tooltip shows: "Active in: Jan, Feb, Mar, ..."

## Validation Rules

1. Custom recurrence only available for monthly frequency
2. At least one month must be selected when custom recurrence enabled
3. `activeMonths` array values must be 0-11
4. Cannot skip a bill that's already paid
5. Skipped bills don't generate overdue notifications

## Backward Compatibility

- Existing recurring items without `activeMonths` work unchanged
- All standard frequencies (weekly, bi-weekly, quarterly, annually) unaffected
- Bill matching and payment workflows unchanged
- No database migrations required (fields are optional)

## Performance Considerations

- Month filtering happens during bill generation (one-time cost)
- No impact on bill list rendering
- Minimal storage overhead (small array of integers)
- Tests complete in < 1 second

## Future Enhancements

Potential future improvements (not in scope):
- Day-of-month customization (e.g., 15th of active months only)
- Holiday exclusions
- Custom date ranges instead of full months
- Bulk skip operations
- Skip history tracking

## Troubleshooting

### Bills not generating for selected months
- Check `activeMonths` array contains correct month indexes (0-11, not 1-12)
- Verify `customRecurrence` is true
- Ensure frequency is set to "monthly"
- Check `nextOccurrence` date is in an active month

### Skip button not appearing
- Verify bill has `recurringTemplateId` field
- Check bill status is not 'paid'
- Ensure bill is not already skipped (button should show "Unskip")

### Month badge not showing
- Verify `activeMonths` array exists and has length > 0
- Check item frequency is "monthly"
- Ensure `customRecurrence` flag is true

## Code Locations

### Core Logic
- `frontend/src/utils/RecurringBillManager.js` (lines 349-411)
- Month filtering in `generateBillsFromTemplate()`

### UI Components
- `frontend/src/pages/Recurring.jsx` (lines 1240-1313)
- Month selector grid with checkboxes

### Skip Functionality
- `frontend/src/pages/Bills.jsx` (lines 830-854)
- `handleToggleSkipBill()` function

### Tests
- `frontend/src/utils/CustomRecurrence.test.js`
- 6 comprehensive test cases

## Summary

This implementation provides flexible recurring bill management with month-specific control, maintaining backward compatibility while adding powerful new capabilities for seasonal or irregular billing patterns. All acceptance criteria have been met, tests pass, and the feature is production-ready.
