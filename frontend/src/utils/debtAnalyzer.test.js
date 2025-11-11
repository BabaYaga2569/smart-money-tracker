// utils/debtAnalyzer.test.js
import { analyzeDebtSituation, calculateDebtFreeTimeline } from './debtAnalyzer.js';

// Simple test runner
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`❌ Assertion failed: ${message}`);
  }
};

const test = (name, fn) => {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(error.message);
    throw error;
  }
};

const runDebtAnalyzerTests = () => {
  console.log('🧪 Testing Debt Analyzer...\n');

  // Test 1: Detect debt when credit cards have balances in balances.current field
  test('Detects debt with balances.current field', () => {
    const creditCards = [
      {
        account_id: 'card1',
        name: 'Chase Sapphire',
        type: 'credit',
        balances: {
          current: 1500.0,
          available: 3500.0,
          limit: 5000.0,
        },
        apr: 18.99,
      },
      {
        account_id: 'card2',
        name: 'Capital One Quicksilver',
        type: 'credit',
        balances: {
          current: 2500.0,
          available: 2500.0,
          limit: 5000.0,
        },
        apr: 22.5,
      },
    ];

    const analysis = analyzeDebtSituation(creditCards, 1000, [], null, []);

    assert(analysis.hasDebt === true, 'Should detect debt');
    assert(analysis.totalDebt === 4000, `Total debt should be 4000, got ${analysis.totalDebt}`);
    assert(analysis.cardsPrioritized.length === 2, 'Should have 2 cards');
    // Should prioritize highest APR first (Capital One at 22.50%)
    assert(
      analysis.cardsPrioritized[0].name === 'Capital One Quicksilver',
      `First card should be Capital One, got ${analysis.cardsPrioritized[0].name}`
    );
    assert(analysis.cardsPrioritized[0].balance === 2500, 'First card balance should be 2500');
  });

  // Test 2: Return hasDebt false when no credit cards have balances
  test('Returns hasDebt false for cards with zero balance', () => {
    const creditCards = [
      {
        account_id: 'card1',
        name: 'Chase Sapphire',
        type: 'credit',
        balances: {
          current: 0,
          available: 5000.0,
          limit: 5000.0,
        },
        apr: 18.99,
      },
    ];

    const analysis = analyzeDebtSituation(creditCards, 1000, [], null, []);

    assert(analysis.hasDebt === false, 'Should not detect debt');
    assert(analysis.totalDebt === 0, 'Total debt should be 0');
    assert(analysis.cardsPrioritized.length === 0, 'Should have 0 cards');
  });

  // Test 3: Handle cards with fallback balance field
  test('Handles fallback balance field', () => {
    const creditCards = [
      {
        account_id: 'card1',
        name: 'Legacy Card',
        type: 'credit',
        balance: 1000.0, // Fallback field
        apr: 15.99,
      },
    ];

    const analysis = analyzeDebtSituation(creditCards, 500, [], null, []);

    assert(analysis.hasDebt === true, 'Should detect debt');
    assert(analysis.totalDebt === 1000, `Total debt should be 1000, got ${analysis.totalDebt}`);
    assert(analysis.cardsPrioritized.length === 1, 'Should have 1 card');
  });

  // Test 4: Calculate average APR correctly
  test('Calculates average APR correctly', () => {
    const creditCards = [
      {
        account_id: 'card1',
        name: 'Card 1',
        type: 'credit',
        balances: { current: 1000 },
        apr: 10,
      },
      {
        account_id: 'card2',
        name: 'Card 2',
        type: 'credit',
        balances: { current: 1000 },
        apr: 20,
      },
    ];

    const analysis = analyzeDebtSituation(creditCards, 0, [], null, []);

    assert(analysis.hasDebt === true, 'Should detect debt');
    assert(analysis.averageAPR === 15, `Average APR should be 15, got ${analysis.averageAPR}`);
  });

  // Test 5: Generate priority recommendation for highest APR card
  test('Prioritizes highest APR card', () => {
    const creditCards = [
      {
        account_id: 'card1',
        name: 'Low APR Card',
        type: 'credit',
        balances: { current: 1000 },
        apr: 12.99,
      },
      {
        account_id: 'card2',
        name: 'High APR Card',
        type: 'credit',
        balances: { current: 2000 },
        apr: 24.99,
      },
    ];

    const analysis = analyzeDebtSituation(creditCards, 500, [], null, []);

    assert(analysis.hasDebt === true, 'Should detect debt');
    assert(
      analysis.priorityCard.name === 'High APR Card',
      `Priority card should be High APR Card, got ${analysis.priorityCard.name}`
    );
    assert(analysis.priorityRecommendation !== undefined, 'Should have priority recommendation');
    assert(
      analysis.priorityRecommendation.priority !== undefined,
      'Recommendation should have priority'
    );
  });

  // Test 6: Return zero timeline for empty card list
  test('Returns zero timeline for empty cards', () => {
    const timeline = calculateDebtFreeTimeline([], 0);

    assert(timeline.months === 0, 'Months should be 0');
    assert(timeline.years === 0, 'Years should be 0');
    assert(timeline.totalInterest === 0, 'Total interest should be 0');
  });

  // Test 7: Calculate timeline with single card
  test('Calculates timeline for single card', () => {
    const cards = [
      {
        account_id: 'card1',
        name: 'Test Card',
        balance: 1000,
        apr: 18,
        minimumPayment: 50,
      },
    ];

    const timeline = calculateDebtFreeTimeline(cards, 0);

    assert(timeline.months > 0, 'Should have positive months');
    assert(timeline.totalInterest > 0, 'Should have positive interest');
    assert(timeline.breakdown !== undefined, 'Should have breakdown');
    assert(timeline.breakdown.length === timeline.months, 'Breakdown length should match months');
  });

  // Test 8: Reduce timeline with extra monthly payment
  test('Extra payment reduces timeline', () => {
    const cards = [
      {
        account_id: 'card1',
        name: 'Test Card',
        balance: 1000,
        apr: 18,
        minimumPayment: 50,
      },
    ];

    const timelineNoExtra = calculateDebtFreeTimeline(cards, 0);
    const timelineWithExtra = calculateDebtFreeTimeline(cards, 100);

    assert(
      timelineWithExtra.months < timelineNoExtra.months,
      'Extra payment should reduce months'
    );
    assert(
      timelineWithExtra.totalInterest < timelineNoExtra.totalInterest,
      'Extra payment should reduce interest'
    );
  });

  console.log('\n✅ All debtAnalyzer tests passed!');
};

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDebtAnalyzerTests();
}

export { runDebtAnalyzerTests };
