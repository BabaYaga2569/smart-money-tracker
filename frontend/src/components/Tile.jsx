import { Link } from "react-router-dom";

export default function Tile({ title, link, children }) {
  return (
    <div
      style={{
        background: "#0f0f0f",
        border: "1px solid #073",
        borderRadius: "16px",
        padding: "1.25rem",
        boxShadow: "0 8px 20px rgba(0,255,153,0.1)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <h2 style={{ margin: "0 0 1rem 0", fontSize: "1.25rem" }}>{title}</h2>
      <div style={{ flex: 1 }}>{children}</div>
      <div style={{ marginTop: "1rem" }}>
        <Link
          to={link}
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
  );
}
