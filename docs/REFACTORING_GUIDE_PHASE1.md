# Phase 1 Refactoring Guide for server.js

This document outlines the remaining changes needed in `backend/server.js` to complete Phase 1 improvements.

## ✅ Completed
- ✅ Created `backend/constants/categories.js` with shared CATEGORY_KEYWORDS
- ✅ Added `PLAID_WEBHOOK_URL` to `.env.example`

## 🔄 Manual Changes Required in server.js

### 1. Remove Duplicate Logging System (Lines 26-61)

**DELETE** the entire `logDiagnostic` object definition and use only the imported `logger` instead.

**Lines to remove:**
```javascript
const logDiagnostic = {
  info: (category, message, data = {}) => { ... },
  error: (category, message, error = {}) => { ... },
  // ... entire object
};
```

**Find and Replace:**
- `logDiagnostic.info(` → `logger.info(`
- `logDiagnostic.error(` → `logger.error(`
- `logDiagnostic.warn(` → `logger.warn(`
- `logDiagnostic.request(` → `logger.request(`
- `logDiagnostic.response(` → `logger.response(`

### 2. Use Shared Category Constants (Lines 82-162)

**DELETE** these lines:
```javascript
const CATEGORY_KEYWORDS = {
  "Groceries": [...],
  // ... entire object
};

function autoCategorizTransaction(description) {
  // ... entire function
}
```

**ADD** at the top of the file (after other imports):
```javascript
import { CATEGORY_KEYWORDS, autoCategorizTransaction } from './constants/categories.js';
```

### 3. Use Environment Variable for Webhook URL

**FIND** these two hardcoded URLs (around lines 1079 and 1126):
```javascript
webhook: "https://smart-money-tracker-09ks.onrender.com/api/plaid/webhook"
```

**REPLACE** with:
```javascript
webhook: process.env.PLAID_WEBHOOK_URL || "https://smart-money-tracker-09ks.onrender.com/api/plaid/webhook"
```

**ADD** at the top with other environment variables (around line 166):
```javascript
const PLAID_WEBHOOK_URL = process.env.PLAID_WEBHOOK_URL || "https://smart-money-tracker-09ks.onrender.com/api/plaid/webhook";
```

Then use `PLAID_WEBHOOK_URL` in both places instead of the string.

## 📋 Testing Checklist

After making these changes:

- [ ] Run `npm install` in backend directory
- [ ] Update your `.env` file with `PLAID_WEBHOOK_URL=https://your-actual-backend-url.com/api/plaid/webhook`
- [ ] Test Plaid link token creation
- [ ] Test transaction sync
- [ ] Verify logging still works
- [ ] Verify auto-categorization still works

## 🎯 Benefits

1. **Single Source of Truth**: Category keywords are now in one place, can be shared with frontend
2. **No More Hardcoded URLs**: Webhook URL is configurable per environment
3. **Consistent Logging**: One logging system instead of two
4. **Easier Maintenance**: Fewer lines of code, better organization

## 📊 Code Reduction

- **Before**: ~2,700 lines
- **After**: ~2,600 lines (-100 lines, ~4% reduction)
- **Duplicate code removed**: ~150 lines

## ⏭️ Next Steps (Phase 2)

After completing Phase 1, Phase 2 will:
- Split server.js into separate route files
- Extract business logic into services
- Add comprehensive input validation
- Implement rate limiting
