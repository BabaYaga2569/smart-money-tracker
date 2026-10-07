import React, { useState, useEffect } from "react";
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import { Link, useLocation } from "react-router-dom";
import { getPendingCount } from '../utils/detectionStorage';
import { APP_NAV_ITEMS, APP_NAV_GROUPS } from '../config/navigation';
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

  const menuItems = APP_NAV_ITEMS.map(item => ({
    ...item,
    badge: item.badgeKey === 'subscriptions' ? detectionCount : 0
  }));

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
      <nav className="sidebar-nav">
        {APP_NAV_GROUPS.map((group) => {
          const groupItems = menuItems.filter(item => item.group === group);
          if (groupItems.length === 0) return null;

          return (
            <div className="sidebar-nav-group" key={group}>
              <div className="sidebar-nav-group-label">{group}</div>
              <ul>
                {groupItems.map((item) => (
                  <li key={item.name}>
                    <Link 
                      to={item.path}
                      className={location.pathname === item.path ? "active" : ""}
                    >
                      <span>{item.name}</span>
                      {item.badge > 0 && (
                        <span className="sidebar-badge">{item.badge}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
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