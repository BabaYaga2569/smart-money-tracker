import React from "react";
import { Link, useLocation } from "react-router-dom";

const Sidebar = () => {
  const location = useLocation();

  const menuItems = [
  { name: "Dashboard", path: "/dashboard" },
  { name: "Accounts", path: "/accounts" },
  { name: "Transactions", path: "/transactions" },
  { name: "Spendability", path: "/spendability" },
  { name: "Bills", path: "/bills" },
  { name: "Recurring", path: "/recurring" },
  { name: "Goals", path: "/goals" },
  { name: "Categories", path: "/categories" },
  { name: "Cash Flow", path: "/cash-flow" },
  { name: "Pay Cycle", path: "/pay-cycle" },
  { name: "Settings", path: "/settings" }
];

  return (
    <aside className="sidebar">
      <h2 className="sidebar-title">💰 Smart Money</h2>
      <nav>
        <ul>
          {menuItems.map((item) => (
            <li key={item.name}>
              <Link 
                to={item.path}
                className={location.pathname === item.path || (location.pathname === "/" && item.path === "/dashboard") ? "active" : ""}
              >
                {item.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
};

export default Sidebar;