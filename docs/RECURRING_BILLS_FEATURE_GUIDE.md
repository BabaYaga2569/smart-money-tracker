# Recurring Bills Workflow - Feature Guide

## 1. Bulk Delete with Undo

### Delete All Button
Located in the action buttons area, next to "Import from CSV" and "Add Recurring Item":
- Only visible when there are recurring items
- Red background (#f44336) for clear warning
- Shows trash icon (🗑️) with "Delete All" text

### Confirmation Modal
When clicking "Delete All":
- Modal displays with warning icon (⚠️)
- Shows count of items to be deleted
- Clear warning message about permanent deletion
- Reassurance about undo capability
- Two options:
  - "Cancel" (gray) - Close without deleting
  - "Delete All" (red) - Confirm deletion

### Undo Button
After deletion:
- Appears in the action buttons area
- Orange background (#ff9800) with pulsing animation
- Shows reverse arrow icon (↩️) with "Undo Delete" text
- Clicking restores all deleted items
- Button remains until next import or page refresh

## 2. CSV Import Error Handling

### Error Detection
When CSV contains errors:
- Errors are displayed in a warning box at top of preview
- Shows error icon (⚠️) with count
- Lists up to 5 errors with row numbers
- Indicates if more errors exist
- Orange background for visibility

### Error Actions
- **Clear Errors button**: Removes all bad rows and allows continuation
- **Continue button**: Disabled (grayed out) while errors exist
- Error message: "⚠️ You must fix or clear these errors before continuing."

### Valid Data Flow
Once errors are cleared:
- Continue button becomes enabled (green)
- All valid items remain in preview
- User can proceed with import

## 3. Enhanced Preview Controls

### Bulk Actions Bar
Located at top of preview items list:
- Green background section
- Two main buttons:
  1. **✓ Approve All**: Quickly approve all items (disabled if errors exist)
  2. **✕ Skip All**: Skip all items in preview

### Item Status Badges
Each item in preview shows a status badge next to its name:
- **"New"** (green #00ff88): Item will be imported as new
- **"Will Merge"** (orange #ff9800): Item will merge with existing (≥90% match)
- **"Potential Duplicate"** (yellow #ffeb3b): Possible duplicate, user decides

### Individual Item Controls
For each item:
- Type selector (Expense/Income)
- Category dropdown
- Remove button (✕) to exclude from import

## 4. Duplicate Resolution

### Smart Defaults
- Items with ≥90% similarity: Default to "Merge"
- Items with <90% similarity: Default to "Keep Both"

### Conflicts Screen
Shows detailed comparison:
- Similarity percentage badge
- Confidence level
- Side-by-side comparison of existing vs new item
- Match reasons explanation

### Bulk Resolution Actions
Located at top of conflicts screen:
- **🔀 Merge All**: Merge all duplicates with existing items
- **⏭️ Skip All**: Skip all new items, keep existing only
- **➕ Keep All Separate**: Import all as separate items

### Individual Resolution
For each conflict, user can choose:
- Merge items (updates existing with new data)
- Skip import (keeps existing, ignores new)
- Keep both separately (imports as new item)

Recommended actions are marked with ⭐

## 5. Counter Sync

### Where Counters Appear
- Main header: "Recurring Items (X)"
- Filters show filtered count
- Import modal shows count

### When Counters Update
Counter updates **immediately** after:
- Adding a new item
- Editing an item
- Deleting a single item
- Bulk deleting all items
- Undoing bulk delete
- Importing from CSV
- Merging duplicates
- Migrating from settings

### Visual Feedback
- Counter changes are instant
- No refresh required
- Works with all filters applied

## Button Reference

### Action Buttons Locations
Right side of recurring controls:
1. **Undo Delete** (orange, pulsing) - Only after bulk delete
2. **Delete All** (red) - Only when items exist
3. **Import from CSV** (blue)
4. **Add Recurring Item** (green)

### Preview Bulk Actions
Top of preview screen:
1. **Approve All** (green)
2. **Skip All** (orange)

### Conflict Bulk Actions
Top of conflicts screen:
1. **Merge All** (green)
2. **Skip All** (orange)
3. **Keep All Separate** (blue)

## Color Coding Guide

### Button Colors:
- **Green (#00ff88)**: Positive actions (Add, Approve, Merge)
- **Blue (#007acc)**: Info actions (Import, Keep)
- **Orange (#ff9800)**: Warning actions (Undo, Skip)
- **Red (#f44336)**: Destructive actions (Delete)

### Status Colors:
- **Green (#00ff88)**: New items
- **Orange (#ff9800)**: Will merge
- **Yellow (#ffeb3b)**: Potential duplicate
- **Red (#ff6b6b)**: Errors

## Best Practices

### Before Bulk Delete:
1. Review your items list
2. Consider exporting to CSV as backup
3. Check if you really want to delete all
4. Remember you can undo immediately after

### During CSV Import:
1. Fix or clear all errors before continuing
2. Review item status badges in preview
3. Use bulk actions for efficiency
4. Resolve duplicates based on recommendations
5. Verify final count before completing

### After Operations:
- Verify counter shows correct count
- Check that filters still work
- Confirm items appear as expected
- Use search to verify specific items

## Keyboard Shortcuts

None currently implemented, but future enhancement could include:
- Ctrl+A: Select all in preview
- Delete: Remove selected items
- Escape: Close modals
- Enter: Confirm actions
