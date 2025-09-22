import { Link } from "react-router-dom";
import { useEffect, useState } from "react";

const tiles = [
  { name: "Accounts", link: "/accounts" },
  { name: "Transactions", link: "/transactions" },
  { name: "Spendability", link: "/spendability" },
  { name: "Bills", link: "/bills" },
  { name: "Recurring", link: "/recurring" },
  { name: "Goals", link: "/goals" },
  { name: "Categories", link: "/categories" },
  { name: "Cash Flow", link: "/cashflow" },
  { name: "Pay Cycle", link: "/paycycle" },
];

export default function Dashboard() {
  const [apiMsg, setApiMsg] = useState("Checking API...");

  useEffect(() => {
    const url = `${import.meta.env.VITE_API_URL}/api/hello`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => setApiMsg(d.message || "OK"))
      .catch(() => setApiMsg("API call failed"));
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#000", color: "#00ff99" }}>
      <header style={{ padding: "1.25rem 2rem", borderBottom: "1px solid #073" }}>
        <h1 style={{ margin: 0 }}>Smart Money Tracker</h1>
        <small style={{ opacity: 0.9 }}>Backend status: {apiMsg}</small>
      </header>

      <main
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "1rem",
          padding: "2rem",
        }}
      >
        {tiles.map((tile) => (
          <div
            key={tile.name}
            style={{
              background: "#0a0a0a",
              border: "1px solid #073",
              borderRadius: "16px",
              padding: "1.25rem",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              boxShadow: "0 8px 24px rgba(0,255,153,0.08)",
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: "0.75rem" }}>{tile.name}</h2>

            {/* Placeholder preview area (we'll fill these with real data later) */}
            <div style={{ flex: 1, opacity: 0.9 }}>
              <em>Preview coming soon…</em>
            </div>

            <div style={{ marginTop: "1rem" }}>
              <Link
                to={tile.link}
                style={{
                  display: "inline-block",
                  padding: "0.5rem 0.75rem",
                  border: "1px solid #00ff99",
                  borderRadius: "10px",
                  textDecoration: "none",
                  color: "#00ff99",
                }}
              >
                View All
              </Link>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
