/**
 * Safe Data Access Examples
 * This file contains practical examples of using safe access utilities
 * to prevent crashes and improve error handling in React components.
 */

import React from 'react';
import { 
  safeGet, 
  safeNumber, 
  safeCurrency, 
  safeArray, 
  safeString,
  hasValue,
  safeTry 
} from '../utils/safeAccess';

// Example 1: Basic Account Display
// Problem: account.balances.available might be undefined
function AccountBalance({ account }) {
  // ❌ UNSAFE - Can crash if account or balances is undefined
  // const balance = account.balances.available;
  
  // ✅ SAFE - Returns 0 if any part of the path is undefined
  const balance = safeGet(account, 'balances.available', 0);
  const formatted = safeCurrency(balance);
  
  return <div className="balance">{formatted}</div>;
}

// Example 2: Transaction List
// Problem: transactions might not be an array, items might have missing data
function TransactionList({ transactions }) {
  // ✅ SAFE - Returns empty array if transactions is undefined/null/not-an-array
  const txList = safeArray(transactions, []);
  
  return (
    <ul>
      {txList.map(tx => (
        <li key={tx.id}>
          {/* ✅ SAFE - Returns 'Unknown' if merchant.name is missing */}
          <span className="merchant">
            {safeGet(tx, 'merchant.name', 'Unknown')}
          </span>
          
          {/* ✅ SAFE - Returns '$0.00' if amount is invalid */}
          <span className="amount">
            {safeCurrency(tx.amount)}
          </span>
          
          {/* ✅ SAFE - Returns 'N/A' if date is missing */}
          <span className="date">
            {safeGet(tx, 'date', 'N/A')}
          </span>
        </li>
      ))}
    </ul>
  );
}

// Example 3: User Profile with Conditional Rendering
// Problem: Various user fields might be missing
function UserProfile({ user }) {
  const displayName = safeGet(user, 'profile.displayName', 'Guest User');
  const email = safeGet(user, 'email', '');
  const memberSince = safeGet(user, 'createdAt', 'Recently');
  
  // ✅ SAFE - Check if email exists before showing it
  const hasEmail = hasValue(email);
  
  return (
    <div className="user-profile">
      <h2>{displayName}</h2>
      {hasEmail && <p>Email: {email}</p>}
      <p>Member since: {memberSince}</p>
    </div>
  );
}

// Example 4: Dashboard Statistics
// Problem: Stats data might be incomplete or have invalid numbers
function DashboardStats({ stats }) {
  // ✅ SAFE - Parse numbers safely, falling back to 0
  const totalAccounts = safeNumber(stats?.totalAccounts, 0);
  const totalBalance = safeNumber(stats?.totalBalance, 0);
  const monthlySpending = safeNumber(stats?.monthlySpending, 0);
  
  return (
    <div className="dashboard-stats">
      <div className="stat">
        <label>Accounts</label>
        <span className="value">{totalAccounts}</span>
      </div>
      <div className="stat">
        <label>Total Balance</label>
        <span className="value">{safeCurrency(totalBalance)}</span>
      </div>
      <div className="stat">
        <label>Monthly Spending</label>
        <span className="value">{safeCurrency(monthlySpending)}</span>
      </div>
    </div>
  );
}

// Example 5: Bill Payment Status
// Problem: Bill data structure might be inconsistent
function BillCard({ bill }) {
  const billName = safeGet(bill, 'name', 'Unnamed Bill');
  const amount = safeCurrency(safeGet(bill, 'amount', 0));
  const dueDate = safeGet(bill, 'dueDate', 'Not set');
  const isPaid = safeGet(bill, 'status', 'unpaid') === 'paid';
  const category = safeGet(bill, 'category.name', 'Uncategorized');
  
  return (
    <div className={`bill-card ${isPaid ? 'paid' : 'unpaid'}`}>
      <h3>{billName}</h3>
      <div className="amount">{amount}</div>
      <div className="due-date">Due: {dueDate}</div>
      <div className="category">{category}</div>
      <div className="status">{isPaid ? '✓ Paid' : 'Pending'}</div>
    </div>
  );
}

