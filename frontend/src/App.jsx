import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Dashboard from "./Dashboard";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        {/* Placeholder pages (we'll build these out next) */}
        <Route path="/accounts" element={<Page title="Accounts" />} />
        <Route path="/transactions" element={<Page title="Transactions" />} />
        <Route path="/spendability" element={<Page title="Spendability" />} />
        <Route path="/bills" element={<Page title="Bills" />} />
        <Route path="/recurring" element={<Page title="Recurring" />} />
        <Route path="/goals" element={<Page title="Goals" />} />
        <Route path="/categories" element={<Page title="Categories" />} />
        <Route path="/cashflow" element={<Page title="Cash Flow" />} />
        <Route path="/paycycle" element={<Page title="Pay Cycle" />} />
      </Routes>
    </Router>
  );
}

function Page({ title }) {
  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#00ff99", padding: "2rem" }}>
      <h1 style={{ marginTop: 0 }}>{title}</h1>
      <p>Content coming soon…</p>
      <a href="/" style={{ color: "#00ff99", textDecoration: "underline" }}>← Back to Dashboard</a>
    </div>
  );
}
