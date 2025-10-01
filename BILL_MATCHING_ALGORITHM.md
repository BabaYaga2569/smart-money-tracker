# Automated Bill Detection and Matching Algorithm

## Overview
This document describes the automated bill detection and matching algorithm that uses Plaid sandbox transaction data to automatically identify and mark recurring bills as paid.

## Algorithm Components

### 1. Merchant Name Matching (Fuzzy Logic)

**Method**: Levenshtein Distance Algorithm

The system uses fuzzy string matching to compare bill names with transaction merchant names. This accounts for variations in how merchants appear on bank statements.

**Matching Logic**:
- **Exact Match**: Bill name exactly matches merchant name (case-insensitive)
- **Substring Match**: One string contains the other (e.g., "Netflix" matches "Netflix Subscription")
- **Similarity Match**: Uses Levenshtein distance to calculate string similarity
  - **Threshold**: 70% similarity required for a match
  - **Formula**: `similarity = 1 - (distance / maxLength)`

**Examples**:
- ✅ "Netflix" ↔ "NETFLIX" (exact, case-insensitive)
- ✅ "Netflix" ↔ "Netflix Subscription" (substring)
- ✅ "Electric Bill" ↔ "Electric Bill Payment" (high similarity)
- ❌ "Comcast" ↔ "Xfinity" (below threshold)

### 2. Amount Matching (Tolerance-Based)

**Tolerance**: ±5% of bill amount

The system allows for small variations in transaction amounts to account for:
- Minor price changes
- Taxes and fees
- Rounding differences

**Formula**:
```javascript
amountDiff = Math.abs(billAmount - transactionAmount)
amountMatch = amountDiff <= (billAmount * 0.05)
```

**Examples**:
- Bill: $15.99, Transaction: $15.99 → ✅ Match (0% difference)
- Bill: $15.99, Transaction: $16.50 → ✅ Match (~3% difference)
- Bill: $15.99, Transaction: $20.00 → ❌ No match (>5% difference)

### 3. Date Proximity Matching

**Window**: ±5 days from due date

Bills are matched to transactions that occur within 5 days before or after the due date, accounting for:
- Early payments
- Weekend/holiday delays
- Processing time

**Formula**:
```javascript
daysDiff = Math.abs((transactionDate - dueDate) / (1000 * 60 * 60 * 24))
dateMatch = daysDiff <= 5
```

**Examples**:
- Due: Jan 15, Transaction: Jan 15 → ✅ Match (0 days)
- Due: Jan 15, Transaction: Jan 18 → ✅ Match (3 days)
- Due: Jan 15, Transaction: Jan 25 → ❌ No match (10 days)

### 4. Duplicate Prevention

The system prevents the same transaction from being matched to multiple bills and prevents bills from being paid twice in the same cycle.

**Checks**:
1. **Transaction Already Used**: Each transaction can only pay one bill
2. **Bill Already Paid**: Bills marked as paid for the current cycle are excluded from matching
3. **Payment History**: Maintains transaction IDs in bill payment history

## Matching Confidence Score

The system calculates a confidence score (0-100) for each match based on:

| Component | Weight | Description |
|-----------|--------|-------------|
| Amount Match | 40 points | Perfect match = 40, scales down with difference |
| Name Match | 40 points | Exact = 40, substring = 35, fuzzy scales based on similarity |
| Date Match | 20 points | Same day = 20, scales down with days difference (up to 5 days) |

**Confidence Levels**:
- **90-100**: Excellent match (exact amount, name, and date)
- **70-89**: Good match (minor variations)
- **50-69**: Moderate match (acceptable with manual review)
- **<50**: Poor match (not recommended)

## Implementation Flow

### 1. Fetch Transactions
```javascript
fetchAndMatchTransactions(accessToken, options)
```
- Retrieves transactions from Plaid API (default: last 30 days)
- Filters for outgoing payments (negative amounts)
- Processes each transaction against active bills

### 2. Find Matching Bills
```javascript
findMatchingBills({ amount, merchantName, date, tolerance })
```
- Gets all active (unpaid) bills
- Applies fuzzy name matching
- Applies amount tolerance check
- Applies date proximity check
- Returns array of matching bills

### 3. Auto-Mark Bills as Paid
```javascript
autoMarkBillAsPaid(bill, transaction)
```
- Creates payment record with transaction details
- Updates bill status to "paid"
- Stores transaction reference
- Triggers user notification

