import * as Sentry from '@sentry/react';

export const initSentry = () => {
  // Only initialize if DSN is provided
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    console.warn('[Sentry] No DSN provided, error monitoring disabled');
    return;
  }

  Sentry.init({
    dsn,

    // Set environment (production, development, staging)
    environment: import.meta.env.MODE,

    // Release tracking (use version from package.json)
    release: `smart-money-tracker@${import.meta.env.VITE_APP_VERSION || '2.0.1'}`,

    // Performance Monitoring
    integrations: [
      // React Router integration
      Sentry.browserTracingIntegration({
        // Set sample rate for performance monitoring
        tracePropagationTargets: [
          'localhost',
          /^https:\/\/smart-money-tracker.*\.netlify\.app/,
        ],
      }),
      // React integration
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],

    // Performance Monitoring sample rate
    // 1.0 = 100% of transactions, 0.1 = 10%
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,

    // Session Replay sample rate
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Ignore common errors
    ignoreErrors: [
      // Browser extensions
      'top.GLOBALS',
      'chrome-extension://',
      'moz-extension://',
      // Network errors
      'NetworkError',
      'Failed to fetch',
      // Cancelled requests
      'AbortError',
      'Request aborted',
    ],

    // Add user context
    beforeSend(event, hint) {
      // Don't send errors in development (optional)
      if (import.meta.env.DEV) {
        console.log('[Sentry] Would send error:', event);
        return null; // Don't send in dev
      }
      return event;
    },
  });

  console.log('[Sentry] Initialized successfully');
};

// Helper to set user context
export const setSentryUser = (user) => {
  if (!user) {
    Sentry.setUser(null);
    return;
  }

  Sentry.setUser({
    id: user.uid,
    email: user.email,
  });
};

// Helper to capture custom errors
export const captureError = (error, context = {}) => {
  Sentry.captureException(error, {
    extra: context,
  });
};

// Helper to capture custom messages
export const captureMessage = (message, level = 'info') => {
  Sentry.captureMessage(message, level);
};