// Example 6: Safe API Response Parsing
// Problem: API might return unexpected structure or fail
function AccountDataLoader({ accountId }) {
  const [account, setAccount] = React.useState(null);
  const [error, setError] = React.useState(null);
  
  React.useEffect(() => {
    const loadAccount = async () => {
      // ✅ SAFE - Wrap API call in safeTry
      const result = await safeTry(
        async () => {
          const response = await fetch(`/api/accounts/${accountId}`);
          const data = await response.json();
          return data;
        },
        null  // Return null on error
      );
      
      if (result) {
        setAccount(result);
      } else {
        setError('Failed to load account');
      }
    };
    
    loadAccount();
  }, [accountId]);
  
  if (error) return <div className="error">{error}</div>;
  if (!account) return <div>Loading...</div>;
  
  return <AccountBalance account={account} />;
}

// Example 7: Form Input Validation
// Problem: Form values might be empty or invalid
function BillForm({ onSubmit }) {
  const [formData, setFormData] = React.useState({});
  
  const handleSubmit = (e) => {
    e.preventDefault();
    
    // ✅ SAFE - Validate and parse form data safely
    const billData = {
      name: safeString(formData.name, '').trim(),
      amount: safeNumber(formData.amount, 0),
      dueDay: safeNumber(formData.dueDay, 1),
      category: safeString(formData.category, 'Other')
    };
    
    // ✅ SAFE - Check if required fields have values
    if (!hasValue(billData.name)) {
      alert('Bill name is required');
      return;
    }
    
    if (billData.amount <= 0) {
      alert('Amount must be greater than 0');
      return;
    }
    
    onSubmit(billData);
  };
  
  return (
    <form onSubmit={handleSubmit}>
      <input 
        type="text" 
        placeholder="Bill name"
        onChange={e => setFormData({...formData, name: e.target.value})}
      />
      <input 
        type="number" 
        placeholder="Amount"
        onChange={e => setFormData({...formData, amount: e.target.value})}
      />
      <button type="submit">Save Bill</button>
    </form>
  );
}

// Example 8: Complex Nested Data
// Problem: Deep nesting with multiple possible undefined values
function SpendingAnalysis({ data }) {
  // ✅ SAFE - Handle deep nesting safely
  const categories = safeArray(
    safeGet(data, 'spending.byCategory', [])
  );
  
  const topCategory = safeGet(
    categories[0],
    'name',
    'No spending data'
  );
  
  const topCategoryAmount = safeCurrency(
    safeGet(categories[0], 'total', 0)
  );
  
  const averageTransaction = safeCurrency(
    safeGet(data, 'spending.averageTransaction', 0)
  );
  
  return (
    <div className="spending-analysis">
      <h3>Spending Analysis</h3>
      <div>Top Category: {topCategory}</div>
      <div>Amount: {topCategoryAmount}</div>
      <div>Avg Transaction: {averageTransaction}</div>
      
      <ul>
        {categories.map((cat, idx) => (
          <li key={idx}>
            {safeGet(cat, 'name', 'Unknown')}: {' '}
            {safeCurrency(safeGet(cat, 'total', 0))}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Example 9: Date Formatting with Safe Try
// Problem: Date parsing might fail
function DateDisplay({ timestamp }) {
  // ✅ SAFE - Try to format date, fall back to 'Invalid Date'
  const formattedDate = safeTry(
    () => new Date(timestamp).toLocaleDateString(),
    'Invalid Date'
  );
  
  return <span className="date">{formattedDate}</span>;
}

// Example 10: Percentage Calculations
// Problem: Division by zero or invalid numbers
function ProgressBar({ current, total }) {
  // ✅ SAFE - Parse numbers and prevent division by zero
  const currentVal = safeNumber(current, 0);
  const totalVal = safeNumber(total, 1); // Use 1 to prevent division by zero
  
  // ✅ SAFE - Calculate percentage safely
  const percentage = Math.min(100, Math.max(0, (currentVal / totalVal) * 100));
  
  return (
    <div className="progress-bar">
      <div className="progress-fill" style={{ width: `${percentage}%` }}>
        {Math.round(percentage)}%
      </div>
    </div>
  );
}

// Export examples for use in other files
export {
  AccountBalance,
  TransactionList,
  UserProfile,
  DashboardStats,
  BillCard,
  AccountDataLoader,
  BillForm,
  SpendingAnalysis,
  DateDisplay,
  ProgressBar
};
