# Dual Balance Display Feature

## Overview
This feature adds support for displaying both **Live** and **Projected** balances throughout the Smart Money Tracker application. Users can now see their actual bank balance (from Plaid) alongside a projected balance that includes manual transactions tracked in the app.

## Problem Solved
Previously, users could track manual transactions in the Transactions page, but these didn't affect the displayed balance from Plaid on the Accounts page. This was confusing for budgeting and planning, as users couldn't see how their pending/planned transactions would affect their available funds.

## Solution
The implementation provides:
1. **Live Balance**: Read-only balance from Plaid (or manually entered)
2. **Projected Balance**: Live balance adjusted for manual transactions
3. **Flexible Display**: Toggle between Live Only, Both, or Projected Only views
4. **Educational Content**: Help section explaining the difference
5. **Visual Indicators**: Icons, colors, and tooltips for clarity

## Technical Implementation

### Files Created
- `frontend/src/utils/BalanceCalculator.js` - Core balance calculation utilities

### Files Modified
- `frontend/src/pages/Accounts.jsx` - Main accounts page with dual balance display
- `frontend/src/pages/Accounts.css` - Styling for new UI elements
- `frontend/src/pages/Dashboard.jsx` - Dashboard tile showing both balances

### Key Functions (BalanceCalculator.js)

#### `calculateProjectedBalance(accountId, liveBalance, transactions)`
Calculates projected balance for a specific account by adding manual transaction amounts to the live balance.

**Parameters:**
- `accountId` - The account ID or key
- `liveBalance` - Current balance from Plaid or manual entry
- `transactions` - Array of manual transactions

**Returns:** Projected balance as a number

#### `calculateAllProjectedBalances(accounts, transactions)`
Calculates projected balances for all accounts.

**Parameters:**
- `accounts` - Accounts object/array (Plaid or manual format)
- `transactions` - Array of manual transactions

**Returns:** Object mapping account IDs to projected balances

#### `calculateTotalProjectedBalance(accounts, transactions)`
Calculates total projected balance across all accounts.

**Returns:** Total projected balance as a number

#### `getBalanceDifference(projectedBalance, liveBalance)`
Gets the difference between projected and live balance.

**Returns:** Difference amount (positive = pending income, negative = pending expenses)

#### `formatBalanceDifference(difference)`
Formats balance difference for display with descriptive text.

**Returns:** Formatted string like "+$50.00 (pending income)" or "-$25.00 (pending expenses)"

## User Interface

### Accounts Page Features

#### 1. Help Button & Documentation
- Click the "❓ Help" button to expand/collapse help section
- Explains Live Balance, Projected Balance, and why they differ
- Clarifies Plaid's read-only nature

#### 2. Balance Toggle
Three options:
- **Live Only**: Show only bank-reported balances
- **Both**: Show both Live and Projected side-by-side (default)
- **Projected Only**: Show only projected balances

#### 3. Total Balance Summary
- Displays total Live balance
- Displays total Projected balance
- Shows difference with explanatory text when viewing "Both"

#### 4. Individual Account Cards
Each account card shows:
- Account name, type, and icon
- Live Balance with 🔗 icon (white text)
- Projected Balance with 📊 icon (green text)
- Difference indicator when balances differ
- Tooltips on hover for additional context

