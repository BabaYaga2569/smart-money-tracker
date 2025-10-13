import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Transactions from './pages/Transactions';
import Spendability from './pages/Spendability';
import Bills from './pages/Bills';
import Recurring from './pages/Recurring';
import Goals from './pages/Goals';
import Categories from './pages/Categories';
import Cashflow from './pages/Cashflow';
import Paycycle from './pages/Paycycle';
import Settings from './pages/Settings';
import Login from './pages/Login';
import './App.css';

// Protected Route wrapper
const PrivateRoute = ({ children }) => {
  const { currentUser } = useAuth();
  return currentUser ? children : <Navigate to="/login" />;
};

// Main app layout with sidebar
const AppLayout = ({ children }) => {
  return (
    <div className="app">
      <Sidebar />
      <main className="main-content">
        {children}
      </main>
    </div>
  );
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          {/* Public route - Login */}
          <Route path="/login" element={<Login />} />
          
          {/* Protected routes - require authentication */}
          <Route path="/" element={
            <PrivateRoute>
              <AppLayout>
                <Dashboard />
              </AppLayout>
            </PrivateRoute>
          } />
          
          <Route path="/accounts" element={
            <PrivateRoute>
              <AppLayout>
                <Accounts />
              </AppLayout>
            </PrivateRoute>
          } />
          
          <Route path="/transactions" element={
            <PrivateRoute>
              <AppLayout>
                <Transactions />
              </AppLayout>
            </PrivateRoute>
          } />
          
          <Route path="/spendability" element={
            <PrivateRoute>
              <AppLayout>
                <Spendability />
              </AppLayout>
            </PrivateRoute>
          } />
          
          <Route path="/bills" element={
            <PrivateRoute>
              <AppLayout>
                <Bills />
              </AppLayout>
            </PrivateRoute>
          } />
          
          <Route path="/recurring" element={
            <PrivateRoute>
              <AppLayout>
                <Recurring />
              </AppLayout>
            </PrivateRoute>
          } />
          
          <Route path="/goals" element={
            <PrivateRoute>
              <AppLayout>
                <Goals />
              </AppLayout>
            </PrivateRoute>
          } />
          
          <Route path="/categories" element={
            <PrivateRoute>
              <AppLayout>
                <Categories />
              </AppLayout>
            </PrivateRoute>
          } />
          
          <Route path="/cashflow" element={
            <PrivateRoute>
              <AppLayout>
                <Cashflow />
              </AppLayout>
            </PrivateRoute>
          } />
          
          <Route path="/paycycle" element={
            <PrivateRoute>
              <AppLayout>
                <Paycycle />
              </AppLayout>
            </PrivateRoute>
          } />
          
          <Route path="/settings" element={
            <PrivateRoute>
              <AppLayout>
                <Settings />
              </AppLayout>
            </PrivateRoute>
          } />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;

