import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Transactions from './pages/Transactions';
import Spendability from './pages/Spendability';
import Bills from './pages/Bills';
import Recurring from './pages/Recurring';
import Goals from './pages/Goals';
import Categories from './pages/Categories';
import Cashflow from './pages/Cashflow';      // ✅ lowercase 'f'
import Paycycle from './pages/Paycycle';      // ✅ lowercase 'c' 
import Settings from './pages/Settings';
import './App.css';

function App() {
  return (
    <Router>
      <div className="app">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/spendability" element={<Spendability />} />
            <Route path="/bills" element={<Bills />} />
            <Route path="/recurring" element={<Recurring />} />
            <Route path="/goals" element={<Goals />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/cashflow" element={<Cashflow />} />
            <Route path="/paycycle" element={<Paycycle />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;