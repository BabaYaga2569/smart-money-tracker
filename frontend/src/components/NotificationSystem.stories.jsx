import NotificationSystem from './NotificationSystem';
import { NotificationManager } from '../utils/NotificationManager';
import { useEffect } from 'react';

export default {
  title: 'Components/NotificationSystem',
  component: NotificationSystem,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
};

// Helper component to add notifications
const NotificationDemo = ({ type, title, message, actions }) => {
  useEffect(() => {
    // Clear previous notifications
    const currentNotifications = NotificationManager.getNotifications();
    currentNotifications.forEach((n) => NotificationManager.removeNotification(n.id));

    // Add demo notification
    const id = NotificationManager.addNotification({
      type,
      title,
      message,
      actions,
    });

    return () => {
      NotificationManager.removeNotification(id);
    };
  }, [type, title, message, actions]);

  return <NotificationSystem />;
};

export const Success = {
  render: () => (
    <NotificationDemo
      type="success"
      title="Success!"
      message="Your transaction has been completed successfully."
    />
  ),
};

export const Error = {
  render: () => (
    <NotificationDemo
      type="error"
      title="Error"
      message="Unable to connect to the server. Please try again."
    />
  ),
};

export const Warning = {
  render: () => (
    <NotificationDemo
      type="warning"
      title="Warning"
      message="Your session will expire in 5 minutes."
    />
  ),
};

export const Info = {
  render: () => (
    <NotificationDemo
      type="info"
      title="Info"
      message="New features are available. Check them out!"
    />
  ),
};

export const Loading = {
  render: () => (
    <NotificationDemo type="loading" message="Syncing your accounts..." />
  ),
};

export const WithActions = {
  render: () => (
    <NotificationDemo
      type="warning"
      title="Account Sync Issue"
      message="Some accounts failed to sync. Would you like to retry?"
      actions={[
        {
          label: 'Retry',
          action: () => alert('Retrying...'),
        },
        {
          label: 'Dismiss',
          action: () => alert('Dismissed'),
        },
      ]}
    />
  ),
};

export const Multiple = {
  render: () => {
    useEffect(() => {
      // Clear previous notifications
      const currentNotifications = NotificationManager.getNotifications();
      currentNotifications.forEach((n) => NotificationManager.removeNotification(n.id));

      // Add multiple notifications
      const ids = [
        NotificationManager.addNotification({
          type: 'success',
          title: 'Transaction Complete',
          message: 'Payment of $50.00 was successful.',
        }),
        NotificationManager.addNotification({
          type: 'info',
          message: 'Your bills are due in 3 days.',
        }),
        NotificationManager.addNotification({
          type: 'warning',
          title: 'Low Balance',
          message: 'Your checking account is running low.',
        }),
      ];

      return () => {
        ids.forEach((id) => NotificationManager.removeNotification(id));
      };
    }, []);

    return <NotificationSystem />;
  },
};
