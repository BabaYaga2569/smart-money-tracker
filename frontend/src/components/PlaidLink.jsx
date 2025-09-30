import React, { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';

const PlaidLink = ({ onSuccess, onExit, userId, buttonText = "Connect Bank" }) => {
  const [linkToken, setLinkToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const createLinkToken = async () => {
      try {
        const response = await fetch('http://localhost:5000/api/plaid/create_link_token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId: userId || 'steve-colburn' }),
        });

        const data = await response.json();
        setLinkToken(data.link_token);
      } catch (error) {
        console.error('Error creating link token:', error);
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
