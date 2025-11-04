# Testing Guide

This guide provides comprehensive instructions for testing the Smart Money Tracker frontend application using Vitest and React Testing Library.

## Table of Contents

- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [Testing Best Practices](#testing-best-practices)
- [Code Coverage](#code-coverage)
- [Mocking](#mocking)

## Running Tests

### Run All Tests

```bash
npm test
```

This runs Vitest in watch mode, which will automatically re-run tests when files change.

### Run Tests with UI

```bash
npm run test:ui
```

This opens a browser-based UI for viewing and running tests interactively.

### Run Tests Once (CI Mode)

```bash
npm test -- --run
```

### Run Tests with Coverage

```bash
npm run test:coverage
```

This generates a code coverage report showing which parts of your code are tested.

### Run Specific Tests

```bash
# Run tests for a specific file
npm test -- Button.test.jsx

# Run tests matching a pattern
npm test -- formatters
```

## Writing Tests

### Test Structure

Tests are organized using the following structure:

```javascript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ComponentName from '../ComponentName';

describe('ComponentName', () => {
  it('should do something specific', () => {
    // Arrange: Set up test data and conditions
    render(<ComponentName prop="value" />);

    // Act: Perform actions (if needed)
    // e.g., fireEvent.click(screen.getByText('Button'));

    // Assert: Check the results
    expect(screen.getByText('Expected Text')).toBeInTheDocument();
  });
});
```

### File Naming Convention

- Test files should be placed in a `__tests__` directory next to the file being tested
- Test files should be named `*.test.js` or `*.test.jsx`
- Example: `src/components/__tests__/Button.test.jsx`

### Testing Components

```javascript
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MyComponent from '../MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('handles user interactions', async () => {
    const user = userEvent.setup();
    render(<MyComponent />);
    
    const button = screen.getByRole('button', { name: /submit/i });
    await user.click(button);
    
    expect(screen.getByText('Submitted')).toBeInTheDocument();
  });
});
```

### Testing Utilities

```javascript
import { describe, it, expect } from 'vitest';
import { formatCurrency } from '../formatters';

describe('formatCurrency', () => {
  it('formats positive amounts correctly', () => {
    expect(formatCurrency(1234.56)).toBe('$1,234.56');
  });
});
```

## Testing Best Practices

### 1. Test User Behavior, Not Implementation

**❌ Bad: Testing implementation details**

```javascript
expect(component.state.isOpen).toBe(true);
```

**✅ Good: Testing user-visible behavior**

```javascript
expect(screen.getByText('Modal Content')).toBeInTheDocument();
```

### 2. Use Accessible Queries

Prefer queries that reflect how users interact with your app:

```javascript
// Best: Accessible to everyone
screen.getByRole('button', { name: /submit/i })
screen.getByLabelText('Email')

// Good: Users see this text
screen.getByText('Welcome')

// Avoid: Implementation details
screen.getByTestId('submit-button')
```

### 3. Write Independent Tests

Each test should be able to run independently and in any order:

```javascript
describe('Counter', () => {
  it('starts at zero', () => {
    render(<Counter />);
    expect(screen.getByText('Count: 0')).toBeInTheDocument();
  });

  it('increments when button is clicked', () => {
    render(<Counter />);
    fireEvent.click(screen.getByText('Increment'));
    expect(screen.getByText('Count: 1')).toBeInTheDocument();
  });
});
```

### 4. Use Descriptive Test Names

```javascript
// ❌ Bad
it('works', () => { ... });

// ✅ Good
it('displays error message when form submission fails', () => { ... });
```

### 5. Keep Tests Simple and Focused

Each test should verify one specific behavior:

```javascript
// ❌ Bad: Testing multiple things
it('handles everything', () => {
  // Tests rendering, clicking, form submission, validation...
});

// ✅ Good: One test per behavior
it('displays validation error for empty email', () => { ... });
it('submits form with valid data', () => { ... });
it('disables submit button while loading', () => { ... });
```

## Code Coverage

### Understanding Coverage Metrics

- **Statements**: Has each statement been executed?
- **Branches**: Has each branch (if/else) been executed?
- **Functions**: Has each function been called?
- **Lines**: Has each line been executed?

### Coverage Guidelines

- Aim for **80%+** coverage on critical business logic
- Don't aim for 100% coverage everywhere - focus on meaningful tests
- Coverage is a tool, not a goal

### Viewing Coverage Reports

After running `npm run test:coverage`, open `coverage/index.html` in your browser to see a detailed report.

## Mocking

### Mocking Modules

```javascript
import { vi } from 'vitest';

// Mock an entire module
vi.mock('../api/client', () => ({
  fetchData: vi.fn(() => Promise.resolve({ data: 'mock data' })),
}));
```

### Mocking Firebase

```javascript
vi.mock('../../firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}));
```

### Mocking Functions

```javascript
import { vi } from 'vitest';

const mockFn = vi.fn();
mockFn.mockReturnValue('mocked value');
mockFn.mockResolvedValue('async mocked value');

// Check if function was called
expect(mockFn).toHaveBeenCalled();
expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
expect(mockFn).toHaveBeenCalledTimes(2);
```

## Common Testing Patterns

### Testing Async Components

```javascript
import { waitFor } from '@testing-library/react';

it('loads data asynchronously', async () => {
  render(<AsyncComponent />);
  
  // Wait for async operation to complete
  await waitFor(() => {
    expect(screen.getByText('Loaded Data')).toBeInTheDocument();
  });
});
```

### Testing Components with Router

```javascript
import { BrowserRouter } from 'react-router-dom';

const RouterWrapper = ({ children }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

it('renders with router', () => {
  render(
    <RouterWrapper>
      <ComponentWithLinks />
    </RouterWrapper>
  );
});
```

### Testing Forms

```javascript
import userEvent from '@testing-library/user-event';

it('submits form with valid data', async () => {
  const user = userEvent.setup();
  const handleSubmit = vi.fn();
  
  render(<Form onSubmit={handleSubmit} />);
  
  await user.type(screen.getByLabelText('Email'), 'test@example.com');
  await user.type(screen.getByLabelText('Password'), 'password123');
  await user.click(screen.getByRole('button', { name: /submit/i }));
  
  expect(handleSubmit).toHaveBeenCalledWith({
    email: 'test@example.com',
    password: 'password123',
  });
});
```

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library Documentation](https://testing-library.com/react)
- [Testing Library Queries](https://testing-library.com/docs/queries/about)
- [Common Mistakes with React Testing Library](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

## Getting Help

If you encounter issues or have questions about testing:

1. Check the [Vitest Documentation](https://vitest.dev/)
2. Review existing tests in the codebase for examples
3. Ask for help in team discussions or code reviews
