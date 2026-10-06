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
import { importWithStaleChunkRecovery } from './utils/lazyImportRecovery';
import './App.css';

// Lazy load all page components with one-time recovery for stale deploy chunks.
// If an open tab references a chunk from the previous deployment, the importer
// clears only browser app caches/service-worker state and reloads once.
const lazyPage = (importer, label) =>
  lazy(() => importWithStaleChunkRecovery(importer, label));

const Dashboard = lazyPage(() => import('./pages/Dashboard'), 'Dashboard');
const Accounts = lazyPage(() => import('./pages/Accounts'), 'Accounts');
const Transactions = lazyPage(() => import('./pages/Transactions'), 'Transactions');
const Spendability = lazyPage(() => import('./pages/Spendability'), 'Spendability');
const Bills = lazyPage(() => import('./pages/Bills'), 'Bills');
const Recurring = lazyPage(() => import('./pages/Recurring'), 'Recurring');
const BillDoctor = lazyPage(() => import('./pages/BillDoctor'), 'BillDoctor');
const Subscriptions = lazyPage(() => import('./pages/Subscriptions'), 'Subscriptions');
const Goals = lazyPage(() => import('./pages/Goals'), 'Goals');
const Categories = lazyPage(() => import('./pages/Categories'), 'Categories');
const Cashflow = lazyPage(() => import('./pages/Cashflow'), 'Cashflow');
const Paycycle = lazyPage(() => import('./pages/Paycycle'), 'Paycycle');
const Settings = lazyPage(() => import('./pages/Settings'), 'Settings');
const BankDetail = lazyPage(() => import('./pages/BankDetail'), 'BankDetail');
const CreditCards = lazyPage(() => import('./pages/CreditCards'), 'CreditCards');
const PaymentHistory = lazyPage(() => import('./pages/PaymentHistory'), 'PaymentHistory');
const Reports = lazyPage(() => import('./pages/Reports'), 'Reports');
const DebtOptimizer = lazyPage(() => import('./pages/DebtOptimizer'), 'DebtOptimizer');
const PaymentRulesManager = lazyPage(() => import('./pages/PaymentRulesManager'), 'PaymentRulesManager');
const PaymentRules = lazyPage(() => import('./pages/PaymentRules'), 'PaymentRules');
const Login = lazyPage(() => import('./pages/Login'), 'Login');
const Onboarding = lazyPage(() => import('./pages/Onboarding'), 'Onboarding');
const Debug = lazyPage(() => import('./pages/Debug'), 'Debug');

// Force bundle hash change to deploy pending fixes
export const APP_VERSION = '2.0.1-' + Date.now();
console.log('[App] Smart Money Tracker v' + APP_VERSION);
console.log('[App] Initialized at:', new Date().toISOString());

// Protected Route wrapper
const PrivateRoute = ({ children }) => {
  const { currentUser } = useAuth();
  return currentUser ? children : <Navigate to="/login" />;
};

// Route-level fallback for errors that make it past stale-chunk recovery.
const RouteErrorFallback = ({ error }) => (
  <div style={{ padding: '40px', maxWidth: '600px', margin: '0 auto', color: 'white', textAlign: 'center' }}>
    <h2>⚠️ Page Load Failed</h2>
    <p style={{ marginBottom: '20px' }}>
      Smart Money Tracker could not load this page. Your financial data was not changed.
    </p>
    {error?.message && (
      <details style={{ margin: '18px auto', textAlign: 'left', maxWidth: '520px', color: '#bbb' }}>
        <summary style={{ cursor: 'pointer', textAlign: 'center' }}>Technical details</summary>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '12px' }}>
          {error.message}
        </pre>
      </details>
    )}
    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
      <button
        onClick={() => window.location.reload()}
        style={{ padding: '12px 24px', fontSize: '16px', cursor: 'pointer', background: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px' }}
      >
        Reload Page
      </button>
      <a href="/" style={{ textDecoration: 'none' }}>
        <button style={{ padding: '12px 24px', fontSize: '16px', cursor: 'pointer', background: '#555', color: 'white', border: 'none', borderRadius: '4px' }}>
          Go to Dashboard
        </button>
      </a>
    </div>
  </div>
);

// Preserve old /dashboard links instead of rendering a blank unmatched route.
const LegacyDashboardRedirect = () => (
  <Navigate to={`/${window.location.search}`} replace />
);

// Onboarding Guard - Redirects to onboarding if not complete
const OnboardingGuard = ({ children }) => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
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
                <Route path="/dashboard" element={<LegacyDashboardRedirect />} />
            
                {/* Onboarding route */}
                <Route path="/onboarding" element={
                  <PrivateRoute>
                    <Onboarding />
                  </PrivateRoute>
                } />
            
                {/* Protected routes */}
                <Route path="/" element={
                  <PrivateRoute>
                    <ErrorBoundary fallback={RouteErrorFallback}>
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
                    <ErrorBoundary fallback={RouteErrorFallback}>
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
                    <ErrorBoundary fallback={RouteErrorFallback}>
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
                    <ErrorBoundary fallback={RouteErrorFallback}>
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
                    <ErrorBoundary fallback={RouteErrorFallback}>
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
                    <ErrorBoundary fallback={RouteErrorFallback}>
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
                    <ErrorBoundary fallback={RouteErrorFallback}>
                      <OnboardingGuard>
                        <AppLayout showDebugButton={debugModeEnabled}>
                          <Recurring />
                        </AppLayout>
                      </OnboardingGuard>
                    </ErrorBoundary>
                  </PrivateRoute>
                } />

                <Route path="/bill-doctor" element={
                  <PrivateRoute>
                    <ErrorBoundary fallback={RouteErrorFallback}>
                      <OnboardingGuard>
                        <AppLayout showDebugButton={debugModeEnabled}>
                          <BillDoctor />
                        </AppLayout>
                      </OnboardingGuard>
                    </ErrorBoundary>
                  </PrivateRoute>
                } />
            
                <Route path="/subscriptions" element={
                  <PrivateRoute>
                    <ErrorBoundary fallback={RouteErrorFallback}>
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
                    <ErrorBoundary fallback={RouteErrorFallback}>
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
                    <ErrorBoundary fallback={RouteErrorFallback}>
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
                    <ErrorBoundary fallback={RouteErrorFallback}>
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
                    <ErrorBoundary fallback={RouteErrorFallback}>
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
                    <ErrorBoundary fallback={RouteErrorFallback}>
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
                    <ErrorBoundary fallback={RouteErrorFallback}>
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
                    <ErrorBoundary fallback={RouteErrorFallback}>
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
                    <ErrorBoundary fallback={RouteErrorFallback}>
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
                    <ErrorBoundary fallback={RouteErrorFallback}>
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
                    <ErrorBoundary fallback={RouteErrorFallback}>
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