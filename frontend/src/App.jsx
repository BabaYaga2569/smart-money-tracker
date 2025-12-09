import React, { useState, useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import LoadingSpinner from './components/LoadingSpinner';
import DebugButton from './components/DebugButton';
import SentryTestButton from './components/SentryTestButton';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import { useWindowSize } from './hooks/useWindowSize';
import './App.css';

// Lazy load all page components
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Accounts = lazy(() => import('./pages/Accounts'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Spendability = lazy(() => import('./pages/Spendability'));
const Bills = lazy(() => import('./pages/Bills'));
const Recurring = lazy(() => import('./pages/Recurring'));
const Subscriptions = lazy(() => import('./pages/Subscriptions'));
const Goals = lazy(() => import('./pages/Goals'));
const Categories = lazy(() => import('./pages/Categories'));
const Cashflow = lazy(() => import('./pages/Cashflow'));
const Paycycle = lazy(() => import('./pages/Paycycle'));
const Settings = lazy(() => import('./pages/Settings'));
const BankDetail = lazy(() => import('./pages/BankDetail'));
const CreditCards = lazy(() => import('./pages/CreditCards'));
const PaymentHistory = lazy(() => import('./pages/PaymentHistory'));
const Reports = lazy(() => import('./pages/Reports'));
const DebtOptimizer = lazy(() => import('./pages/DebtOptimizer'));
const Login = lazy(() => import('./pages/Login'));
const Onboarding = lazy(() => import('./pages/Onboarding'));

// Force bundle hash change to deploy pending fixes
export const APP_VERSION = '2.0.1-' + Date.now();
console.log('[App] Smart Money Tracker v' + APP_VERSION);
console.log('[App] Initialized at:', new Date().toISOString());

// Protected Route wrapper
const PrivateRoute = ({ children }) => {
  const { currentUser } = useAuth();
  return currentUser ? children : <Navigate to="/login" />;
};

// Onboarding Guard - Redirects to onboarding if not complete
const OnboardingGuard = ({ children }) => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [needsOnboarding, setNeedsOnboarding] = React.useState(false);

  React.useEffect(() => {
    const checkOnboarding = async () => {
      if (!currentUser) {
        setLoading(false);
        return;
      }

      try {
        const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
        const settingsDocSnap = await getDoc(settingsDocRef);

        if (settingsDocSnap.exists()) {
          const data = settingsDocSnap.data();
          // Check if onboarding is complete
          setNeedsOnboarding(data.isOnboardingComplete !== true);
        } else {
          // No settings document = needs onboarding
          setNeedsOnboarding(true);
        }
      } catch (error) {
        console.error('[OnboardingGuard] Error checking onboarding status:', error);
        // On error, assume onboarding is needed
        setNeedsOnboarding(true);
      } finally {
        setLoading(false);
      }
    };

    checkOnboarding();
  }, [currentUser]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (needsOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }

  return children;
};

// Main app layout with sidebar
const AppLayout = ({ children, showDebugButton }) => {
  const { isMobile, isTablet } = useWindowSize();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleToggleMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const handleCloseMenu = () => {
    setMobileMenuOpen(false);
  };

  return (
    <div className="app">
      {/* Show mobile nav on mobile/tablet, desktop sidebar on desktop */}
      {(isMobile || isTablet) ? (
        <MobileNav 
          isOpen={mobileMenuOpen} 
          onToggle={handleToggleMenu} 
          onClose={handleCloseMenu} 
        />
      ) : (
        <Sidebar />
      )}
      <main className="main-content">
        {children}
      </main>
      {showDebugButton && <DebugButton />}
    </div>
  );
};

function App() {
  const [debugModeEnabled, setDebugModeEnabled] = useState(false);

  useEffect(() => {
    // Check localStorage for debug mode
    const debugMode = localStorage.getItem('debugMode') === 'true';
    setDebugModeEnabled(debugMode);

    // Listen for debug mode changes
    const handleDebugModeChange = (event) => {
      setDebugModeEnabled(event.detail.enabled);
    };
    window.addEventListener('debugModeChanged', handleDebugModeChange);

    // Add keyboard shortcut: Ctrl+Shift+D
    const handleKeyDown = (event) => {
      if (event.ctrlKey && event.shiftKey && event.key === 'D') {
        event.preventDefault();
        // Trigger debug modal open
        const debugButton = document.querySelector('.debug-button');
        if (debugButton) {
          debugButton.click();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('debugModeChanged', handleDebugModeChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return (
    <>
      <ErrorBoundary>
        <Router>
          <AuthProvider>
            <PWAInstallPrompt />
            <Suspense fallback={<LoadingSpinner />}>
              <Routes>
              {/* Public route - Login */}
              <Route path="/login" element={<Login />} />
          
          {/* Onboarding route - requires authentication but bypasses onboarding guard */}
          <Route path="/onboarding" element={
            <PrivateRoute>
              <Onboarding />
            </PrivateRoute>
          } />
          
          {/* Protected routes - require authentication and onboarding complete */}
          <Route path="/" element={
            <PrivateRoute>
              <OnboardingGuard>
                <AppLayout showDebugButton={debugModeEnabled}>
                  <Dashboard />
                </AppLayout>
              </OnboardingGuard>
            </PrivateRoute>
          } />
          
          <Route path="/accounts" element={
            <PrivateRoute>
              <OnboardingGuard>
                <AppLayout showDebugButton={debugModeEnabled}>
                  <Accounts />
                </AppLayout>
              </OnboardingGuard>
            </PrivateRoute>
          } />
          
          <Route path="/bank/:accountId" element={
            <PrivateRoute>
              <OnboardingGuard>
                <AppLayout showDebugButton={debugModeEnabled}>
                  <BankDetail />
                </AppLayout>
              </OnboardingGuard>
            </PrivateRoute>
          } />
          
          <Route path="/transactions" element={
            <PrivateRoute>
              <OnboardingGuard>
                <AppLayout showDebugButton={debugModeEnabled}>
                  <Transactions />
                </AppLayout>
              </OnboardingGuard>
            </PrivateRoute>
          } />
          
          <Route path="/spendability" element={
            <PrivateRoute>
              <OnboardingGuard>
                <AppLayout showDebugButton={debugModeEnabled}>
                  <Spendability />
                </AppLayout>
              </OnboardingGuard>
            </PrivateRoute>
          } />
          
          <Route path="/bills" element={
            <PrivateRoute>
              <OnboardingGuard>
                <AppLayout showDebugButton={debugModeEnabled}>
                  <Bills />
                </AppLayout>
              </OnboardingGuard>
            </PrivateRoute>
          } />
          
          <Route path="/recurring" element={
            <PrivateRoute>
              <OnboardingGuard>
                <AppLayout showDebugButton={debugModeEnabled}>
                  <Recurring />
                </AppLayout>
              </OnboardingGuard>
            </PrivateRoute>
          } />
          
          <Route path="/subscriptions" element={
            <PrivateRoute>
              <OnboardingGuard>
                <AppLayout showDebugButton={debugModeEnabled}>
                  <Subscriptions />
                </AppLayout>
              </OnboardingGuard>
            </PrivateRoute>
          } />
          
          <Route path="/goals" element={
            <PrivateRoute>
              <OnboardingGuard>
                <AppLayout showDebugButton={debugModeEnabled}>
                  <Goals />
                </AppLayout>
              </OnboardingGuard>
            </PrivateRoute>
          } />
          
          <Route path="/categories" element={
            <PrivateRoute>
              <OnboardingGuard>
                <AppLayout showDebugButton={debugModeEnabled}>
                  <Categories />
                </AppLayout>
              </OnboardingGuard>
            </PrivateRoute>
          } />
          
          <Route path="/creditcards" element={
            <PrivateRoute>
              <OnboardingGuard>
                <AppLayout showDebugButton={debugModeEnabled}>
                 <CreditCards />
               </AppLayout>
              </OnboardingGuard>
          </PrivateRoute>
         } />     
          
          <Route path="/cashflow" element={
            <PrivateRoute>
              <OnboardingGuard>
                <AppLayout showDebugButton={debugModeEnabled}>
                  <Cashflow />
                </AppLayout>
              </OnboardingGuard>
            </PrivateRoute>
          } />
          
          <Route path="/paycycle" element={
            <PrivateRoute>
              <OnboardingGuard>
                <AppLayout showDebugButton={debugModeEnabled}>
                  <Paycycle />
                </AppLayout>
              </OnboardingGuard>
            </PrivateRoute>
          } />
          
          <Route path="/settings" element={
            <PrivateRoute>
              <OnboardingGuard>
                <AppLayout showDebugButton={debugModeEnabled}>
                  <Settings />
                </AppLayout>
              </OnboardingGuard>
            </PrivateRoute>
          } />
          
          <Route path="/payment-history" element={
            <PrivateRoute>
              <OnboardingGuard>
                <AppLayout showDebugButton={debugModeEnabled}>
                  <PaymentHistory />
                </AppLayout>
              </OnboardingGuard>
            </PrivateRoute>
          } />
          
          <Route path="/reports" element={
            <PrivateRoute>
              <OnboardingGuard>
                <AppLayout showDebugButton={debugModeEnabled}>
                  <Reports />
                </AppLayout>
              </OnboardingGuard>
            </PrivateRoute>
          } />
          
          <Route path="/debt-optimizer" element={
            <PrivateRoute>
              <OnboardingGuard>
                <AppLayout showDebugButton={debugModeEnabled}>
                  <DebtOptimizer />
                </AppLayout>
              </OnboardingGuard>
            </PrivateRoute>
          } />
              </Routes>
            </Suspense>
          </AuthProvider>
        </Router>
      </ErrorBoundary>
      <SentryTestButton />
    </>
  );
}

export default App;
