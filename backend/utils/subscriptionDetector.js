/**
 * Subscription Auto-Detection Algorithm
 * Analyzes transaction history to identify recurring subscription patterns
 */

// Category keywords for intelligent categorization
const SUBSCRIPTION_CATEGORY_KEYWORDS = {
  "Entertainment": ["netflix", "spotify", "hulu", "disney", "hbo", "youtube premium", "prime video", "apple tv", "paramount", "peacock", "max", "showtime"],
  "Fitness": ["gym", "planet fitness", "24 hour fitness", "la fitness", "equinox", "yoga", "peloton", "fitness", "crunch", "anytime fitness"],
  "Software": ["adobe", "microsoft", "github", "dropbox", "icloud", "google one", "notion", "slack", "zoom", "canva", "grammarly"],
  "Utilities": ["electric", "electricity", "gas", "water", "internet", "phone", "mobile", "verizon", "at&t", "comcast", "xfinity", "t-mobile"],
  "Food": ["meal kit", "hello fresh", "blue apron", "factor", "home chef", "freshly", "daily harvest"],
  "Other": []
};

/**
 * Detect recurring subscription patterns from transaction history
 * @param {Array} transactions - All user transactions
 * @param {Array} existingSubscriptions - Already tracked subscriptions
 * @returns {Array} Detected subscription patterns with confidence scores
 */
function detectSubscriptions(transactions, existingSubscriptions = []) {
  // Step 1: Filter out transactions that might be subscriptions
  // (negative amounts = expenses in our system)
  const expenseTransactions = transactions.filter(tx => 
    tx.amount < 0 && 
    tx.merchant_name && 
    tx.merchant_name.trim() !== ''
  );

  // Step 2: Group transactions by merchant name (case-insensitive)
  const merchantGroups = groupByMerchant(expenseTransactions);

  // Step 3: Filter merchants with 2+ transactions (minimum for pattern)
  const potentialSubscriptions = [];
  
  for (const [merchantName, txList] of Object.entries(merchantGroups)) {
    if (txList.length < 2) continue;

    // Sort by date (oldest first)
    txList.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Step 4: Check amount consistency (±$2 tolerance)
    const amounts = txList.map(tx => Math.abs(tx.amount));
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const amountConsistency = calculateAmountConsistency(amounts, avgAmount);

    if (amountConsistency < 0.3) continue; // Too much variation

    // Step 5: Calculate time intervals between charges
    const intervals = calculateIntervals(txList);
    if (intervals.length === 0) continue;

    // Step 6: Detect billing cycle
    const billingCycle = detectBillingCycle(intervals);
    if (!billingCycle) continue; // No recognizable pattern

    // Step 7: Calculate confidence score
    const confidence = calculateConfidenceScore({
      occurrences: txList.length,
      amountConsistency,
      intervalRegularity: calculateIntervalRegularity(intervals, billingCycle),
      timeSpan: getTimeSpan(txList)
    });

    // Only show suggestions with 75%+ confidence
    if (confidence < 75) continue;

    // Step 8: Estimate next renewal date
    const lastTransaction = txList[txList.length - 1];
    const nextRenewal = estimateNextRenewal(lastTransaction.date, billingCycle);

    // Step 9: Suggest category
    const category = suggestCategory(merchantName);

    // Step 10: Check if already tracked
    if (isAlreadyTracked(merchantName, existingSubscriptions)) continue;

    potentialSubscriptions.push({
      merchantName,
      amount: avgAmount,
      billingCycle,
      confidence: Math.round(confidence),
      occurrences: txList.length,
      recentCharges: txList.slice(-3).map(tx => ({
        date: tx.date,
        amount: Math.abs(tx.amount)
      })),
      nextRenewal,
      category,
      transactionIds: txList.map(tx => tx.transaction_id || tx.id)
    });
  }

  // Sort by confidence (highest first)
  potentialSubscriptions.sort((a, b) => b.confidence - a.confidence);

  return potentialSubscriptions;
}

/**
 * Group transactions by merchant name (normalized)
 */
function groupByMerchant(transactions) {
  const groups = {};
  
  for (const tx of transactions) {
    const merchant = normalizeMerchantName(tx.merchant_name);
    if (!groups[merchant]) {
      groups[merchant] = [];
    }
    groups[merchant].push(tx);
  }
  
  return groups;
}

/**
 * Normalize merchant name for grouping
 */
