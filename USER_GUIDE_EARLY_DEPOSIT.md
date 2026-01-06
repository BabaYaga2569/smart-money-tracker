# User Guide: Early Deposit Feature in Spendability

## What is Early Deposit?

Early Deposit is a feature for users who receive their paycheck split across two deposits:
- An **early deposit** (e.g., $400 on Tuesday)
- The **main deposit** (e.g., $1,483.81 on Thursday)

This is common with employers who offer early direct deposit or with banks like SoFi that provide early access to paychecks.

## How to Enable Early Deposit

### Step 1: Go to Settings
1. Click on **Settings** in the navigation menu
2. Scroll down to the **⚡ Early Deposit Settings** section

### Step 2: Configure Your Early Deposit
1. ✅ Check the **Enable Early Deposit** checkbox
2. Fill in the following fields:
   - **Early Deposit Bank**: Name of the bank receiving the early deposit (e.g., "SoFi")
   - **Early Deposit Amount**: Dollar amount of the early deposit (e.g., "400")
   - **Days Before Payday**: How many days before your main payday (default: 2)
   - **Remainder Bank**: Name of the bank receiving the main deposit (e.g., "Bank of America")

### Step 3: Save Settings
Click the **Save Settings** button at the bottom of the page.

## Example Configuration

**Scenario:** You get paid bi-weekly, total $1,883.81
- SoFi gets $400 two days early
- Bank of America gets $1,483.81 on main payday

**Settings Configuration:**
```
✅ Enable Early Deposit
Early Deposit Bank:     SoFi
Early Deposit Amount:   400
Days Before Payday:     2
Remainder Bank:         Bank of America
```

## What You'll See in Spendability

### Before Enabling (Single Payday)
```
┌─────────────────────┐
│   Next Payday       │
│                     │
│   01/09/2026       │
│   4 days           │
└─────────────────────┘

Safe to Spend: $425.75
```

### After Enabling (Multiple Paydays)
```
┌─────────────────────┐
│ 💰 Upcoming Income  │
│                     │
│ ⚡ Early Deposit    │
│ 01/07/2026 (2 days)│
│ $400.00            │
│ SoFi               │
│                     │
│ 💵 Main Payday     │
│ 01/09/2026 (4 days)│
│ $1,483.81          │
│ Bank of America    │
│                     │
│ Total: $1,883.81   │
└─────────────────────┘

Safe to Spend: $2,309.56
```

## Calculation Details

### Without Early Deposit
```
Current Balance:       $670.75
- Bills by 01/09:      -$45.00
- Weekly Essentials:   -$100.00
- Safety Buffer:       -$100.00
= Safe to Spend:       $425.75
```

### With Early Deposit
```
Current Balance:          $670.75
+ Early Deposit (01/07):  +$400.00
+ Main Payday (01/09):    +$1,483.81
- Bills by 01/09:         -$45.00
- Weekly Essentials:      -$100.00
- Safety Buffer:          -$100.00
= Safe to Spend:          $2,309.56
```

**Difference:** $1,883.81 (your full paycheck included!)

## Important Notes

### What "Safe to Spend" Means
The calculation shows **what you'll have by your next payday**, not just what you have right now. This helps you plan spending across your entire pay period.

### When Early Deposit Updates
The Spendability page reads your early deposit settings every time it loads. If you change your settings, refresh the Spendability page to see the updates.

### If Your Early Deposit Amount Changes
Simply go back to Settings and update the amount. The Spendability page will automatically recalculate next time you view it.

### Disabling Early Deposit
To disable:
1. Go to Settings
2. Uncheck **Enable Early Deposit**
3. Save Settings
4. Spendability will go back to showing a single payday

## Troubleshooting

### Issue: I enabled early deposit but still see single payday

