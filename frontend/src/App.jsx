import React,{useState,useEffect}from"react"
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Transactions from './pages/Transactions';
import Spendability from './pages/Spendability';
import Bills from './pages/Bills';
import Recurring from './pages/Recurring';
import Subscriptions from './pages/Subscriptions';
import Goals from './pages/Goals';
import Categories from './pages/Categories';
import Cashflow from './pages/Cashflow';
import Paycycle from './pages/Paycycle';
import Settings from './pages/Settings';
import BankDetail from './pages/BankDetail';
import CreditCards from './pages/CreditCards';

import Login from './pages/Login';
import DebugButton from './components/DebugButton';
import { useWindowSize } from './hooks/useWindowSize';
import './App.css';

// Force bundle hash change to deploy pending fixes
export const APP_VERSION = '2.0.1-' + Date.now();
console.log('[App] Smart Money Tracker v' + APP_VERSION);
console.log('[App] Initialized at:', new Date().toISOString());

// Protected Route wrapper
const PrivateRoute = ({ children }) => {
  const { currentUser } = useAuth();
  return currentUser ? children : <Navigate to="/login" />;
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
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <Routes>
            {/* Public route - Login */}
            <Route path="/login" element={<Login />} />
          
          {/* Protected routes - require authentication */}
          <Route path="/" element={
            <PrivateRoute>
              <AppLayout showDebugButton={debugModeEnabled}>
                <Dashboard />
              </AppLayout>
            </PrivateRoute>
          } />
          
          <Route path="/accounts" element={
            <PrivateRoute>
              <AppLayout showDebugButton={debugModeEnabled}>
                <Accounts />
              </AppLayout>
            </PrivateRoute>
          } />
          
          <Route path="/bank/:accountId" element={
            <PrivateRoute>
              <AppLayout showDebugButton={debugModeEnabled}>
                <BankDetail />
              </AppLayout>
            </PrivateRoute>
          } />
          
          <Route path="/transactions" element={
            <PrivateRoute>
              <AppLayout showDebugButton={debugModeEnabled}>
                <Transactions />
              </AppLayout>
            </PrivateRoute>
          } />
          
          <Route path="/spendability" element={
            <PrivateRoute>
              <AppLayout showDebugButton={debugModeEnabled}>
                <Spendability />
              </AppLayout>
            </PrivateRoute>
          } />
          
          <Route path="/bills" element={
            <PrivateRoute>
              <AppLayout showDebugButton={debugModeEnabled}>
                <Bills />
              </AppLayout>
            </PrivateRoute>
          } />
          
          <Route path="/recurring" element={
            <PrivateRoute>
              <AppLayout showDebugButton={debugModeEnabled}>
                <Recurring />
              </AppLayout>
            </PrivateRoute>
          } />
          
          <Route path="/subscriptions" element={
            <PrivateRoute>
              <AppLayout showDebugButton={debugModeEnabled}>
                <Subscriptions />
              </AppLayout>
            </PrivateRoute>
          } />
          
          <Route path="/goals" element={
            <PrivateRoute>
              <AppLayout showDebugButton={debugModeEnabled}>
                <Goals />
              </AppLayout>
            </PrivateRoute>
          } />
          
          <Route path="/categories" element={
            <PrivateRoute>
              <AppLayout showDebugButton={debugModeEnabled}>
                <Categories />
              </AppLayout>
            </PrivateRoute>
          } />
          
          <Route path="/creditcards" element={
            <PrivateRoute>
              <AppLayout showDebugButton={debugModeEnabled}>
               <CreditCards />
             </AppLayout>
          </PrivateRoute>
         } />     
          
          <Route path="/cashflow" element={
            <PrivateRoute>
              <AppLayout showDebugButton={debugModeEnabled}>
                <Cashflow />
              </AppLayout>
            </PrivateRoute>
          } />
          
          <Route path="/paycycle" element={
            <PrivateRoute>
              <AppLayout showDebugButton={debugModeEnabled}>
                <Paycycle />
              </AppLayout>
            </PrivateRoute>
          } />
          
          <Route path="/settings" element={
            <PrivateRoute>
              <AppLayout showDebugButton={debugModeEnabled}>
                <Settings />
              </AppLayout>
            </PrivateRoute>
          } />
        </Routes>
      </AuthProvider>
    </Router>
    </ErrorBoundary>
  );
}

export default App;
