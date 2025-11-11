// utils/debtAnalyzer.js
// Core analysis engine for debt optimization

import { calculatePayoff, calculateSavings, estimateMinimumPayment } from './payoffCalculator.js';

/**
 * Analyze complete debt situation and generate recommendations
 * @param {Array} creditCards - Array of credit card accounts
 * @param {number} spendability - Available cash to spend
 * @param {Array} bills - Upcoming bills
 * @param {string} payday - Next payday date
 * @param {Array} recurringPayments - Existing recurring payments
 * @returns {Object} Complete debt analysis with recommendations
 */
export const analyzeDebtSituation = (
  creditCards,
  spendability,
  bills,
  payday,
  recurringPayments
) => {
  // Filter out cards with no balance
  const cardsWithDebt = creditCards.filter((card) => {
    const balance = parseFloat(card.balances?.current || card.balance || 0);
    return balance > 0;
  });

  if (cardsWithDebt.length === 0) {
    return {
      hasDebt: false,
      totalDebt: 0,
      averageAPR: 0,
      monthlyInterest: 0,
      recommendations: [],
      priorityCard: null,
      cardsPrioritized: [],
    };
  }

  // Calculate total debt and average APR
  let totalDebt = 0;
  let totalAPR = 0;
  let validAPRCount = 0;

  const cardsWithAnalysis = cardsWithDebt.map((card) => {
    const balance = parseFloat(card.balances?.current || card.balance || 0);
    const apr = extractAPR(card);
    const minimumPayment = estimateMinimumPayment(balance, apr);

    // Find existing recurring payment for this card
    const existingPayment = findExistingPayment(card, recurringPayments);

    totalDebt += balance;
    if (apr > 0) {
      totalAPR += apr;
      validAPRCount++;
    }

    return {
      ...card,
      balance,
      apr,
      minimumPayment,
      existingPayment,
      monthlyInterest: (balance * (apr / 100 / 12)),
    };
  });

  const averageAPR = validAPRCount > 0 ? totalAPR / validAPRCount : 0;
  const totalMonthlyInterest = cardsWithAnalysis.reduce(
    (sum, card) => sum + card.monthlyInterest,
    0
  );

  // Sort by APR (debt avalanche strategy - highest APR first)
  const cardsPrioritized = [...cardsWithAnalysis].sort((a, b) => b.apr - a.apr);

  // Get priority card (highest APR)
  const priorityCard = cardsPrioritized[0];

  // Generate recommendation for priority card
  const recommendation = generateRecommendation(
    priorityCard,
    spendability,
    bills
  );

  // Generate recommendations for all cards
  const recommendations = cardsPrioritized.map((card) =>
    generateRecommendation(card, spendability, bills)
  );

  return {
    hasDebt: true,
    totalDebt,
    averageAPR,
    monthlyInterest: totalMonthlyInterest,
    yearlyInterest: totalMonthlyInterest * 12,
    availableCash: spendability,
    priorityCard,
    cardsPrioritized,
    recommendations,
    priorityRecommendation: recommendation,
  };
};

/**
 * Extract APR from card data
 * @param {Object} card - Credit card account
 * @returns {number} APR percentage
 */
const extractAPR = (card) => {
  // Try to get APR from various possible locations in the data structure
  if (card.apr) return parseFloat(card.apr);
  if (card.aprs && Array.isArray(card.aprs) && card.aprs.length > 0) {
    const purchaseAPR = card.aprs.find(
      (a) => a.apr_type === 'purchase_apr' || a.balance_subject_to_apr_type === 'purchase'
    );
    if (purchaseAPR && purchaseAPR.apr_percentage) {
      return parseFloat(purchaseAPR.apr_percentage);
    }
    // Return first APR if no purchase APR found
    if (card.aprs[0].apr_percentage) {
      return parseFloat(card.aprs[0].apr_percentage);
    }
  }
  // Default to 20% if no APR data available (typical credit card rate)
  return 20;
};

/**
 * Find existing recurring payment for a card
 * @param {Object} card - Credit card account
 * @param {Array} recurringPayments - Array of recurring payments
 * @returns {Object|null} Existing payment or null
 */
const findExistingPayment = (card, recurringPayments) => {
  if (!recurringPayments || recurringPayments.length === 0) return null;

  // Try to match by account ID or card name
  const payment = recurringPayments.find((p) => {
    // Check if linked to this account
    if (p.linkedAccount === card.account_id) return true;

    // Check if name matches (case-insensitive partial match)
    const cardName = (card.name || card.official_name || '').toLowerCase();
    const paymentName = (p.name || '').toLowerCase();
    if (cardName && paymentName && paymentName.includes(cardName)) return true;

    return false;
  });

  return payment || null;
};

/**
 * Generate smart recommendation for a credit card
 * @param {Object} card - Credit card with analysis data
 * @param {number} availableCash - Available cash to spend
 * @param {Array} bills - Upcoming bills
 * @returns {Object} Recommendation details
 */
