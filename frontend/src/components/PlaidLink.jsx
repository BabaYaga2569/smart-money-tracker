import React, { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';

const PlaidLink = ({ onSuccess, onExit, userId, buttonText = "Connect Bank" }) => {
  const [linkToken, setLinkToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const createLinkToken = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Add timeout to prevent infinite loading
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const apiUrl = import.meta.env.VITE_API_URL || 'https://smart-money-tracker-09ks.onrender.com';
        const response = await fetch(`${apiUrl}/api/plaid/create_link_token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId: userId || 'steve-colburn' }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to create link token: ${response.status}`);
        }

        const data = await response.json();
        
        if (!data.link_token) {
          throw new Error('No link token received from server');
        }
        
        setLinkToken(data.link_token);
        setError(null);
      } catch (error) {
        console.error('Error creating link token:', error);
        
        let errorMessage = 'Unable to connect to Plaid. ';
        if (error.name === 'AbortError') {
          errorMessage += 'Connection timeout. Please check your internet connection.';
        } else if (error.message.includes('CORS')) {
          errorMessage += 'Server configuration issue. Please contact support.';
        } else if (error.message.includes('Failed to fetch')) {
          errorMessage += 'Network error. Please check your connection and try again.';
        } else {
          errorMessage += error.message || 'Please try again later.';
        }
        
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    createLinkToken();
  }, [userId, retryCount]);

  const onSuccessCallback = useCallback(
    (public_token, metadata) => {
      // Send public_token to backend
      onSuccess(public_token, metadata);
    },
    [onSuccess]
  );

  const config = {
    token: linkToken,
    onSuccess: onSuccessCallback,
    onExit: onExit,
  };

  const { open, ready } = usePlaidLink(config);

  const handleRetry = () => {
    setRetryCount(prev => prev + 1);
  };

  if (loading) {
    return (
      <button className="btn-primary" disabled>
        Loading...
      </button>
    );
  }

  if (error) {
    return (
      <div style={{ 
        padding: '12px', 
        background: 'rgba(239, 68, 68, 0.1)', 
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '8px',
        color: '#ef4444',
        maxWidth: '400px'
      }}>
        <p style={{ margin: '0 0 10px 0', fontWeight: '500', fontSize: '14px' }}>
          ⚠️ Unable to Initialize Bank Connection
        </p>
        <p style={{ margin: '0 0 12px 0', fontSize: '13px', lineHeight: '1.4' }}>
          {error}
        </p>
        <button
          onClick={handleRetry}
          style={{
            background: '#ef4444',
            color: '#fff',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500'
          }}
        >
          🔄 Try Again
        </button>
      </div>
    );
  }

  return (
    <button
      className="btn-primary"
      onClick={() => open()}
      disabled={!ready || !linkToken}
    >
      {buttonText}
    </button>
  );
};

export default PlaidLink;
