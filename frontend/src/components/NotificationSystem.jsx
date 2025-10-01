import React, { useState, useEffect } from 'react';
import { NotificationManager } from '../utils/NotificationManager';
import './NotificationSystem.css';

const NotificationSystem = () => {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    // Subscribe to notification updates
    const unsubscribe = NotificationManager.subscribe(setNotifications);
    
    // Get initial notifications
    setNotifications(NotificationManager.getNotifications());

    return unsubscribe;
  }, []);

  const handleDismiss = (id) => {
    NotificationManager.removeNotification(id);
  };

  const handleActionClick = (action) => {
    try {
      action.action();
    } catch (error) {
      console.error('Error executing notification action:', error);
    }
    // Auto-dismiss after action (optional)
    // handleDismiss(notificationId);
  };

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="notification-system">
      {notifications.map((notification) => (
        <div
          key={notification.id}
          className={`notification notification-${notification.type}`}
        >
          <div className="notification-content">
            <div className="notification-header">
              {notification.title && (
                <h4 className="notification-title">{notification.title}</h4>
              )}
              <button
                className="notification-close"
                onClick={() => handleDismiss(notification.id)}
                aria-label="Dismiss notification"
              >
                ×
              </button>
            </div>
            
            <div className="notification-message">
              {notification.message}
            </div>

            {notification.actions && notification.actions.length > 0 && (
              <div className="notification-actions">
                {notification.actions.map((action, index) => (
                  <button
                    key={index}
                    className="notification-action-btn"
                    onClick={() => handleActionClick(action)}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {notification.type === 'loading' && (
            <div className="notification-spinner">
              <div className="spinner"></div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default NotificationSystem;