# Integration Guide: Recurring Items Timezone Fix

## Overview

This guide shows how to integrate the timezone helpers into the Recurring.jsx component to fix the next occurrence date bug.

## Step 1: Import Timezone Helpers

Add this import at the top of `frontend/src/pages/Recurring.jsx`:

```javascript
import { 
  parseLocalDate, 
  formatLocalDate,
  dateStringToFirestoreFormat,
  firestoreDateToLocalString
} from '../utils/timezoneHelpers';
```

## Step 2: Fix Date Input Handling

### When Reading from Firestore

Replace any code that reads `nextOccurrence` from Firestore with:

```javascript
// BEFORE (broken):
const nextOccurrence = recurringItem.nextOccurrence;

// AFTER (fixed):
const nextOccurrence = firestoreDateToLocalString(recurringItem.nextOccurrence);
```

### When Preparing Data for Firestore

Replace any code that prepares `nextOccurrence` to save with:

```javascript
// BEFORE (broken):
const dataToSave = {
  ...formData,
  nextOccurrence: formData.nextOccurrence // Causes timezone bug!
};

// AFTER (fixed):
const dataToSave = {
  ...formData,
  nextOccurrence: dateStringToFirestoreFormat(formData.nextOccurrence)
};
```

## Step 3: Fix Date Input Value

In the modal where the date input is rendered, ensure the value is formatted correctly:

```javascript
// Date input in modal
<input
  type="date"
  value={formatLocalDate(new Date(editingItem.nextOccurrence))}
  onChange={(e) => setEditingItem({
    ...editingItem,
    nextOccurrence: e.target.value  // Already in YYYY-MM-DD format
  })}
/>
```

## Example: Complete Fix for Save Function

```javascript
const handleSaveRecurringItem = async () => {
  try {
    const recurringItemData = {
      name: editingItem.name,
      type: editingItem.type,
      amount: parseFloat(editingItem.amount),
      category: editingItem.category,
      frequency: editingItem.frequency,
      // FIX: Use timezone helper to prevent date shift
      nextOccurrence: dateStringToFirestoreFormat(editingItem.nextOccurrence),
      customMonths: editingItem.customMonths || [],
      account: editingItem.account || null,
      description: editingItem.description || '',
      autopay: editingItem.autopay || false,
      status: editingItem.status || 'active',
      updatedAt: new Date()
    };

    // Save to Firestore
    if (editingItem.id) {
      // Update existing
      await updateDoc(doc(db, `users/${user.uid}/recurring`, editingItem.id), recurringItemData);
    } else {
      // Create new
      await addDoc(collection(db, `users/${user.uid}/recurring`), {
        ...recurringItemData,
        createdAt: new Date()
      });
    }

    toast.success('Recurring item saved successfully!');
    setShowEditModal(false);
    loadRecurringItems(); // Refresh list
  } catch (error) {
    console.error('Error saving recurring item:', error);
    toast.error('Failed to save recurring item');
  }
};
```

## Example: Complete Fix for Load Function

```javascript
const loadRecurringItems = async () => {
  try {
    const recurringRef = collection(db, `users/${user.uid}/recurring`);
    const recurringSnapshot = await getDocs(recurringRef);
    
    const items = recurringSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        // FIX: Convert Firestore date to local string
        nextOccurrence: firestoreDateToLocalString(data.nextOccurrence),
        // Ensure other dates are also properly formatted
        createdAt: data.createdAt?.toDate?.(),
        updatedAt: data.updatedAt?.toDate?.()
      };
    });

    setRecurringItems(items);
  } catch (error) {
    console.error('Error loading recurring items:', error);
    toast.error('Failed to load recurring items');
  }
};
```

## Critical Points

1. **Always use helpers** when:
   - Reading dates from Firestore
   - Saving dates to Firestore
   - Initializing date input values

2. **Never use** `new Date(dateString)` for date inputs - it causes the timezone bug

3. **Test in your timezone** - The bug only appears in timezones with negative UTC offsets (PST, EST, etc.)

## Testing Checklist

After applying the fix:

- [ ] Create new recurring item with tomorrow's date → Saves correctly
- [ ] Edit existing recurring item date → Updates correctly
- [ ] Date displayed in modal matches what you selected
- [ ] Date displayed in Bills page matches what you set
- [ ] Date doesn't shift when page is refreshed
- [ ] Works correctly in both PST and EST timezones

## Files to Update

1. `frontend/src/pages/Recurring.jsx`
   - Import timezone helpers
   - Update `handleSaveRecurringItem` function
   - Update `loadRecurringItems` function
   - Update date input value binding

2. `frontend/src/pages/Bills.jsx`
   - Import timezone helpers
   - Update date display for bills generated from recurring items
   - Use `firestoreDateToLocalString` when showing due dates

## Additional Notes

- The fix is **non-breaking** - existing data continues to work
- Dates saved after the fix will be correctly timezone-adjusted
- No database migration needed
- Compatible with all timezone PRs (like #290)
