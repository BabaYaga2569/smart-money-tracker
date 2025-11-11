# Quick Testing Guide - Spendability Bug Fixes

## 🎯 What Was Fixed

✅ **Bug 1:** Available until date (was TODAY, now 10/15/2025)  
✅ **Bug 2:** Checking total (was $1,426.88, now $1,945.12)  
✅ **Bug 3:** Next payday calculation (was 0 days, now 7 days)

---

## 🧪 Quick Test (30 seconds)

### Step 1: Open Console
Press **F12** to open DevTools Console

### Step 2: Navigate to Spendability
Go to the Spendability page

### Step 3: Look for 3 Emoji Logs
```
🔍 SPENDABILITY DEBUG
📅 PAYDAY CALCULATION DEBUG  
🏦 CHECKING ACCOUNTS DEBUG
```

### Step 4: Verify Console Shows
- **All 4 accounts:** Adv Plus Banking, USAA, SoFi, 360 Checking ✅
- **checkingTotal:** 1945.12 ✅
- **nextPayday:** "2025-10-15" ✅
- **source:** "spouse" ✅

### Step 5: Verify UI Shows
- **Checking:** $1,945.12 ✅
- **Available until:** 10/15/2025 ✅
- **Next Payday:** 10/15/2025 (7 days) ✅

---

## 🔍 What Each Log Shows

### 🔍 SPENDABILITY DEBUG
Shows **all accounts** with their balances and types:
```javascript
plaidAccounts: [
  { name: "Adv Plus Banking", balance: "550.74", projected: 518.24 },
  { name: "USAA Classic Checking", balance: "643.60", projected: 643.60 },
  { name: "SoFi Checking", balance: "209.45", projected: 195.09 },
  { name: "360 Checking", balance: "588.19", projected: 588.19 }
]
```

### 📅 PAYDAY CALCULATION DEBUG
Shows **payday calculation** details:
```javascript
{
  spouseSchedule: { amount: "1851.04" },  ← Must have value!
  nextPayday: "2025-10-15",               ← Wife's payday
  daysUntilPayday: 7,                      ← Days from 10/08
  source: "spouse"                         ← Using wife's schedule
}
```

### 🏦 CHECKING ACCOUNTS DEBUG
Shows **account breakdowns**:
```javascript
checkingAccountsFound: [
  { name: "Adv Plus Banking", projected: 518.24 },    ← NOW INCLUDED!
  { name: "USAA Classic Checking", projected: 643.60 },
  { name: "SoFi Checking", projected: 195.09 },
  { name: "360 Checking", projected: 588.19 }
],
checkingTotal: 1945.12  ← Sum of all 4 accounts
```

---

## ❌ Signs of Problems

If you see these, the fix didn't work:

### Problem 1: Missing Account
```javascript
// Only 3 accounts shown
checkingAccountsFound: [
  { name: "USAA Classic Checking", ... },
  { name: "SoFi Checking", ... },
  { name: "360 Checking", ... }
  // ❌ Adv Plus Banking missing!
]
```

### Problem 2: Wrong Total
```javascript
checkingTotal: 1426.88  ❌ Should be 1945.12
```

### Problem 3: Wrong Payday
```javascript
nextPayday: "2025-10-08",  ❌ Should be 2025-10-15
daysUntilPayday: 0         ❌ Should be 7
```

### Problem 4: No Spouse Schedule
```javascript
spouseSchedule: { amount: 0 }  ❌ Should have value like 1851.04
```

---

## ✅ Expected Results Checklist

### Console Logs
- [ ] 🔍 SPENDABILITY DEBUG log appears
- [ ] Shows 4 checking accounts (not 3)
- [ ] Adv Plus Banking is included
- [ ] 📅 PAYDAY CALCULATION DEBUG log appears
- [ ] spouseSchedule.amount has a value (not 0)
- [ ] nextPayday shows "2025-10-15"
- [ ] source shows "spouse"
- [ ] 🏦 CHECKING ACCOUNTS DEBUG log appears
- [ ] checkingTotal shows 1945.12

### UI Display
- [ ] Current Balances - Checking: **$1,945.12**
- [ ] Safe to Spend - Available until: **10/15/2025**
- [ ] Next Payday: **10/15/2025**
- [ ] Next Payday countdown: **7 days**

---

## 🐛 If Tests Fail

### If Spouse Schedule Amount is 0
1. Go to Settings page
2. Enter spouse pay amount: `1851.04`
3. Click "Save Settings"
4. Check console for: `💾 SAVING SETTINGS`
5. Verify it shows: `paySchedules.spouse.amount: "1851.04"`
6. Go back to Spendability page

### If Adv Plus Banking Still Missing
Check the per-account filter logs:
```
Account "Adv Plus Banking": isChecking=true  ← Should be true
```

If it says `false`, the account might have:
- Name contains "savings" → Check account name
- Subtype contains "savings" → Check account subtype

### If Still Having Issues
1. Clear browser cache
2. Hard refresh (Ctrl+Shift+R)
3. Check browser console for errors
4. Verify Settings were saved properly

---

## 📚 Full Documentation

- **Implementation Details:** See `SPENDABILITY_BUGS_FIX_SUMMARY.md`
- **Visual Comparison:** See `SPENDABILITY_BUGS_VISUAL_COMPARISON.md`

---

## 🎉 Success!

If all checkboxes are ✅, all three bugs are fixed!

**Summary:**
- ✅ All 4 checking accounts included
- ✅ Total checking = $1,945.12
- ✅ Next payday = 10/15/2025 (wife's payday)
- ✅ 7 days countdown (not 0 days)
- ✅ Available until 10/15/2025 (not TODAY)
