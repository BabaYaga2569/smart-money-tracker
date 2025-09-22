import { useEffect, useState } from "react";

function App() {
  const [apiMsg, setApiMsg] = useState("Loading...");

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/api/hello`)
      .then((res) => res.json())
      .then((data) => setApiMsg(data.message))
      .catch(() => setApiMsg("API call failed"));
  }, []);

  return (
    <div style={{ textAlign: "center", padding: "2rem", color: "#00ff99", backgroundColor: "#000" }}>
      <h1>Smart Money Tracker</h1>
      <p>Backend says: {apiMsg}</p>
    </div>
  );
}

export default App;
