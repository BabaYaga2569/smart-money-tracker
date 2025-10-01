import React, { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';

const PlaidLink = ({ onSuccess, onExit, userId, buttonText = "Connect Bank" }) => {
  const [linkToken, setLinkToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const createLinkToken = async () => {
      try {
        // Add timeout to prevent infinite loading
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/plaid/create_link_token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId: userId || 'steve-colburn' }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Failed to create link token: ${response.status}`);
        }

        const data = await response.json();
        
        if (!data.link_token) {
          throw new Error('No link token received from server');
        }
        
        setLinkToken(data.link_token);
        setError(null);
      } catch (error) {
        console.error('Error creating link token:', error);
        setError(error.name === 'AbortError' 
          ? 'Connection timeout. Please check your internet connection.' 
          : 'Unable to connect to Plaid. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    createLinkToken();
  }, [userId]);

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
        padding: '10px', 
        background: 'rgba(239, 68, 68, 0.1)', 
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '8px',
        color: '#ef4444'
      }}>
        <p style={{ margin: '0 0 8px 0', fontWeight: '500' }}>⚠️ Unable to Connect Bank</p>
        <p style={{ margin: '0', fontSize: '14px' }}>{error}</p>
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
