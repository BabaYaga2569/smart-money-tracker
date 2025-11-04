import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  envDir: '../',
  build: {
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
