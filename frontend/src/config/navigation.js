export const APP_NAV_ITEMS = [
  { name: 'Dashboard', path: '/', group: 'Overview' },

  { name: 'Accounts', path: '/accounts', group: 'Money' },
  { name: 'Transactions', path: '/transactions', group: 'Money' },
  { name: 'Spendability', path: '/spendability', group: 'Money' },

  { name: 'Bills', path: '/bills', group: 'Bills' },
  { name: 'Recurring', path: '/recurring', group: 'Bills' },
  { name: 'Payment History', path: '/payment-history', group: 'Bills' },

  { name: 'Credit Cards', path: '/creditcards', group: 'Planning' },
  { name: 'Debt Optimizer', path: '/debt-optimizer', group: 'Planning' },
  { name: 'Subscriptions', path: '/subscriptions', group: 'Planning', badgeKey: 'subscriptions' },
  { name: 'Goals', path: '/goals', group: 'Planning' },
  { name: 'Cash Flow', path: '/cashflow', group: 'Planning' },
  { name: 'Pay Cycle', path: '/paycycle', group: 'Planning' },
  { name: 'Categories', path: '/categories', group: 'Planning' },

  { name: 'Reports', path: '/reports', group: 'Insights' },

  { name: 'Settings', path: '/settings', group: 'Tools' },
  { name: 'Bill Doctor', path: '/bill-doctor', group: 'Tools' },
  { name: 'Payment Rules', path: '/payment-rules', group: 'Tools' }
];

export const APP_NAV_GROUPS = ['Overview', 'Money', 'Bills', 'Planning', 'Insights', 'Tools'];
