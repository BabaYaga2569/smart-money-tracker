import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import './MobileNav.css';

export default function MobileNav({ isOpen, onToggle, onClose }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();

  const menuItems = [
    { name: "Dashboard", path: "/" },
    { name: "Accounts", path: "/accounts" },
    { name: "Transactions", path: "/transactions" },
    { name: "Spendability", path: "/spendability" },
    { name: "Bills", path: "/bills" },
    { name: "💳 Payment History", path: "/payment-history" },
    { name: "Recurring", path: "/recurring" },
    { name: "Subscriptions", path: "/subscriptions" },
    { name: "Goals", path: "/goals" },
    { name: "Categories", path: "/categories" },
    { name: "Cash Flow", path: "/cashflow" },
    { name: "Pay Cycle", path: "/paycycle" },
    { name: "📊 Reports", path: "/reports" },
    { name: "Settings", path: "/settings" }
  ];

  const handleLogout = async () => {
    try {
      await auth.signOut();
      navigate('/login');
      onClose();
    } catch (error) {
      console.error('Error logging out:', error);
      alert('Failed to log out. Please try again.');
    }
  };

  const handleNavClick = () => {
    onClose();
  };

  return (
    <>
      {/* Hamburger button */}
      <button 
        className="mobile-menu-btn" 
        onClick={onToggle}
        aria-label="Toggle menu"
      >
        <span className={`hamburger ${isOpen ? 'open' : ''}`}>
          <span></span>
          <span></span>
          <span></span>
        </span>
      </button>
      
      {/* Backdrop overlay */}
      {isOpen && (
        <div className="mobile-backdrop" onClick={onClose} />
      )}
      
      {/* Slide-out sidebar */}
      <aside className={`mobile-sidebar ${isOpen ? 'open' : ''}`}>
        <div className="mobile-sidebar-header">
          <h2 className="mobile-sidebar-title">💰 Smart Money</h2>
        </div>
        
        <nav className="mobile-sidebar-nav">
          <ul>
            {menuItems.map((item) => (
              <li key={item.name}>
                <Link 
                  to={item.path}
                  className={location.pathname === item.path ? "active" : ""}
                  onClick={handleNavClick}
                >
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        
        <div className="mobile-sidebar-logout">
          <button onClick={handleLogout} className="mobile-logout-btn">
            🚪 Logout
          </button>
          {currentUser && (
            <small className="mobile-user-email">{currentUser.email}</small>
          )}
        </div>
      </aside>
    </>
  );
}
