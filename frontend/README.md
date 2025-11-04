# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## 🧪 Testing

This project uses [Vitest](https://vitest.dev/) and [React Testing Library](https://testing-library.com/react) for comprehensive unit testing.

### Running Tests

```bash
# Run tests in watch mode
npm test

# Run tests with UI interface
npm run test:ui

# Run tests with coverage report
npm run test:coverage
```

### Test Structure

- Tests are located in `__tests__` directories next to the code they test
- Component tests: `src/components/__tests__/`
- Context tests: `src/contexts/__tests__/`
- Utility tests: `src/utils/__tests__/`

### Writing Tests

See [src/test/README.md](src/test/README.md) for comprehensive testing guidelines, including:
- How to write effective tests
- Testing best practices
- Common testing patterns
- Mocking strategies

### Coverage Guidelines

- Aim for 80%+ coverage on critical business logic
- Focus on testing user behavior, not implementation details
- Use accessible queries that reflect how users interact with the app

## 🐛 Error Monitoring (Sentry)

This project uses [Sentry](https://sentry.io) for error monitoring and performance tracking.

### Setup Sentry:

1. Create a free Sentry account at https://sentry.io/signup/
2. Create a new React project
3. Copy your DSN from the project settings
4. Add to `../.env.local` (root directory):
   ```
   VITE_SENTRY_DSN=https://your-dsn@sentry.io/project-id
   ```
5. (Optional) For source maps in production, add:
   ```
   SENTRY_ORG=your-org
   SENTRY_PROJECT=your-project
   SENTRY_AUTH_TOKEN=your-auth-token
   ```

### Testing Sentry:

- In development mode, look for test buttons in the bottom-right corner
- Click to send test errors/messages to Sentry
- Check your Sentry dashboard to verify

**Note:** Errors in development mode are logged but not sent to Sentry by default.

## 📱 PWA Features

Smart Money Tracker is a Progressive Web App (PWA) that can be installed on your device and works offline!

### Installation

#### Desktop (Chrome, Edge, Brave)
1. Visit the app in your browser
2. Look for the install icon in the address bar (⊕ or install button)
3. Click "Install" when prompted
4. The app will be added to your applications

#### Mobile (Android - Chrome)
1. Open the app in Chrome
2. Tap the menu (⋮) in the top-right
3. Select "Install app" or "Add to Home Screen"
4. Follow the prompts

#### Mobile (iOS - Safari)
1. Open the app in Safari
2. Tap the Share button (square with arrow)
3. Scroll down and tap "Add to Home Screen"
4. Tap "Add" to confirm

### Offline Capabilities

The app works offline with these features:
- **Static Assets Cached**: All app files are cached for instant loading
- **Smart Caching**: Google Fonts and Firebase Storage assets are cached intelligently
- **Offline Fallback**: See a helpful offline page when disconnected
- **Auto-Update**: Service worker updates automatically with new versions

### Service Worker Caching Strategy

- **Static Assets** (JS, CSS, HTML): Cached on install for offline access
- **Google Fonts**: Cache-First strategy with 1-year expiration
- **Firebase Storage**: Stale-While-Revalidate for fresh data with offline fallback
- **Firebase API**: Not cached to ensure data consistency

### Testing PWA Features

See [docs/PWA.md](docs/PWA.md) for detailed testing instructions including:
- Testing PWA installation
- Testing offline mode
- Running Lighthouse PWA audits
- Platform-specific tips
