import "./Sidebar.css";

export default function Sidebar() {
  return (
    <div className="sidebar">
      <h2 className="sidebar-title">💰 Tracker</h2>
      <nav>
        <ul>
          <li><a href="/">Dashboard</a></li>
          <li><a href="#accounts">Accounts</a></li>
          <li><a href="#transactions">Transactions</a></li>
          <li><a href="#spendability">Spendability</a></li>
          <li><a href="#bills">Bills</a></li>
          <li><a href="#recurring">Recurring</a></li>
          <li><a href="#goals">Goals</a></li>
          <li><a href="#categories">Categories</a></li>
          <li><a href="#cashflow">Cash Flow</a></li>
          <li><a href="#paycycle">Pay Cycle</a></li>
        </ul>
      </nav>
    </div>
  );
}
