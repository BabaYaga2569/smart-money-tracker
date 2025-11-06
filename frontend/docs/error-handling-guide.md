# Error Handling Guide

## ErrorBoundary Component

The ErrorBoundary component catches React errors and prevents the entire app from crashing with a white screen.

### Features

- ✅ Catches React component errors
- ✅ Shows user-friendly error message
- ✅ Provides "Try Again" and "Go to Dashboard" recovery buttons
- ✅ Tracks error count and auto-reloads after 3+ consecutive errors
- ✅ Shows error details in development mode only
- ✅ Supports custom fallback UI
- ✅ Integrates with Sentry error tracking

### Usage

The ErrorBoundary is already wrapping the entire app in `App.jsx`:

```jsx
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <Router>
        {/* App content */}
      </Router>
    </ErrorBoundary>
  );
}
```

### Custom Fallback UI

You can provide a custom fallback UI:

```jsx
<ErrorBoundary fallback={<div>Custom error message</div>}>
  <YourComponent />
</ErrorBoundary>
```

### Testing the Error Boundary

To test the error boundary in development:

```jsx
// Add this temporarily to any component
throw new Error('Test error boundary');
```

You should see:
- Warning icon (⚠️)
- "Oops! Something went wrong" message
- "Try Again" button
- "Go to Dashboard" button
- Error details (in dev mode only)

---

## Safe Data Access Utilities

The `safeAccess.js` utilities prevent crashes from null/undefined data access.

### Import

```javascript
import { 
  safeGet, 
  safeNumber, 
  safeCurrency, 
  safeArray, 
  safeString,
  hasValue,
  safeTry 
} from './utils/safeAccess';
```

### Functions

#### `safeGet(obj, path, defaultValue)`

Safely access nested object properties:

```javascript
// Before (crashes if undefined)
const city = user.address.city;

// After (returns default if undefined)
const city = safeGet(user, 'address.city', 'Unknown');

// Examples
safeGet(data, 'user.name', 'Guest');           // Returns 'Guest' if undefined
safeGet(account, 'balance.available', 0);       // Returns 0 if undefined
safeGet(transaction, 'merchant.name', 'N/A');   // Returns 'N/A' if undefined
```

#### `safeNumber(value, fallback)`

Safely parse numbers:

```javascript
// Before (returns NaN for invalid values)
const amount = Number(data.amount);

// After (returns fallback for invalid values)
const amount = safeNumber(data.amount, 0);

// Examples
safeNumber('123', 0);      // Returns 123
safeNumber('abc', 0);      // Returns 0
safeNumber(null, 10);      // Returns 10
safeNumber(undefined, 0);  // Returns 0
```

#### `safeCurrency(value, fallback)`

Safely format currency:

```javascript
// Before (breaks if null/undefined)
const formatted = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD'
}).format(balance);

// After (returns fallback if invalid)
const formatted = safeCurrency(balance, '$0.00');

// Examples
safeCurrency(100.50);        // Returns '$100.50'
safeCurrency(null);          // Returns '$0.00'
safeCurrency(undefined);     // Returns '$0.00'
safeCurrency(0);             // Returns '$0.00'
```

#### `safeArray(value, fallback)`

Safely access arrays:

```javascript
// Before (breaks if not an array)
const items = data.items.map(item => item.name);

// After (returns empty array if not an array)
const items = safeArray(data.items, []).map(item => item.name);

// Examples
safeArray([1, 2, 3]);        // Returns [1, 2, 3]
safeArray(null, []);         // Returns []
safeArray(undefined, []);    // Returns []
safeArray('not array', []);  // Returns []
```

#### `safeString(value, fallback)`

Safely access strings:

```javascript
// Before (breaks if not a string)
const name = data.name.toUpperCase();

// After (returns fallback if not a string)
const name = safeString(data.name, '').toUpperCase();

// Examples
safeString('hello', '');     // Returns 'hello'
safeString(null, '');        // Returns ''
safeString(undefined, '');   // Returns ''
safeString(123, 'N/A');      // Returns 'N/A'
```

#### `hasValue(value)`

Check if a value exists and is not empty:

```javascript
// Check various types
hasValue('hello');           // true
hasValue('');                // false
hasValue('   ');             // false
hasValue([1, 2, 3]);         // true
hasValue([]);                // false
hasValue({ a: 1 });          // true
hasValue({});                // false
hasValue(null);              // false
hasValue(undefined);         // false
hasValue(0);                 // true
hasValue(false);             // true

// Usage in components
if (hasValue(user.email)) {
  // Safe to use user.email
}
```

