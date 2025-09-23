import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Dashboard from "./Dashboard";
import Sidebar from "./components/Sidebar";

export default function App() {
  return (
    <Router>
      <div className="layout">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
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
        </main>
      </div>
    </Router>
  );
}

function Page({ title }) {
  return (
    <div className="page">
      <h1>{title}</h1>
      <p>Content coming soon…</p>
      <a href="/">← Back to Dashboard</a>
    </div>
  );
}
