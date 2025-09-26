// MockCashFlowData.js - Demo data for testing cash flow functionality
const getCurrentMonth = () => {
  const now = new Date();
  return now.toISOString().slice(0, 7); // Format: YYYY-MM
};

const currentMonth = getCurrentMonth(); // e.g., "2024-09"

export const mockTransactions = [
  // Current Month - Dynamic based on actual current month
  { id: '1', amount: 3500, description: 'Salary - ABC Corp', category: 'Income', account: 'bofa', date: `${currentMonth}-01`, type: 'income' },
  { id: '2', amount: -1200, description: 'Rent Payment', category: 'Bills & Utilities', account: 'bofa', date: `${currentMonth}-01`, type: 'expense' },
  { id: '3', amount: -150, description: 'Grocery Shopping - Walmart', category: 'Groceries', account: 'bofa', date: `${currentMonth}-02`, type: 'expense' },
  { id: '4', amount: -45, description: 'Gas Station - Shell', category: 'Gas & Fuel', account: 'bofa', date: `${currentMonth}-03`, type: 'expense' },
  { id: '5', amount: -85, description: 'Electric Bill - NV Energy', category: 'Bills & Utilities', account: 'bofa', date: `${currentMonth}-05`, type: 'expense' },
  { id: '6', amount: -25, description: 'Coffee - Starbucks', category: 'Food & Dining', account: 'bofa', date: `${currentMonth}-06`, type: 'expense' },
  { id: '7', amount: -120, description: 'Groceries - Whole Foods', category: 'Groceries', account: 'bofa', date: `${currentMonth}-08`, type: 'expense' },
  { id: '8', amount: -60, description: 'Internet Bill - Xfinity', category: 'Bills & Utilities', account: 'bofa', date: `${currentMonth}-10`, type: 'expense' },
  { id: '9', amount: -35, description: 'Lunch - Chipotle', category: 'Food & Dining', account: 'bofa', date: `${currentMonth}-12`, type: 'expense' },
  { id: '10', amount: 400, description: 'Freelance Project', category: 'Income', account: 'bofa', date: `${currentMonth}-15`, type: 'income' },
  
  // Previous months with realistic data
  { id: '11', amount: 3500, description: 'Salary - ABC Corp', category: 'Income', account: 'bofa', date: '2024-08-01', type: 'income' },
  { id: '12', amount: -1200, description: 'Rent Payment', category: 'Bills & Utilities', account: 'bofa', date: '2024-08-01', type: 'expense' },
  { id: '13', amount: -180, description: 'Grocery Shopping - Costco', category: 'Groceries', account: 'bofa', date: '2024-08-03', type: 'expense' },
  { id: '14', amount: -50, description: 'Gas Station - Chevron', category: 'Gas & Fuel', account: 'bofa', date: '2024-08-05', type: 'expense' },
  { id: '15', amount: -90, description: 'Electric Bill - NV Energy', category: 'Bills & Utilities', account: 'bofa', date: '2024-08-07', type: 'expense' },
  { id: '16', amount: -200, description: 'Shopping - Amazon', category: 'Shopping', account: 'bofa', date: '2024-08-10', type: 'expense' },
  { id: '17', amount: -75, description: 'Dinner - Restaurant', category: 'Food & Dining', account: 'bofa', date: '2024-08-12', type: 'expense' },
  { id: '18', amount: -60, description: 'Internet Bill - Xfinity', category: 'Bills & Utilities', account: 'bofa', date: '2024-08-15', type: 'expense' },
  { id: '19', amount: 300, description: 'Freelance Project', category: 'Income', account: 'bofa', date: '2024-08-20', type: 'expense' },
  { id: '20', amount: -100, description: 'Clothes Shopping', category: 'Clothing', account: 'bofa', date: '2024-08-25', type: 'expense' },
  
  { id: '21', amount: 3500, description: 'Salary - ABC Corp', category: 'Income', account: 'bofa', date: '2024-07-01', type: 'income' },
  { id: '22', amount: -1200, description: 'Rent Payment', category: 'Bills & Utilities', account: 'bofa', date: '2024-07-01', type: 'expense' },
  { id: '23', amount: -160, description: 'Grocery Shopping - Safeway', category: 'Groceries', account: 'bofa', date: '2024-07-02', type: 'expense' },
  { id: '24', amount: -55, description: 'Gas Station - BP', category: 'Gas & Fuel', account: 'bofa', date: '2024-07-04', type: 'expense' },
  { id: '25', amount: -95, description: 'Electric Bill - NV Energy', category: 'Bills & Utilities', account: 'bofa', date: '2024-07-06', type: 'expense' },
  { id: '26', amount: -150, description: 'Entertainment - Movie Theater', category: 'Entertainment', account: 'bofa', date: '2024-07-08', type: 'expense' },
  { id: '27', amount: -60, description: 'Internet Bill - Xfinity', category: 'Bills & Utilities', account: 'bofa', date: '2024-07-10', type: 'expense' },
  { id: '28', amount: 500, description: 'Bonus Payment', category: 'Income', account: 'bofa', date: '2024-07-15', type: 'income' },
  { id: '29', amount: -80, description: 'Car Maintenance', category: 'Transportation', account: 'bofa', date: '2024-07-18', type: 'expense' },
  { id: '30', amount: -120, description: 'Healthcare - Doctor Visit', category: 'Healthcare', account: 'bofa', date: '2024-07-22', type: 'expense' },
  
  { id: '31', amount: 3500, description: 'Salary - ABC Corp', category: 'Income', account: 'bofa', date: '2024-06-01', type: 'income' },
  { id: '32', amount: -1200, description: 'Rent Payment', category: 'Bills & Utilities', account: 'bofa', date: '2024-06-01', type: 'expense' },
  { id: '33', amount: -140, description: 'Grocery Shopping - Trader Joes', category: 'Groceries', account: 'bofa', date: '2024-06-03', type: 'expense' },
  { id: '34', amount: -45, description: 'Gas Station - Shell', category: 'Gas & Fuel', account: 'bofa', date: '2024-06-05', type: 'expense' },
  { id: '35', amount: -100, description: 'Electric Bill - NV Energy', category: 'Bills & Utilities', account: 'bofa', date: '2024-06-07', type: 'expense' },
  { id: '36', amount: -250, description: 'Vacation Expenses', category: 'Entertainment', account: 'bofa', date: '2024-06-15', type: 'expense' },
  { id: '37', amount: -60, description: 'Internet Bill - Xfinity', category: 'Bills & Utilities', account: 'bofa', date: '2024-06-10', type: 'expense' },
  { id: '38', amount: 200, description: 'Investment Dividend', category: 'Income', account: 'bofa', date: '2024-06-20', type: 'income' },
  { id: '39', amount: -90, description: 'Subscription - Netflix, Spotify', category: 'Subscriptions', account: 'bofa', date: '2024-06-25', type: 'expense' },
  
  { id: '40', amount: 3500, description: 'Salary - ABC Corp', category: 'Income', account: 'bofa', date: '2024-05-01', type: 'income' },
  { id: '41', amount: -1200, description: 'Rent Payment', category: 'Bills & Utilities', account: 'bofa', date: '2024-05-01', type: 'expense' },
  { id: '42', amount: -170, description: 'Grocery Shopping - Whole Foods', category: 'Groceries', account: 'bofa', date: '2024-05-03', type: 'expense' },
  { id: '43', amount: -50, description: 'Gas Station - Chevron', category: 'Gas & Fuel', account: 'bofa', date: '2024-05-05', type: 'expense' },
  { id: '44', amount: -85, description: 'Electric Bill - NV Energy', category: 'Bills & Utilities', account: 'bofa', date: '2024-05-07', type: 'expense' },
  { id: '45', amount: -300, description: 'Shopping - Target', category: 'Shopping', account: 'bofa', date: '2024-05-10', type: 'expense' },
  { id: '46', amount: -60, description: 'Internet Bill - Xfinity', category: 'Bills & Utilities', account: 'bofa', date: '2024-05-12', type: 'expense' },
  { id: '47', amount: 600, description: 'Freelance Bonus', category: 'Income', account: 'bofa', date: '2024-05-15', type: 'income' },
  { id: '48', amount: -120, description: 'Car Insurance', category: 'Bills & Utilities', account: 'bofa', date: '2024-05-20', type: 'expense' },
  
  { id: '49', amount: 3500, description: 'Salary - ABC Corp', category: 'Income', account: 'bofa', date: '2024-04-01', type: 'income' },
  { id: '50', amount: -1200, description: 'Rent Payment', category: 'Bills & Utilities', account: 'bofa', date: '2024-04-01', type: 'expense' },
  { id: '51', amount: -155, description: 'Grocery Shopping - Kroger', category: 'Groceries', account: 'bofa', date: '2024-04-03', type: 'expense' },
  { id: '52', amount: -40, description: 'Gas Station - Shell', category: 'Gas & Fuel', account: 'bofa', date: '2024-04-05', type: 'expense' },
  { id: '53', amount: -75, description: 'Electric Bill - NV Energy', category: 'Bills & Utilities', account: 'bofa', date: '2024-04-07', type: 'expense' },
  { id: '54', amount: -200, description: 'Home Repairs', category: 'Household Items', account: 'bofa', date: '2024-04-10', type: 'expense' },
  { id: '55', amount: -60, description: 'Internet Bill - Xfinity', category: 'Bills & Utilities', account: 'bofa', date: '2024-04-12', type: 'expense' },
  { id: '56', amount: 350, description: 'Side Job Payment', category: 'Income', account: 'bofa', date: '2024-04-15', type: 'income' },
  { id: '57', amount: -110, description: 'Pharmacy - CVS', category: 'Pharmacy', account: 'bofa', date: '2024-04-18', type: 'expense' }
];

export const mockAccounts = {
  bofa: { name: "Bank of America", type: "checking", balance: "1361.97" },
  capone: { name: "Capital One", type: "checking", balance: "24.74" },
  usaa: { name: "USAA", type: "checking", balance: "143.36" }
};