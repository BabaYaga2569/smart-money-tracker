/**
 * Financial Insights Utility
 * Generates smart insights from payment and spending data
 */

export const generateFinancialInsights = (payments, options = {}) => {
  const insights = [];
  
  if (!payments || payments.length === 0) {
    return insights;
  }

  // Sort payments by date
  const sortedPayments = [...payments].sort((a, b) => 
    new Date(a.paidDate) - new Date(b.paidDate)
  );

  // Group by month
  const paymentsByMonth = groupPaymentsByMonth(sortedPayments);
  const monthKeys = Object.keys(paymentsByMonth).sort();

  // 1. Month-over-month spending comparison
  if (monthKeys.length >= 2) {
    const lastMonth = monthKeys[monthKeys.length - 1];
    const prevMonth = monthKeys[monthKeys.length - 2];
    
    const lastMonthTotal = paymentsByMonth[lastMonth].reduce((sum, p) => sum + p.amount, 0);
    const prevMonthTotal = paymentsByMonth[prevMonth].reduce((sum, p) => sum + p.amount, 0);
    
    const diff = lastMonthTotal - prevMonthTotal;
    const percentChange = ((diff / prevMonthTotal) * 100).toFixed(1);
    
    if (Math.abs(percentChange) > 5) {
      insights.push({
        type: diff > 0 ? 'warning' : 'success',
        icon: diff > 0 ? '📈' : '📉',
        title: 'Month-over-Month Spending',
        message: `Your spending ${diff > 0 ? 'increased' : 'decreased'} by ${Math.abs(percentChange)}% compared to last month (${formatCurrency(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'}).`,
        priority: Math.abs(percentChange) > 20 ? 'high' : 'medium'
      });
    }
  }

  // 2. Biggest single expense
  const biggestExpense = sortedPayments.reduce((max, p) => 
    p.amount > (max?.amount || 0) ? p : max, 
    null
  );
  
  if (biggestExpense) {
    insights.push({
      type: 'info',
      icon: '💰',
      title: 'Biggest Expense',
      message: `Your largest bill payment was ${formatCurrency(biggestExpense.amount)} for "${biggestExpense.billName}" in ${formatMonthYear(biggestExpense.paidDate)}.`,
      priority: 'low'
    });
  }

  // 3. Top spending category
  const categoryTotals = payments.reduce((acc, p) => {
    const cat = p.category || 'Uncategorized';
    acc[cat] = (acc[cat] || 0) + p.amount;
    return acc;
  }, {});
  
  const topCategory = Object.entries(categoryTotals)
    .sort(([, a], [, b]) => b - a)[0];
  
  if (topCategory) {
    const [category, amount] = topCategory;
    const percentage = ((amount / payments.reduce((sum, p) => sum + p.amount, 0)) * 100).toFixed(1);
    
    insights.push({
      type: 'info',
      icon: '📊',
      title: 'Top Spending Category',
      message: `${category} is your highest spending category at ${formatCurrency(amount)} (${percentage}% of total).`,
      priority: 'medium'
    });
  }

  // 4. Spending trend analysis
  if (monthKeys.length >= 3) {
    const recentMonths = monthKeys.slice(-3);
    const totals = recentMonths.map(month => 
      paymentsByMonth[month].reduce((sum, p) => sum + p.amount, 0)
    );
    
    const isIncreasing = totals[2] > totals[1] && totals[1] > totals[0];
    const isDecreasing = totals[2] < totals[1] && totals[1] < totals[0];
    
    if (isIncreasing) {
      insights.push({
        type: 'warning',
        icon: '📈',
        title: 'Upward Spending Trend',
        message: 'Your spending has been consistently increasing over the past 3 months. Consider reviewing your budget.',
        priority: 'high'
      });
    } else if (isDecreasing) {
      insights.push({
        type: 'success',
        icon: '🎯',
        title: 'Positive Spending Trend',
        message: 'Great job! Your spending has been decreasing for 3 consecutive months.',
        priority: 'medium'
      });
    }
  }

  // 5. Overdue payment analysis
  const overduePayments = payments.filter(p => p.isOverdue);
  if (overduePayments.length > 0) {
    const totalOverdue = overduePayments.reduce((sum, p) => sum + p.amount, 0);
    const avgDaysLate = overduePayments.reduce((sum, p) => sum + (p.daysPastDue || 0), 0) / overduePayments.length;
    
    insights.push({
      type: 'warning',
      icon: '⚠️',
      title: 'Late Payment Alert',
      message: `You have ${overduePayments.length} late payment${overduePayments.length > 1 ? 's' : ''} totaling ${formatCurrency(totalOverdue)}. Average delay: ${avgDaysLate.toFixed(1)} days. Consider setting up automatic payments.`,
      priority: 'high'
    });
  }

  // 6. Most frequent bill
  const billFrequency = payments.reduce((acc, p) => {
    acc[p.billName] = (acc[p.billName] || 0) + 1;
    return acc;
  }, {});
  
  const mostFrequentBill = Object.entries(billFrequency)
    .sort(([, a], [, b]) => b - a)[0];
  
  if (mostFrequentBill && mostFrequentBill[1] >= 3) {
    insights.push({
      type: 'info',
      icon: '🔄',
      title: 'Most Frequent Payment',
      message: `You've paid "${mostFrequentBill[0]}" ${mostFrequentBill[1]} times. This bill appears to be recurring.`,
      priority: 'low'
    });
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return insights;
};

// Helper functions
const groupPaymentsByMonth = (payments) => {
  return payments.reduce((acc, payment) => {
    const month = payment.paymentMonth || payment.paidDate?.slice(0, 7) || 'unknown';
    if (!acc[month]) {
      acc[month] = [];
    }
    acc[month].push(payment);
    return acc;
  }, {});
};

const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount);
};

