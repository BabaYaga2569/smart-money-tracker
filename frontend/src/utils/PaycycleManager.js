// PaycycleManager.js - Comprehensive paycycle and income management
import { getDaysUntilDateInPacific, getPacificTime } from './DateUtils.js';

export class PaycycleManager {
  /**
   * Income source types with their characteristics
   */
  static INCOME_SOURCE_TYPES = {
    SALARY: {
      frequency: ['weekly', 'bi-weekly', 'semi-monthly', 'monthly'],
      predictable: true,
      taxable: true,
      icon: '💼',
    },
    HOURLY: {
      frequency: ['weekly', 'bi-weekly'],
      predictable: false,
      taxable: true,
      icon: '⏰',
    },
    GIG_WORK: {
      frequency: 'irregular',
      predictable: false,
      taxable: true,
      platforms: ['uber', 'doordash', 'freelance', 'other'],
      icon: '🚗',
    },
    SIDE_HUSTLE: {
      frequency: 'irregular',
      predictable: false,
      taxable: true,
      icon: '💡',
    },
    INVESTMENT: {
      frequency: ['monthly', 'quarterly', 'annual'],
      predictable: true,
      taxable: true,
      types: ['dividends', 'interest', 'rental'],
      icon: '📈',
    },
    BENEFITS: {
      frequency: ['monthly', 'one-time'],
      predictable: true,
      taxable: false,
      types: ['unemployment', 'disability', 'social_security'],
      icon: '🏛️',
    },
  };

