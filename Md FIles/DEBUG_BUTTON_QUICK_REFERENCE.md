# Debug Button - Quick Reference

## 🚀 Quick Start

### Enable Debug Mode
1. Go to **Settings** page
2. Scroll to **Developer Tools** section  
3. Check ✅ **Enable Debug Mode**
4. Done! 🛠️ button appears in bottom-right corner

### Disable Debug Mode
1. Go to **Settings** page
2. Uncheck **Enable Debug Mode**
3. Button disappears immediately

---

## ⌨️ Keyboard Shortcut

**Press:** `Ctrl+Shift+D`  
**Result:** Opens debug modal instantly (from any page)

---

## 🛠️ Debug Modal Actions

### 1. 🔍 Show Full State
- Logs complete page state to browser console
- Press **F12** to view console output

### 2. 🧪 Test Account Lookup
- **Only on Transactions page**
- Tests why transactions show "| Account" instead of bank names
- Shows detailed matching results
- Logs to console with emoji prefixes

### 3. 💾 Export Page Data
- Downloads page state as JSON file
- Format: `debug-transactions-2025-10-11.json`
- Share with team for debugging

### 4. 📋 Copy to Clipboard
- Copies page state as JSON
- Ready to paste into issue reports

---

## 📊 What Gets Logged

### On Transactions Page:
- `transactions` - All transactions loaded
- `filteredTransactions` - After applying filters
- `accounts` - Account data with IDs as keys
- `filters` - Current search/filter state
- `analytics` - Income/expense breakdown
- `plaidStatus` - Connection status
- `loading`, `syncing` flags

---

## 🧪 Testing Account Lookup

When you click "Test Account Lookup" on Transactions page:

**You'll see:**
```
✅ Tested 5 transactions
✅ Successful lookups: 3
❌ Failed lookups: 2

Account IDs in accounts object: 4
  - nepjkM0w...
  - zxydAykJ...
  - YNo47jEe...
  - RvVJ5Z7j...

See console (F12) for detailed results.
```

**Console shows per-transaction:**
```javascript
🧪 Transaction 1: {
  transactionId: "abc123",
  description: "Coffee Shop",
  account_id: "RvVJ5Z7j...",
  availableAccountKeys: ["nepjkM0w...", "zxydAykJ..."],
  foundAccount: "USAA CLASSIC CHECKING",  // null if failed
  displayName: "usaa classic checking"
}
```

---

## 🎯 Common Use Cases

### Diagnose "| Account" Issue
1. Enable debug mode
2. Go to Transactions page
3. Press `Ctrl+Shift+D`
4. Click "Test Account Lookup"
5. Check if `foundAccount` is `null`
6. Compare `account_id` vs `availableAccountKeys`

### Export Data for Bug Report
1. Open debug modal on affected page
2. Click "Export Page Data"
3. Attach JSON file to GitHub issue

### Quick State Inspection
1. Press `Ctrl+Shift+D`
2. View page stats in modal
3. Click "Show Full State"
4. Inspect in console (F12)

---

## 🎨 Visual Appearance

**Floating Button:**
- **Size:** 60x60px circle
- **Position:** Bottom-right corner (20px from edges)
- **Color:** Purple gradient (#667eea → #764ba2)
- **Icon:** 🛠️ emoji
- **Hover:** Scales up + glowing shadow

**Debug Modal:**
- **Size:** Max 800px wide, 80vh tall
- **Background:** Dark theme (#1a1a2e)
- **Accent:** Purple borders and buttons
- **Scrollable:** If content overflows

---

## 💡 Tips

- **Always check console** - Most detailed info is logged there
- **Test on real data** - Use production/staging to see actual issues
- **Export before changes** - Save state for comparison
- **Keyboard shortcut** - Fastest way to access modal
- **Page-specific** - Modal shows different info per page

---

## 🔒 Privacy & Security

✅ **Local only** - Debug mode stored in your browser  
✅ **No server** - Nothing sent to backend  
✅ **User-specific** - Doesn't affect other users  
✅ **Removable** - Disable anytime in Settings  
✅ **Production-safe** - Can use in production

---

## 📁 Files Added

- `frontend/src/components/DebugButton.jsx`
- `frontend/src/components/DebugModal.jsx`
- `frontend/src/components/DebugButton.css`

## 📝 Files Modified

- `frontend/src/App.jsx` - Added button + keyboard shortcut
- `frontend/src/pages/Settings.jsx` - Added toggle
- `frontend/src/pages/Transactions.jsx` - Exposed state

---

## ❓ Troubleshooting

**Button doesn't appear:**
- Check Settings → Developer Tools → Enable Debug Mode
- Refresh page after enabling
- Check console for errors

**Keyboard shortcut doesn't work:**
- Ensure debug mode is enabled
- Try clicking button manually first
- Check browser console for errors

**"No state available" in modal:**
- Check if page component exposes `window.__DEBUG_STATE__`
- Currently only Transactions page has full state
- Other pages will be added incrementally

**Test Account Lookup not appearing:**
- This action only shows on Transactions page
- Navigate to `/transactions` to see it

---

## 🐛 Found a Bug?

Use the debug button to collect data:
1. Enable debug mode
2. Go to affected page
3. Click "Export Page Data"
4. Attach JSON to GitHub issue

---

**Quick Access:** Settings → Developer Tools → Enable Debug Mode  
**Keyboard:** `Ctrl+Shift+D`  
**Location:** Bottom-right corner 🛠️
