import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Dashboard from "./Dashboard";
import Sidebar from "./components/Sidebar";
import "./App.css";
import Spendability from "./pages/Spendability";
import Settings from "./pages/Settings";

// Placeholder components for future pages
const PlaceholderPage = ({ title }) => (
  <div className="placeholder-page">
    <h1>{title}</h1>
    <p>Content coming soon...</p>
  </div>
);

export default function App() {
  return (
    <Router>
      <div className="layout">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/accounts" element={<PlaceholderPage title="Accounts" />} />
            <Route path="/transactions" element={<PlaceholderPage title="Transactions" />} />
            <Route path="/spendability" element={<Spendability />} />
            <Route path="/bills" element={<PlaceholderPage title="Bills" />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/recurring" element={<PlaceholderPage title="Recurring" />} />
            <Route path="/goals" element={<PlaceholderPage title="Goals" />} />
            <Route path="/categories" element={<PlaceholderPage title="Categories" />} />
            <Route path="/cash-flow" element={<PlaceholderPage title="Cash Flow" />} />
            <Route path="/pay-cycle" element={<PlaceholderPage title="Pay Cycle" />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}