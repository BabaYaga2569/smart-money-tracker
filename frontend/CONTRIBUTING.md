# Contributing to Smart Money Tracker

## Code Quality Standards

This project uses ESLint and Prettier to maintain code quality and consistency.

### Before You Commit

Code is automatically checked and formatted before each commit via Husky pre-commit hooks.

### Manual Commands

#### Lint Code

```bash
npm run lint              # Check for errors
npm run lint:fix          # Auto-fix errors
```

#### Format Code

```bash
npm run format            # Format all files
npm run format:check      # Check formatting without changes
```

### VS Code Setup

1. Install extensions:
   - ESLint (dbaeumer.vscode-eslint)
   - Prettier (esbenp.prettier-vscode)

2. Settings are already configured in `.vscode/settings.json`

3. Code will auto-format on save!

### Rules Overview

#### ESLint Rules

- ✅ React hooks rules enforced
- ✅ Unused variables warned
- ✅ Console.log allowed (with warning)
- ✅ Must use `const` over `let` when possible
- ✅ No `var` allowed

#### Prettier Rules

- ✅ Single quotes for strings
- ✅ Semicolons required
- ✅ 100 character line width
- ✅ 2 space indentation
- ✅ Trailing commas in ES5

### Pre-commit Hook

On `git commit`, the following happens automatically:

1. ESLint checks and fixes JavaScript/React files
2. Prettier formats all files
3. If errors can't be auto-fixed, commit is blocked
4. Fix errors manually, then commit again

### Disable Rules (When Necessary)

```javascript
// Disable for one line
// eslint-disable-next-line no-console
console.log('Important debug info');

// Disable for entire file
/* eslint-disable no-console */
```

**Use sparingly!** Rules exist for good reasons.

### Common Issues

#### Issue: "ESLint errors blocking commit"

**Solution:** Run `npm run lint:fix` to auto-fix, then commit again

#### Issue: "Prettier formatted my code differently"

**Solution:** This is expected! Prettier ensures consistency

#### Issue: "Pre-commit hook not running"

**Solution:** Run `npm run prepare` to reinstall Husky hooks

### Getting Help

If you're stuck on a linting error, ask in the PR comments!
