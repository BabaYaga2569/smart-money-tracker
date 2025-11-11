// DebtOptimizerCreditCardFilter.test.js - Test for credit card detection logic
// This test verifies the fix for credit card detection with various Plaid formats

// Simple assertion helper
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
};

// Test helper function
const test = (name, fn) => {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(error.message);
    process.exit(1);
  }
};

// Extracted improved filter logic (what we'll implement in DebtOptimizer.jsx)
const isCreditCard = (account) => {
  // Check type
  if (account.type === 'credit') return true;

  // Check subtype exact matches
  if (account.subtype === 'credit') return true;
  if (account.subtype === 'credit card') return true;

  // Check if subtype contains 'credit' (case-insensitive)
  if (account.subtype?.toLowerCase().includes('credit')) return true;

  // Not a credit card
  return false;
};

// Filter function that also checks for outstanding balance
const filterCreditCardsWithDebt = (accounts) => {
  let creditCards = accounts.filter(isCreditCard);

  // Filter out cards with zero or negative balance (they have available credit, not debt)
  creditCards = creditCards.filter((card) => {
    const balance = parseFloat(card.balances?.current || card.balance || 0);
    return balance > 0;
  });

  return creditCards;
};

// Run tests
const runCreditCardFilterTests = () => {
  console.log('🧪 Testing Credit Card Filter Logic...\n');

  // Test 1: Plaid standard format (type='credit', subtype='credit card')
  test('Detects credit card with Plaid standard format (subtype="credit card")', () => {
    const costcoVisa = {
      account_id: 'test1',
      name: 'Costco Anywhere Visa',
      type: 'credit',
      subtype: 'credit card',
      balance: 657.52,
    };

    assert(isCreditCard(costcoVisa), 'Should detect Plaid credit card format');
  });

  // Test 2: Legacy format (subtype='credit')
  test('Detects credit card with legacy format (subtype="credit")', () => {
    const legacyCard = {
      account_id: 'test2',
      name: 'Legacy Credit Card',
      type: 'credit',
      subtype: 'credit',
      balance: 1000.0,
    };

    assert(isCreditCard(legacyCard), 'Should detect legacy credit card format');
  });

  // Test 3: Type only (no subtype)
  test('Detects credit card with type="credit" only', () => {
    const typeOnlyCard = {
      account_id: 'test3',
      name: 'Type Only Card',
      type: 'credit',
      balance: 500.0,
    };

    assert(
      isCreditCard(typeOnlyCard),
      'Should detect credit card by type alone'
    );
  });

  // Test 4: Capitalized subtype
  test('Detects credit card with capitalized subtype', () => {
    const capitalizedCard = {
      account_id: 'test4',
      name: 'Capitalized Card',
      type: 'credit',
      subtype: 'Credit Card',
      balance: 300.0,
    };

    assert(
      isCreditCard(capitalizedCard),
      'Should detect credit card with capitalized subtype'
    );
  });

  // Test 5: Should NOT detect checking account
  test('Does NOT detect checking account as credit card', () => {
    const checkingAccount = {
      account_id: 'test5',
      name: 'Checking Account',
      type: 'depository',
      subtype: 'checking',
      balance: 1000.0,
    };

    assert(
      !isCreditCard(checkingAccount),
      'Should not detect checking account as credit card'
    );
  });

  // Test 6: Should NOT detect savings account
  test('Does NOT detect savings account as credit card', () => {
    const savingsAccount = {
      account_id: 'test6',
      name: 'Savings Account',
      type: 'depository',
      subtype: 'savings',
      balance: 5000.0,
    };

    assert(
      !isCreditCard(savingsAccount),
      'Should not detect savings account as credit card'
    );
  });

  // Test 7: Filter array of accounts
  test('Filters array of accounts to find only credit cards', () => {
    const accounts = [
      {
        account_id: '1',
        name: 'Costco Visa',
        type: 'credit',
        subtype: 'credit card',
        balance: 657.52,
      },
      {
        account_id: '2',
        name: 'Checking',
        type: 'depository',
        subtype: 'checking',
        balance: 1000.0,
      },
      {
        account_id: '3',
        name: 'Citi Card',
        type: 'credit',
        subtype: 'credit card',
        balance: 2947.58,
      },
      {
        account_id: '4',
        name: 'Savings',
        type: 'depository',
        subtype: 'savings',
        balance: 5000.0,
      },
    ];

    const creditCards = accounts.filter(isCreditCard);

    assert(
      creditCards.length === 2,
      `Should find 2 credit cards, found ${creditCards.length}`
    );
    assert(
      creditCards[0].name === 'Costco Visa',
      'First credit card should be Costco Visa'
    );
    assert(
      creditCards[1].name === 'Citi Card',
      'Second credit card should be Citi Card'
    );
  });

  // Test 8: Filter out cards with zero balance
  test('Filters out credit cards with zero balance', () => {
    const accounts = [
      {
        account_id: '1',
        name: 'Card with Debt',
        type: 'credit',
        subtype: 'credit card',
        balances: { current: 500.0 },
      },
      {
        account_id: '2',
        name: 'Paid Off Card',
        type: 'credit',
        subtype: 'credit card',
        balances: { current: 0 },
      },
      {
        account_id: '3',
        name: 'Card with Refund',
        type: 'credit',
        subtype: 'credit card',
        balances: { current: -50.0 },
      },
    ];

    const cardsWithDebt = filterCreditCardsWithDebt(accounts);

    assert(
      cardsWithDebt.length === 1,
      `Should find 1 card with debt, found ${cardsWithDebt.length}`
    );
    assert(
      cardsWithDebt[0].name === 'Card with Debt',
      'Should only include card with outstanding balance'
    );
  });

  // Test 9: Handle missing balances object
  test('Handles missing balances object gracefully', () => {
    const accounts = [
      {
        account_id: '1',
        name: 'Card with balance property',
        type: 'credit',
        subtype: 'credit card',
        balance: 500.0,
      },
      {
        account_id: '2',
        name: 'Card without balance',
        type: 'credit',
        subtype: 'credit card',
      },
    ];

    const cardsWithDebt = filterCreditCardsWithDebt(accounts);

    assert(
      cardsWithDebt.length === 1,
      `Should find 1 card with debt, found ${cardsWithDebt.length}`
    );
    assert(
      cardsWithDebt[0].name === 'Card with balance property',
      'Should include card with balance property'
    );
  });

  console.log('\n✅ All tests passed!\n');
};

// Run the tests
runCreditCardFilterTests();
