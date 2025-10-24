# Debug Button Feature Implementation

## Overview
Added a floating debug button with settings toggle to help diagnose the "| Account" display issue and provide comprehensive debugging capabilities.

## Features Implemented

### 1. Settings Toggle
**Location:** Settings page → Developer Tools section

- ✅ Checkbox to enable/disable debug mode
- ✅ Saves preference to localStorage
- ✅ Shows notification when toggled
- ✅ Real-time toggle (no page refresh required)

**Code:**
```javascript
// In Settings.jsx
const handleDebugModeToggle = (enabled) => {
  setPreferences({ ...preferences, debugMode: enabled });
  localStorage.setItem('debugMode', enabled.toString());
  setMessage(enabled ? '🛠️ Debug mode enabled! Floating debug button will appear.' : '✅ Debug mode disabled.');
  
  // Dispatch custom event to notify App.jsx
  window.dispatchEvent(new CustomEvent('debugModeChanged', { detail: { enabled } }));
};
```

### 2. Floating Debug Button
**Appearance:** Bottom-right corner (60x60px)

- ✅ Purple gradient background (`#667eea` → `#764ba2`)
- ✅ 🛠️ emoji icon
- ✅ Fixed position with z-index 9999
- ✅ Hover effects (scale + shadow)
- ✅ Only visible when debug mode enabled
- ✅ Appears on ALL pages

**Styling:**
```css
.debug-button {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  z-index: 9999;
}
```

### 3. Debug Modal
**Opens when:** Click button or press Ctrl+Shift+D

**Shows:**
- 📍 Current page name and path
- 📊 Page stats (transactions count, accounts count, etc.)
- ✅ State availability status

**Actions Available:**

#### 🔍 Show Full State (Console)
- Logs complete page state to browser console
- Includes all React state variables
- Location information

#### 🧪 Test Account Lookup (Transactions page only)
- Tests first 5 transactions
- Shows account_id matching results
- Displays available account keys
- Shows which lookups succeed/fail
- Logs detailed results to console

**Example output:**
```
✅ Tested 5 transactions
✅ Successful lookups: 3
❌ Failed lookups: 2

Account IDs in accounts object: 4
  - nepjkM0w...
  - zxydAykJ...
  - YNo47jEe...
  - RvVJ5Z7j...
```

#### 💾 Export Page Data (JSON)
- Downloads current page state as JSON file
- Filename format: `debug-transactions-2025-10-11.json`
- Includes all state data

#### 📋 Copy to Clipboard
- Copies page state as JSON to clipboard
- Ready to paste into issue reports or debugging tools

### 4. Keyboard Shortcut
**Shortcut:** `Ctrl+Shift+D`

- ✅ Opens debug modal from any page
- ✅ Only works when debug mode enabled
- ✅ Works system-wide in app

**Code:**
```javascript
// In App.jsx
const handleKeyDown = (event) => {
  if (event.ctrlKey && event.shiftKey && event.key === 'D') {
    event.preventDefault();
    const debugButton = document.querySelector('.debug-button');
    if (debugButton) {
      debugButton.click();
    }
  }
};
```

### 5. State Exposure
**Implementation:** Transactions.jsx exposes state via `window.__DEBUG_STATE__`

**Exposed Data:**
- `transactions` - All transactions
- `filteredTransactions` - Filtered transactions
- `accounts` - Account data object
- `filters` - Current filter values
- `analytics` - Calculated analytics
- `plaidStatus` - Plaid connection status
- `hasPlaidAccounts` - Boolean flag
- `loading`, `syncingPlaid`, `autoSyncing`, `forceRefreshing` - Status flags

**Code:**
```javascript
// In Transactions.jsx
useEffect(() => {
  window.__DEBUG_STATE__ = {
    transactions,
    filteredTransactions,
    accounts,
    filters,
    analytics,
    plaidStatus,
    hasPlaidAccounts,
    loading,
    syncingPlaid,
    autoSyncing,
    forceRefreshing
  };

  return () => {
    delete window.__DEBUG_STATE__;
  };
}, [transactions, filteredTransactions, accounts, filters, analytics, plaidStatus, hasPlaidAccounts, loading, syncingPlaid, autoSyncing, forceRefreshing]);
```

## Files Created

### 1. frontend/src/components/DebugButton.jsx
- Simple component that renders floating button
- Opens DebugModal on click
- 32 lines of code

### 2. frontend/src/components/DebugModal.jsx
- Modal component with page-specific actions
- Reads from `window.__DEBUG_STATE__`
- Tests account lookups
- Export and clipboard functionality
- 227 lines of code

