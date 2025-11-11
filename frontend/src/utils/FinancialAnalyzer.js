/**
 * Financial Analyzer - Analyzes user's complete financial situation
 * Phase 1: Core analysis functions
 */

export class FinancialAnalyzer {
  /**
   * Analyze cash flow from recent transactions
   */
  static analyzeCashFlow(transactions, accounts) {
    if (!transactions || !accounts) {
      return null;
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentTransactions = transactions.filter(t => {
      const txDate = new Date(t.date);
      return txDate >= thirtyDaysAgo;
    });

    const income = recentTransactions
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const expenses = recentTransactions
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const availableCash = accounts
      .filter(a => a.type === 'depository' && (a.subtype === 'checking' || a.subtype === 'savings'))
      .reduce((sum, a) => sum + (a.balances?.current || 0), 0);

    const monthlySurplus = income - expenses;
    const recommendedExtra = monthlySurplus > 100 ? Math.floor(monthlySurplus * 0.4) : 0;

    return {
      monthlyIncome: income,
      monthlyExpenses: expenses,
      monthlySurplus: monthlySurplus,
      availableCash: availableCash,
      recommendedExtraPayment: recommendedExtra,
      hasPositiveCashFlow: monthlySurplus > 0
    };
  }

  /**
   * Analyze spending by category
   */
  static analyzeSpending(transactions) {
    if (!transactions || transactions.length === 0) {
      return [];
    }

    const categoryTotals = {};
    
    transactions.forEach(t => {
      if (t.amount < 0) {
        const category = t.category || 'Uncategorized';
        categoryTotals[category] = (categoryTotals[category] || 0) + Math.abs(t.amount);
      }
    });

    return Object.entries(categoryTotals)
      .filter(([cat]) => cat !== 'Bills & Utilities' && cat !== 'Transfer')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .filter(([_, amount]) => amount > 200)
      .map(([category, amount]) => ({
        category,
        amount,
        suggestion: `Consider reducing by 15-20%`,
        potentialSavings: Math.floor(amount * 0.15)
      }));
  }

  /**
   * Calculate optimal debt payoff strategy
   */
  static calculateStrategy(debts, cashFlow) {
    if (!debts || debts.length === 0) {
      return null;
    }

    const sortedByAPR = [...debts].sort((a, b) => 
      (b.interestRate || 0) - (a.interestRate || 0)
    );

    const smallDebt = debts.find(d => d.balance < 500);
    const targetDebt = smallDebt || sortedByAPR[0];
    
    const totalMinimums = debts.reduce((sum, d) => 
      sum + (d.minimumPayment || d.balance * 0.02), 0
    );

    const extraPayment = cashFlow?.recommendedExtraPayment || 0;
    const totalPayment = totalMinimums + extraPayment;

    const totalDebt = debts.reduce((sum, d) => sum + d.balance, 0);
    const avgAPR = debts.reduce((sum, d) => sum + (d.interestRate || 20), 0) / debts.length;
    const monthlyRate = (avgAPR / 100) / 12;
    
    let months = 0;
    let remainingBalance = totalDebt;
    
    while (remainingBalance > 0 && months < 600) {
      remainingBalance += remainingBalance * monthlyRate;
      remainingBalance -= totalPayment;
      months++;
    }

    const debtFreeDate = new Date();
    debtFreeDate.setMonth(debtFreeDate.getMonth() + months);

    return {
      targetDebt,
      strategy: smallDebt ? 'hybrid' : 'avalanche',
      strategyName: smallDebt ? 'Quick Win + Avalanche' : 'Avalanche (Highest APR First)',
      recommendedExtraPayment: extraPayment,
      totalMonthlyPayment: totalPayment,
      estimatedMonths: months,
      debtFreeDate,
      reasoning: smallDebt 
        ? `Pay off ${targetDebt.name} first for a quick psychological win, then attack highest APR debts`
        : `Focus on ${targetDebt.name} (${targetDebt.interestRate}% APR) to minimize total interest paid`
    };
  }

  /**
   * Generate actionable recommendations
   */
  static generateRecommendations(strategy, cashFlow) {
    const recommendations = [];

    if (!strategy || !cashFlow) {
      return recommendations;
    }

    if (strategy.recommendedExtraPayment > 0) {
      recommendations.push({
        type: 'payment',
        priority: 'high',
        title: `Pay $${strategy.recommendedExtraPayment} extra on ${strategy.targetDebt.name}`,
        description: `This will save you approximately $${Math.floor(strategy.recommendedExtraPayment * 0.15)} in interest`,
        action: 'Make extra payment'
      });
    } else {
      recommendations.push({
        type: 'payment',
        priority: 'medium',
        title: `Keep making minimum payments`,
        description: `Focus on building emergency fund first. Current surplus: $${Math.floor(cashFlow.monthlySurplus)}`,
        action: 'Maintain minimums'
      });
    }

    if (cashFlow.availableCash < 1000) {
      recommendations.push({
        type: 'emergency',
        priority: 'high',
        title: 'Build emergency fund first',
        description: `You have $${Math.floor(cashFlow.availableCash)} available. Aim for $1,000 before aggressive debt payoff`,
        action: 'Save for emergency fund'
      });
    }

    recommendations.push({
      type: 'automation',
      priority: 'medium',
      title: 'Set up auto-pay for minimum payments',
      description: 'Avoid late fees and maintain good credit',
      action: 'Enable auto-pay'
    });

    return recommendations;
  }
}
