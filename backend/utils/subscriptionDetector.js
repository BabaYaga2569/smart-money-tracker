/**
 * Recurring Bills & Subscription Auto-Detection Algorithm
 * Analyzes transaction history to identify recurring bill and subscription patterns
 * with smart duplicate matching and comprehensive category support
 */

// Comprehensive bill and subscription category keywords
const RECURRING_BILL_CATEGORIES = {
  // Housing
  "Housing": {
    keywords: ["rent", "mortgage", "hoa", "property management", "homeowners insurance", 
               "apartment", "condo", "property tax", "lease", "landlord"],
    icon: "🏠"
  },
  
  // Auto & Transportation
  "Auto & Transportation": {
    keywords: [
      // Auto loans & financing
      "chrysler capital", "chase auto", "honda financial", "toyota financial", 
      "ford credit", "gm financial", "ally auto", "capital one auto", "carvana",
      "car payment", "auto loan", "vehicle payment",
      // Auto insurance
      "geico", "progressive", "state farm", "allstate", "liberty mutual",
      "farmers insurance", "usaa", "esurance", "auto insurance", "car insurance",
      // Transportation
      "parking", "toll", "ezpass", "fastrak", "sunpass"
    ],
    icon: "🚗"
  },
  
  // Credit Cards & Loans
  "Credit Cards & Loans": {
    keywords: [
      // Personal loans
      "upgrade", "lending club", "sofi", "prosper", "avant", "marcus", "discover personal loan",
      "best egg", "upstart", "payoff", "personal loan",
      // Buy Now Pay Later
      "affirm", "klarna", "afterpay", "sezzle", "quadpay", "zip", "splitit",
      // Credit cards
      "capital one", "chase card", "discover", "amex", "american express",
      "comenity", "bread financial", "synchrony", "barclays", "citibank",
      "bank of america card", "wells fargo card", "credit card payment"
    ],
    icon: "💳"
  },
  
  // Utilities & Home Services
  "Utilities & Home Services": {
    keywords: [
      // Electric
      "electric", "electricity", "nv energy", "duke energy", "pge", "pg&e",
      "southern california edison", "florida power", "con edison", "power company",
      // Water/Sewer
      "water", "sewer", "water district", "municipal water",
      // Gas
      "gas company", "natural gas", "propane",
      // Waste
      "trash", "waste management", "republic services", "garbage", "recycling",
      // Home services
      "adt", "ring", "security", "alarm", "lawn care", "landscaping", "pest control"
    ],
    icon: "💡"
  },
  
  // Phone & Internet
  "Phone & Internet": {
    keywords: [
      // Mobile
      "verizon", "at&t", "t-mobile", "sprint", "mint mobile", "cricket",
      "boost mobile", "metro pcs", "visible", "phone", "mobile", "wireless",
      // Internet/Cable
      "comcast", "xfinity", "spectrum", "cox", "centurylink", "frontier",
      "optimum", "mediacom", "internet", "cable", "broadband", "fiber"
    ],
    icon: "📱"
  },
  
  // Insurance & Healthcare
  "Insurance & Healthcare": {
    keywords: [
      // Health insurance
      "health insurance", "medical insurance", "anthem", "blue cross", "aetna",
      "united healthcare", "humana", "kaiser", "cigna",
      // Other insurance
      "dental", "vision", "life insurance", "disability insurance",
      // Fitness & Health
      "gym", "planet fitness", "24 hour fitness", "la fitness", "equinox",
      "yoga", "peloton", "fitness", "crunch", "anytime fitness",
      "therapy", "counseling", "medical"
    ],
    icon: "🏥"
  },
  
  // Subscriptions & Entertainment (keep traditional subscriptions)
  "Subscriptions & Entertainment": {
    keywords: [
      // Streaming
      "netflix", "hulu", "disney", "disney plus", "hbo", "hbo max", "max",
      "spotify", "apple music", "youtube premium", "youtube music", "prime video",
      "apple tv", "paramount", "peacock", "showtime", "starz", "crunchyroll",
      // Gaming
      "xbox", "playstation", "nintendo", "steam", "epic games", "game pass",
      // Other entertainment
      "audible", "kindle unlimited", "news", "magazine", "newspaper"
    ],
    icon: "🎬"
  },
  
  // Software (keep as separate category)
  "Software": {
    keywords: [
      "adobe", "microsoft", "office 365", "github", "dropbox", "icloud",
      "google one", "notion", "slack", "zoom", "canva", "grammarly",
      "aws", "cloud", "hosting", "domain", "software"
    ],
    icon: "💻"
  },
  
  // Personal Care
  "Personal Care": {
    keywords: ["ulta", "sephora", "salon", "spa", "beauty", "nails", "haircut", "barber"],
    icon: "💅"
  },
  
  // Food Delivery
  "Food": {
    keywords: ["meal kit", "hello fresh", "blue apron", "factor", "home chef", "freshly", "daily harvest"],
    icon: "🍔"
  },
  
  // Other
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

    // Only show suggestions with 70%+ confidence (lowered from 75%)
    if (confidence < 70) continue;

    // Step 8: Estimate next renewal date
    const lastTransaction = txList[txList.length - 1];
    const nextRenewal = estimateNextRenewal(lastTransaction.date, billingCycle);

    // Step 9: Suggest category
    const category = suggestCategory(merchantName);

    // Step 10: Check if already tracked and build result object
    const matchedSubscription = findMatchingSubscription(merchantName, avgAmount, existingSubscriptions);
    
    const detectedPattern = {
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
      // Add match information
      isMatch: !!matchedSubscription,
      matchedSubscription: matchedSubscription ? {
        id: matchedSubscription.id,
        name: matchedSubscription.name,
        amount: matchedSubscription.cost,
        category: matchedSubscription.category
      } : null
    };

    potentialSubscriptions.push(detectedPattern);
  }

  // Sort by confidence (highest first)
  potentialSubscriptions.sort((a, b) => b.confidence - a.confidence);

  // Separate into matches and new patterns
  const matches = potentialSubscriptions.filter(p => p.isMatch);
  const newPatterns = potentialSubscriptions.filter(p => !p.isMatch);

  return {
    matches,        // Patterns that match existing subscriptions
    newPatterns,    // Patterns with no existing subscription
    all: potentialSubscriptions  // All patterns for backward compatibility
  };
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
 * More aggressive normalization for better fuzzy matching
 */
