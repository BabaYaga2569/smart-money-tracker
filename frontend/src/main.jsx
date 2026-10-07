import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

// Expose Sentry to window for debugging in production
if (import.meta.env.PROD) {
  window.Sentry = Sentry;
}

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './utils/authFetch'  // attaches Firebase token to all API calls
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import './styles/design-system.css'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register'


const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    console.log('[PWA] New Smart Money build available; activating it now.');
    updateSW(true);
  },
  onOfflineReady() {
    console.log('[PWA] Smart Money is ready for offline use.');
  },
});

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)