## Usage

### Manual Refresh
Users can manually trigger transaction matching from the Bills page:
```javascript
refreshPlaidTransactions()
```
This fetches recent transactions and matches them with pending bills.

### Automatic Processing
When a new Plaid transaction webhook is received:
```javascript
processTransaction(transaction)
```
The system automatically checks for matching bills and marks them as paid.

### Manual Override
Users can manually mark or unmark bills as paid, overriding automatic detection:
- **Mark Paid**: Manually mark a bill as paid
- **Unmark Paid**: Remove payment status if incorrectly matched

## Configuration

### Adjustable Parameters

```javascript
PlaidIntegrationManager.initialize({
  enabled: true,                    // Enable/disable auto-matching
  transactionTolerance: 0.05,       // 5% amount tolerance
  autoMarkPaid: true                // Auto-mark bills when matched
})
```

### Tolerance Recommendations
- **Strict**: 2-3% (fewer false positives, may miss legitimate matches)
- **Standard**: 5% (recommended - balanced)
- **Lenient**: 10% (more matches, higher false positive rate)

## Testing

Comprehensive test suite covers:
- Fuzzy name matching (4 tests)
- Amount tolerance (2 tests)
- Date proximity (2 tests)
- Duplicate prevention (2 tests)
- Match confidence calculation (4 tests)
- Multiple bill scenarios (2 tests)
- String similarity algorithms (3 tests)
- Integration status (1 test)

**Run tests**:
```bash
cd frontend/src/utils
node BillMatchingService.test.js
```

## Future Enhancements

1. **Machine Learning**: Train model on user corrections to improve matching
2. **Merchant Aliases**: Build database of known merchant name variations
3. **Category Matching**: Use transaction category as additional matching signal
4. **Smart Tolerance**: Dynamically adjust tolerance based on bill type
5. **Batch Processing**: Process multiple months of historical transactions

## Troubleshooting

### Common Issues

**Issue**: Bills not being matched
- Check merchant name similarity (must be ≥70%)
- Verify amount is within 5% tolerance
- Ensure transaction is within ±5 days of due date
- Confirm bill is not already marked as paid

**Issue**: Wrong bills being matched
- Reduce amount tolerance (try 2-3%)
- Increase name similarity threshold (try 80%)
- Reduce date window (try ±3 days)

**Issue**: Duplicate matches
- System should prevent this automatically
- Check payment history for transaction IDs
- Verify duplicate prevention logic is working

## Security Considerations

- Access tokens are stored securely in localStorage
- Transaction data is fetched only when user initiates refresh
- All Plaid communication uses HTTPS
- Transaction IDs prevent duplicate processing
- User can manually override all automatic decisions

## API Reference

### PlaidIntegrationManager

#### Methods

- `initialize(config)` - Initialize the matching system
- `fetchAndMatchTransactions(accessToken, options)` - Fetch and process transactions
- `findMatchingBills(transactionData)` - Find bills matching a transaction
- `calculateMatchConfidence(bill, transaction)` - Calculate match confidence score
- `refreshBillMatching(accessToken)` - Manual refresh with notifications
- `autoMarkBillAsPaid(bill, transaction)` - Mark bill as paid automatically
- `fuzzyMatch(str1, str2, threshold)` - Fuzzy string matching
- `levenshteinDistance(str1, str2)` - Calculate edit distance

#### Configuration

```javascript
{
  enabled: boolean,                 // Enable auto-matching
  transactionTolerance: number,     // Amount tolerance (0-1)
  autoMarkPaid: boolean            // Auto-mark matched bills
}
```

## Implementation Notes

### Plaid Sandbox vs Production

The algorithm works identically in both Plaid sandbox and production environments:
- Sandbox: Use test data for development
- Production: Use real bank transactions

**Switching to Production**:
1. Update Plaid credentials in backend `.env`
2. Change `basePath` to `PlaidEnvironments.production`
3. No code changes needed in matching algorithm

### Transaction Format

Expected Plaid transaction format:
```javascript
{
  transaction_id: string,
  account_id: string,
  amount: number,              // Positive for outgoing
  merchant_name: string,       // Or 'name'
  date: string,                // YYYY-MM-DD
  category: Array<string>
}
```

## Support

For questions or issues with the bill matching algorithm:
1. Check this documentation
2. Run the test suite to verify functionality
3. Review console logs for matching decisions
4. Check the GitHub repository issues
