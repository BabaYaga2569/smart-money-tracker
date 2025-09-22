import { Link } from "react-router-dom";

const navLinks = [
  { name: "Dashboard", path: "/" },
  { name: "Accounts", path: "/accounts" },
  { name: "Transactions", path: "/transactions" },
  { name: "Bills", path: "/bills" },
  { name: "Goals", path: "/goals" },
  { name: "Pay Cycle", path: "/paycycle" },
];

export default function Sidebar() {
  return (
    <aside
      style={{
        width: "220px",
        background: "#0a0a0a",
        borderRight: "1px solid #073",
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "fixed",
        left: 0,
        top: 0,
      }}
    >
      <h2 style={{ color: "#00ff99", marginBottom: "2rem" }}>💰 Tracker</h2>
      <nav style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {navLinks.map((link) => (
          <Link
            key={link.name}
            to={link.path}
            style={{
              color: "#00ff99",
              textDecoration: "none",
              fontWeight: "500",
            }}
          >
            {link.name}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