function normalizeMerchantName(name) {
  return name
    .toLowerCase()
    .trim()
    // Remove common business suffixes
    .replace(/\s*(inc|llc|ltd|corp|co|company|corporation|limited|.com|.net|.org)\s*$/gi, '')
    // Remove "financial", "auto", "bank" suffixes that vary
    .replace(/\s*(financial|auto|bank|services|group)\s*$/gi, '')
    // Normalize multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate amount consistency (0-1, where 1 = exact amounts)
 * Uses flexible tolerance based on bill amount
 */
function calculateAmountConsistency(amounts, avgAmount) {
  // Flexible tolerance: ±$5 for small bills, ±10% for large bills
  let tolerance;
  if (avgAmount < 50) {
    tolerance = 5.0; // ±$5 for small bills
  } else {
    tolerance = avgAmount * 0.10; // ±10% for large bills
  }
  
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
 * Supports monthly, bi-monthly, quarterly, and annual cycles
 */
function detectBillingCycle(intervals) {
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  
  // Monthly: 25-35 days apart (flexible for weekends/holidays)
  if (avgInterval >= 25 && avgInterval <= 35) {
    return 'Monthly';
  }
  
  // Bi-monthly: 55-65 days apart
  if (avgInterval >= 55 && avgInterval <= 65) {
    return 'Bi-Monthly';
  }
  
  // Quarterly: 85-95 days apart (flexible range)
  if (avgInterval >= 85 && avgInterval <= 95) {
    return 'Quarterly';
  }
  
  // Annual: 355-375 days apart
  if (avgInterval >= 355 && avgInterval <= 375) {
    return 'Annual';
  }
  
  return null;
}

/**
 * Calculate interval regularity (0-1, where 1 = perfectly regular)
 * Supports monthly, bi-monthly, quarterly, and annual cycles
 */
function calculateIntervalRegularity(intervals, billingCycle) {
  const expectedInterval = {
    'Monthly': 30,
    'Bi-Monthly': 60,
    'Quarterly': 90,
    'Annual': 365
  }[billingCycle];
  
  // More flexible tolerances
  const tolerance = billingCycle === 'Monthly' ? 5 : 
                   billingCycle === 'Bi-Monthly' ? 5 :
                   billingCycle === 'Quarterly' ? 5 : 10;
  
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
 * Supports monthly, bi-monthly, quarterly, and annual cycles
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
    case 'Annual':
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      break;
  }
  
  return nextDate.toISOString().split('T')[0]; // YYYY-MM-DD
}

/**
 * Suggest category based on merchant name with comprehensive keywords
 */
function suggestCategory(merchantName) {
  const lowerName = merchantName.toLowerCase();
  
  for (const [category, categoryData] of Object.entries(RECURRING_BILL_CATEGORIES)) {
    for (const keyword of categoryData.keywords) {
      if (lowerName.includes(keyword.toLowerCase())) {
        return category;
      }
    }
  }
  
  return 'Other';
}

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy matching of merchant names
 */
function levenshteinDistance(str1, str2) {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
  
  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  return matrix[len1][len2];
}

/**
 * Calculate similarity score between two strings (0-1)
 */
function calculateSimilarity(str1, str2) {
  const maxLen = Math.max(str1.length, str2.length);
  if (maxLen === 0) return 1.0;
  const distance = levenshteinDistance(str1, str2);
  return 1.0 - (distance / maxLen);
}

/**
 * Check if transaction merchant name matches bill name using fuzzy logic
 */
function matchesMerchant(transactionName, billName) {
  const txNorm = normalizeMerchantName(transactionName);
  const billNorm = normalizeMerchantName(billName);
  
  // Exact match
  if (txNorm === billNorm) return true;
  
  // Contains match
  if (txNorm.includes(billNorm) || billNorm.includes(txNorm)) return true;
  
  // Keyword match (at least 2 common words)
  const txWords = txNorm.split(/\s+/).filter(w => w.length > 2);
  const billWords = billNorm.split(/\s+/).filter(w => w.length > 2);
  const commonWords = txWords.filter(w => billWords.includes(w));
  if (commonWords.length >= 2) return true;
  
  // Levenshtein distance (fuzzy match)
  const similarity = calculateSimilarity(txNorm, billNorm);
  return similarity > 0.75;
}

/**
 * Check if subscription is already tracked
 * Uses fuzzy matching to catch variations in merchant names
 */
function isAlreadyTracked(merchantName, existingSubscriptions) {
  return existingSubscriptions.some(sub => {
    return matchesMerchant(merchantName, sub.name);
  });
}

/**
 * Find matching existing subscription for a merchant name
 * Returns the matched subscription or null
 */
function findMatchingSubscription(merchantName, amount, existingSubscriptions) {
  for (const sub of existingSubscriptions) {
    if (matchesMerchant(merchantName, sub.name)) {
      // Also check if amount is reasonably close (within 20%)
      const amountDiff = Math.abs(amount - sub.cost) / sub.cost;
      if (amountDiff < 0.20) {
        return sub;
      }
    }
  }
  return null;
}

export { detectSubscriptions };
