import React from 'react';
import PlaidConnectionManager from '../utils/PlaidConnectionManager';
import './PlaidErrorModal.css';

const PlaidErrorModal = ({ isOpen, onClose, onRetry }) => {
  if (!isOpen) return null;

  const errorMessage = PlaidConnectionManager.getErrorMessage();
  const troubleshootingSteps = PlaidConnectionManager.getTroubleshootingSteps();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal plaid-error-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>❌ Plaid Connection Error</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="error-message">
            <p>{errorMessage || 'Unable to connect to Plaid. Please try again.'}</p>
          </div>
          
          {troubleshootingSteps && troubleshootingSteps.length > 0 && (
            <div className="troubleshooting-section">
              <h4>💡 Troubleshooting Steps:</h4>
              <ul>
                {troubleshootingSteps.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
          {onRetry && (
            <button className="btn-primary" onClick={onRetry}>
              🔄 Retry Connection
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlaidErrorModal;
