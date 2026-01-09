import React from 'react';
import { getMonthlyEquivalent } from '../utils/subscriptionCalculations';

const SubscriptionCard = ({ subscription, onEdit, onDelete, onCancel }) => {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getBillingCycleDisplay = (cycle, cost) => {
    switch (cycle) {
      case 'Monthly':
        return `${formatCurrency(cost)}/mo`;
      case 'Annual':
        return `${formatCurrency(cost)}/yr`;
      case 'Quarterly':
        return `${formatCurrency(cost)}/qtr`;
      default:
        return formatCurrency(cost);
    }
  };

  const getCategoryIcon = (category) => {
    const icons = {
      'Housing': '🏠',
      'Auto & Transportation': '🚗',
      'Credit Cards & Loans': '💳',
      'Utilities & Home Services': '💡',
      'Phone & Internet': '📱',
      'Insurance & Healthcare': '🏥',
      'Subscriptions & Entertainment': '🎬',
      'Software & Technology': '💻',
      'Fitness & Gym': '💪',
      'Personal Care': '💅',
      'Financial Services': '💰',
      'Food': '🍔',
      'Shopping': '🛍️',
      'Storage': '☁️',
      'Other': '📦'
    };
    return icons[category] || '📦';
  };

  return (
    <div className={`subscription-card ${subscription.status}`}>
      <div className="subscription-card-header">
        <div className="subscription-info">
          <h3 className="subscription-name">
            {getCategoryIcon(subscription.category)} {subscription.name}
          </h3>
          <div className="subscription-cost">
            {getBillingCycleDisplay(subscription.billingCycle, subscription.cost)}
          </div>
        </div>
      </div>
      
      <div className="subscription-meta">
        <span className="subscription-category">{subscription.category}</span>
        <span className="subscription-separator">•</span>
        <span className="subscription-payment">{subscription.paymentMethod}</span>
        <span className="subscription-separator">•</span>
        <span className="subscription-renewal">
          Renews {formatDate(subscription.nextRenewal)}
        </span>
        {subscription.autoRenew && (
          <>
            <span className="subscription-separator">•</span>
            <span className="subscription-auto-renew">🔄 Auto</span>
          </>
        )}
        {subscription.essential && (
          <>
            <span className="subscription-separator">•</span>
            <span className="subscription-essential">⭐</span>
          </>
        )}
      </div>

      {subscription.billingCycle === 'Annual' && (
        <div className="subscription-monthly-equiv">
          ({formatCurrency(getMonthlyEquivalent(subscription))}/mo equivalent)
        </div>
      )}

      {subscription.notes && (
        <div className="subscription-notes">{subscription.notes}</div>
      )}

      <div className="subscription-actions">
        <button 
          className="action-btn edit-btn" 
          onClick={() => onEdit(subscription)}
          title="Edit subscription"
        >
          ✏️ Edit
        </button>
        <button 
          className="action-btn delete-btn" 
          onClick={() => onDelete(subscription)}
          title="Delete subscription"
        >
          🗑️ Delete
        </button>
        {subscription.status === 'active' && (
          <button 
            className="action-btn cancel-btn" 
            onClick={() => onCancel(subscription)}
            title="Cancel subscription"
          >
            ❌ Cancel Sub
          </button>
        )}
      </div>
    </div>
  );
};

export default SubscriptionCard;
