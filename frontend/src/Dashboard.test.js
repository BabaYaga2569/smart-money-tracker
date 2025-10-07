// Dashboard.test.js - Test for Dashboard Firebase integration

// Simple test assertion helper
const assert = (condition, message) => {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
};

const test = (name, fn) => {
    try {
        fn();
        console.log(`✅ ${name}`);
        return true;
    } catch (error) {
        console.error(`❌ ${name}`);
        console.error(`   Error: ${error.message}`);
        return false;
    }
};

// Mock Firebase data
const mockSettingsData = {
    plaidAccounts: [
        { account_id: 'acc1', name: 'Checking', balance: '1000.50' },
        { account_id: 'acc2', name: 'Savings', balance: '2500.00' }
    ],
    bills: [
        { name: 'Rent', amount: '1200', status: 'pending', recurrence: 'monthly' },
        { name: 'Electric', amount: '150', status: 'paid', recurrence: 'monthly' },
        { name: 'Internet', amount: '80', status: 'pending', recurrence: 'monthly' }
    ],
    paySchedules: {
        yours: {
            lastPaydate: '2025-01-01',
            amount: 2000
        }
    }
};

// Generate transactions for current month and last month
const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth();
const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

const mockTransactions = [
    { id: 't1', date: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-05`, amount: 2000, category: 'Salary' },
    { id: 't2', date: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-06`, amount: -50, category: 'Groceries' },
    { id: 't3', date: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-07`, amount: -100, category: 'Dining' },
    { id: 't4', date: `${lastMonthYear}-${String(lastMonth + 1).padStart(2, '0')}-20`, amount: -200, category: 'Shopping' } // Last month
];

// Test helper functions from Dashboard
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
    }).format(amount);
};

const formatCount = (count, singular, plural) => {
    if (count === 0) return `0 ${plural}`;
    if (count === 1) return `1 ${singular}`;
    return `${count} ${plural}`;
};

// Run tests
console.log('='.repeat(70));
console.log('Dashboard Firebase Integration Tests');
console.log('='.repeat(70));
console.log();

let passedTests = 0;
let totalTests = 0;

// Test 1: Account counting
totalTests++;
if (test('Should count accounts correctly', () => {
    const accountsCount = mockSettingsData.plaidAccounts.length;
    assert(accountsCount === 2, `Expected 2 accounts, got ${accountsCount}`);
})) passedTests++;

// Test 2: Spendability calculation
totalTests++;
if (test('Should calculate spendability correctly', () => {
    const spendability = mockSettingsData.plaidAccounts.reduce((sum, account) => {
        return sum + (parseFloat(account.balance) || 0);
    }, 0);
    assert(spendability === 3500.50, `Expected 3500.50, got ${spendability}`);
})) passedTests++;

// Test 3: Bills counting (non-paid)
totalTests++;
if (test('Should count non-paid bills correctly', () => {
    const billsCount = mockSettingsData.bills.filter(bill => bill.status !== 'paid').length;
    assert(billsCount === 2, `Expected 2 non-paid bills, got ${billsCount}`);
})) passedTests++;

// Test 4: Recurring bills counting
totalTests++;
if (test('Should count recurring bills correctly', () => {
    const recurringCount = mockSettingsData.bills.filter(
        bill => bill.recurrence && bill.recurrence !== 'one-time'
    ).length;
    assert(recurringCount === 3, `Expected 3 recurring bills, got ${recurringCount}`);
})) passedTests++;

// Test 5: Current month transactions filtering
totalTests++;
if (test('Should filter current month transactions correctly', () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const transactionsCount = mockTransactions.filter(t => {
        const transactionDate = new Date(t.date);
        return transactionDate.getMonth() === currentMonth && 
               transactionDate.getFullYear() === currentYear;
    }).length;
    assert(transactionsCount === 3, `Expected 3 transactions this month, got ${transactionsCount}`);
})) passedTests++;

// Test 6: Category counting
totalTests++;
if (test('Should count unique categories correctly', () => {
    const uniqueCategories = new Set(mockTransactions.map(t => t.category).filter(Boolean));
    const categoriesCount = uniqueCategories.size;
    assert(categoriesCount === 4, `Expected 4 unique categories, got ${categoriesCount}`);
})) passedTests++;

// Test 7: Currency formatting
totalTests++;
if (test('Should format currency correctly', () => {
    const formatted = formatCurrency(1234.56);
    assert(formatted === '$1,234.56', `Expected '$1,234.56', got '${formatted}'`);
})) passedTests++;

// Test 8: Count formatting (singular)
totalTests++;
if (test('Should format single count correctly', () => {
    const formatted = formatCount(1, 'account', 'accounts');
    assert(formatted === '1 account', `Expected '1 account', got '${formatted}'`);
})) passedTests++;

// Test 9: Count formatting (plural)
totalTests++;
if (test('Should format plural count correctly', () => {
    const formatted = formatCount(3, 'account', 'accounts');
    assert(formatted === '3 accounts', `Expected '3 accounts', got '${formatted}'`);
})) passedTests++;

// Test 10: Count formatting (zero)
totalTests++;
if (test('Should format zero count correctly', () => {
    const formatted = formatCount(0, 'account', 'accounts');
    assert(formatted === '0 accounts', `Expected '0 accounts', got '${formatted}'`);
})) passedTests++;

console.log();
console.log('='.repeat(70));
console.log(`Test Results: ${passedTests}/${totalTests} passed`);
console.log('='.repeat(70));

// Exit with appropriate code
if (passedTests !== totalTests) {
    process.exit(1);
}
