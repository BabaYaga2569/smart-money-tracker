import React, { useCallback, useEffect, useState } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import PlaidConnectionManager from '../utils/PlaidConnectionManager';

const PlaidLink = ({ onSuccess, onExit, userId, buttonText = "Connect Bank" }) => {
  const [linkToken, setLinkToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [errorType, setErrorType] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const createLinkToken = async () => {
      try {
        setLoading(true);
        setError(null);
        setErrorType(null);
        
        console.log('[PlaidLink] Creating link token for user:', userId || 'steve-colburn');
        
        // Calculate timeout with exponential backoff for retries
        const baseTimeout = 10000; // 10 seconds
        const timeout = baseTimeout + (retryCount * 5000); // Add 5s per retry
        
        // Add timeout to prevent infinite loading
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const apiUrl = import.meta.env.VITE_API_URL || 'https://smart-money-tracker-09ks.onrender.com';
        
        // Validate API URL before using it
        if (!apiUrl || typeof apiUrl !== 'string') {
          throw new Error('API URL is not configured');
        }
        
        console.log('[PlaidLink] Backend API URL:', apiUrl);
        
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
          let errorData = {};
          try {
            errorData = await response.json();
          } catch (parseError) {
            console.error('[PlaidLink] Failed to parse error response:', parseError);
          }
          console.error('[PlaidLink] Failed to create link token:', response.status, errorData);
          throw new Error(errorData?.error || `Failed to create link token: ${response.status}`);
        }

        let data;
        try {
          data = await response.json();
        } catch (parseError) {
          console.error('[PlaidLink] Failed to parse response:', parseError);
          throw new Error('Invalid response from server');
        }
        
        if (!data?.link_token) {
          console.error('[PlaidLink] No link token in response:', data);
          throw new Error('No link token received from server');
        }
        
        console.log('[PlaidLink] Successfully created link token');
        setLinkToken(data.link_token);
        setError(null);
        setErrorType(null);
      } catch (error) {
        console.error('[PlaidLink] Error creating link token:', error);
        
        let errorMessage = 'Unable to connect to Plaid. ';
        let type = 'unknown';
        
        if (error.name === 'AbortError') {
          errorMessage += 'Connection timeout. The backend server may be slow or unreachable.';
          type = 'timeout';
          console.error('[PlaidLink] Request timed out after 10 seconds');
        } else if (error.message.includes('CORS')) {
          errorMessage += 'CORS configuration issue. This typically indicates a server configuration problem.';
          type = 'cors';
          console.error('[PlaidLink] CORS error detected');
        } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          errorMessage += 'Network error. Please check your internet connection or the backend may be down.';
          type = 'network';
          console.error('[PlaidLink] Network error - backend may be unreachable');
        } else {
          errorMessage += error.message || 'Please try again later.';
          type = 'api';
        }
        
        setError(errorMessage);
        setErrorType(type);
      } finally {
        setLoading(false);
      }
    };

    createLinkToken();
  }, [userId, retryCount]);

  const onSuccessCallback = useCallback(
    (public_token, metadata) => {
      console.log('[PlaidLink] Successfully connected to bank:', metadata.institution?.name);
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
    console.log('[PlaidLink] Retrying link token creation (attempt:', retryCount + 1, ')');
    setRetryCount(prev => prev + 1);
  };

  const getRetryDelay = () => {
    if (retryCount === 0) return '';
    const delaySeconds = 5 * retryCount;
    return ` (${delaySeconds}s extended timeout)`;
  };

  const getTroubleshootingSteps = () => {
    switch (errorType) {
      case 'timeout':
        return [
          'Check if the backend server is running',
          'Verify VITE_API_URL is set correctly',
          'The server may be slow to respond - try again in a moment'
        ];
      case 'cors':
        return [
          'This is a server configuration issue',
          'Check backend CORS settings',
          'Verify the backend URL is correct',
          'Contact support if the problem persists'
        ];
      case 'network':
        return [
          'Check your internet connection',
          'Verify the backend server is running',
          'Try accessing the backend directly to test connectivity',
          'Check browser console for detailed network errors'
        ];
      case 'api':
        return [
          'The Plaid API may be experiencing issues',
          'Check Plaid status page',
          'Verify Plaid credentials are configured correctly',
          'Try again in a few minutes'
        ];
      default:
        return [
          'Refresh the page and try again',
          'Check browser console for detailed errors',
          'Contact support if the problem persists'
        ];
    }
  };

  if (loading) {
    return (
      <button className="btn-primary" disabled>
        Loading...
      </button>
    );
  }

  if (error) {
    const troubleshootingSteps = getTroubleshootingSteps();
    
    return (
      <div style={{ 
        padding: '16px', 
        background: 'rgba(239, 68, 68, 0.1)', 
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '8px',
        color: '#ef4444',
        maxWidth: '500px'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '12px' }}>
          <span style={{ fontSize: '20px', marginRight: '8px' }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <p style={{ margin: '0 0 4px 0', fontWeight: '600', fontSize: '14px' }}>
              Unable to Initialize Bank Connection
            </p>
            <p style={{ margin: '0', fontSize: '13px', lineHeight: '1.5', color: '#dc2626' }}>
              {error}
            </p>
          </div>
        </div>
        
        {troubleshootingSteps.length > 0 && (
          <div style={{ 
            marginTop: '12px',
            paddingTop: '12px',
            borderTop: '1px solid rgba(239, 68, 68, 0.2)'
          }}>
            <p style={{ margin: '0 0 8px 0', fontWeight: '600', fontSize: '13px' }}>
              💡 Troubleshooting Steps:
            </p>
            <ul style={{ 
              margin: '0',
              paddingLeft: '20px',
              fontSize: '12px',
              lineHeight: '1.6'
            }}>
              {troubleshootingSteps.map((step, idx) => (
                <li key={idx} style={{ marginBottom: '4px' }}>{step}</li>
              ))}
            </ul>
          </div>
        )}
        
        <button
          onClick={handleRetry}
          style={{
            marginTop: '12px',
            background: '#ef4444',
            color: '#fff',
            border: 'none',
            padding: '10px 16px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
            width: '100%'
          }}
        >
          🔄 Try Again{retryCount > 0 ? ` (Retry ${retryCount})${getRetryDelay()}` : ''}
        </button>
      </div>
    );
  }

  return (
    <button
      className="btn-primary"
      onClick={() => {
        console.log('[PlaidLink] Opening Plaid Link UI');
        open();
      }}
      disabled={!ready || !linkToken}
    >
      {buttonText}
    </button>
  );
};

export default PlaidLink;
