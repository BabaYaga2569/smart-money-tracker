import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import { getPendingCount } from '../utils/detectionStorage';
import { APP_NAV_ITEMS } from '../config/navigation';
import './MobileNav.css';

export default function MobileNav({ isOpen, onToggle, onClose }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [detectionCount, setDetectionCount] = useState(0);

  useEffect(() => {
    const refresh = () => setDetectionCount(getPendingCount());
    refresh();
    window.addEventListener('detectionUpdate', refresh);
    window.addEventListener('detectionDismissed', refresh);
    window.addEventListener('detectionRemoved', refresh);
    window.addEventListener('detectionsCleared', refresh);
    window.addEventListener('detectionsReset', refresh);
    return () => {
      window.removeEventListener('detectionUpdate', refresh);
      window.removeEventListener('detectionDismissed', refresh);
      window.removeEventListener('detectionRemoved', refresh);
      window.removeEventListener('detectionsCleared', refresh);
      window.removeEventListener('detectionsReset', refresh);
    };
  }, []);

  const menuItems = APP_NAV_ITEMS.map(item => ({
    ...item,
    badge: item.badgeKey === 'subscriptions' ? detectionCount : 0
  }));

  /* legacy mobile menu list removed; shared config above keeps parity */


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
                  <span>{item.name}</span>
                  {item.badge > 0 && (
                    <span className="mobile-nav-badge">{item.badge}</span>
                  )}
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
