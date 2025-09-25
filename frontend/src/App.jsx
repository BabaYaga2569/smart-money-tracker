import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Transactions from './pages/Transactions';
import Spendability from './pages/Spendability';
import Bills from './pages/Bills';
import Recurring from './pages/Recurring';
import Goals from './pages/Goals';
import Categories from './pages/Categories';
import CashFlow from './pages/CashFlow';
import PayCycle from './pages/PayCycle';
import Settings from './pages/Settings';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/spendability" element={<Spendability />} />
          <Route path="/bills" element={<Bills />} />
          <Route path="/recurring" element={<Recurring />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/cashflow" element={<CashFlow />} />
          <Route path="/paycycle" element={<PayCycle />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;