# Debug Logging Visual Guide

## Console Output Examples

This document shows what the console logs will look like in different scenarios.

---

## Scenario 1: API Timeout → Firebase Success

**What happens:**
1. API call times out after 3 seconds
2. Falls back to Firebase
3. Loads accounts successfully from Firebase

**Console Output:**
```javascript
🔄 [loadAccounts] Starting account load...
⏰ [loadAccounts] API request timed out after 3s, using Firebase
🔄 [loadFirebaseAccounts] Starting Firebase account load...
📊 [loadFirebaseAccounts] Firebase data retrieved: {
  plaidAccountsCount: 4,
  bankAccountsCount: 0,
  plaidAccountIds: [
    "nepjkM0w7QCONbk8gEd1Sd0qMRKyYrfGmMQox",
    "zxydAykJ5DCxmg07kxMRfVZP3V1eBQCN5NnBz",
    "YNo47jEe6gI8joD7jePwTAq3pD4V7Pi1a1b9y",
    "RvVJ5Z7j4LTLXry0zpQycxZnyDNkEkCqepYBv"
  ]
}
✅ [loadFirebaseAccounts] Updated PlaidConnectionManager with 4 accounts
✅ [loadFirebaseAccounts] Set accounts state from Firebase Plaid: {
  count: 4,
  accountIds: [
    "nepjkM0w7QCONbk8gEd1Sd0qMRKyYrfGmMQox",
    "zxydAykJ5DCxmg07kxMRfVZP3V1eBQCN5NnBz",
    "YNo47jEe6gI8joD7jePwTAq3pD4V7Pi1a1b9y",
    "RvVJ5Z7j4LTLXry0zpQycxZnyDNkEkCqepYBv"
  ],
  firstAccount: {
    name: "Adv Plus Banking",
    official_name: "Adv Plus Banking",
    type: "checking",
    balance: "4296.17",
    mask: "1111",
    institution_name: "Navy Federal Credit Union",
    institution: "Navy Federal Credit Union"
  }
}
🔍 [applyFilters] Running with: {
  transactionsCount: 472,
  accountsCount: 4,
  accountIds: [
    "nepjkM0w7QCONbk8gEd1Sd0qMRKyYrfGmMQox",
    "zxydAykJ5DCxmg07kxMRfVZP3V1eBQCN5NnBz",
    "YNo47jEe6gI8joD7jePwTAq3pD4V7Pi1a1b9y",
    "RvVJ5Z7j4LTLXry0zpQycxZnyDNkEkCqepYBv"
  ]
}
🔍 [applyFilters] First transaction account lookup: {
  transactionId: "abc123",
  transaction_account_id: "RvVJ5Z7j4LTLXry0zpQycxZnyDNkEkCqepYBv",
  transaction_account: undefined,
  availableAccountKeys: [
    "nepjkM0w7QCONbk8gEd1Sd0qMRKyYrfGmMQox",
    "zxydAykJ5DCxmg07kxMRfVZP3V1eBQCN5NnBz",
    "YNo47jEe6gI8joD7jePwTAq3pD4V7Pi1a1b9y",
    "RvVJ5Z7j4LTLXry0zpQycxZnyDNkEkCqepYBv"
  ],
  foundAccount: {
    name: "USAA CLASSIC CHECKING",
    official_name: "USAA CLASSIC CHECKING",
    type: "checking",
    balance: "510.35",
    mask: "9403",
    institution_name: "USAA",
    institution: "USAA"
  },
  displayName: "usaa classic checking"
}
```

**Diagnosis:** ✅ Everything working correctly!
- Accounts loaded: 4
- Account IDs match between Firebase and transactions
- Display name extracted correctly

---

## Scenario 2: API Success

**What happens:**
1. API responds successfully
2. Accounts loaded from API

**Console Output:**
```javascript
🔄 [loadAccounts] Starting account load...
✅ [loadAccounts] API responded successfully
✅ [loadAccounts] Set accounts from API: {
  count: 4,
  accountIds: [
    "nepjkM0w7QCONbk8gEd1Sd0qMRKyYrfGmMQox",
    "zxydAykJ5DCxmg07kxMRfVZP3V1eBQCN5NnBz",
    "YNo47jEe6gI8joD7jePwTAq3pD4V7Pi1a1b9y",
    "RvVJ5Z7j4LTLXry0zpQycxZnyDNkEkCqepYBv"
  ],
  firstAccount: {
    name: "Adv Plus Banking",
    official_name: "Adv Plus Banking",
    type: "checking",
    balance: "4296.17",
    mask: "1111",
    institution_name: "Navy Federal Credit Union",
    institution: "Navy Federal Credit Union"
  }
}
```

**Diagnosis:** ✅ API working correctly!

---

## Scenario 3: Account ID Mismatch (THE BUG!)

**What happens:**
1. Firebase loads accounts with IDs: `["AAA", "BBB", "CCC"]`
2. Transactions reference account ID: `"ZZZ"`
3. Account lookup fails → shows "| Account"

