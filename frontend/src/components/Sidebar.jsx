import { Link } from "react-router-dom";
import "./Sidebar.css";

export default function Sidebar() {
  return (
    <div className="sidebar">
      <h2>💰 Tracker</h2>
      <nav>
        <ul>
          <li><Link to="/">Dashboard</Link></li>
          <li><Link to="/accounts">Accounts</Link></li>
          <li><Link to="/transactions">Transactions</Link></li>
          <li><Link to="/bills">Bills</Link></li>
          <li><Link to="/recurring">Recurring</Link></li>
          <li><Link to="/goals">Goals</Link></li>
          <li><Link to="/categories">Categories</Link></li>
          <li><Link to="/cashflow">Cash Flow</Link></li>
          <li><Link to="/paycycle">Pay Cycle</Link></li>
        </ul>
      </nav>
    </div>
  );
}
