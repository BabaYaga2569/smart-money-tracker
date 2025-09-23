import Dashboard from "./Dashboard";
import Sidebar from "./components/Sidebar";

export default function App() {
  return (
    <div className="layout">
      <Sidebar />
      <main className="main-content">
        <Dashboard />
      </main>
    </div>
  );
}
