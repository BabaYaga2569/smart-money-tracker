# Payment Matching System

## Overview

The Universal Transaction-to-Bill Matching System automatically links bank transactions to bills using a sophisticated multi-strategy matching engine. This eliminates the need for manual bill payment tracking, especially for P2P payments like Zelle, Venmo, and CashApp.

## Problem Solved

**Before:** Zelle/Venmo payments couldn't be matched to bills because:
- Payment names like "Zelle Transfer CONF# P73F008MJ; RAYLENE PANDO..." don't match bill names like "First Rent Payment"
- Only basic fuzzy string matching was available
- No way to handle edge cases
- No learning from user corrections

**After:** 90%+ auto-match rate for P2P payments with:
- Payment pattern recognition
- User-defined rules
- Learning from manual corrections
- Multiple matching strategies

## Matching Strategies

The system uses **4 strategies** in priority order:

### 1. User-Defined Rules (95% confidence)
Highest priority. Custom rules you create for specific bills.

**Example:**
```javascript
{
  billName: "First Rent Payment",
  matchCriteria: {
    amountExact: 350.00,
    amountTolerance: 0.50,
    requiredKeywords: ["raylene", "pando"],
    transactionTypes: ["zelle"],
    dateWindow: { daysBefore: 3, daysAfter: 5 }
  }
}
```

### 2. Payment Pattern Matching (90% confidence)
Automatically detects and extracts recipient information from P2P payments.

**Supported Payment Types:**
- **Zelle**: Extracts recipient name from "Zelle Transfer CONF# ...; JOHN DOE"
- **Venmo**: Extracts from "Venmo Payment to @username"
- **CashApp**: Extracts from "Cash App to $username"
- **Check**: Extracts from "Check #1234 to John Doe"
- **ACH**: Extracts from "ACH Payment to Company Name"

### 3. Merchant Aliases (85% confidence)
Uses existing merchant alias database for traditional payments.

### 4. Fuzzy Name Matching (67-80% confidence)
Fallback strategy using Levenshtein distance for string similarity.

## Creating Payment Rules

### Method 1: Manual Linking (Recommended)

1. Go to **Bills** page
2. Find an unpaid bill
3. Click **🔗 Link Transaction** button
4. Select matching transaction
5. Check **"Create payment rule for future matches"**
6. Click **Link Transaction**

The system automatically creates a rule with:
- Extracted keywords from transaction name
- Amount with tolerance
- Default date window (±3-5 days)

### Method 2: Interactive CLI Wizard

Run from backend directory:
```bash
node scripts/10-setup-payment-rules.js USER_ID
```

The wizard will:
1. Scan for unmatched transactions
2. Detect P2P payments automatically
3. Extract recipient names and keywords
4. Guide you through matching to bills
5. Create optimized rules

### Method 3: Manual Creation (Advanced)

Create rules directly in Payment Rules Manager (`/payment-rules`):

```javascript
{
  billName: "Electric Bill",
  matchCriteria: {
    amountExact: 150.00,
    amountTolerance: 10.00,
    requiredKeywords: ["electric", "power"],
    optionalKeywords: ["utility"],
    transactionTypes: ["ach"],
    dateWindow: {
      daysBefore: 5,
      daysAfter: 3
    }
  }
}
```

## Common Scenarios

### Scenario 1: Rent Payment via Zelle

**Problem:** 
- Bill: "First Rent Payment" ($1,350)
- Transaction: "Zelle Transfer CONF# P73F008MJ; LANDLORD NAME LLC"

**Solution:**
1. Click **🔗 Link Transaction** on rent bill
2. Select the Zelle transaction
3. System extracts keywords: `["landlord", "name", "llc"]`
4. Creates rule matching future Zelle payments with these keywords

**Result:** All future rent Zelle transfers auto-match at 90%+ confidence

### Scenario 2: Variable Utility Bill

**Problem:**
- Bill: "Electric Bill" (amount varies $120-$180)
- Transaction: "ACH DEBIT - ELECTRIC COMPANY"

**Solution:**
```javascript
matchCriteria: {
  amountTolerance: 30.00,  // Wide tolerance for variable amounts
  requiredKeywords: ["electric", "company"],
  transactionTypes: ["ach"],
  dateWindow: { daysBefore: 7, daysAfter: 7 }
}
```

