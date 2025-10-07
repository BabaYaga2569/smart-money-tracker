import React from "react";
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import { Link, useLocation } from "react-router-dom";

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const menuItems = [
    { name: "Dashboard", path: "/" },
    { name: "Accounts", path: "/accounts" },
    { name: "Transactions", path: "/transactions" },
    { name: "Spendability", path: "/spendability" },
    { name: "Bills", path: "/bills" },
    { name: "Recurring", path: "/recurring" },
    { name: "Goals", path: "/goals" },
    { name: "Categories", path: "/categories" },
    { name: "Cash Flow", path: "/cashflow" },
    { name: "Pay Cycle", path: "/paycycle" },
    { name: "Settings", path: "/settings" }
  ];

  const handleLogout = async () => {
    try {
      // Note: Plaid tokens are now stored securely server-side only
      
      // Sign out from Firebase
      await auth.signOut();
      
      // Redirect to login page
      navigate('/login');
    } catch (error) {
      console.error('Error logging out:', error);
      alert('Failed to log out. Please try again.');
    }
  };

  return (
    <aside className="sidebar">
      <h2 className="sidebar-title">💰 Smart Money</h2>
      <nav>
        <ul>
          {menuItems.map((item) => (
            <li key={item.name}>
              <Link 
                to={item.path}
                className={location.pathname === item.path ? "active" : ""}
              >
                {item.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      
      <div className="sidebar-logout">
        <button onClick={handleLogout} className="logout-btn">
          🚪 Logout
        </button>
        {currentUser && (
          <small className="user-email">{currentUser.email}</small>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
