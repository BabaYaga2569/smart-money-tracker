# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

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