**Console Output:**
```javascript
🔄 [loadAccounts] Starting account load...
⏰ [loadAccounts] API request timed out after 3s, using Firebase
🔄 [loadFirebaseAccounts] Starting Firebase account load...
📊 [loadFirebaseAccounts] Firebase data retrieved: {
  plaidAccountsCount: 3,
  bankAccountsCount: 0,
  plaidAccountIds: ["AAA", "BBB", "CCC"]
}
✅ [loadFirebaseAccounts] Updated PlaidConnectionManager with 3 accounts
✅ [loadFirebaseAccounts] Set accounts state from Firebase Plaid: {
  count: 3,
  accountIds: ["AAA", "BBB", "CCC"],
  firstAccount: { name: "Account 1", ... }
}
🔍 [applyFilters] Running with: {
  transactionsCount: 100,
  accountsCount: 3,
  accountIds: ["AAA", "BBB", "CCC"]
}
🔍 [applyFilters] First transaction account lookup: {
  transactionId: "tx_001",
  transaction_account_id: "ZZZ",  // ❌ MISMATCH!
  transaction_account: undefined,
  availableAccountKeys: ["AAA", "BBB", "CCC"],  // ❌ "ZZZ" not in list!
  foundAccount: null,  // ❌ NOT FOUND!
  displayName: "unknown account"  // ❌ FALLBACK NAME!
}
```

**Diagnosis:** 🔴 **FOUND THE BUG!**
- Transaction has account_id: `"ZZZ"`
- But accounts state only has: `["AAA", "BBB", "CCC"]`
- Account lookup fails
- Falls back to "Unknown Account"
- UI shows "| Account"

---

## Scenario 4: No Firebase Data

**What happens:**
1. API times out
2. Firebase has no data
3. Falls back to demo accounts

**Console Output:**
```javascript
🔄 [loadAccounts] Starting account load...
⏰ [loadAccounts] API request timed out after 3s, using Firebase
🔄 [loadFirebaseAccounts] Starting Firebase account load...
⚠️ [loadFirebaseAccounts] No Firebase settings document found, using demo accounts
ℹ️ [setDefaultDemoAccounts] Setting demo accounts
```

**Diagnosis:** ⚠️ User needs to connect Plaid or add manual accounts

---

## Scenario 5: API Returns No Accounts

**What happens:**
1. API responds but returns empty accounts array
2. Falls back to Firebase

**Console Output:**
```javascript
🔄 [loadAccounts] Starting account load...
✅ [loadAccounts] API responded successfully
⚠️ [loadAccounts] No accounts from API, falling back to Firebase
🔄 [loadFirebaseAccounts] Starting Firebase account load...
📊 [loadFirebaseAccounts] Firebase data retrieved: {
  plaidAccountsCount: 4,
  bankAccountsCount: 0,
  plaidAccountIds: [...]
}
```

**Diagnosis:** ℹ️ API working but no Plaid data, using Firebase as expected

---

## Scenario 6: API Returns success=false

**What happens:**
1. API returns `{ success: false, error: "..." }`
2. Falls back to Firebase (expected behavior)

**Console Output:**
```javascript
🔄 [loadAccounts] Starting account load...
✅ [loadAccounts] API responded successfully
ℹ️ [loadAccounts] API returned success=false, falling back to Firebase
🔄 [loadFirebaseAccounts] Starting Firebase account load...
```

**Diagnosis:** ℹ️ Expected when Plaid not configured

---

## How to Use This Guide

1. **Open browser console** (F12) on Transactions page
2. **Look for emoji prefixes** to quickly identify log type:
   - 🔄 = Starting a process
   - ✅ = Success
   - ⚠️ = Warning (but not fatal)
   - ❌ = Error
   - ℹ️ = Information
   - ⏰ = Timeout
   - 🔍 = Debug/diagnostic data
   - 📊 = Data summary

3. **Find the account lookup log** `🔍 [applyFilters] First transaction account lookup:`
   - Check if `transaction_account_id` is in `availableAccountKeys`
   - Check if `foundAccount` is `null` or has data
   - Check what `displayName` shows

4. **Compare account IDs:**
   - IDs from Firebase: `📊 [loadFirebaseAccounts] Firebase data retrieved`
   - IDs in accounts state: `✅ [loadFirebaseAccounts] Set accounts state`
   - IDs in applyFilters: `🔍 [applyFilters] Running with`
   - Transaction's account_id: `🔍 [applyFilters] First transaction account lookup`

5. **Screenshot console output** and share for debugging

---

## Quick Reference

### Emoji Legend
| Emoji | Meaning | Log Type |
|-------|---------|----------|
| 🔄 | Starting | `console.log` |
| ✅ | Success | `console.log` |
| ⚠️ | Warning | `console.warn` |
| ❌ | Error | `console.error` or `console.warn` |
| ℹ️ | Info | `console.log` |
| ⏰ | Timeout | `console.warn` |
| 🔍 | Debug | `console.log` |
| 📊 | Data | `console.log` |

### Key Data Points to Check

1. **plaidAccountsCount** - How many accounts Firebase has
2. **plaidAccountIds** - Array of account IDs from Firebase
3. **accountIds** in accounts state - What IDs the app has loaded
4. **transaction_account_id** - What ID the transaction is looking for
5. **foundAccount** - Whether account lookup succeeded (null = failed)
6. **displayName** - What name is being shown (lowercase)

### Common Issues

| Symptom | Log Pattern | Root Cause |
|---------|-------------|------------|
| Shows "Account" | `foundAccount: null` | Account ID mismatch |
| No accounts loaded | `plaidAccountsCount: 0` | No Firebase data |
| Empty accounts state | `accountsCount: 0` | State not updating |
| PlaidConnectionManager empty | No "Updated PlaidConnectionManager" log | setPlaidAccounts not called |
