// Mock data for Storybook stories

export const mockUser = {
  uid: 'mock-user-123',
  email: 'user@example.com',
  displayName: 'John Doe',
};

export const mockAccounts = [
  {
    id: 'acc-1',
    name: 'Chase Checking',
    type: 'depository',
    subtype: 'checking',
    balance: 2500.0,
    available: 2500.0,
    institution: 'Chase Bank',
  },
  {
    id: 'acc-2',
    name: 'Chase Savings',
    type: 'depository',
    subtype: 'savings',
    balance: 10000.0,
    available: 10000.0,
    institution: 'Chase Bank',
  },
  {
    id: 'acc-3',
    name: 'Chase Freedom',
    type: 'credit',
    subtype: 'credit card',
    balance: -1250.0,
    limit: 5000.0,
    institution: 'Chase Bank',
  },
];

export const mockTransactions = [
  {
    id: 'txn-1',
    name: 'Amazon Purchase',
    amount: -45.99,
    date: '2024-01-15',
    category: 'Shopping',
    accountId: 'acc-1',
    pending: false,
  },
  {
    id: 'txn-2',
    name: 'Monthly Salary',
    amount: 5000.0,
    date: '2024-01-01',
    category: 'Income',
    accountId: 'acc-1',
    pending: false,
  },
  {
    id: 'txn-3',
    name: 'Starbucks',
    amount: -5.75,
    date: '2024-01-14',
    category: 'Food & Dining',
    accountId: 'acc-1',
    pending: false,
  },
  {
    id: 'txn-4',
    name: 'Netflix Subscription',
    amount: -15.99,
    date: '2024-01-10',
    category: 'Entertainment',
    accountId: 'acc-3',
    pending: false,
  },
];

export const mockBills = [
  {
    id: 'bill-1',
    name: 'Electric Bill',
    amount: 120.0,
    dueDate: '2024-01-25',
    status: 'pending',
    category: 'Utilities',
    recurring: true,
  },
  {
    id: 'bill-2',
    name: 'Internet',
    amount: 79.99,
    dueDate: '2024-01-20',
    status: 'pending',
    category: 'Utilities',
    recurring: true,
  },
  {
    id: 'bill-3',
    name: 'Rent',
    amount: 1800.0,
    dueDate: '2024-02-01',
    status: 'pending',
    category: 'Housing',
    recurring: true,
  },
];

export const mockSubscriptions = [
  {
    id: 'sub-1',
    name: 'Netflix',
    amount: 15.99,
    frequency: 'monthly',
    nextBillingDate: '2024-02-10',
    category: 'Entertainment',
  },
  {
    id: 'sub-2',
    name: 'Spotify',
    amount: 9.99,
    frequency: 'monthly',
    nextBillingDate: '2024-02-05',
    category: 'Entertainment',
  },
  {
    id: 'sub-3',
    name: 'Amazon Prime',
    amount: 14.99,
    frequency: 'monthly',
    nextBillingDate: '2024-02-15',
    category: 'Shopping',
  },
];

export const mockGoals = [
  {
    id: 'goal-1',
    name: 'Emergency Fund',
    targetAmount: 10000.0,
    currentAmount: 5000.0,
    deadline: '2024-12-31',
    category: 'Savings',
  },
  {
    id: 'goal-2',
    name: 'Vacation to Europe',
    targetAmount: 5000.0,
    currentAmount: 1500.0,
    deadline: '2024-08-01',
    category: 'Travel',
  },
];

export const mockDashboardData = {
  totalBalance: 12500.0,
  totalProjectedBalance: 12000.0,
  accountCount: 3,
  safeToSpend: 1200.0,
  billsDueSoon: 3,
  recurringCount: 5,
  subscriptionsCount: 3,
  subscriptionsBurn: 40.97,
  daysUntilPayday: 15,
  monthlyIncome: 5000.0,
  monthlyExpenses: 3200.0,
  transactionCount: 45,
};

export const mockCreditCards = [
  {
    id: 'cc-1',
    name: 'Chase Freedom',
    balance: 1250.0,
    limit: 5000.0,
    utilization: 25.0,
    dueDate: '2024-02-01',
    minimumPayment: 35.0,
  },
  {
    id: 'cc-2',
    name: 'Discover It',
    balance: 750.0,
    limit: 3000.0,
    utilization: 25.0,
    dueDate: '2024-02-05',
    minimumPayment: 25.0,
  },
];