const formatMonthYear = (dateStr) => {
  if (!dateStr) return 'unknown';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
};

// Generate category insights
export const generateCategoryInsights = (payments) => {
  const categoryTotals = payments.reduce((acc, p) => {
    const cat = p.category || 'Uncategorized';
    acc[cat] = (acc[cat] || 0) + p.amount;
    return acc;
  }, {});

  const total = Object.values(categoryTotals).reduce((sum, val) => sum + val, 0);
  
  return Object.entries(categoryTotals)
    .map(([category, amount]) => ({
      category,
      amount,
      percentage: ((amount / total) * 100).toFixed(1),
      count: payments.filter(p => (p.category || 'Uncategorized') === category).length
    }))
    .sort((a, b) => b.amount - a.amount);
};

// Generate monthly trend data
export const generateMonthlyTrend = (payments) => {
  const paymentsByMonth = groupPaymentsByMonth(payments);
  const monthKeys = Object.keys(paymentsByMonth).sort();

  return monthKeys.map(month => ({
    month,
    total: paymentsByMonth[month].reduce((sum, p) => sum + p.amount, 0),
    count: paymentsByMonth[month].length,
    average: paymentsByMonth[month].reduce((sum, p) => sum + p.amount, 0) / paymentsByMonth[month].length
  }));
};

// Calculate year summary
export const calculateYearSummary = (payments, year) => {
  const yearPayments = payments.filter(p => {
    const paymentYear = p.year || new Date(p.paidDate).getFullYear();
    return paymentYear === year;
  });

  if (yearPayments.length === 0) {
    return null;
  }

  const total = yearPayments.reduce((sum, p) => sum + p.amount, 0);
  const monthlyAverage = total / 12;
  
  const monthlyTotals = generateMonthlyTrend(yearPayments);
  const mostExpensiveMonth = monthlyTotals.reduce((max, m) => 
    m.total > max.total ? m : max, 
    monthlyTotals[0]
  );
  const leastExpensiveMonth = monthlyTotals.reduce((min, m) => 
    m.total < min.total ? m : min, 
    monthlyTotals[0]
  );

  const categoryBreakdown = generateCategoryInsights(yearPayments);
  
  return {
    year,
    total,
    monthlyAverage,
    paymentCount: yearPayments.length,
    mostExpensiveMonth: {
      month: mostExpensiveMonth.month,
      amount: mostExpensiveMonth.total
    },
    leastExpensiveMonth: {
      month: leastExpensiveMonth.month,
      amount: leastExpensiveMonth.total
    },
    topCategory: categoryBreakdown[0],
    categoryBreakdown,
    monthlyTotals
  };
};