### Scenario 3: Multiple Payment Methods

**Problem:**
- Sometimes pay rent via Zelle, sometimes via check

**Solution:**
Create rule with multiple transaction types:
```javascript
matchCriteria: {
  transactionTypes: ["zelle", "check"],
  requiredKeywords: ["landlord"], // Common keyword
  ...
}
```

## Managing Payment Rules

### Viewing Rules

Navigate to **Payment Rules Manager** (`/payment-rules`):
- See all rules with statistics
- View enabled/disabled status
- Check match counts and confidence
- See example matched transactions

### Editing Rules

1. Click rule to expand details
2. View match criteria and examples
3. Toggle enabled/disabled status
4. Delete rules if needed

**Note:** Currently, editing criteria requires deleting and recreating the rule.

### Rule Statistics

Each rule shows:
- **Match Count**: Total successful matches
- **Confidence**: Matching confidence level (0-100%)
- **Source**: How the rule was created (manual, cli_wizard, auto)
- **Created Date**: When the rule was created

## Best Practices

### DO ✅

- **Use descriptive bill names** that match transaction descriptions
- **Create rules after first manual link** to automate future matches
- **Use wide date windows** for bills with flexible due dates
- **Test rules by running link scripts** to verify matches
- **Keep rules enabled** unless temporarily not needed

### DON'T ❌

- **Don't create duplicate rules** for the same bill
- **Don't use overly specific keywords** that might change
- **Don't set tight amount tolerance** for variable bills
- **Don't delete rules** unless bill is permanently gone
- **Don't forget to link manually** if auto-match fails

## Troubleshooting

### Bill Not Auto-Matching

**Check:**
1. Is there a matching transaction in the date window?
2. Does amount match within tolerance?
3. Are required keywords present in transaction name?
4. Is the rule enabled?

**Solutions:**
- Widen date window: `daysBefore: 7, daysAfter: 7`
- Increase amount tolerance: `amountTolerance: 5.00`
- Reduce required keywords to essentials
- Check Payment Rules Manager for disabled rules

### Too Many False Matches

**Check:**
1. Are keywords too generic?
2. Is amount tolerance too wide?
3. Are transaction types too broad?

**Solutions:**
- Add more specific required keywords
- Tighten amount tolerance
- Specify exact transaction types
- Add more criteria to be more selective

### P2P Payment Not Recognized

**Check:**
1. Does transaction name contain payment type keywords?
2. Is recipient name extractable?

**Example Formats:**
- ✅ Good: "Zelle Transfer CONF# ABC123; JOHN DOE"
- ✅ Good: "Venmo Payment to @username"
- ❌ Bad: "Transfer 123456" (too generic)

**Solution:**
Create manual rule with keywords from transaction name

## Running Match Scripts

### Link Transactions Script

Matches all unlinked transactions to bills:

```bash
cd backend
node scripts/06-link-transactions.js
```

**What it does:**
1. Loads all payment rules
2. Loads merchant aliases
3. Scans unlinked financial events (bills)
4. Tries all 4 matching strategies
5. Links transactions with 70%+ confidence
6. Shows strategy breakdown

### Auto-Clear Paid Bills Script

Clears overdue bills by matching transactions:

```bash
cd backend
node scripts/08-auto-clear-paid-bills.js USER_ID
```

**What it does:**
1. Loads transactions from last 60 days
2. Loads unpaid bills
3. Matches using TransactionMatcher
4. Marks bills as paid
5. Advances recurring patterns
6. Generates next bills

## Technical Details

### Match Criteria Fields

```javascript
matchCriteria: {
  // Amount matching
  amountExact: 350.00,           // Exact amount to match
  amountTolerance: 0.50,         // +/- tolerance
  
  // Keyword matching
  requiredKeywords: ["word1"],   // All must be present
  optionalKeywords: ["word2"],   // Bonus points if present
  
  // Transaction type filtering
  transactionTypes: ["zelle", "venmo", "cashapp", "check", "ach", "wire"],
  
  // Date window
  dateWindow: {
    daysBefore: 3,               // Days before due date
    daysAfter: 5                 // Days after due date
  }
}
```

