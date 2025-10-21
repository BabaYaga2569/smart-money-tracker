import React, { useState, useEffect } from "react";
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import { Link, useLocation } from "react-router-dom";
import { getPendingCount } from '../utils/detectionStorage';
import './Sidebar.css';

const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [detectionCount, setDetectionCount] = useState(0);

  useEffect(() => {
    updateDetectionCount();
    
    // Listen for detection updates
    const handleUpdate = () => {
      updateDetectionCount();
    };
    
    window.addEventListener('detectionUpdate', handleUpdate);
    window.addEventListener('detectionDismissed', handleUpdate);
    window.addEventListener('detectionRemoved', handleUpdate);
    window.addEventListener('detectionsCleared', handleUpdate);
    window.addEventListener('detectionsReset', handleUpdate);
    
    return () => {
      window.removeEventListener('detectionUpdate', handleUpdate);
      window.removeEventListener('detectionDismissed', handleUpdate);
      window.removeEventListener('detectionRemoved', handleUpdate);
      window.removeEventListener('detectionsCleared', handleUpdate);
      window.removeEventListener('detectionsReset', handleUpdate);
    };
  }, []);

  const updateDetectionCount = () => {
    const count = getPendingCount();
    setDetectionCount(count);
  };

  const menuItems = [
    { name: "Dashboard", path: "/" },
    { name: "Accounts", path: "/accounts" },
    { name: "Transactions", path: "/transactions" },
    { name: "Spendability", path: "/spendability" },
    { name: "Bills", path: "/bills" },
    { name: "Recurring", path: "/recurring" },
    { name: "Credit Cards", path: "/creditcards" },
    { name: "Subscriptions", path: "/subscriptions", badge: detectionCount },
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
                {item.badge > 0 && (
                  <span className="sidebar-badge">{item.badge}</span>
                )}
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
