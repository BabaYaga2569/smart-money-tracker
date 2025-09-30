# CSV Import Guide - Plaid Account Mapping

## Overview

The recurring bills CSV import now supports automatic mapping to Plaid accounts using institution names. This allows you to import bills from spreadsheets and automatically link them to your connected bank accounts.

## CSV Format

Your CSV file should include the following columns:

| Column | Required | Description | Example |
|--------|----------|-------------|---------|
| Name | Yes | Bill or subscription name | "Netflix Subscription" |
| Amount | Yes | Monthly payment amount | "15.99" |
| Date | No | Next due date | "2025-02-15" |
| Frequency | No | Payment schedule | "monthly" |
| Category | No | Transaction category | "Subscriptions" |
| Institution Name | No | Bank name for auto-matching | "Chase" |

### Sample CSV

```csv
Name,Amount,Date,Frequency,Category,Institution Name
Netflix Subscription,15.99,2025-02-15,monthly,Subscriptions,Chase
Electric Bill,125.50,2025-02-20,monthly,Bills & Utilities,Bank of America
Internet Service,89.99,2025-02-10,monthly,Bills & Utilities,Capital One
Gym Membership,45.00,2025-02-01,monthly,Health & Fitness,USAA
Car Insurance,150.00,2025-02-25,monthly,Bills & Utilities,Wells Fargo
```

## Import Workflow

### Step 1: Upload CSV
1. Navigate to the Recurring Bills page
2. Click "Import from CSV"
3. Select your CSV file

### Step 2: Preview & Edit
- Review imported bills
- Edit categories and types as needed
- Remove any unwanted items

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
