// CashFlowAnalytics.js - Advanced cash flow analysis and forecasting utilities
import { parseLocalDate } from './DateUtils.js';

export class CashFlowAnalytics {
  /**
   * Calculate comprehensive cash flow metrics for a given period
   * @param {Array} transactions - Array of transaction objects
   * @param {Date} startDate - Start date for analysis
   * @param {Date} endDate - End date for analysis
   * @returns {Object} Comprehensive cash flow metrics
   */
  static calculateCashFlowMetrics(transactions, startDate = null, endDate = null) {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // Default to current month if no dates provided
    if (!startDate) {
      startDate = new Date(currentYear, currentMonth, 1);
    }
    if (!endDate) {
      endDate = new Date(currentYear, currentMonth + 1, 0);
    }

    // Filter transactions for the period
    const periodTransactions = transactions.filter(t => {
      const transactionDate = new Date(t.date);
      return transactionDate >= startDate && transactionDate <= endDate;
    });

    // Calculate basic metrics
    const income = periodTransactions
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);
      
    const expenses = Math.abs(periodTransactions
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + t.amount, 0));
      
    const netFlow = income - expenses;

    // Calculate income streams
    const incomeStreams = this.calculateIncomeStreams(periodTransactions);
    
    // Calculate expense categories
    const expenseCategories = this.calculateExpenseCategories(periodTransactions);

    // Calculate trends
    const trends = this.calculateTrends(transactions, startDate);

    // Calculate velocity (frequency of transactions)
    const velocity = this.calculateCashFlowVelocity(periodTransactions, startDate, endDate);

    // Calculate efficiency (income utilization)
    const efficiency = income > 0 ? ((income - expenses) / income) * 100 : 0;

    return {
      period: {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
      },
      income: {
        total: income,
        streams: incomeStreams
      },
      expenses: {
        total: expenses,
        categories: expenseCategories
      },
      netFlow,
      trends,
      velocity,
      efficiency: Math.max(0, Math.min(100, efficiency)), // Cap between 0-100%
      transactionCount: periodTransactions.length
    };
  }

  /**
   * Calculate income streams breakdown
   * @param {Array} transactions - Period transactions
   * @returns {Object} Income streams breakdown
   */
  static calculateIncomeStreams(transactions) {
    const incomeTransactions = transactions.filter(t => t.amount > 0);
    
    const streams = {
      primary: 0,    // Salary, wages
      secondary: 0,  // Freelance, side hustle
      investment: 0, // Dividends, interest
      other: 0       // Gifts, refunds, bonuses
    };

    const primaryKeywords = ['payroll', 'salary', 'wages', 'paycheck'];
    const secondaryKeywords = ['freelance', 'gig', 'contract', 'consulting'];
    const investmentKeywords = ['dividend', 'interest', 'investment', 'capital gains'];
    
    incomeTransactions.forEach(t => {
      const desc = t.description.toLowerCase();
      const amount = t.amount;
      
      if (primaryKeywords.some(keyword => desc.includes(keyword))) {
        streams.primary += amount;
      } else if (secondaryKeywords.some(keyword => desc.includes(keyword))) {
        streams.secondary += amount;
      } else if (investmentKeywords.some(keyword => desc.includes(keyword))) {
        streams.investment += amount;
      } else {
        streams.other += amount;
      }
    });

    return streams;
  }

  /**
   * Calculate expense categories breakdown
   * @param {Array} transactions - Period transactions
   * @returns {Object} Expense categories breakdown
   */
  static calculateExpenseCategories(transactions) {
    const expenseTransactions = transactions.filter(t => t.amount < 0);
    
    const categories = {
      fixed: 0,        // Rent, insurance, loan payments
      variable: 0,     // Groceries, utilities, gas
      discretionary: 0 // Entertainment, dining, shopping
    };

    const fixedKeywords = ['rent', 'mortgage', 'insurance', 'loan', 'car payment'];
    const discretionaryKeywords = ['entertainment', 'dining', 'restaurant', 'shopping', 'clothes', 'vacation'];
    
    expenseTransactions.forEach(t => {
      const desc = t.description.toLowerCase();
      const amount = Math.abs(t.amount);
      
      if (fixedKeywords.some(keyword => desc.includes(keyword))) {
        categories.fixed += amount;
      } else if (discretionaryKeywords.some(keyword => desc.includes(keyword))) {
        categories.discretionary += amount;
      } else {
        categories.variable += amount;
      }
    });

    return categories;
  }

  /**
   * Calculate cash flow trends over multiple periods
   * @param {Array} transactions - All transactions
   * @param {Date} currentPeriodStart - Current period start date
   * @returns {Object} Trend analysis
   */
  static calculateTrends(transactions, currentPeriodStart) {
    const trends = {
      threeMonth: 0,
      sixMonth: 0,
      twelveMonth: 0,
      yearOverYear: 0
    };

    // Calculate 3-month average
    const threeMonthsAgo = new Date(currentPeriodStart);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
    
    const threeMonthTransactions = transactions.filter(t => {
      const date = new Date(t.date);
      return date >= threeMonthsAgo && date < currentPeriodStart;
    });
    
    const threeMonthFlow = this.calculatePeriodFlow(threeMonthTransactions);
    trends.threeMonth = threeMonthFlow / 3; // Average per month

    // Calculate 6-month average
    const sixMonthsAgo = new Date(currentPeriodStart);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const sixMonthTransactions = transactions.filter(t => {
      const date = new Date(t.date);
      return date >= sixMonthsAgo && date < currentPeriodStart;
    });
    
    const sixMonthFlow = this.calculatePeriodFlow(sixMonthTransactions);
    trends.sixMonth = sixMonthFlow / 6; // Average per month

    // Calculate 12-month average
    const twelveMonthsAgo = new Date(currentPeriodStart);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    
    const twelveMonthTransactions = transactions.filter(t => {
      const date = new Date(t.date);
      return date >= twelveMonthsAgo && date < currentPeriodStart;
    });
    
    const twelveMonthFlow = this.calculatePeriodFlow(twelveMonthTransactions);
    trends.twelveMonth = twelveMonthFlow / 12; // Average per month

    // Calculate year-over-year percentage change
    const lastYearSameMonth = new Date(currentPeriodStart);
    lastYearSameMonth.setFullYear(lastYearSameMonth.getFullYear() - 1);
    const lastYearEnd = new Date(lastYearSameMonth);
    lastYearEnd.setMonth(lastYearEnd.getMonth() + 1, 0);
    
    const lastYearTransactions = transactions.filter(t => {
      const date = new Date(t.date);
      return date >= lastYearSameMonth && date <= lastYearEnd;
    });
    
    const lastYearFlow = this.calculatePeriodFlow(lastYearTransactions);
    const currentFlow = this.calculatePeriodFlow(transactions.filter(t => {
      const date = new Date(t.date);
      return date >= currentPeriodStart;
    }));
    
    if (lastYearFlow !== 0) {
      trends.yearOverYear = ((currentFlow - lastYearFlow) / Math.abs(lastYearFlow)) * 100;
    }

    return trends;
  }

  /**
   * Calculate net flow for a period
   * @param {Array} transactions - Period transactions
   * @returns {number} Net cash flow
   */
  static calculatePeriodFlow(transactions) {
    return transactions.reduce((sum, t) => sum + t.amount, 0);
  }

  /**
   * Calculate cash flow velocity (transaction frequency)
   * @param {Array} transactions - Period transactions
   * @param {Date} startDate - Period start
   * @param {Date} endDate - Period end
   * @returns {number} Transactions per day
   */
  static calculateCashFlowVelocity(transactions, startDate, endDate) {
    const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    return daysDiff > 0 ? transactions.length / daysDiff : 0;
  }

  /**
   * Generate cash flow forecast based on historical patterns
   * @param {Array} transactions - All transactions
   * @param {number} monthsAhead - Number of months to forecast
   * @returns {Object} Forecast data
   */
  static generateForecast(transactions, monthsAhead = 3) {
    if (transactions.length === 0) {
      return {
        nextMonth: 0,
        sixMonth: 0,
        twelveMonth: 0,
        confidence: 0,
        factors: []
      };
    }

    // Calculate monthly averages for the last 6 months
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    
    const recentTransactions = transactions.filter(t => {
      const date = new Date(t.date);
      return date >= sixMonthsAgo;
    });

    // Group by month
    const monthlyData = {};
    recentTransactions.forEach(t => {
      const date = new Date(t.date);
      const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { income: 0, expenses: 0, netFlow: 0 };
      }
      
      if (t.amount > 0) {
        monthlyData[monthKey].income += t.amount;
      } else {
        monthlyData[monthKey].expenses += Math.abs(t.amount);
      }
      monthlyData[monthKey].netFlow += t.amount;
    });

    const monthlyFlows = Object.values(monthlyData).map(m => m.netFlow);
    const avgMonthlyFlow = monthlyFlows.length > 0 
      ? monthlyFlows.reduce((sum, flow) => sum + flow, 0) / monthlyFlows.length 
      : 0;

    // Calculate variance for confidence
    const variance = monthlyFlows.length > 1
      ? monthlyFlows.reduce((sum, flow) => sum + Math.pow(flow - avgMonthlyFlow, 2), 0) / (monthlyFlows.length - 1)
      : 0;
    
    const standardDeviation = Math.sqrt(variance);
    const coefficientOfVariation = avgMonthlyFlow !== 0 ? Math.abs(standardDeviation / avgMonthlyFlow) : 1;
    
    // Confidence decreases with higher variability
    const confidence = Math.max(50, Math.min(95, 100 - (coefficientOfVariation * 50)));

    // Identify factors affecting forecast
    const factors = this.identifyForecastFactors(transactions, monthlyData);

    return {
      nextMonth: avgMonthlyFlow,
      sixMonth: avgMonthlyFlow * 6,
      twelveMonth: avgMonthlyFlow * 12,
      confidence: Math.round(confidence),
      factors,
      historicalAverage: avgMonthlyFlow,
      volatility: standardDeviation
    };
  }

  /**
   * Identify factors that might affect future cash flow
   * @param {Array} transactions - All transactions
   * @param {Object} monthlyData - Monthly data breakdown
   * @returns {Array} Factors affecting forecast
   */
  static identifyForecastFactors(transactions, monthlyData) {
    const factors = [];
    
    // Check for seasonal patterns
    const seasonalData = this.analyzeSeasonalPatterns(transactions);
    if (seasonalData.hasSeasonality) {
      factors.push('seasonal_variation');
    }

    // Check for recurring bills
    const recurringTransactions = transactions.filter(t => 
      t.description.toLowerCase().includes('recurring') ||
      t.description.toLowerCase().includes('subscription') ||
      t.description.toLowerCase().includes('monthly')
    );
    
    if (recurringTransactions.length > 0) {
      factors.push('recurring_bills');
    }

    // Check for growth trends
    const monthlyFlows = Object.values(monthlyData).map(m => m.netFlow);
    if (monthlyFlows.length >= 3) {
      const trend = this.calculateTrendDirection(monthlyFlows);
      if (trend > 0.1) {
        factors.push('positive_trend');
      } else if (trend < -0.1) {
        factors.push('negative_trend');
      }
    }

    return factors;
  }

  /**
   * Analyze seasonal spending patterns
   * @param {Array} transactions - All transactions
   * @returns {Object} Seasonal analysis
   */
  static analyzeSeasonalPatterns(transactions) {
    const monthlyTotals = new Array(12).fill(0);
    const monthlyCounts = new Array(12).fill(0);
    
    transactions.forEach(t => {
      const date = new Date(t.date);
      const month = date.getMonth();
      monthlyTotals[month] += Math.abs(t.amount);
      monthlyCounts[month]++;
    });

    // Calculate average spending per month
    const monthlyAverages = monthlyTotals.map((total, index) => 
      monthlyCounts[index] > 0 ? total / monthlyCounts[index] : 0
    );

    // Check for significant variations (>20% from average)
    const overallAverage = monthlyAverages.reduce((sum, avg) => sum + avg, 0) / 12;
    const hasSeasonality = monthlyAverages.some(avg => 
      Math.abs(avg - overallAverage) / overallAverage > 0.2
    );

    return {
      hasSeasonality,
      monthlyAverages,
      peakMonth: monthlyAverages.indexOf(Math.max(...monthlyAverages)),
      lowMonth: monthlyAverages.indexOf(Math.min(...monthlyAverages))
    };
  }

  /**
   * Calculate trend direction from an array of values
   * @param {Array} values - Array of numerical values
   * @returns {number} Trend coefficient (-1 to 1)
   */
  static calculateTrendDirection(values) {
    if (values.length < 2) return 0;
    
    const n = values.length;
    const sumX = (n * (n - 1)) / 2; // Sum of indices 0,1,2...n-1
    const sumY = values.reduce((sum, val) => sum + val, 0);
    const sumXY = values.reduce((sum, val, index) => sum + (index * val), 0);
    const sumX2 = values.reduce((sum, val, index) => sum + (index * index), 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    
    // Normalize slope relative to average value
    const avgY = sumY / n;
    return avgY !== 0 ? slope / Math.abs(avgY) : 0;
  }

  /**
   * Generate intelligent cash flow insights
   * @param {Object} metrics - Cash flow metrics
   * @param {Array} transactions - All transactions
   * @returns {Array} Array of insight objects
   */
  static generateInsights(metrics, transactions) {
    const insights = [];

    // Net flow insights
    if (metrics.netFlow > 0) {
      insights.push({
        type: 'positive',
        icon: 'âœ…',
        title: 'Positive Cash Flow',
        message: `You have a surplus of $${Math.abs(metrics.netFlow).toFixed(2)} this period`,
        priority: 'high'
      });
    } else if (metrics.netFlow < 0) {
      insights.push({
        type: 'warning',
        icon: 'âš ï¸',
        title: 'Negative Cash Flow',
        message: `You spent $${Math.abs(metrics.netFlow).toFixed(2)} more than you earned`,
        priority: 'high'
      });
    }

    // Efficiency insights
    if (metrics.efficiency > 80) {
      insights.push({
        type: 'positive',
        icon: 'ðŸŽ¯',
        title: 'Excellent Savings Rate',
        message: `You're saving ${metrics.efficiency.toFixed(1)}% of your income`,
        priority: 'medium'
      });
    } else if (metrics.efficiency < 20) {
      insights.push({
        type: 'warning',
        icon: 'ðŸ’¸',
        title: 'Low Savings Rate',
        message: `Consider reducing expenses to improve your ${metrics.efficiency.toFixed(1)}% savings rate`,
        priority: 'medium'
      });
    }

    // Trend insights
    if (metrics.trends.yearOverYear > 20) {
      insights.push({
        type: 'positive',
        icon: 'ðŸ“ˆ',
        title: 'Improving Trends',
        message: `Your cash flow improved ${metrics.trends.yearOverYear.toFixed(1)}% compared to last year`,
        priority: 'medium'
      });
    } else if (metrics.trends.yearOverYear < -20) {
      insights.push({
        type: 'warning',
        icon: 'ðŸ“‰',
        title: 'Declining Trends',
        message: `Your cash flow decreased ${Math.abs(metrics.trends.yearOverYear).toFixed(1)}% compared to last year`,
        priority: 'medium'
      });
    }

    // Velocity insights
    if (metrics.velocity > 5) {
      insights.push({
        type: 'info',
        icon: 'ðŸ”„',
        title: 'High Transaction Frequency',
        message: `You average ${metrics.velocity.toFixed(1)} transactions per day`,
        priority: 'low'
      });
    }

    return insights.slice(0, 6); // Limit to 6 insights
  }
}
