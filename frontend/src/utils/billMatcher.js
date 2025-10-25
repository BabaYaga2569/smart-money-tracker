// BillMatcher.js

// Helper function to normalize strings for comparison
function normalizeString(str) {
    return str.toLowerCase().replace(/\s+/g, ' ').trim();
}

// Generate variations of names to improve matching
function generateNameVariations(name) {
    const variations = [name];
    // Add simple variations: abbreviations, common misspellings, etc.
    variations.push(name.replace(/Inc\.?/i, '')); // Remove 'Inc.'
    variations.push(name.replace(/LLC\.?/i, '')); // Remove 'LLC'
    return variations;
}

// Calculate similarity between two strings
function calculateSimilarity(str1, str2) {
    // A simple similarity measure (could be improved with a library)
    const normalizedStr1 = normalizeString(str1);
    const normalizedStr2 = normalizeString(str2);
    const matches = normalizedStr1.split(' ').filter(word => normalizedStr2.includes(word));
    return matches.length / Math.max(normalizedStr1.split(' ').length, normalizedStr2.split(' ').length);
}

// Match names using generated variations and similarity scoring
function matchNames(billName, transactionNames) {
    const billVariations = generateNameVariations(billName);
    return transactionNames.filter(transactionName => 
        billVariations.some(variation => calculateSimilarity(variation, transactionName) > 0.8)
    );
}

// Enhanced function to find matching transaction for a bill
function findMatchingTransactionForBill(bill, transactions) {
    const matchingTransactions = transactions.filter(transaction => {
        const dateDifference = Math.abs(new Date(transaction.date) - new Date(bill.date)) / (1000 * 3600 * 24);
        const amountDifference = Math.abs(transaction.amount - bill.amount);
        const nameMatches = matchNames(bill.name, [transaction.name]);

        return dateDifference <= 3 && amountDifference <= 2 && nameMatches.length > 0;
    });
    return matchingTransactions;
}

// Batch matching function for bills
function batchMatchBills(bills, transactions) {
    return bills.map(bill => {
        const matchingTransactions = findMatchingTransactionForBill(bill, transactions);
        return {
            bill,
            matchingTransactions
        };
    });
}

export { findMatchingTransactionForBill, batchMatchBills };