**Solutions:**
1. Make sure you entered a dollar amount (can't be 0 or blank)
2. Refresh the Spendability page
3. Check that you saved settings (click Save Settings button)

### Issue: My early deposit amount is more than my total pay

**What Happens:**
The system will fall back to showing a single payday with your total pay amount and show a warning in the console.

**Solution:**
1. Go to Settings
2. Reduce your early deposit amount to be less than your total pay
3. Save Settings

### Issue: The dates don't match my actual deposits

**Solution:**
1. Check your **Days Before Payday** setting
2. Verify your **Last Pay Date** in Settings is correct
3. If your main payday date is wrong, update it in Settings

### Issue: My calculation seems wrong

**Check These:**
1. **Current Balance:** Make sure your bank account balances are up to date
2. **Bills:** Verify all bills are entered correctly in the Bills page
3. **Early Deposit Amount:** Confirm the amount matches what you actually receive
4. **Total Pay:** Verify your total pay amount is correct in Settings

## Frequently Asked Questions

### Q: Can I have more than 2 deposits?
**A:** Not currently. The feature supports one early deposit and one main deposit. If you need support for more complex pay schedules, please request this feature.

### Q: Does this work with weekly or monthly pay?
**A:** Yes! The early deposit feature works with any pay schedule. Just set your days before payday accordingly.

### Q: What if my early deposit varies each pay period?
**A:** You'll need to update the amount in Settings each time it changes. The system doesn't currently support variable amounts.

### Q: Will this affect my actual bank accounts?
**A:** No! This is only for display and calculation purposes. It doesn't move money or make any changes to your actual bank accounts.

### Q: Can I use different early deposit amounts for different pay periods?
**A:** The setting applies to all future pay periods. If your amount changes, update it in Settings.

### Q: Does early deposit work with multiple income sources (e.g., two jobs)?
**A:** Not directly. The feature is designed for a single paycheck split into two deposits. For multiple jobs, set up your main job's pay schedule and use the standard single payday mode.

## Real-World Examples

### Example 1: SoFi Early Access
**Setup:**
- Bank: SoFi
- Feature: 2-day early direct deposit
- Total Pay: $2,000 bi-weekly
- Early Amount: $500
- Main Pay Date: Every other Thursday

**Configuration:**
```
Early Deposit Bank:     SoFi
Early Deposit Amount:   500
Days Before Payday:     2
Remainder Bank:         Chase
```

**Result:**
- Tuesday: See $500 early deposit
- Thursday: See $1,500 main deposit
- Safe to Spend includes full $2,000

### Example 2: Split Between Accounts
**Setup:**
- You split your paycheck manually
- $300 goes to savings early for bills
- $1,200 goes to checking on payday
- Total Pay: $1,500 bi-weekly

**Configuration:**
```
Early Deposit Bank:     Savings Account
Early Deposit Amount:   300
Days Before Payday:     2
Remainder Bank:         Checking Account
```

**Result:**
- See both deposits clearly separated
- Bills paid from correct account
- Safe to Spend reflects total available

### Example 3: Variable Early Amount
**Setup:**
- Sometimes get $200 early, sometimes $400
- Depends on bank's policies

**Best Practice:**
- Use the **minimum** amount you always get
- Update Settings when you know the exact amount
- Or disable early deposit and just use single payday for simplicity

## Tips for Best Results

1. **Keep Settings Updated**
   - Update your early deposit amount if it changes
   - Keep your main payday date current
   - Verify bank names match your actual banks

2. **Monitor First Few Pay Periods**
   - Watch the Spendability page closely
   - Verify calculations match expectations
   - Adjust settings if needed

3. **Use Consistent Naming**
   - Use official bank names for clarity
   - Be consistent in Settings and Bills pages

4. **Understand the Math**
   - Review the Calculation Breakdown tile
   - Verify each line item
   - Safe to Spend = Everything you'll have minus everything you owe

5. **Combine with Bills Tracking**
   - Enter all bills in the Bills page
   - Let auto-matching clear paid bills
   - Keep bills list up to date for accurate calculations

## Support

If you encounter issues not covered in this guide:
1. Check the browser console for error messages
2. Review your Settings configuration
3. Verify all amounts are entered correctly
4. Try disabling and re-enabling the feature
5. Contact support with specific details about the issue

## Related Features

- **Bills Page:** Track and manage all your bills
- **Auto Bill Clearing:** Automatically marks bills as paid
- **Overdue Tracking:** See which bills are past due
- **Spendability Calculator:** See how much you can safely spend

All these features work together to give you a complete picture of your finances!