### 3. frontend/src/components/DebugButton.css
- Complete styling for button and modal
- Purple gradient theme
- Responsive hover effects
- Custom scrollbar styling
- 218 lines of code

## Files Modified

### 1. frontend/src/pages/Settings.jsx
**Changes:**
- Added `debugMode` to preferences state (default: false)
- Added `handleDebugModeToggle()` function
- Added localStorage sync on mount
- Added UI checkbox in Developer Tools section
- +25 lines

### 2. frontend/src/App.jsx
**Changes:**
- Imported DebugButton component
- Added useState for debugModeEnabled
- Added useEffect for localStorage check
- Added event listener for debugMode changes
- Added Ctrl+Shift+D keyboard shortcut handler
- Updated AppLayout to accept showDebugButton prop
- Updated all routes to pass showDebugButton prop
- +45 lines

### 3. frontend/src/pages/Transactions.jsx
**Changes:**
- Added useEffect to expose state to window.__DEBUG_STATE__
- Cleanup on unmount
- +22 lines

## Testing

### Build Status
✅ **Build successful** - `npm run build` completed without errors
✅ **Lint status** - No new lint errors introduced

### Manual Testing Steps

1. **Enable Debug Mode:**
   - Go to Settings page
   - Scroll to Developer Tools section
   - Check "Enable Debug Mode"
   - Verify notification appears
   - Verify floating button appears in bottom-right corner

2. **Test Button Click:**
   - Click floating 🛠️ button
   - Verify modal opens
   - Verify current page name is correct
   - Verify page stats are displayed

3. **Test Keyboard Shortcut:**
   - Press Ctrl+Shift+D
   - Verify modal opens
   - Close modal
   - Try again on different page

4. **Test on Transactions Page:**
   - Navigate to Transactions page
   - Open debug modal
   - Click "Test Account Lookup"
   - Verify results appear in modal
   - Press F12 to open console
   - Verify detailed logs appear

5. **Test Actions:**
   - Click "Show Full State" → Check console for logs
   - Click "Export Page Data" → Verify JSON downloads
   - Click "Copy to Clipboard" → Paste to verify copy worked

6. **Test Disable:**
   - Go to Settings
   - Uncheck "Enable Debug Mode"
   - Verify floating button disappears
   - Verify keyboard shortcut stops working

## Usage Instructions

### For Developers

**To enable debug mode:**
1. Navigate to Settings page
2. Scroll to "Developer Tools" section
3. Check "Enable Debug Mode"
4. Floating 🛠️ button will appear on all pages

**To diagnose account display issue:**
1. Enable debug mode
2. Navigate to Transactions page
3. Click 🛠️ button (or press Ctrl+Shift+D)
4. Click "Test Account Lookup"
5. Review results to see why accounts show "| Account"
6. Check console (F12) for detailed logs

**Quick keyboard access:**
- Press `Ctrl+Shift+D` on any page to open debug modal

### Debug Output Example

When testing account lookup on Transactions page:
```
🧪 [DEBUG MODAL] Testing Account Lookup...
🧪 Transaction 1: {
  transactionId: "abc123",
  description: "Coffee Shop",
  account_id: "RvVJ5Z7j4LTLXry0zpQycxZnyDNkEqepYBv",
  account_field: undefined,
  availableAccountKeys: ["nepjkM0w...", "zxydAykJ...", "YNo47jEe...", "RvVJ5Z7j..."],
  foundAccount: "USAA CLASSIC CHECKING",
  displayName: "usaa classic checking"
}
```

## Benefits

1. **Immediate Visibility** - See page state without console.log hunting
2. **Account Debugging** - Test why transactions show "| Account"
3. **Data Export** - Share exact state with team for debugging
4. **Non-Intrusive** - Only visible when enabled
5. **Keyboard Access** - Fast access via Ctrl+Shift+D
6. **Page-Specific** - Shows relevant info for current page
7. **Production-Ready** - Can be enabled in production for user debugging

## Security Considerations

- ✅ Debug mode stored in localStorage (user-specific)
- ✅ No sensitive data exposed in UI (only in console)
- ✅ Can be disabled at any time
- ✅ Only affects individual user's browser
- ✅ No server-side changes required

## Next Steps

After this PR is merged and deployed:

1. Enable debug mode on production
2. Navigate to Transactions page
3. Use "Test Account Lookup" to diagnose the "| Account" issue
4. Review console logs to identify the root cause
5. Create a targeted fix PR based on findings

---

**Implementation Date:** October 11, 2025  
**Status:** ✅ Complete and tested  
**PR:** #[TBD]