#### 5. Visual Indicators
- **Icons**: 🔗 for Live, 📊 for Projected
- **Colors**: White for Live, Green (#00ff88) for Projected
- **Tooltips**: Hover descriptions on balance labels
- **Difference Text**: Shows pending transactions amount and type

### Dashboard Integration
The Accounts tile on the Dashboard:
- Shows both balances when they differ
- Shows single balance when they match
- Includes tooltip explaining balance types
- Maintains consistent visual language

## How Manual Transactions Affect Balances

### Transaction Types
1. **Expenses** (negative amounts): Decrease projected balance
2. **Income** (positive amounts): Increase projected balance

### Example Scenarios

#### Scenario 1: Pending Expense
- Live Balance: $1,000.00
- Manual Transaction: -$50.00 (grocery shopping)
- Projected Balance: $950.00
- Difference: "-$50.00 (pending expenses)"

#### Scenario 2: Expected Income
- Live Balance: $1,000.00
- Manual Transaction: +$500.00 (paycheck deposit)
- Projected Balance: $1,500.00
- Difference: "+$500.00 (pending income)"

#### Scenario 3: Multiple Transactions
- Live Balance: $1,000.00
- Manual Transactions:
  - -$50.00 (groceries)
  - -$30.00 (gas)
  - +$200.00 (side income)
- Projected Balance: $1,120.00
- Difference: "+$120.00 (pending income)"

## Data Flow

```
1. User adds manual transaction in Transactions page
   ↓
2. Transaction saved to Firebase with account reference
   ↓
3. Accounts page loads both:
   - Account balances (from Plaid/Firebase)
   - Manual transactions (from Firebase)
   ↓
4. BalanceCalculator processes:
   - Groups transactions by account
   - Sums transaction amounts per account
   - Adds to live balance
   ↓
5. UI displays:
   - Live balance (unchanged)
   - Projected balance (calculated)
   - Difference (helpful text)
```

## Design Decisions

### Why Toggle Instead of Always Showing Both?
- **Flexibility**: Different users have different preferences
- **Simplicity**: Some users may not use manual transactions
- **Screen Space**: Mobile users benefit from single-column view
- **Learning Curve**: New users can start with Live only, then explore Projected

### Why Green for Projected Balance?
- Matches the app's accent color (#00ff88)
- Indicates "enhanced" or "calculated" data
- Provides clear visual distinction from Live balance
- Maintains consistency with other UI elements

### Why Tooltips on Labels?
- Provides context without cluttering the UI
- Helps new users understand the difference
- Accessible via hover (desktop) and touch (mobile)
- Consistent with modern web app patterns

## Future Enhancements

### Potential Improvements
1. **Per-Account Toggle**: Allow different views per account
2. **Historical Projected Balance**: Track projected balance over time
3. **Forecast Chart**: Visualize Live vs Projected over upcoming weeks
4. **Smart Alerts**: Notify when projected balance goes below threshold
5. **Transaction Categories**: Break down difference by category
6. **Bulk Transaction Import**: Quickly add multiple planned transactions
7. **Recurring Adjustments**: Auto-apply recurring transactions to projections

### Integration Opportunities
1. **Bills Page**: Show how upcoming bills affect projected balance
2. **Spendability**: Use projected balance for "safe to spend" calculations
3. **Cash Flow**: Compare projected vs actual trends
4. **Goals**: Show impact of transactions on goal progress
5. **Pay Cycle**: Factor projected balance into payday calculations

## Testing Checklist

### Manual Testing Performed
- ✅ Balance calculation with no transactions
- ✅ Balance calculation with expense transactions
- ✅ Balance calculation with income transactions
- ✅ Balance calculation with mixed transactions
- ✅ Toggle between Live/Both/Projected views
- ✅ Help section expand/collapse
- ✅ Tooltips display correct information
- ✅ Responsive design on mobile viewport
- ✅ Dashboard tile displays correctly
- ✅ Multiple accounts with different transactions
- ✅ Visual indicators (icons, colors) display correctly

### Build & Deployment
- ✅ Code builds without errors
- ✅ No ESLint errors in modified files
- ✅ CSS properly scoped and responsive
- ✅ Firebase integration works correctly
- ✅ Handles offline/demo mode gracefully

## Accessibility Considerations
- Tooltips provide context for screen readers
- Color is not the only indicator (icons + text)
- Keyboard navigation supported
- Semantic HTML structure maintained
- ARIA labels on interactive elements

## Browser Compatibility
- Modern browsers (Chrome, Firefox, Safari, Edge)
- Mobile browsers (iOS Safari, Chrome Mobile)
- Responsive design works on all screen sizes
- CSS uses standard properties (no vendor prefixes needed)

## Performance
- Calculations are efficient (O(n) where n = number of transactions)
- No unnecessary re-renders
- State updates are batched
- Firebase queries are optimized with limits
- No performance impact on large transaction lists (tested with 100 transactions)

## Documentation for Users
The in-app Help section provides:
- Clear explanation of Live Balance
- Clear explanation of Projected Balance
- Why there's a difference
- How manual transactions work
- Plaid's read-only nature

Users can access this anytime by clicking the "❓ Help" button on the Accounts page.

## Support & Troubleshooting

### Common Questions

**Q: Why isn't my projected balance updating?**
A: Ensure transactions are assigned to the correct account and have been saved successfully.

**Q: Can I edit the projected balance directly?**
A: No, projected balance is calculated automatically. Edit the Live balance or add/remove transactions.

**Q: Why do both balances show the same amount?**
A: You don't have any manual transactions for that account, or transactions have been synced with your bank.

**Q: Will Plaid eventually sync my manual transactions?**
A: No, Plaid only reads from your bank. Manual transactions are app-only and help with planning.

**Q: Can I trust the projected balance for spending?**
A: Projected balance is only as accurate as the manual transactions you've entered. Always verify important transactions.

## Conclusion
The dual balance display feature bridges the gap between read-only bank data and user-tracked planning data. It provides flexibility, clarity, and helps users make better financial decisions by seeing both their current and projected financial state.
