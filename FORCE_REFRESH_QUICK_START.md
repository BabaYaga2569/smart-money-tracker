# Force Bank Refresh - Quick Start Guide 🚀

## What is Force Bank Refresh?

A new feature that lets you tell Plaid to check your bank **RIGHT NOW** for new transactions, instead of waiting for the regular 6-hour auto-sync.

## Where is it?

On the **Transactions** page, look for the **green button** next to the blue Sync button:

```
[🔄 Sync Plaid Transactions]  [🔄 Force Bank Check]  ← This one!
      (Blue button)                (Green button)
```

## How to Use It

### Step 1: Click the Button
Click the green **"🔄 Force Bank Check"** button

### Step 2: Wait (3-5 seconds)
- Button changes to **"⏳ Checking Bank..."**
- You'll see: "Plaid is checking your bank now..."
- Wait 3 seconds while Plaid polls your bank

### Step 3: Automatic Sync
- Frontend automatically syncs the new data
- New transactions appear!
- Button returns to green

**Total time: ~5-8 seconds** from click to new transactions ⚡

## When to Use It

### Perfect For:
- ✅ Just made a purchase → want to see it immediately
- ✅ Tracking a pending charge → need latest status
- ✅ Testing your bank connection
- ✅ Need up-to-the-second transaction data

### Don't Need It For:
- ❌ Regular daily updates (auto-sync handles this every 6 hours)
- ❌ Background synchronization (auto-sync does this automatically)
- ❌ General transaction viewing (existing data is usually fresh)

## Difference from Regular Sync

| Feature | Regular Sync | Force Bank Check |
|---------|-------------|------------------|
| **What it does** | Fetches transactions Plaid already has | Tells Plaid to check bank RIGHT NOW |
| **Speed** | Instant (< 1 second) | ~5-8 seconds |
| **When to use** | Get latest from Plaid's cache | Get absolute latest from bank |
| **Frequency** | As often as you want | Use sparingly (bank may rate-limit) |
| **Color** | Blue button | Green button |

## Visual Guide

### Normal State
```
┌──────────────────────────┐
│ 🔄 Force Bank Check      │ ← Click me!
└──────────────────────────┘
     Green, clickable
```

### During Check
```
┌──────────────────────────┐
│ ⏳ Checking Bank...      │ ← Wait...
└──────────────────────────┘
     Gray, disabled
```

### Back to Normal
```
┌──────────────────────────┐
│ 🔄 Force Bank Check      │ ← Done! ✓
└──────────────────────────┘
     Green, clickable
```

## What Happens Behind the Scenes

```
You click button
    ↓
Backend → Plaid API: "Check bank now!"
    ↓
Plaid → Your bank: "Any new transactions?"
    ↓
[Wait 3 seconds]
    ↓
Frontend → Backend: "Sync transactions"
    ↓
New transactions appear! 🎉
```

## Troubleshooting

### Button is Gray and Disabled?

**Cause:** Plaid is not connected to your account

**Solution:**
1. Go to Settings page
2. Connect your bank with Plaid
3. Return to Transactions page
4. Button should now be green!

### Error: "Failed to request bank refresh"?

**Possible causes:**
- ❌ No internet connection
- ❌ Plaid service is down
- ❌ Bank's API is temporarily unavailable
- ❌ Your Plaid connection expired

**Solution:**
1. Check your internet connection
2. Try the regular blue "Sync" button first
3. If that works, try Force Bank Check again
4. If still failing, reconnect your bank in Settings

### Takes Longer Than Expected?

**Normal:** 3-8 seconds is expected
- Plaid needs time to poll your bank
- Some banks respond slower than others

**Too long (> 15 seconds)?**
- Your bank might be slow to respond
- Network latency issues
- Try again in a minute

## Button Behavior

### The button disables itself when:
- ❌ Already force refreshing (prevents duplicate calls)
- ❌ Regular sync in progress (prevents conflicts)
- ❌ Auto-sync in progress (prevents conflicts)
- ❌ Plaid not connected (feature requires Plaid)

### All other buttons also disable during force refresh:
- Add Transaction
- Quick Add Pending Charge
- Sync Plaid Transactions
- Templates
- Export CSV

This prevents conflicts and ensures data integrity! 🛡️

## Pro Tips

### 💡 Tip 1: Use Sparingly
Don't click Force Bank Check repeatedly. Banks may rate-limit requests, and Plaid might not return new data if called too frequently (< 1 minute apart).

### 💡 Tip 2: Check Console
Open browser DevTools (F12) → Console tab to see detailed logging:
```
🔄 Telling Plaid to check bank RIGHT NOW...
✅ Plaid is checking bank now!
🔄 Now syncing new transactions...
✅ Force refresh complete!
```

### 💡 Tip 3: Regular Sync First
If you haven't synced in a while, use the regular blue "Sync" button first (faster), then use Force Bank Check only if you need the absolute latest data.

### 💡 Tip 4: Auto-Sync vs Force
- **Auto-sync:** Runs automatically every 6 hours when you load the page
- **Force Bank Check:** Manual, on-demand, when you need data RIGHT NOW

Both work together harmoniously! 🎵

## Example Scenarios

### Scenario 1: Just Made a Purchase
```
You: *Buys coffee at Starbucks*
You: *Opens app*
You: "I want to see this transaction NOW!"
You: *Clicks Force Bank Check* 🔄
App: "Checking bank... Syncing... Done!"
You: *Sees Starbucks transaction* ☕✅
```

### Scenario 2: Tracking Pending Charge
```
You: "Did my pending charge clear yet?"
You: *Clicks Force Bank Check* 🔄
App: "Checking bank..."
App: "Charge is now cleared!" ✅
You: *Updated transaction status shown*
```

### Scenario 3: Testing Bank Connection
```
You: "Is my bank connection working?"
You: *Clicks Force Bank Check* 🔄
App: "Checking bank... Syncing... Done!"
You: "Yep, it's working! Got new transactions."
```

## FAQ

**Q: How often can I use this?**  
A: Technically unlimited, but recommended: once every 1-2 minutes at most. More frequent calls won't return new data.

**Q: Will this cost extra API calls?**  
A: Each click uses 1 Plaid `transactionsRefresh()` call + 1 `transactionsSync()` call. Within normal usage limits.

**Q: Does this work with all banks?**  
A: Yes! Any bank connected via Plaid supports this feature.

**Q: What if I click it multiple times quickly?**  
A: The button disables itself during refresh, so you can't spam it. Smart! 🧠

**Q: Can I use this without Plaid?**  
A: No, this feature requires a Plaid connection. Manual transactions don't need this feature.

**Q: Is this the same as the auto-sync feature?**  
A: No! They're complementary:
- **Auto-sync:** Passive, runs every 6 hours automatically
- **Force Bank Check:** Active, runs when YOU click the button

## Summary

- 🟢 **Green button** next to blue Sync button
- ⚡ **Fast:** ~5-8 seconds total
- 🎯 **Purpose:** Get absolute latest data from bank RIGHT NOW
- 🤝 **Works with:** Existing auto-sync feature
- 🛡️ **Safe:** Prevents conflicts by disabling other operations
- 💪 **Powerful:** Direct line to your bank's latest data

**When in doubt:** Click it! It's designed to be safe and fast. 🚀

---

**Need help?** Check the console logs (F12 → Console) or contact support.
