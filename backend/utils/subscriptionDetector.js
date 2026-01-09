/**
 * Recurring Bills Auto-Detection Algorithm
 * Analyzes transaction history to identify recurring bill and subscription patterns
 */

// Comprehensive bill categories for intelligent categorization
const BILL_CATEGORIES = {
  "Housing": {
    keywords: ["rent", "mortgage", "apartment", "property management", "hoa", "landlord", "lease", "housing"],
    icon: "🏠"
  },
  "Auto & Transportation": {
    keywords: ["chrysler capital", "chase auto", "ally auto", "car payment", "auto loan", "car insurance", "progressive", "geico", "state farm", "allstate", "insurance auto"],
    icon: "🚗"
  },
  "Credit Cards & Loans": {
    keywords: [
      // Personal loans
      "upgrade", "lending club", "sofi", "prosper", "avant", "upstart", "best egg", "marcus",
      // BNPL
      "affirm", "klarna", "afterpay", "sezzle", "quadpay", "zip", "splitit",
      // Credit cards
      "capital one", "chase", "citi", "amex", "discover", "wells fargo", "comenity", "bread financial", "synchrony"
    ],
    icon: "💳"
  },
  "Utilities & Home Services": {
    keywords: ["electric", "nv energy", "duke energy", "pge", "water", "gas", "sewer", "trash", "waste management", "republic services", "utility"],
    icon: "💡"
  },
  "Phone & Internet": {
    keywords: ["verizon", "att", "at&t", "t-mobile", "sprint", "comcast", "xfinity", "spectrum", "cox", "frontier", "centurylink", "phone", "mobile", "internet"],
    icon: "📱"
  },
  "Insurance & Healthcare": {
    keywords: ["insurance", "health", "dental", "vision", "life insurance", "disability", "cigna", "aetna", "united healthcare"],
    icon: "🏥"
  },
  "Subscriptions & Entertainment": {
    keywords: ["netflix", "spotify", "hulu", "disney", "hbo", "youtube premium", "apple music", "amazon prime", "xbox", "playstation", "streaming"],
    icon: "🎬"
  },
  "Fitness & Gym": {
    keywords: ["gym", "fitness", "planet fitness", "24 hour fitness", "la fitness", "equinox", "yoga", "peloton", "crunch", "anytime fitness"],
    icon: "💪"
  },
  "Personal Care": {
    keywords: ["ulta", "sephora", "salon", "spa", "beauty", "massage", "nail", "hair"],
    icon: "💅"
  },
  "Software & Technology": {
    keywords: ["adobe", "microsoft", "github", "dropbox", "icloud", "google one", "notion", "slack", "zoom", "canva", "grammarly", "software"],
    icon: "💻"
  },
  "Financial Services": {
    keywords: ["bank fee", "account fee", "safe deposit", "advisor fee", "investment fee"],
    icon: "💰"
  },
  "Other": {
    keywords: [],
    icon: "📦"
  }
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

    // Step 4: Check amount consistency with dynamic tolerance
    const amounts = txList.map(tx => Math.abs(tx.amount));
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    
    // Dynamic amount tolerance: $5 or 10%, whichever is larger
    const amountTolerance = Math.max(5, avgAmount * 0.10);
    const amountConsistency = calculateAmountConsistency(amounts, avgAmount, amountTolerance);
    
    // Support variable amounts (like utilities)
    let isVariableBill = false;
    let amountRange = null;
    if (amountConsistency < 0.3 && amounts.length >= 3) {
      const variance = (Math.max(...amounts) - Math.min(...amounts)) / avgAmount;
      if (variance < 0.25) {  // Within 25% variance
        isVariableBill = true;
        amountRange = {
          min: Math.min(...amounts),
          max: Math.max(...amounts),
          avg: avgAmount
        };
      } else {
        continue; // Too much variation
      }
    } else if (amountConsistency < 0.3) {
      continue; // Too much variation
    }

    // Step 5: Calculate time intervals between charges
    const intervals = calculateIntervals(txList);
    if (intervals.length === 0) continue;

    // Step 6: Detect billing cycle
    const billingCycle = detectBillingCycle(intervals);
    if (!billingCycle) continue; // No recognizable pattern

    // Step 7: Calculate confidence score (lowered threshold)
    const confidence = calculateConfidenceScore({
      occurrences: txList.length,
      amountConsistency: isVariableBill ? 0.7 : amountConsistency, // Lower score for variable bills
      intervalRegularity: calculateIntervalRegularity(intervals, billingCycle),
      timeSpan: getTimeSpan(txList)
    });

    // Only show suggestions with 70%+ confidence (lowered from 75%)
    if (confidence < 70) continue;

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
      transactionIds: txList.map(tx => tx.transaction_id || tx.id),
      isVariableBill,
      amountRange,
      displayAmount: isVariableBill 
        ? `$${amountRange.min.toFixed(2)}-$${amountRange.max.toFixed(2)}` 
        : undefined
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
 * Normalize merchant name for grouping and matching
 */
function normalizeMerchantName(name) {
  if (!name) return '';
  
  return name
    .toLowerCase()
    .trim()
    // Remove common suffixes
    .replace(/\s+(inc|llc|corp|ltd|co|company)\b/gi, '')
    // Remove payment processor info
    .replace(/\s+\*\d+$/g, '')  // Remove * followed by numbers
    .replace(/\s+\d{4}$/g, '')  // Remove last 4 digits
    // Remove .com
    .replace(/\.com\b/gi, '')
    // Remove extra whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate amount consistency (0-1, where 1 = exact amounts)
 */
function calculateAmountConsistency(amounts, avgAmount, tolerance = 2.0) {
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
  
  // Monthly: 25-35 days apart (more flexible)
  if (avgInterval >= 25 && avgInterval <= 35) {
    return 'Monthly';
  }
  
  // Bi-monthly: 55-65 days apart
  if (avgInterval >= 55 && avgInterval <= 65) {
    return 'Bi-Monthly';
  }
  
  // Quarterly: 85-95 days apart
  if (avgInterval >= 85 && avgInterval <= 95) {
    return 'Quarterly';
  }
  
  // Semi-annual: 175-185 days apart
  if (avgInterval >= 175 && avgInterval <= 185) {
    return 'Semi-Annual';
  }
  
  // Annual: 355-375 days apart
  if (avgInterval >= 355 && avgInterval <= 375) {
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
    'Bi-Monthly': 60,
    'Quarterly': 91,
    'Semi-Annual': 182,
    'Annual': 365
  }[billingCycle];
  
  const tolerance = billingCycle === 'Monthly' ? 5 : 
                   billingCycle === 'Bi-Monthly' ? 5 :
                   billingCycle === 'Quarterly' ? 5 : 
                   billingCycle === 'Semi-Annual' ? 7 : 10;
  
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
    case 'Bi-Monthly':
      nextDate.setMonth(nextDate.getMonth() + 2);
      break;
    case 'Quarterly':
      nextDate.setMonth(nextDate.getMonth() + 3);
      break;
    case 'Semi-Annual':
      nextDate.setMonth(nextDate.getMonth() + 6);
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
  
  for (const [category, config] of Object.entries(BILL_CATEGORIES)) {
    for (const keyword of config.keywords) {
      if (lowerName.includes(keyword.toLowerCase())) {
        return category;
      }
    }
  }
  
  return 'Other';
}

/**
 * Calculate similarity between two strings (Levenshtein distance-based)
 * Returns a value between 0 and 1, where 1 is identical
 */
function calculateSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const editDistance = getEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function getEditDistance(str1, str2) {
  const matrix = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Check if two merchant names match using fuzzy logic
 */
function merchantNamesMatch(name1, name2) {
  const normalized1 = normalizeMerchantName(name1);
  const normalized2 = normalizeMerchantName(name2);
  
  // Exact match
  if (normalized1 === normalized2) return true;
  
  // One contains the other
  if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
    return true;
  }
  
  // Fuzzy match (70% similarity threshold)
  const similarity = calculateSimilarity(normalized1, normalized2);
  return similarity > 0.7;
}

/**
 * Check if subscription is already tracked
 */
function isAlreadyTracked(merchantName, existingSubscriptions) {
  return existingSubscriptions.some(sub => {
    return merchantNamesMatch(merchantName, sub.name);
  });
}

export { detectSubscriptions };
