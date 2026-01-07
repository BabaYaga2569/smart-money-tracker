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
const PaymentRulesManager = lazy(() => import('./pages/PaymentRulesManager'));
const PaymentRules = lazy(() => import('./pages/PaymentRules'));  // ← NEW
const Login = lazy(() => import('./pages/Login'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Debug = lazy(() => import('./pages/Debug'));

// Force bundle hash change to deploy pending fixes
export const APP_VERSION = '2.0.1-' + Date.now();
console.log('[App] Smart Money Tracker v' + APP_VERSION);
console.log('[App] Initialized at:', new Date().toISOString());

// Protected Route wrapper
const PrivateRoute = ({ children }) => {
  const { currentUser } = useAuth();
  return currentUser ? children : <Navigate to="/login" />;
};

// Error Fallback for OnboardingGuard failures
const OnboardingErrorFallback = (
  <div style={{ padding: '40px', maxWidth: '600px', margin: '0 auto', color: 'white', textAlign: 'center' }}>
    <h2>⚠️ Onboarding Check Failed</h2>
    <p style={{ marginBottom: '20px' }}>There was an error checking your onboarding status.</p>
    <a href="/dashboard?skip_onboarding=true" style={{ textDecoration: 'none' }}>
      <button style={{ padding: '12px 24px', fontSize: '16px', cursor: 'pointer', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px' }}>
        Continue to Dashboard
      </button>
    </a>
  </div>
);

// Onboarding Guard - Redirects to onboarding if not complete
const OnboardingGuard = ({ children }) => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = React.useState(true);
  const [needsOnboarding, setNeedsOnboarding] = React.useState(false);

  React.useEffect(() => {
    // EMERGENCY BYPASS: Allow ?skip_onboarding=true to bypass guard
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('skip_onboarding') === 'true') {
      console.warn('⚠️ [OnboardingGuard] Onboarding check BYPASSED via URL parameter');
      setNeedsOnboarding(false);
      setLoading(false);
      return;
    }

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
          // FAIL OPEN: Only redirect if EXPLICITLY set to false
          // If field is missing or undefined, assume onboarding is complete
          setNeedsOnboarding(data.isOnboardingComplete === false);
        } else {
          // No settings document = new user, needs onboarding
          setNeedsOnboarding(true);
        }
      } catch (error) {
        console.error('[OnboardingGuard] Error checking onboarding status:', error);
        // ON ERROR: Let user through instead of blocking them (FAIL OPEN)
        setNeedsOnboarding(false);
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
    const debugMode = localStorage.getItem('debugMode') === 'true';
    setDebugModeEnabled(debugMode);

    const handleDebugModeChange = (event) => {
      setDebugModeEnabled(event.detail. enabled);
    };
    window.addEventListener('debugModeChanged', handleDebugModeChange);

    const handleKeyDown = (event) => {
      if (event.ctrlKey && event.shiftKey && event.key === 'D') {
        event.preventDefault();
        const debugButton = document. querySelector('.debug-button');
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
                {/* Public routes - No authentication required */}
                <Route path="/login" element={<Login />} />
                <Route path="/debug" element={<Debug />} />
            
                {/* Onboarding route */}
                <Route path="/onboarding" element={
                  <PrivateRoute>
                    <Onboarding />
                  </PrivateRoute>
                } />
            
                {/* Protected routes */}
                <Route path="/" element={
                  <PrivateRoute>
                    <ErrorBoundary fallback={OnboardingErrorFallback}>
                      <OnboardingGuard>
                        <AppLayout showDebugButton={debugModeEnabled}>
                          <Dashboard />
                        </AppLayout>
                      </OnboardingGuard>
                    </ErrorBoundary>
                  </PrivateRoute>
                } />
            
                <Route path="/accounts" element={
                  <PrivateRoute>
                    <ErrorBoundary fallback={OnboardingErrorFallback}>
                      <OnboardingGuard>
                        <AppLayout showDebugButton={debugModeEnabled}>
                          <Accounts />
                        </AppLayout>
                      </OnboardingGuard>
                    </ErrorBoundary>
                  </PrivateRoute>
                } />
            
                <Route path="/bank/:accountId" element={
                  <PrivateRoute>
                    <ErrorBoundary fallback={OnboardingErrorFallback}>
                      <OnboardingGuard>
                        <AppLayout showDebugButton={debugModeEnabled}>
                          <BankDetail />
                        </AppLayout>
                      </OnboardingGuard>
                    </ErrorBoundary>
                  </PrivateRoute>
                } />
            
                <Route path="/transactions" element={
                  <PrivateRoute>
                    <ErrorBoundary fallback={OnboardingErrorFallback}>
                      <OnboardingGuard>
                        <AppLayout showDebugButton={debugModeEnabled}>
                          <Transactions />
                        </AppLayout>
                      </OnboardingGuard>
                    </ErrorBoundary>
                  </PrivateRoute>
                } />
            
                <Route path="/spendability" element={
                  <PrivateRoute>
                    <ErrorBoundary fallback={OnboardingErrorFallback}>
                      <OnboardingGuard>
                        <AppLayout showDebugButton={debugModeEnabled}>
                          <Spendability />
                        </AppLayout>
                      </OnboardingGuard>
                    </ErrorBoundary>
                  </PrivateRoute>
                } />
            
                <Route path="/bills" element={
                  <PrivateRoute>
                    <ErrorBoundary fallback={OnboardingErrorFallback}>
                      <OnboardingGuard>
                        <AppLayout showDebugButton={debugModeEnabled}>
                          <Bills />
                        </AppLayout>
                      </OnboardingGuard>
                    </ErrorBoundary>
                  </PrivateRoute>
                } />
            
                <Route path="/recurring" element={
                  <PrivateRoute>
                    <ErrorBoundary fallback={OnboardingErrorFallback}>
                      <OnboardingGuard>
                        <AppLayout showDebugButton={debugModeEnabled}>
                          <Recurring />
                        </AppLayout>
                      </OnboardingGuard>
                    </ErrorBoundary>
                  </PrivateRoute>
                } />
            
                <Route path="/subscriptions" element={
                  <PrivateRoute>
                    <ErrorBoundary fallback={OnboardingErrorFallback}>
                      <OnboardingGuard>
                        <AppLayout showDebugButton={debugModeEnabled}>
                          <Subscriptions />
                        </AppLayout>
                      </OnboardingGuard>
                    </ErrorBoundary>
                  </PrivateRoute>
                } />
            
                <Route path="/goals" element={
                  <PrivateRoute>
                    <ErrorBoundary fallback={OnboardingErrorFallback}>
                      <OnboardingGuard>
                        <AppLayout showDebugButton={debugModeEnabled}>
                          <Goals />
                        </AppLayout>
                      </OnboardingGuard>
                    </ErrorBoundary>
                  </PrivateRoute>
                } />
            
                <Route path="/categories" element={
                  <PrivateRoute>
                    <ErrorBoundary fallback={OnboardingErrorFallback}>
                      <OnboardingGuard>
                        <AppLayout showDebugButton={debugModeEnabled}>
                          <Categories />
                        </AppLayout>
                      </OnboardingGuard>
                    </ErrorBoundary>
                  </PrivateRoute>
                } />
            
                <Route path="/creditcards" element={
                  <PrivateRoute>
                    <ErrorBoundary fallback={OnboardingErrorFallback}>
                      <OnboardingGuard>
                        <AppLayout showDebugButton={debugModeEnabled}>
                          <CreditCards />
                        </AppLayout>
                      </OnboardingGuard>
                    </ErrorBoundary>
                  </PrivateRoute>
                } />     
            
                <Route path="/cashflow" element={
                  <PrivateRoute>
                    <ErrorBoundary fallback={OnboardingErrorFallback}>
                      <OnboardingGuard>
                        <AppLayout showDebugButton={debugModeEnabled}>
                          <Cashflow />
                        </AppLayout>
                      </OnboardingGuard>
                    </ErrorBoundary>
                  </PrivateRoute>
                } />
            
                <Route path="/paycycle" element={
                  <PrivateRoute>
                    <ErrorBoundary fallback={OnboardingErrorFallback}>
                      <OnboardingGuard>
                        <AppLayout showDebugButton={debugModeEnabled}>
                          <Paycycle />
                        </AppLayout>
                      </OnboardingGuard>
                    </ErrorBoundary>
                  </PrivateRoute>
                } />
            
                <Route path="/settings" element={
                  <PrivateRoute>
                    <ErrorBoundary fallback={OnboardingErrorFallback}>
                      <OnboardingGuard>
                        <AppLayout showDebugButton={debugModeEnabled}>
                          <Settings />
                        </AppLayout>
                      </OnboardingGuard>
                    </ErrorBoundary>
                  </PrivateRoute>
                } />
            
                <Route path="/payment-history" element={
                  <PrivateRoute>
                    <ErrorBoundary fallback={OnboardingErrorFallback}>
                      <OnboardingGuard>
                        <AppLayout showDebugButton={debugModeEnabled}>
                          <PaymentHistory />
                        </AppLayout>
                      </OnboardingGuard>
                    </ErrorBoundary>
                  </PrivateRoute>
                } />
            
                <Route path="/reports" element={
                  <PrivateRoute>
                    <ErrorBoundary fallback={OnboardingErrorFallback}>
                      <OnboardingGuard>
                        <AppLayout showDebugButton={debugModeEnabled}>
                          <Reports />
                        </AppLayout>
                      </OnboardingGuard>
                    </ErrorBoundary>
                  </PrivateRoute>
                } />
            
                <Route path="/debt-optimizer" element={
                  <PrivateRoute>
                    <ErrorBoundary fallback={OnboardingErrorFallback}>
                      <OnboardingGuard>
                        <AppLayout showDebugButton={debugModeEnabled}>
                          <DebtOptimizer />
                        </AppLayout>
                      </OnboardingGuard>
                    </ErrorBoundary>
                  </PrivateRoute>
                } />
            
                {/* NEW:  Payment Rules route */}
                <Route path="/payment-rules" element={
                  <PrivateRoute>
                    <ErrorBoundary fallback={OnboardingErrorFallback}>
                      <OnboardingGuard>
                        <AppLayout showDebugButton={debugModeEnabled}>
                          <PaymentRules />
                        </AppLayout>
                      </OnboardingGuard>
                    </ErrorBoundary>
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