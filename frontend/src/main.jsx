import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from './config/queryClient';
import { initSentry } from './config/sentry';
import * as Sentry from '@sentry/react';
import './index.css';
import App from './App.jsx';

// Initialize Sentry first
initSentry();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={({ error, resetError }) => (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <h1>Something went wrong</h1>
          <p>The error has been reported to our team.</p>
          <button onClick={resetError}>Try again</button>
          {import.meta.env.DEV && (
            <pre
              style={{
                textAlign: 'left',
                background: '#f5f5f5',
                padding: '1rem',
                marginTop: '1rem',
              }}
            >
              {error.toString()}
            </pre>
          )}
        </div>
      )}
      showDialog={false}
    >
      <QueryClientProvider client={queryClient}>
        <App />
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>,
);
