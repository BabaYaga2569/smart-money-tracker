# Merchant Names Display Fix - PR #114

## Problem Statement
PR #113 successfully implemented horizontal layout for transaction cards, but introduced a critical bug where **merchant names were only showing the first letter** instead of the full text. Bank account names were also missing from the display.

### Examples of Broken Display
- "C" instead of "CITI CARD ONLINE"
- "J" instead of "JASMINE DONNETT"
- "I" instead of "I Heart Tacos Mexican"
- "D" instead of "Deposit from 360 Performance"
- No bank account names visible (should show "| 360 Checking")

## Root Cause
The horizontal layout in PR #113 had merchant names nested inside the `.transaction-description` span along with the account name. The CSS `text-overflow: ellipsis` combined with `flex: 1` was causing the text to be truncated incorrectly, showing only the first character.

## Solution Implemented

### Visual Before & After
![Transaction Layout Fix](https://github.com/user-attachments/assets/137fba50-7078-47ff-90a7-86781fd875cb)

### JSX Changes (`frontend/src/pages/Transactions.jsx`)

**Key Changes:**
1. **Two-row layout structure:**
   - Row 1: Date header on its own line
   - Row 2: Merchant, category, account, amount, actions in horizontal layout

2. **Separated merchant name:**
   - Created dedicated `.transaction-merchant` span
   - No longer nested inside description
   - Uses proper text priority: `merchant_name || name || description || 'Unknown'`

3. **Added category display:**
   - Shows between merchant and account when available
   - Uses `.transaction-category-inline` class
   - Only renders if `transaction.category` exists

4. **Account name with separator:**
   - Displays as "| Account Name"
   - Uses `.transaction-account-inline` class
   - Has `flex-shrink: 0` to prevent compression

**Code Structure:**
```jsx
<div className="transaction-item">
  <div className="transaction-date-header">
    {formatDateForDisplay(transaction.date)}
  </div>
  
  <div className="transaction-main-content">
    <div className="transaction-info">
      <span className="transaction-merchant">
        {transaction.merchant_name || transaction.name || transaction.description || 'Unknown'}
      </span>
      
      {transaction.category && (
        <span className="transaction-category-inline">
          {transaction.category}
        </span>
      )}
      
      <span className="transaction-account-inline">
        | {getAccountName(transaction.account_id || transaction.account)}
      </span>
    </div>
    
    <span className="transaction-amount">
      {formatCurrency(transaction.amount)}
    </span>
    
    <div className="transaction-actions">
      <button>✏️</button>
      <button>🗑️</button>
    </div>
  </div>
</div>
```

### CSS Changes (`frontend/src/pages/Transactions.css`)

**Key Changes:**

1. **`.transaction-item`** - Container restructured:
   ```css
   display: flex;
   flex-direction: column;  /* Changed from row to column */
   gap: 8px;
   min-height: 60px;
   max-height: 80px;
   ```

2. **`.transaction-date-header`** - Date on top:
   ```css
   color: #00ff88;
   font-size: 0.85rem;
   font-weight: 600;
   ```

3. **`.transaction-main-content`** - Horizontal content row (NEW):
   ```css
   display: flex;
   justify-content: space-between;
   align-items: center;
   gap: 16px;
   ```

4. **`.transaction-merchant`** - Merchant name (NEW, replaces `.transaction-description`):
   ```css
   color: #fff;
   font-weight: 500;
   font-size: 1rem;
   white-space: nowrap;
   overflow: hidden;
   text-overflow: ellipsis;
   min-width: 150px;  /* Ensures readability */
   max-width: 400px;  /* Prevents excessive space usage */
   ```

5. **`.transaction-category-inline`** - Category badge (UPDATED):
   ```css
   color: #00ff88;
   font-size: 0.9rem;
   white-space: nowrap;
   ```

6. **`.transaction-account-inline`** - Account name (UPDATED):
   ```css
   color: #888;
   font-size: 0.9rem;
   white-space: nowrap;
   flex-shrink: 0;  /* Prevents compression */
   ```

7. **`.transaction-actions`** - Action buttons (UPDATED):
   ```css
   display: flex;
   gap: 8px;
   flex-shrink: 0;  /* Prevents compression */
   min-width: 80px; /* Prevents button overlap */
   ```

## Critical Requirements Met ✅

- ✅ **Show FULL merchant name** (not just first letter!)
- ✅ **Show bank account name** with "|" separator
- ✅ **Show category** if available
- ✅ **Use text-overflow: ellipsis** for long names
- ✅ **Keep horizontal compact layout** (60-80px height)
- ✅ **No button overlap** (flex-shrink: 0)
- ✅ **Keep min-width** on merchant name so it's readable

## Testing & Validation

### Build & Lint
- ✅ **Build successful:** No errors or warnings introduced
- ✅ **Lint passed:** No new linting errors
- ✅ **No breaking changes:** Only layout optimization, functionality preserved

### Visual Testing
- ✅ Full merchant names display correctly
- ✅ Account names visible with "|" separator
- ✅ Categories show when available
- ✅ Buttons don't overlap with amounts
- ✅ Layout remains compact (60-80px height maintained)
- ✅ Text overflow handled with ellipsis for long names

### Data Priority
The merchant name displays using this fallback priority:
1. `transaction.merchant_name` (Plaid data - preferred)
2. `transaction.name` (alternative field)
3. `transaction.description` (manual transactions)
4. `'Unknown'` (last resort fallback)

## Impact
This fix resolves the critical usability issue introduced in PR #113 where users couldn't see what transactions were for. Now all transaction information is clearly visible while maintaining the compact horizontal layout.

## Files Changed
- `frontend/src/pages/Transactions.jsx` - 90 lines changed (restructured JSX)
- `frontend/src/pages/Transactions.css` - 50 lines changed (updated layout styles)

## Related PRs
- PR #113: Introduced horizontal layout (but broke merchant names)
- PR #110: Bank account names visible (maintained in this fix)
- PR #111: Container height 1000px (maintained in this fix)
