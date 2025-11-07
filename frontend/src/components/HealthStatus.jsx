import { useState, useEffect } from 'react';
import './HealthStatus.css';

const HealthStatus = () => {
  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const fetchHealthStatus = async () => {
    try {
      setLoading(true);
      const apiUrl = import.meta.env.VITE_API_URL || 'https://smart-money-tracker-09ks.onrender.com';
      const response = await fetch(`${apiUrl}/api/health`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setHealthData(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching health status:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fetch immediately on mount
    fetchHealthStatus();

    // Set up auto-refresh every 60 seconds
    const intervalId = setInterval(() => {
      fetchHealthStatus();
    }, 60000);

    // Cleanup interval on unmount
    return () => clearInterval(intervalId);
  }, []);

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'healthy':
      case 'ok':
        return '#00ff88';
      case 'degraded':
      case 'warning':
        return '#f59e0b';
      case 'unhealthy':
      case 'error':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'healthy':
      case 'ok':
        return '✅';
      case 'degraded':
      case 'warning':
        return '⚠️';
      case 'unhealthy':
      case 'error':
        return '❌';
      default:
        return '⏳';
    }
  };

  const formatUptime = (seconds) => {
    if (!seconds) return 'N/A';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  if (loading && !healthData) {
    return (
      <div className="health-status-widget loading">
        <div className="health-status-icon">⏳</div>
        <div className="health-status-text">
          <div className="health-status-title">System Health</div>
          <div className="health-status-subtitle">Loading...</div>
        </div>
      </div>
    );
  }

  if (error && !healthData) {
    return (
      <div className="health-status-widget error">
        <div className="health-status-icon">❌</div>
        <div className="health-status-text">
          <div className="health-status-title">System Health</div>
          <div className="health-status-subtitle">Error: {error}</div>
        </div>
      </div>
    );
  }

  const overallStatus = healthData?.status || 'unknown';
  const firebaseStatus = healthData?.services?.firebase?.status || 'unknown';
  const plaidStatus = healthData?.services?.plaid?.status || 'unknown';

  return (
    <>
      <div 
        className={`health-status-widget ${overallStatus}`}
        onClick={() => setShowModal(true)}
        title="Click for details"
      >
        <div className="health-status-icon">
          {getStatusIcon(overallStatus)}
        </div>
        <div className="health-status-text">
          <div className="health-status-title">System Health</div>
          <div className="health-status-subtitle">
            <span className="service-indicator" style={{ color: getStatusColor(firebaseStatus) }}>
              Firebase
            </span>
            {' • '}
            <span className="service-indicator" style={{ color: getStatusColor(plaidStatus) }}>
              Plaid
            </span>
          </div>
        </div>
        <div className="health-status-badge" style={{ backgroundColor: getStatusColor(overallStatus) }}>
          {overallStatus}
        </div>
      </div>

      {showModal && (
        <div className="health-status-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="health-status-modal" onClick={(e) => e.stopPropagation()}>
            <div className="health-status-modal-header">
              <h2>System Health Details</h2>
              <button 
                className="health-status-modal-close"
                onClick={() => setShowModal(false)}
              >
                ×
              </button>
            </div>

            <div className="health-status-modal-body">
              {/* Overall Status */}
              <div className="health-section">
                <h3>Overall Status</h3>
                <div className="health-item">
                  <span className="health-label">Status:</span>
                  <span className="health-value" style={{ color: getStatusColor(overallStatus) }}>
                    {getStatusIcon(overallStatus)} {overallStatus}
                  </span>
                </div>
                <div className="health-item">
                  <span className="health-label">Uptime:</span>
                  <span className="health-value">{formatUptime(healthData?.uptime)}</span>
                </div>
                <div className="health-item">
                  <span className="health-label">Last Updated:</span>
                  <span className="health-value">
                    {healthData?.timestamp ? new Date(healthData.timestamp).toLocaleString() : 'N/A'}
                  </span>
                </div>
              </div>

              {/* Services Status */}
              <div className="health-section">
                <h3>Services</h3>
                
                {/* Firebase */}
                <div className="service-card">
                  <div className="service-header">
                    <span className="service-name">
                      {getStatusIcon(firebaseStatus)} Firebase
                    </span>
                    <span 
                      className="service-status"
                      style={{ color: getStatusColor(firebaseStatus) }}
                    >
                      {firebaseStatus}
                    </span>
                  </div>
                  <div className="service-details">
                    <div className="health-item">
                      <span className="health-label">Latency:</span>
                      <span className="health-value">
                        {healthData?.services?.firebase?.latency || 'N/A'}
                      </span>
                    </div>
                    <div className="health-item">
                      <span className="health-label">Message:</span>
                      <span className="health-value">
                        {healthData?.services?.firebase?.message || 'No message'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Plaid */}
                <div className="service-card">
                  <div className="service-header">
                    <span className="service-name">
                      {getStatusIcon(plaidStatus)} Plaid
                    </span>
                    <span 
                      className="service-status"
                      style={{ color: getStatusColor(plaidStatus) }}
                    >
                      {plaidStatus}
                    </span>
                  </div>
                  <div className="service-details">
                    <div className="health-item">
                      <span className="health-label">Latency:</span>
                      <span className="health-value">
                        {healthData?.services?.plaid?.latency || 'N/A'}
                      </span>
                    </div>
                    <div className="health-item">
                      <span className="health-label">Message:</span>
                      <span className="health-value">
                        {healthData?.services?.plaid?.message || 'No message'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Performance Metrics */}
              {healthData?.performance && (
                <div className="health-section">
                  <h3>Performance</h3>
                  <div className="health-item">
                    <span className="health-label">Total Requests:</span>
                    <span className="health-value">{healthData.performance.totalRequests}</span>
                  </div>
                  <div className="health-item">
                    <span className="health-label">Avg Response Time:</span>
                    <span className="health-value">{healthData.performance.avgResponseTime}</span>
                  </div>
                  <div className="health-item">
                    <span className="health-label">Requests/Minute:</span>
                    <span className="health-value">{healthData.performance.requestsPerMinute}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="health-status-modal-footer">
              <button 
                className="refresh-button"
                onClick={(e) => {
                  e.stopPropagation();
                  fetchHealthStatus();
                }}
                disabled={loading}
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
              <button 
                className="close-button"
                onClick={() => setShowModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default HealthStatus;