### Confidence Scoring

The system calculates confidence based on multiple factors:

**User Rule (0.95):**
- All criteria matched → 0.95 confidence
- Most criteria matched → 0.80-0.90 confidence

**Payment Pattern (0.90):**
- Recipient name match + amount + date → 0.90 confidence
- Partial match → 0.70-0.85 confidence

**Merchant Alias (0.85):**
- Direct alias match + amount + date → 0.85 confidence

**Fuzzy Match (0.67-0.80):**
- High name similarity + amount + date → 0.75-0.80 confidence
- Moderate similarity → 0.67-0.75 confidence

### Pattern Recognition

The PaymentPatternMatcher uses regex patterns to extract recipient information:

```javascript
// Zelle pattern
/zelle\s+(?:transfer|payment|to)?\s*(?:conf#?\s*[a-z0-9]+)?\s*;?\s*([a-z\s]+)/i

// Venmo pattern
/venmo\s+(?:payment\s+)?(?:to\s+)?(@?[a-z0-9\s]+)/i

// CashApp pattern
/cash\s+app\s+(?:to\s+)?(\$?@?[a-z0-9]+)/i
```

## Database Schema

### paymentRules Collection

```javascript
users/{userId}/paymentRules/{ruleId}
{
  ruleId: string,
  billName: string,
  billId: string,
  matchCriteria: {
    amountExact: number,
    amountTolerance: number,
    requiredKeywords: string[],
    optionalKeywords: string[],
    transactionTypes: string[],
    dateWindow: {
      daysBefore: number,
      daysAfter: number
    }
  },
  createdAt: timestamp,
  createdBy: string,
  matchCount: number,
  confidence: number,
  enabled: boolean,
  source: string,
  examples: [{
    transactionId: string,
    transactionName: string,
    amount: number,
    date: string
  }]
}
```

### Linked Transaction Fields

When a transaction is linked to a bill:

**financialEvent (bill):**
```javascript
{
  linkedTransactionId: string,
  linkedAt: timestamp,
  linkConfidence: number,
  linkStrategy: string,  // "user_rule", "payment_pattern", etc.
  linkRuleId: string     // If matched by rule
}
```

**transaction:**
```javascript
{
  linkedEventId: string,
  linkedAt: timestamp
}
```

## API Reference

### TransactionMatcher

```javascript
import { TransactionMatcher } from './utils/TransactionMatcher.js';

const matcher = new TransactionMatcher(db, userId);
await matcher.initialize();

const match = await matcher.findMatch(bill, transactions);
// Returns: { transaction, confidence, strategy, ... }
```

### PaymentPatternMatcher

```javascript
import { PaymentPatternMatcher } from './utils/PaymentPatternMatcher.js';

const matcher = new PaymentPatternMatcher();
const paymentInfo = matcher.extractPaymentInfo(transaction);
// Returns: { paymentType, recipient, confidence, keywords }
```

## FAQs

**Q: Do I need to create rules for every bill?**
A: No. Many bills auto-match with existing strategies. Only create rules for problem cases like P2P payments.

**Q: Can I have multiple rules for the same bill?**
A: Not recommended. One comprehensive rule is better than multiple overlapping rules.

**Q: What happens if a transaction matches multiple rules?**
A: The rule with highest confidence wins. User rules have highest priority.

**Q: Can I edit a rule's criteria?**
A: Currently no. Delete the rule and create a new one with updated criteria.

**Q: Will rules match historical transactions?**
A: Yes, when you run `06-link-transactions.js` script.

**Q: What if I manually mark a bill paid without linking a transaction?**
A: That's fine. The bill will be marked paid but won't create a link or rule.

## Support

For issues or questions:
1. Check this documentation
2. Review Payment Rules Manager for rule status
3. Check browser console for errors
4. Run linking scripts with debug output
5. Create an issue on GitHub

## Future Enhancements

Potential improvements for future versions:
- Machine learning-based matching
- Automatic rule optimization
- Bulk rule creation
- Rule testing interface
- Match preview before linking
- Advanced keyword extraction with NLP
- Multi-bill split matching
- Scheduled rule execution
