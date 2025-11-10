// utils/payoffCalculator.js
// Payoff calculator for credit card debt optimization

/**
 * Calculate payoff timeline for a credit card
 * @param {number} balance - Current balance
 * @param {number} apr - Annual Percentage Rate
 * @param {number} monthlyPayment - Monthly payment amount
 * @returns {Object} Payoff details including months, total interest, and breakdown
 */
export const calculatePayoff = (balance, apr, monthlyPayment) => {
  if (!balance || balance <= 0) {
    return {
      months: 0,
      years: 0,
      totalInterest: 0,
      totalPaid: 0,
      breakdown: [],
      isValid: true,
    };
  }

  if (!monthlyPayment || monthlyPayment <= 0) {
    return {
      months: null,
      years: null,
      totalInterest: null,
      totalPaid: null,
      breakdown: [],
      isValid: false,
      error: 'Payment must be greater than zero',
    };
  }

  const monthlyRate = apr / 100 / 12;
  const minimumInterest = balance * monthlyRate;

  // Check if payment is less than monthly interest (will never pay off)
  if (monthlyPayment <= minimumInterest) {
    return {
      months: null,
      years: null,
      totalInterest: null,
      totalPaid: null,
      breakdown: [],
      isValid: false,
      error: 'Payment must be greater than monthly interest to pay off debt',
    };
  }

  let remainingBalance = balance;
  let totalInterest = 0;
  let totalPaid = 0;
  let months = 0;
  const breakdown = [];
  const maxMonths = 360; // 30 years cap

  while (remainingBalance > 0.01 && months < maxMonths) {
    const interestCharge = remainingBalance * monthlyRate;
    const principalPayment = Math.min(monthlyPayment - interestCharge, remainingBalance);
    const actualPayment = principalPayment + interestCharge;

    remainingBalance -= principalPayment;
    totalInterest += interestCharge;
    totalPaid += actualPayment;
    months++;

    breakdown.push({
      month: months,
      payment: actualPayment,
      principal: principalPayment,
      interest: interestCharge,
      remainingBalance: Math.max(0, remainingBalance),
    });
  }

  return {
    months,
    years: (months / 12).toFixed(1),
    totalInterest,
    totalPaid,
    breakdown,
    isValid: true,
  };
};

/**
 * Compare different payment scenarios
 * @param {number} balance - Current balance
 * @param {number} apr - Annual Percentage Rate
 * @param {number} currentPayment - Current monthly payment
 * @returns {Object} Comparison of minimum, current, doubled, and optimal payments
 */
export const compareScenarios = (balance, apr, currentPayment) => {
  if (!balance || balance <= 0) {
    return {
      minimum: null,
      current: null,
      doubled: null,
      optimal: null,
    };
  }

  // Calculate minimum payment (typically 2% of balance or $25, whichever is higher)
  const minimumPayment = Math.max(25, balance * 0.02);
  const monthlyRate = apr / 100 / 12;
  const minimumInterest = balance * monthlyRate;
  const effectiveMinimum = Math.max(minimumPayment, minimumInterest + 1);

  const current = calculatePayoff(balance, apr, currentPayment || effectiveMinimum);
  const minimum = calculatePayoff(balance, apr, effectiveMinimum);
  const doubled = calculatePayoff(balance, apr, (currentPayment || effectiveMinimum) * 2);

  // Optimal: Pay off in 12 months if possible
  const optimalPayment = balance / 12 + minimumInterest;
  const optimal = calculatePayoff(balance, apr, optimalPayment);

  return {
    minimum: {
      payment: effectiveMinimum,
      ...minimum,
    },
    current: {
      payment: currentPayment || effectiveMinimum,
      ...current,
    },
    doubled: {
      payment: (currentPayment || effectiveMinimum) * 2,
      ...doubled,
    },
    optimal: {
      payment: optimalPayment,
      ...optimal,
    },
  };
};

/**
 * Calculate interest savings by increasing payment
 * @param {number} balance - Current balance
 * @param {number} apr - Annual Percentage Rate
 * @param {number} currentPayment - Current monthly payment
 * @param {number} newPayment - Proposed new monthly payment
 * @returns {Object} Savings details
 */
export const calculateSavings = (balance, apr, currentPayment, newPayment) => {
  const current = calculatePayoff(balance, apr, currentPayment);
  const proposed = calculatePayoff(balance, apr, newPayment);

  if (!current.isValid || !proposed.isValid) {
    return {
      interestSaved: 0,
      monthsSaved: 0,
      isValid: false,
    };
  }

  return {
    interestSaved: current.totalInterest - proposed.totalInterest,
    monthsSaved: current.months - proposed.months,
    currentTotalInterest: current.totalInterest,
    proposedTotalInterest: proposed.totalInterest,
    currentMonths: current.months,
    proposedMonths: proposed.months,
    isValid: true,
  };
};

/**
 * Calculate payoff date based on months to payoff
 * @param {number} months - Number of months to payoff
 * @returns {string} Formatted payoff date
 */
export const calculatePayoffDate = (months) => {
  if (!months || months === null) return 'Never';

  const date = new Date();
  date.setMonth(date.getMonth() + months);

  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
};

/**
 * Estimate minimum payment for a credit card
 * @param {number} balance - Current balance
 * @param {number} apr - Annual Percentage Rate
 * @returns {number} Estimated minimum payment
 */
export const estimateMinimumPayment = (balance, apr) => {
  if (!balance || balance <= 0) return 0;

  const monthlyRate = apr / 100 / 12;
  const percentPortion = balance * 0.02; // 2% of balance
  const interestPortion = balance * monthlyRate; // interest due
  const floor = 25; // common $25 floor

  return Math.max(floor, percentPortion + interestPortion);
};
