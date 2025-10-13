/**
 * Subscription Calculations Utility
 * Handles all calculation logic for subscription tracking
 */

/**
 * Calculate total monthly burn from all subscriptions
 * @param {Array} subscriptions - Array of subscription objects
 * @returns {number} Total monthly cost
 */
export const calculateMonthlyTotal = (subscriptions) => {
  if (!subscriptions || subscriptions.length === 0) return 0;
  
  const monthly = subscriptions
    .filter(sub => sub.status === 'active' && sub.billingCycle === 'Monthly')
    .reduce((sum, sub) => sum + (parseFloat(sub.cost) || 0), 0);
  
  const annual = subscriptions
    .filter(sub => sub.status === 'active' && sub.billingCycle === 'Annual')
    .reduce((sum, sub) => sum + ((parseFloat(sub.cost) || 0) / 12), 0);
  
  const quarterly = subscriptions
    .filter(sub => sub.status === 'active' && sub.billingCycle === 'Quarterly')
    .reduce((sum, sub) => sum + ((parseFloat(sub.cost) || 0) / 3), 0);
  
  return monthly + annual + quarterly;
};

/**
 * Calculate annual projection from subscriptions
 * @param {Array} subscriptions - Array of subscription objects
 * @returns {number} Total annual cost
 */
export const calculateAnnualTotal = (subscriptions) => {
  return calculateMonthlyTotal(subscriptions) * 12;
};

/**
 * Get upcoming renewals within specified days
 * @param {Array} subscriptions - Array of subscription objects
 * @param {number} days - Number of days to look ahead (default: 7)
 * @returns {Array} Filtered and sorted subscriptions
 */
export const getUpcomingRenewals = (subscriptions, days = 7) => {
  if (!subscriptions || subscriptions.length === 0) return [];
  
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
  futureDate.setHours(23, 59, 59, 999);
  
  return subscriptions
    .filter(sub => sub.status === 'active')
    .filter(sub => {
      if (!sub.nextRenewal) return false;
      const renewalDate = new Date(sub.nextRenewal);
      return renewalDate >= now && renewalDate <= futureDate;
    })
    .sort((a, b) => new Date(a.nextRenewal) - new Date(b.nextRenewal));
};

/**
 * Group subscriptions by category
 * @param {Array} subscriptions - Array of subscription objects
 * @returns {Object} Subscriptions grouped by category
 */
export const groupByCategory = (subscriptions) => {
  if (!subscriptions || subscriptions.length === 0) return {};
  
  return subscriptions.reduce((acc, sub) => {
    const category = sub.category || 'Other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(sub);
    return acc;
  }, {});
};

/**
 * Get monthly equivalent cost for a subscription
 * @param {Object} subscription - Subscription object
 * @returns {number} Monthly equivalent cost
 */
export const getMonthlyEquivalent = (subscription) => {
  if (!subscription || !subscription.cost) return 0;
  
  const cost = parseFloat(subscription.cost) || 0;
  
  switch (subscription.billingCycle) {
    case 'Monthly':
      return cost;
    case 'Annual':
      return cost / 12;
    case 'Quarterly':
      return cost / 3;
    default:
      return cost;
  }
};

/**
 * Count active subscriptions
 * @param {Array} subscriptions - Array of subscription objects
 * @returns {number} Number of active subscriptions
 */
export const countActiveSubscriptions = (subscriptions) => {
  if (!subscriptions || subscriptions.length === 0) return 0;
  return subscriptions.filter(sub => sub.status === 'active').length;
};

/**
 * Calculate category breakdown for charts
 * @param {Array} subscriptions - Array of subscription objects
 * @returns {Object} Category totals
 */
export const getCategoryBreakdown = (subscriptions) => {
  if (!subscriptions || subscriptions.length === 0) return {};
  
  const grouped = groupByCategory(subscriptions.filter(sub => sub.status === 'active'));
  const breakdown = {};
  
  Object.keys(grouped).forEach(category => {
    breakdown[category] = grouped[category].reduce((sum, sub) => {
      return sum + getMonthlyEquivalent(sub);
    }, 0);
  });
  
  return breakdown;
};

/**
 * Check if a subscription is due soon (within 3 days)
 * @param {Object} subscription - Subscription object
 * @returns {boolean} True if renewal is within 3 days
 */
export const isDueSoon = (subscription) => {
  if (!subscription || !subscription.nextRenewal) return false;
  
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const renewalDate = new Date(subscription.nextRenewal);
  const diffDays = Math.ceil((renewalDate - now) / (1000 * 60 * 60 * 24));
  
  return diffDays >= 0 && diffDays <= 3;
};