const generateRecommendation = (card, availableCash, bills) => {
  const balance = card.balance;
  const apr = card.apr;
  const minimumPayment = card.minimumPayment;
  const existingPayment = card.existingPayment;
  const currentPayment = existingPayment ? parseFloat(existingPayment.amount) : minimumPayment;

  // Calculate upcoming bills total
  const upcomingBillsTotal = bills
    ? bills.reduce((sum, bill) => sum + parseFloat(bill.amount || 0), 0)
    : 0;

  // Adjust available cash for bills
  const cashAfterBills = Math.max(0, availableCash - upcomingBillsTotal);

  // Scenario 1: Can pay off completely
  if (cashAfterBills >= balance) {
    const interestSaved = calculatePayoff(balance, apr, minimumPayment).totalInterest;
    const monthlyPaymentFreedUp = currentPayment;

    return {
      type: 'PAY_OFF_NOW',
      priority: 'HIGH',
      action: `Pay off now ($${balance.toFixed(2)})`,
      amount: balance,
      benefits: [
        'Debt-free in 1 payment',
        `Save $${interestSaved.toFixed(2)} in interest`,
        `Free up $${monthlyPaymentFreedUp.toFixed(2)}/month`,
      ],
      reasoning: `You have $${cashAfterBills.toFixed(2)} available after bills, and this card only has $${balance.toFixed(2)}. Pay it off now!`,
      card,
    };
  }

  // Scenario 2: Cash is tight (less than 2x current payment available)
  if (cashAfterBills < currentPayment * 2) {
    return {
      type: 'REDUCE_PAYMENT',
      priority: 'LOW',
      action: `Keep minimum payment ($${minimumPayment.toFixed(2)})`,
      amount: minimumPayment,
      benefits: ['Avoid overdraft fees', 'Maintain good credit'],
      reasoning: `Cash is tight this period ($${cashAfterBills.toFixed(2)} available after bills). Stick to minimum payments to avoid overdraft fees.`,
      card,
    };
  }

  // Scenario 3: Can increase payment
  // Suggest using 10% of available cash or doubling current payment, whichever is less
  const suggestedIncrease = Math.min(currentPayment * 2, cashAfterBills * 0.1);
  const suggestedPayment = Math.max(currentPayment * 1.5, suggestedIncrease);
  const roundedPayment = Math.round(suggestedPayment / 5) * 5; // Round to nearest $5

  const savings = calculateSavings(balance, apr, currentPayment, roundedPayment);

  if (savings.isValid && savings.interestSaved > 0) {
    return {
      type: 'INCREASE_PAYMENT',
      priority: 'MEDIUM',
      action: `Increase to $${roundedPayment.toFixed(2)}/month`,
      amount: roundedPayment,
      benefits: [
        `Pay off ${savings.monthsSaved} months faster`,
        `Save $${savings.interestSaved.toFixed(2)} in interest`,
        `Debt-free in ${savings.proposedMonths} months`,
      ],
      reasoning: `You're currently paying $${currentPayment.toFixed(2)}/month. Increase to $${roundedPayment.toFixed(2)}/month to accelerate payoff.`,
      savings,
      card,
    };
  }

  // Default: Keep current payment
  return {
    type: 'MAINTAIN',
    priority: 'LOW',
    action: `Continue current payment ($${currentPayment.toFixed(2)})`,
    amount: currentPayment,
    benefits: ['Stay on track', 'Maintain budget'],
    reasoning: 'Continue with your current payment plan.',
    card,
  };
};

/**
 * Calculate debt-free timeline with extra payment
 * @param {Array} cardsPrioritized - Cards sorted by priority
 * @param {number} extraMonthlyPayment - Extra amount to apply each month
 * @returns {Object} Timeline details
 */
export const calculateDebtFreeTimeline = (cardsPrioritized, extraMonthlyPayment = 0) => {
  if (!cardsPrioritized || cardsPrioritized.length === 0) {
    return {
      months: 0,
      years: 0,
      totalInterest: 0,
      breakdown: [],
    };
  }

  // Clone cards to avoid mutation
  const cards = cardsPrioritized.map((card) => ({
    ...card,
    remainingBalance: card.balance,
    monthsPaid: 0,
    totalInterestPaid: 0,
  }));

  let month = 0;
  let totalInterest = 0;
  const maxMonths = 360; // 30 years cap
  const breakdown = [];

  while (cards.some((c) => c.remainingBalance > 0.01) && month < maxMonths) {
    month++;
    let extraBudget = extraMonthlyPayment;

    // Apply interest and minimum payments to all cards
    for (const card of cards) {
      if (card.remainingBalance <= 0.01) continue;

      const monthlyRate = card.apr / 100 / 12;
      const interestCharge = card.remainingBalance * monthlyRate;
      card.remainingBalance += interestCharge;
      card.totalInterestPaid += interestCharge;
      totalInterest += interestCharge;

      // Apply minimum payment
      const minPayment = Math.min(card.minimumPayment, card.remainingBalance);
      card.remainingBalance -= minPayment;
      card.monthsPaid++;
    }

    // Apply extra budget to highest priority card with balance
    const targetCard = cards.find((c) => c.remainingBalance > 0.01);
    if (targetCard && extraBudget > 0) {
      const extraPayment = Math.min(extraBudget, targetCard.remainingBalance);
      targetCard.remainingBalance -= extraPayment;
      extraBudget -= extraPayment;
    }

    breakdown.push({
      month,
      totalRemaining: cards.reduce((sum, c) => sum + c.remainingBalance, 0),
      totalInterest,
      extraPaymentApplied: extraMonthlyPayment - extraBudget,
    });
  }

  return {
    months: month,
    years: (month / 12).toFixed(1),
    totalInterest,
    breakdown,
    cardsPayoffOrder: cards.map((c) => ({
      name: c.name || c.official_name,
      monthsPaid: c.monthsPaid,
      totalInterestPaid: c.totalInterestPaid,
    })),
  };
};
