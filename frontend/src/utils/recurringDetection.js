/**
 * Recurring Detection Utility
 * Analyzes transactions to detect recurring patterns (bills and subscriptions)
 */

// Category constants for auto-type assignment
export const SUBSCRIPTION_CATEGORIES = [
  'Subscriptions & Entertainment',
  'Software & Technology',
  'Fitness & Gym',
  'Streaming',
  'Software',
  'Memberships',
  'Entertainment',
  'Gaming'
];

export const RECURRING_BILL_CATEGORIES = [
  'Housing',
  'Auto & Transportation',
  'Credit Cards & Loans',
  'Utilities & Home Services',
  'Phone & Internet',
  'Insurance & Healthcare',
  'Personal Care',
  'Financial Services',
  'Utilities',
  'Rent',
  'Insurance',
  'Phone',
  'Internet',
  'Mortgage'
];

/**
 * Determine type based on category
 * @param {string} category - The category of the subscription/bill
 * @returns {string} - 'subscription' or 'recurring_bill'
 */
export const getTypeFromCategory = (category) => {
  if (SUBSCRIPTION_CATEGORIES.includes(category)) return 'subscription';
  if (RECURRING_BILL_CATEGORIES.includes(category)) return 'recurring_bill';
  return 'subscription'; // Default to subscription
};

/**
 * Categorize merchant name based on keywords
 * @param {string} merchant - The merchant name
 * @returns {string} - The detected category
 */
export const categorizeMerchant = (merchant) => {
  const name = merchant.toLowerCase();
  
  // Housing
  if (name.includes('rent') || name.includes('apartment') || name.includes('property') ||
      name.includes('mortgage') || name.includes('housing') || name.includes('hoa') || 
      name.includes('landlord') || name.includes('lease')) {
    return 'Housing';
  }
  
  // Auto & Transportation
  if (name.includes('chrysler capital') || name.includes('chase auto') || name.includes('ally auto') ||
      name.includes('car payment') || name.includes('auto loan') || name.includes('car insurance') ||
      name.includes('progressive') || name.includes('geico') || name.includes('state farm') ||
      name.includes('allstate')) {
    return 'Auto & Transportation';
  }
  
  // Credit Cards & Loans
  if (name.includes('upgrade') || name.includes('lending club') || name.includes('sofi') ||
      name.includes('prosper') || name.includes('avant') || name.includes('upstart') ||
      name.includes('affirm') || name.includes('klarna') || name.includes('afterpay') ||
      name.includes('capital one') || name.includes('chase') || name.includes('citi') ||
      name.includes('amex') || name.includes('discover') || name.includes('wells fargo')) {
    return 'Credit Cards & Loans';
  }
  
  // Utilities & Home Services
  if (name.includes('electric') || name.includes('power') || name.includes('energy') ||
      name.includes('nv energy') || name.includes('duke energy') || name.includes('pge') ||
      name.includes('water') || name.includes('sewer') || name.includes('gas') ||
      name.includes('trash') || name.includes('waste management') || name.includes('utility')) {
    return 'Utilities & Home Services';
  }
  
  // Phone & Internet
  if (name.includes('phone') || name.includes('verizon') || name.includes('at&t') || 
      name.includes('t-mobile') || name.includes('sprint') || name.includes('mobile') ||
      name.includes('internet') || name.includes('comcast') || name.includes('spectrum') || 
      name.includes('cox') || name.includes('xfinity') || name.includes('centurylink')) {
    return 'Phone & Internet';
  }
  
  // Insurance & Healthcare
  if (name.includes('insurance') || name.includes('cigna') || name.includes('aetna') ||
      name.includes('united healthcare') || name.includes('health') || name.includes('dental') ||
      name.includes('vision') || name.includes('life insurance') || name.includes('disability')) {
    return 'Insurance & Healthcare';
  }
  
  // Subscriptions & Entertainment / Streaming
  if (name.includes('netflix') || name.includes('spotify') || name.includes('hulu') || 
      name.includes('disney') || name.includes('hbo') || name.includes('youtube premium') ||
      name.includes('apple music') || name.includes('amazon prime') || name.includes('xbox') ||
      name.includes('playstation')) {
    return 'Subscriptions & Entertainment';
  }
  
  // Software & Technology
  if (name.includes('adobe') || name.includes('microsoft') || name.includes('github') || 
      name.includes('dropbox') || name.includes('google') || name.includes('icloud') ||
      name.includes('notion') || name.includes('slack') || name.includes('zoom')) {
    return 'Software & Technology';
  }
  
  // Fitness & Gym
  if (name.includes('gym') || name.includes('fitness') || name.includes('planet fitness') ||
      name.includes('24 hour fitness') || name.includes('la fitness') || name.includes('equinox') ||
      name.includes('yoga') || name.includes('peloton')) {
    return 'Fitness & Gym';
  }
  
  // Personal Care
  if (name.includes('ulta') || name.includes('sephora') || name.includes('salon') ||
      name.includes('spa') || name.includes('beauty') || name.includes('massage') ||
      name.includes('nail') || name.includes('hair')) {
    return 'Personal Care';
  }
  
  // Financial Services
  if (name.includes('bank fee') || name.includes('account fee') || name.includes('safe deposit') ||
      name.includes('advisor fee') || name.includes('investment fee')) {
    return 'Financial Services';
  }
  
  return 'Other';
};