#### `safeTry(fn, fallback)`

Safely execute functions with fallback:

```javascript
// Before (crashes on error)
const result = JSON.parse(data);

// After (returns fallback on error)
const result = safeTry(() => JSON.parse(data), {});

// Examples
safeTry(() => JSON.parse(jsonString), {});
safeTry(() => complexCalculation(data), 0);
safeTry(() => formatDate(timestamp), 'Invalid Date');
```

### Real-world Examples

#### Component with Safe Data Access

```jsx
import { safeGet, safeCurrency, safeArray } from '../utils/safeAccess';

function AccountCard({ account }) {
  // Safe access to nested properties
  const accountName = safeGet(account, 'name', 'Unknown Account');
  const balance = safeCurrency(safeGet(account, 'balances.available', 0));
  const transactions = safeArray(account.transactions, []);
  
  return (
    <div className="account-card">
      <h3>{accountName}</h3>
      <p className="balance">{balance}</p>
      <ul>
        {transactions.map(tx => (
          <li key={tx.id}>{tx.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

#### Dashboard with Error Protection

```jsx
import { safeGet, safeCurrency, hasValue } from '../utils/safeAccess';

function Dashboard({ userData }) {
  const userName = safeGet(userData, 'user.displayName', 'Guest');
  const totalBalance = safeCurrency(
    safeGet(userData, 'accounts.total', 0)
  );
  
  // Check if user has accounts before rendering
  if (!hasValue(userData?.accounts)) {
    return <div>No accounts connected</div>;
  }
  
  return (
    <div>
      <h1>Welcome, {userName}!</h1>
      <div className="balance">Total: {totalBalance}</div>
    </div>
  );
}
```

### Benefits

- 🛡️ **Prevents crashes**: No more white screens from undefined access
- 🎯 **Predictable**: Always returns expected data types
- 🔧 **Easy to use**: Simple API that fits naturally in your code
- 📊 **Better UX**: Users see fallback values instead of errors
- 🐛 **Easier debugging**: Console warnings help track issues

### Testing

All utilities have comprehensive tests. Run them with:

```bash
node src/utils/safeAccess.test.js
```

Expected output: `Test Results: 20/20 passed`

---

## Best Practices

### 1. Use ErrorBoundary for Component Errors

Wrap components that might throw errors:

```jsx
<ErrorBoundary>
  <ComplexComponent data={data} />
</ErrorBoundary>
```

### 2. Use Safe Access for Data

Always use safe access utilities when:
- Accessing API response data
- Working with user-provided data
- Accessing nested object properties
- Formatting values for display

### 3. Combine Both for Maximum Safety

```jsx
import { safeGet, safeCurrency } from '../utils/safeAccess';

function TransactionList({ transactions }) {
  return (
    <ErrorBoundary>
      <div>
        {safeArray(transactions).map(tx => (
          <div key={tx.id}>
            <span>{safeGet(tx, 'merchant.name', 'Unknown')}</span>
            <span>{safeCurrency(tx.amount)}</span>
          </div>
        ))}
      </div>
    </ErrorBoundary>
  );
}
```

### 4. Don't Overuse

Not everything needs safe access:
- Internal function parameters that are always valid
- Loop variables
- Constants
- Values you just created

Use safe access primarily at data boundaries:
- API responses
- User inputs
- External data sources
- Props that might be undefined

---

## Troubleshooting

### ErrorBoundary Not Catching Errors

ErrorBoundary only catches errors in:
- Render methods
- Lifecycle methods
- Constructors

It does NOT catch:
- Event handlers (use try-catch)
- Async code (use try-catch)
- Server-side rendering errors
- Errors in the ErrorBoundary itself

### Error Boundary Shows Up in Production

This means a real error occurred. Check:
1. Browser console for error details
2. Sentry dashboard for error reports
3. Network tab for failed API calls

### Safe Access Returns Wrong Fallback

Double-check:
1. The path string is correct
2. The fallback value is appropriate
3. The data structure matches your expectations

---

## Related

- See `ErrorBoundary.jsx` for implementation
- See `safeAccess.js` for utility implementations
- See `safeAccess.test.js` for comprehensive tests
- Part of Issue #232 - Phase 1: Critical & Stability