function normalizeMerchantName(name) {
  return name
    .toLowerCase()
    .trim()
    // Remove common suffixes that vary
    .replace(/\s*(inc|llc|ltd|corp|co|.com)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate amount consistency (0-1, where 1 = exact amounts)
 */
function calculateAmountConsistency(amounts, avgAmount) {
  const tolerance = 2.0; // $2 tolerance
  const consistentCount = amounts.filter(amt => 
    Math.abs(amt - avgAmount) <= tolerance
  ).length;
  
  return consistentCount / amounts.length;
}

/**
 * Calculate intervals between transactions (in days)
 */
function calculateIntervals(transactions) {
  const intervals = [];
  
  for (let i = 1; i < transactions.length; i++) {
    const prevDate = new Date(transactions[i - 1].date);
    const currDate = new Date(transactions[i].date);
    const daysDiff = Math.round((currDate - prevDate) / (1000 * 60 * 60 * 24));
    intervals.push(daysDiff);
  }
  
  return intervals;
}

/**
 * Detect billing cycle from intervals
 */
function detectBillingCycle(intervals) {
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  
  // Monthly: 28-32 days apart
  if (avgInterval >= 28 && avgInterval <= 32) {
    return 'Monthly';
  }
  
  // Quarterly: 89-93 days apart
  if (avgInterval >= 89 && avgInterval <= 93) {
    return 'Quarterly';
  }
  
  // Annual: 360-370 days apart
  if (avgInterval >= 360 && avgInterval <= 370) {
    return 'Annual';
  }
  
  return null;
}

/**
 * Calculate interval regularity (0-1, where 1 = perfectly regular)
 */
function calculateIntervalRegularity(intervals, billingCycle) {
  const expectedInterval = {
    'Monthly': 30,
    'Quarterly': 91,
    'Annual': 365
  }[billingCycle];
  
  const tolerance = billingCycle === 'Monthly' ? 2 : 
                   billingCycle === 'Quarterly' ? 2 : 5;
  
  const regularCount = intervals.filter(interval => 
    Math.abs(interval - expectedInterval) <= tolerance
  ).length;
  
  return intervals.length > 0 ? regularCount / intervals.length : 0;
}

/**
 * Get time span of transactions (in months)
 */
function getTimeSpan(transactions) {
  const firstDate = new Date(transactions[0].date);
  const lastDate = new Date(transactions[transactions.length - 1].date);
  const monthsDiff = (lastDate - firstDate) / (1000 * 60 * 60 * 24 * 30);
  return monthsDiff;
}

/**
 * Calculate confidence score (0-100)
 * Formula: (occurrenceScore * 0.4) + (amountConsistency * 0.3) + 
 *          (intervalRegularity * 0.2) + (timeSpanScore * 0.1) * 100
 */
function calculateConfidenceScore({ occurrences, amountConsistency, intervalRegularity, timeSpan }) {
  // Occurrence score (more transactions = higher confidence)
  // 2 occurrences = 0.5, 6+ occurrences = 1.0
  const occurrenceScore = Math.min(1.0, (occurrences - 2) / 4 + 0.5);
  
  // Time span score (longer history = higher confidence)
  // 3+ months = 1.0
  const timeSpanScore = Math.min(1.0, timeSpan / 3);
  
  const confidence = (
    (occurrenceScore * 0.4) +
    (amountConsistency * 0.3) +
    (intervalRegularity * 0.2) +
    (timeSpanScore * 0.1)
  ) * 100;
  
  return confidence;
}

/**
 * Estimate next renewal date
 */
function estimateNextRenewal(lastChargeDate, billingCycle) {
  const lastDate = new Date(lastChargeDate);
  const nextDate = new Date(lastDate);
  
  switch (billingCycle) {
    case 'Monthly':
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    case 'Quarterly':
      nextDate.setMonth(nextDate.getMonth() + 3);
      break;
    case 'Annual':
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      break;
  }
  
  return nextDate.toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Suggest category based on merchant name
 */
function suggestCategory(merchantName) {
  const lowerName = merchantName.toLowerCase();
  
  for (const [category, keywords] of Object.entries(SUBSCRIPTION_CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerName.includes(keyword.toLowerCase())) {
        return category;
      }
    }
  }
  
  return 'Other';
}

/**
 * Check if subscription is already tracked
 */
function isAlreadyTracked(merchantName, existingSubscriptions) {
  const normalizedMerchant = normalizeMerchantName(merchantName);
  
  return existingSubscriptions.some(sub => {
    const normalizedSubName = normalizeMerchantName(sub.name);
    return normalizedSubName === normalizedMerchant || 
           normalizedSubName.includes(normalizedMerchant) ||
           normalizedMerchant.includes(normalizedSubName);
  });
}

module.exports = { detectSubscriptions };