  /**
   * Calculate comprehensive income metrics
   */
  static calculateIncomeMetrics(incomeSources, transactions = []) {
    const now = getPacificTime();
    const currentYear = now.getFullYear();

    let totalMonthlyProjection = 0;
    let yearToDate = 0;
    let nextPaycheck = null;

    // Calculate projections from income sources
    incomeSources.forEach((source) => {
      if (source.active) {
        const monthlyAmount = this.calculateMonthlyAmount(source);
        totalMonthlyProjection += monthlyAmount;

        // Find next paycheck date
        const nextPayDate = this.calculateNextPayDate(source);
        if (nextPayDate && (!nextPaycheck || nextPayDate < nextPaycheck.date)) {
          nextPaycheck = {
            date: nextPayDate,
            amount: source.amount,
            source: source.name,
          };
        }
      }
    });

    // Calculate YTD from transactions
    const startOfYear = new Date(currentYear, 0, 1);
    yearToDate = transactions
      .filter((t) => t.amount > 0 && new Date(t.date) >= startOfYear)
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      currentPayPeriod: this.calculateCurrentPayPeriod(incomeSources, transactions),
      monthlyProjection: totalMonthlyProjection,
      yearToDate,
      nextPaycheck: nextPaycheck
        ? {
            ...nextPaycheck,
            daysUntil: getDaysUntilDateInPacific(nextPaycheck.date),
          }
        : null,
    };
  }

  /**
   * Calculate monthly amount from income source
   */
  static calculateMonthlyAmount(source) {
    const { frequency, amount } = source;

    switch (frequency) {
      case 'weekly':
        return amount * 4.33; // Average weeks per month
      case 'bi-weekly':
        return amount * 2.167; // 26 pays per year / 12 months
      case 'semi-monthly':
        return amount * 2;
      case 'monthly':
        return amount;
      case 'quarterly':
        return amount / 3;
      case 'annual':
        return amount / 12;
      default:
        return 0;
    }
  }

  /**
   * Calculate next pay date for income source
   */
  static calculateNextPayDate(source) {
    const { frequency, lastPayDate } = source;
    if (!lastPayDate) return null;

    const lastPay = new Date(lastPayDate);
    const nextPay = new Date(lastPay);

    switch (frequency) {
      case 'weekly':
        nextPay.setDate(lastPay.getDate() + 7);
        break;
      case 'bi-weekly':
        nextPay.setDate(lastPay.getDate() + 14);
        break;
      case 'semi-monthly': {
        // 15th and 30th of month
        const day = lastPay.getDate();
        if (day <= 15) {
          nextPay.setDate(30);
        } else {
          nextPay.setMonth(lastPay.getMonth() + 1);
          nextPay.setDate(15);
        }
        break;
      }
      case 'monthly':
        nextPay.setMonth(lastPay.getMonth() + 1);
        break;
      default:
        return null;
    }

    return nextPay;
  }

  /**
   * Calculate current pay period metrics
   */
  static calculateCurrentPayPeriod(incomeSources, transactions) {
    const now = getPacificTime();

    // Find most recent pay period
    let periodStart = new Date(now);
    periodStart.setDate(1); // Default to month start

    // Try to find actual pay period from income sources
    const primarySource = incomeSources.find((s) => s.type === 'SALARY' && s.active);
    if (primarySource && primarySource.lastPayDate) {
      const lastPay = new Date(primarySource.lastPayDate);
      const nextPay = this.calculateNextPayDate(primarySource);

      if (nextPay && lastPay <= now && now < nextPay) {
        periodStart = lastPay;
      }
    }

    // Calculate period transactions
    const periodTransactions = transactions.filter((t) => {
      const tDate = new Date(t.date);
      return tDate >= periodStart && tDate <= now;
    });

    const grossIncome = periodTransactions
      .filter((t) => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);

    return {
      grossIncome,
      netIncome: grossIncome * 0.75, // Estimate 25% deductions
      deductions: {
        taxes: grossIncome * 0.15,
        benefits: grossIncome * 0.05,
        retirement: grossIncome * 0.03,
        other: grossIncome * 0.02,
      },
    };
  }

  /**
   * Generate cash flow forecast
   */
  static generateCashFlowForecast(incomeSources, bills, currentBalance, days = 90) {
    const forecast = [];
    const now = getPacificTime();

    // Generate future income and expense events
    const events = [];

    // Add income events
    incomeSources.forEach((source) => {
      if (source.active) {
        const payDates = this.generatePayDates(source, days);
        payDates.forEach((date) => {
          events.push({
            date,
            amount: source.amount,
            type: 'income',
            description: `${source.name} - ${source.type}`,
          });
        });
      }
    });

    // Add bill events
    bills.forEach((bill) => {
      if (bill.active) {
        const billDates = this.generateBillDates(bill, days);
        billDates.forEach((date) => {
          events.push({
            date,
            amount: -bill.amount,
            type: 'expense',
            description: bill.name,
          });
        });
      }
    });

    // Sort events by date
    events.sort((a, b) => a.date - b.date);

    // Calculate running balance
    let balance = currentBalance;
    const currentDate = new Date(now);

    for (let i = 0; i < days; i++) {
      const dayEvents = events.filter((e) => e.date.toDateString() === currentDate.toDateString());

      const dayIncome = dayEvents
        .filter((e) => e.type === 'income')
        .reduce((sum, e) => sum + e.amount, 0);

      const dayExpenses = Math.abs(
        dayEvents.filter((e) => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0)
      );

      balance += dayIncome - dayExpenses;

      forecast.push({
        date: new Date(currentDate),
        balance,
        income: dayIncome,
        expenses: dayExpenses,
        events: dayEvents,
        riskLevel: this.assessDayRisk(balance, dayExpenses),
      });

      currentDate.setDate(currentDate.getDate() + 1);
    }

    return forecast;
  }

  /**
   * Generate pay dates for an income source
   */
  static generatePayDates(source, days) {
    const dates = [];
    const { lastPayDate } = source;

    if (!lastPayDate) return dates;

    let nextDate = this.calculateNextPayDate(source);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    while (nextDate && nextDate <= endDate) {
      dates.push(new Date(nextDate));

      // Calculate next occurrence
      const tempSource = { ...source, lastPayDate: nextDate };
      nextDate = this.calculateNextPayDate(tempSource);
    }

    return dates;
  }

  /**
   * Generate bill due dates
   */
  static generateBillDates(bill, days) {
    const dates = [];
    const { frequency, dueDate } = bill;

    if (!dueDate) return dates;

    const nextDate = new Date(dueDate);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);

    // Ensure we start from next occurrence if due date is in past
    const now = new Date();
    while (nextDate <= now) {
      switch (frequency) {
        case 'weekly':
          nextDate.setDate(nextDate.getDate() + 7);
          break;
        case 'bi-weekly':
          nextDate.setDate(nextDate.getDate() + 14);
          break;
        case 'monthly':
          nextDate.setMonth(nextDate.getMonth() + 1);
          break;
        default:
          return dates;
      }
    }

    while (nextDate <= endDate) {
      dates.push(new Date(nextDate));

      switch (frequency) {
        case 'weekly':
          nextDate.setDate(nextDate.getDate() + 7);
          break;
        case 'bi-weekly':
          nextDate.setDate(nextDate.getDate() + 14);
          break;
        case 'monthly':
          nextDate.setMonth(nextDate.getMonth() + 1);
          break;
        default:
          return dates;
      }
    }

    return dates;
  }

  /**
   * Assess financial risk for a day
   */
  static assessDayRisk(balance, expenses) {
    const ratio = expenses / balance;

    if (balance < 0) return 'critical';
    if (ratio > 0.8) return 'high';
    if (ratio > 0.5) return 'medium';
    return 'low';
  }

  /**
   * Optimize bill payment schedule
   */
  static optimizePaymentSchedule(bills, incomeSources) {
    return bills.map((bill) => {
      const recommendations = this.generatePaymentRecommendations(bill, incomeSources);
      const riskLevel = this.assessPaymentRisk(bill, incomeSources);

      return {
        ...bill,
        recommendations,
        riskLevel,
        suggestedPayDate: recommendations.optimalPayDate,
      };
    });
  }

  /**
   * Generate payment recommendations for a bill
   */
  static generatePaymentRecommendations(bill, incomeSources) {
    const dueDate = new Date(bill.dueDate);

    // Find next paycheck after due date
    let optimalPaycheck = null;
    let optimalPayDate = dueDate;

    incomeSources.forEach((source) => {
      if (source.active) {
        const nextPay = this.calculateNextPayDate(source);
        if (nextPay && nextPay >= dueDate) {
          if (!optimalPaycheck || nextPay < optimalPaycheck.date) {
            optimalPaycheck = {
              date: nextPay,
              amount: source.amount,
              source: source.name,
            };
          }
        }
      }
    });

    if (optimalPaycheck) {
      // Suggest paying 1-2 days after paycheck
      optimalPayDate = new Date(optimalPaycheck.date);
      optimalPayDate.setDate(optimalPayDate.getDate() + 1);
    }

    return {
      optimalPayDate,
      paymentTiming: 'Pay bills 2-3 days after paychecks arrive',
      riskMitigation: 'Build 3-day buffer for bill payments',
      optimization: 'Schedule large purchases right after pay periods',
      emergencyPlan: 'Maintain $500 buffer for unexpected expenses',
    };
  }

  /**
   * Assess payment risk for a bill
   */
  static assessPaymentRisk(bill, incomeSources) {
    const dueDate = new Date(bill.dueDate);

    // Find closest paycheck before due date
    let closestPaycheck = null;

    incomeSources.forEach((source) => {
      if (source.active) {
        const nextPay = this.calculateNextPayDate(source);
        if (nextPay && nextPay <= dueDate) {
          if (!closestPaycheck || nextPay > closestPaycheck.date) {
            closestPaycheck = {
              date: nextPay,
              amount: source.amount,
            };
          }
        }
      }
    });

    if (!closestPaycheck) return 'critical';

    const daysBetween = Math.floor((dueDate - closestPaycheck.date) / (1000 * 60 * 60 * 24));
    const amountRatio = bill.amount / closestPaycheck.amount;

    if (daysBetween < 1 || amountRatio > 0.8) return 'high';
    if (daysBetween < 3 || amountRatio > 0.5) return 'medium';
    return 'low';
  }
}
