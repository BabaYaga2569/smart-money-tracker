import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Upload source maps to Sentry in production builds
    process.env.NODE_ENV === 'production' &&
      sentryVitePlugin({
        org: process.env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN,
        // Disable if no auth token provided
        disable: !process.env.SENTRY_AUTH_TOKEN,
      }),
  ].filter(Boolean),
  envDir: '../',
  build: {
    // Generate source maps for Sentry
    sourcemap: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].[hash].v2.js',
        chunkFileNames: 'assets/[name].[hash].v2.js',
        assetFileNames: 'assets/[name].[hash].v2.[ext]',
        manualChunks: {
          // Vendor chunks
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'firebase-vendor': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          
          // Feature chunks
          'bills': ['./src/pages/Bills.jsx', './src/utils/RecurringBillManager.js'],
          'spendability': ['./src/pages/Spendability.jsx'],
          'transactions': ['./src/pages/Transactions.jsx'],
          'dashboard': ['./src/pages/Dashboard.jsx'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
});
