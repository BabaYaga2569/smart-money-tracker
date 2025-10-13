import React, { useState, useEffect } from 'react';
import { getPendingDetections, dismissAllDetections } from '../utils/detectionStorage';
import './SubscriptionDetectionBanner.css';

const SubscriptionDetectionBanner = ({ onReviewClick }) => {
  const [detections, setDetections] = useState([]);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    loadDetections();
    
    // Listen for detection updates
    const handleUpdate = () => {
      loadDetections();
    };
    
    window.addEventListener('detectionUpdate', handleUpdate);
    window.addEventListener('detectionDismissed', handleUpdate);
    window.addEventListener('detectionRemoved', handleUpdate);
    window.addEventListener('detectionsCleared', handleUpdate);
    
    return () => {
      window.removeEventListener('detectionUpdate', handleUpdate);
      window.removeEventListener('detectionDismissed', handleUpdate);
      window.removeEventListener('detectionRemoved', handleUpdate);
      window.removeEventListener('detectionsCleared', handleUpdate);
    };
  }, []);

  const loadDetections = () => {
    const pending = getPendingDetections();
    setDetections(pending);
    setIsVisible(pending.length > 0);
  };

  const handleDismiss = () => {
    dismissAllDetections();
    setIsVisible(false);
  };

  const handleReview = () => {
    if (onReviewClick) {
      onReviewClick();
    }
  };

  if (!isVisible || detections.length === 0) {
    return null;
  }

  // Get top 3 merchant names for preview
  const topMerchants = detections.slice(0, 3).map(d => d.merchantName);
  const remainingCount = detections.length - topMerchants.length;

  return (
    <div className="detection-banner">
      <div className="detection-banner-content">
        <div className="detection-banner-icon">🤖</div>
        <div className="detection-banner-text">
          <strong>We detected {detections.length} new subscription{detections.length > 1 ? 's' : ''}!</strong>
          <span className="detection-preview">
            {topMerchants.join(', ')}
            {remainingCount > 0 && ` and ${remainingCount} more`}
          </span>
        </div>
        <div className="detection-banner-actions">
          <button className="btn-review" onClick={handleReview}>
            Review Suggestions
          </button>
          <button className="btn-dismiss" onClick={handleDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionDetectionBanner;
