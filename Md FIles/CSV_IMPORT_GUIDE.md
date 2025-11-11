# CSV Import Guide - Plaid Account Mapping

## Overview

The recurring bills CSV import now supports automatic mapping to Plaid accounts using institution names. This allows you to import bills from spreadsheets and automatically link them to your connected bank accounts.

## CSV Format

Your CSV file should include the following columns:

| Column | Required | Aliases | Description | Example |
|--------|----------|---------|-------------|---------|
| Name | Yes | Description, Bill, Merchant, Payee | Bill or subscription name | "Netflix Subscription" |
| Amount | Yes | Cost, Price, Payment, Total | Monthly payment amount | "15.99" |
| Date | No | Due, Day of Month Due, Due Day | Next due date or day of month (1-31) | "2025-02-15" or "15" |
| Frequency | No | Period, Recurring, Schedule | Payment schedule | "monthly" |
| Category | No | Type, Group | Transaction category | "Subscriptions" |
| Institution Name | No | Bank, Bank Name | Bank name for auto-matching | "Chase" |

**Note:** The CSV importer is flexible and will detect common column name variations automatically.

### Sample CSV Format 1: Full Dates

```csv
Name,Amount,Date,Frequency,Category,Institution Name
Netflix Subscription,15.99,2025-02-15,monthly,Subscriptions,Chase
Electric Bill,125.50,2025-02-20,monthly,Bills & Utilities,Bank of America
Internet Service,89.99,2025-02-10,monthly,Bills & Utilities,Capital One
Gym Membership,45.00,2025-02-01,monthly,Health & Fitness,USAA
Car Insurance,150.00,2025-02-25,monthly,Bills & Utilities,Wells Fargo
```

### Sample CSV Format 2: Day of Month (Simplified)

```csv
Description,Amount,Day of Month Due,Institution Name
Netflix,15.99,15,Chase
Electric Bill,125.50,20,Bank of America
Internet Service,89.99,10,Capital One
Gym Membership,45.00,1,USAA
Car Insurance,150.00,25,Wells Fargo
```

**Day of Month Due:** When using just a number (1-31), the system automatically calculates the next occurrence:
- If the day hasn't passed this month, it uses the current month
- If the day has already passed, it uses next month
- Default frequency is "monthly" if not specified

## Import Workflow

### Step 1: Upload CSV
1. Navigate to the Recurring Bills page
2. Click "Import from CSV"
3. Select your CSV file

### Step 2: Preview & Edit
- Review imported bills
- Edit categories and types as needed
- Remove any unwanted items
- **Error Handling**: If errors are detected:
  - ⚠️ Error section appears at the top with auto-scroll
  - Each error shows the row number, error message, and full row data
  - View all column values from problematic rows for easy debugging
  - Click "Clear Errors" to remove all bad rows and continue
  - Cannot proceed until all errors are fixed or cleared

### Step 3: Account Assignment (Auto)
The system will automatically match institution names to your Plaid accounts:
- **Exact Match**: "Chase" → Chase Checking
- **Legacy Match**: "Bank of America" → Bank of America Savings
- **Fuzzy Match**: "Capital One Bank" → Capital One Credit

### Step 4: Manual Assignment (If Needed)
For any unmatched bills:
- **Individual Assignment**: Select the correct account for each bill
- **Bulk Assignment**: Assign all unmatched bills to one default account
- **Save Mapping**: Click the 💾 icon to save custom mappings for future imports

### Step 5: Mapping Table
- View and edit saved institution-to-account mappings
- Mappings are preserved across imports
- Remove unwanted mappings as needed

### Step 6: Resolve Conflicts
If duplicate bills are detected, choose:
- **Keep Both**: Import as new bill
- **Skip**: Don't import this bill
- **Merge**: Update existing bill with new data

### Step 7: Complete Import
Review the import summary and click "Done"

## Institution Name Matching

### Supported Legacy Names

The system recognizes common legacy bank names:
- "Bank of America", "BoFA", "BoA"
- "USAA", "USAA Federal Savings Bank"
- "Chase", "JPMorgan Chase", "JP Morgan"
- "Wells Fargo", "Wells Fargo Bank"
- "Capital One", "Capital One Bank", "CapitalOne"
- "Citibank", "Citi", "Citigroup"
- And many more...

### Environment Support

The matching system works in both:
- **Development**: Matches to Plaid sandbox accounts
- **Production**: Matches to real Plaid accounts

### Custom Mappings

Create custom mappings for your specific needs:
1. During import, assign an account to a bill with an institution name
2. Click the 💾 icon next to that bill
3. The mapping is saved for future imports
4. Manage mappings in the Institution Mapping Table

## Best Practices

1. **Include Institution Names**: Always include the "Institution Name" column for automatic matching
2. **Use Consistent Names**: Use the same institution name format across all CSV imports
3. **Save Mappings**: Save custom mappings for frequently imported institutions
4. **Review Before Import**: Always review the preview step to catch any issues
5. **Bulk Assignment**: Use bulk assignment when many bills share the same account
6. **Fix Errors First**: Address all CSV errors before proceeding with import

## Common Import Errors

### "Name is required"
**Cause:** Missing or empty bill name/description  
**Fix:** Ensure every row has a value in the Name/Description column  
**Example:** Add "Netflix Subscription" instead of leaving blank

### "Valid amount is required"
**Cause:** Missing, zero, or invalid amount value  
**Fix:** Ensure amount is a positive number (decimals allowed)  
**Example:** Use "15.99" instead of "", "0", or "free"

### Error Display Features
- **Full Row Data**: See all column values for the problematic row
- **Auto-Scroll**: Page automatically scrolls to error section
- **Clear Errors**: One-click removal of all bad rows to continue
- **Color Coding**: Green column names, "(empty)" markers for missing values

## Troubleshooting

### Problem: Bills not matching to accounts
**Solution**: 
- Check that institution names in CSV match your Plaid account names
- Use the manual assignment step to select the correct account
- Save the mapping for future imports

### Problem: Wrong account matched
**Solution**:
- In the account assignment step, manually select the correct account
- Remove the incorrect mapping from the mapping table
- Save the corrected mapping

### Problem: No accounts available
**Solution**:
- Connect Plaid accounts on the Accounts page first
- Ensure accounts are loaded properly before importing CSV

## Development vs Production

### Sandbox (Development)
- Uses Plaid sandbox credentials
- Test with sample bank accounts
- Safe for testing and development

### Production
- Uses real Plaid accounts
- Real bank data and transactions
- Requires verified Plaid credentials

The CSV import feature automatically adapts to the environment and matches bills to the appropriate account type.
