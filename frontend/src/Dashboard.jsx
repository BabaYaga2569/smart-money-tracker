import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import Tile from "./components/Tile";

const tiles = [
  { title: "Accounts", link: "/accounts" },
  { title: "Transactions", link: "/transactions" },
  { title: "Spendability", link: "/spendability" },
  { title: "Bills", link: "/bills" },
  { title: "Recurring", link: "/recurring" },
  { title: "Goals", link: "/goals" },
  { title: "Categories", link: "/categories" },
  { title: "Cash Flow", link: "/cashflow" },
  { title: "Pay Cycle", link: "/paycycle" },
];

export default function Dashboard() {
  const [apiMsg, setApiMsg] = useState("Checking API...");

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/api/hello`)
      .then((r) => r.json())
      .then((d) => setApiMsg(d.message || "OK"))
      .catch(() => setApiMsg("API call failed"));
  }, []);

  return (
    <div style={{ display: "flex" }}>
      <Sidebar />
      <main
        style={{
          marginLeft: "220px", // same width as sidebar
          padding: "2rem",
          flex: 1,
          background: "#000",
          color: "#00ff99",
          minHeight: "100vh",
        }}
      >
        <header style={{ marginBottom: "2rem" }}>
          <h1>Smart Money Tracker</h1>
          <small>Backend status: {apiMsg}</small>
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
            gap: "1rem",
          }}
        >
          {tiles.map((t) => (
            <Tile key={t.title} title={t.title} link={t.link}>
              <em>Preview coming soon…</em>
            </Tile>
          ))}
        </section>
      </main>
    </div>
  );
}