/**
 * Calculate next renewal date based on recent transactions
 * @param {Array} transactions - Array of transaction objects with date property
 * @returns {string} - ISO date string for next renewal
 */
export const calculateNextRenewal = (transactions) => {
  if (!transactions || transactions.length === 0) {
    return new Date().toISOString().split('T')[0];
  }
  
  // Sort by date (most recent first)
  const sorted = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
  const mostRecent = new Date(sorted[0].date);
  
  // Calculate average interval between transactions
  if (sorted.length >= 2) {
    let totalDays = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
      const diff = new Date(sorted[i].date) - new Date(sorted[i + 1].date);
      totalDays += diff / (1000 * 60 * 60 * 24);
    }
    const avgInterval = Math.round(totalDays / (sorted.length - 1));
    
    // Add average interval to most recent date
    const nextDate = new Date(mostRecent);
    nextDate.setDate(nextDate.getDate() + avgInterval);
    return nextDate.toISOString().split('T')[0];
  }
  
  // Default: add 30 days to most recent
  const nextDate = new Date(mostRecent);
  nextDate.setDate(nextDate.getDate() + 30);
  return nextDate.toISOString().split('T')[0];
};

/**
 * Analyze transactions for recurring patterns
 * @param {Array} transactions - Array of transaction objects
 * @returns {Array} - Array of detected recurring bills/subscriptions
 */
export const analyzeTransactionsForRecurring = (transactions) => {
  if (!transactions || transactions.length === 0) {
    return [];
  }
  
  // Group transactions by merchant
  const merchantGroups = {};
  
  transactions.forEach(tx => {
    const merchant = tx.merchant_name || tx.name;
    if (!merchant) return;
    
    if (!merchantGroups[merchant]) {
      merchantGroups[merchant] = [];
    }
    merchantGroups[merchant].push(tx);
  });
  
  // Find recurring patterns
  const recurringBills = [];
  
  Object.entries(merchantGroups).forEach(([merchant, txs]) => {
    // Need at least 2 transactions to detect a pattern
    if (txs.length < 2) {
      return;
    }
    
    // Check if amounts are similar (within 10%)
    const amounts = txs.map(t => Math.abs(t.amount));
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const isSimilarAmount = amounts.every(amt => 
      Math.abs(amt - avgAmount) / avgAmount < 0.10
    );
    
    if (!isSimilarAmount) {
      return;
    }
    
    // Check if dates are roughly monthly (25-35 days apart)
    const sortedTxs = [...txs].sort((a, b) => new Date(a.date) - new Date(b.date));
    const daysDiff = [];
    for (let i = 1; i < sortedTxs.length; i++) {
      const diff = (new Date(sortedTxs[i].date) - new Date(sortedTxs[i-1].date)) / (1000 * 60 * 60 * 24);
      daysDiff.push(diff);
    }
    const avgDaysDiff = daysDiff.reduce((a, b) => a + b, 0) / daysDiff.length;
    const isMonthly = avgDaysDiff >= 25 && avgDaysDiff <= 35;
    
    if (!isMonthly) {
      return;
    }
    
    // Categorize the merchant
    const category = categorizeMerchant(merchant);
    const type = getTypeFromCategory(category);
    
    // Build the recurring item
    recurringBills.push({
      name: merchant,
      cost: avgAmount,
      billingCycle: 'Monthly',
      category: category,
      type: type,
      nextRenewal: calculateNextRenewal(sortedTxs),
      paymentMethod: sortedTxs[0].account_id || 'Unknown',
      notes: `Auto-detected from ${txs.length} transactions`,
      essential: RECURRING_BILL_CATEGORIES.includes(category), // Bills are essential by default
      autoDetected: true,
      linkedTransactionIds: txs.map(t => t.transaction_id || t.id).filter(Boolean),
      transactionCount: txs.length,
      status: 'active',
      autoRenew: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  });
  
  return recurringBills;
};

/**
 * Filter detected items by type
 * @param {Array} detectedItems - Array of detected recurring items
 * @param {string} type - 'subscription' or 'recurring_bill'
 * @returns {Array} - Filtered array
 */
export const filterByType = (detectedItems, type) => {
  return detectedItems.filter(item => item.type === type);
};
