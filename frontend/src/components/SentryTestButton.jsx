import { captureError, captureMessage } from '../config/sentry';

const SentryTestButton = () => {
  // Only show in development
  if (import.meta.env.PROD) return null;

  const testError = () => {
    try {
      throw new Error('Test error from Sentry Test Button');
    } catch (error) {
      captureError(error, { test: true, source: 'SentryTestButton' });
      alert('Test error sent to Sentry! Check your Sentry dashboard.');
    }
  };

  const testMessage = () => {
    captureMessage('Test message from Sentry', 'info');
    alert('Test message sent to Sentry! Check your Sentry dashboard.');
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: 9999,
        display: 'flex',
        gap: '10px',
        flexDirection: 'column',
      }}
    >
      <button
        onClick={testError}
        style={{
          padding: '10px 15px',
          background: '#ff4444',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer',
          fontSize: '12px',
        }}
      >
        🐛 Test Sentry Error
      </button>
      <button
        onClick={testMessage}
        style={{
          padding: '10px 15px',
          background: '#4444ff',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer',
          fontSize: '12px',
        }}
      >
        💬 Test Sentry Message
      </button>
    </div>
  );
};

export default SentryTestButton;
