/**
 * Recurring Detection Utility
 * Analyzes transactions to detect recurring patterns (bills and subscriptions)
 */

// Category constants for auto-type assignment
export const SUBSCRIPTION_CATEGORIES = [
  'Streaming',
  'Software',
  'Memberships',
  'Entertainment',
  'Gaming'
];

export const RECURRING_BILL_CATEGORIES = [
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
  
  // Utilities
  if (name.includes('electric') || name.includes('power') || name.includes('energy')) {
    return 'Utilities';
  }
  if (name.includes('water') || name.includes('sewer')) {
    return 'Utilities';
  }
  if (name.includes('gas') || name.includes('fuel')) {
    return 'Utilities';
  }
  
  // Rent/Housing
  if (name.includes('rent') || name.includes('apartment') || name.includes('property')) {
    return 'Rent';
  }
  if (name.includes('mortgage') || name.includes('housing')) {
    return 'Mortgage';
  }
  
  // Insurance
  if (name.includes('insurance') || name.includes('geico') || name.includes('progressive') || 
      name.includes('state farm') || name.includes('allstate')) {
    return 'Insurance';
  }
  
  // Phone/Internet
  if (name.includes('phone') || name.includes('verizon') || name.includes('at&t') || 
      name.includes('t-mobile') || name.includes('sprint')) {
    return 'Phone';
  }
  if (name.includes('internet') || name.includes('comcast') || name.includes('spectrum') || 
      name.includes('cox') || name.includes('xfinity')) {
    return 'Internet';
  }
  
  // Streaming services
  if (name.includes('netflix') || name.includes('spotify') || name.includes('hulu') || 
      name.includes('disney') || name.includes('hbo') || name.includes('amazon prime')) {
    return 'Streaming';
  }
  
  // Software
  if (name.includes('adobe') || name.includes('microsoft') || name.includes('github') || 
      name.includes('dropbox') || name.includes('google')) {
    return 'Software';
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
