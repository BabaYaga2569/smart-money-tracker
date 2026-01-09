import React, { useState, useEffect } from 'react';
import { getTypeFromCategory, SUBSCRIPTION_CATEGORIES, RECURRING_BILL_CATEGORIES } from '../utils/recurringDetection';

const BILLING_CYCLES = ['Monthly', 'Annual', 'Quarterly'];

const AddSubscriptionForm = ({ subscription, accounts, onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    name: '',
    category: 'Streaming',
    cost: '',
    billingCycle: 'Monthly',
    paymentMethod: '',
    paymentMethodId: '',
    nextRenewal: '',
    autoRenew: true,
    essential: false,
    notes: '',
    status: 'active',
    type: 'subscription' // Default to subscription
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (subscription) {
      setFormData({
        name: subscription.name || '',
        category: subscription.category || 'Streaming',
        cost: subscription.cost || '',
        billingCycle: subscription.billingCycle || 'Monthly',
        paymentMethod: subscription.paymentMethod || '',
        paymentMethodId: subscription.paymentMethodId || '',
        nextRenewal: subscription.nextRenewal || '',
        autoRenew: subscription.autoRenew !== undefined ? subscription.autoRenew : true,
        essential: subscription.essential || false,
        notes: subscription.notes || '',
        status: subscription.status || 'active',
        type: subscription.type || getTypeFromCategory(subscription.category || 'Streaming')
      });
    }
  }, [subscription]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;
    
    setFormData(prev => {
      const updated = {
        ...prev,
        [name]: newValue
      };
      
      // Auto-assign type when category changes
      if (name === 'category') {
        updated.type = getTypeFromCategory(value);
      }
      
      return updated;
    });
    
    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handlePaymentMethodChange = (e) => {
    const selectedAccountId = e.target.value;
    const selectedAccount = accounts.find(acc => acc.account_id === selectedAccountId);
    
    setFormData(prev => ({
      ...prev,
      paymentMethodId: selectedAccountId,
      paymentMethod: selectedAccount ? (selectedAccount.official_name || selectedAccount.name) : ''
    }));
  };

  const validate = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }
    
    if (!formData.cost || parseFloat(formData.cost) <= 0) {
      newErrors.cost = 'Cost must be greater than 0';
    }
    
    if (!formData.nextRenewal) {
      newErrors.nextRenewal = 'Next renewal date is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (validate()) {
      const subscriptionData = {
        ...formData,
        cost: parseFloat(formData.cost),
        type: formData.type || getTypeFromCategory(formData.category), // Ensure type is set
        priceHistory: subscription?.priceHistory || [
          { date: new Date().toISOString().split('T')[0], price: parseFloat(formData.cost) }
        ]
      };
      
      onSave(subscriptionData);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal subscription-form-modal">
        <div className="modal-header">
          <h3>{subscription ? 'Edit Recurring Bill' : 'Add New Recurring Bill'}</h3>
          <button className="close-btn" onClick={onCancel}>&times;</button>
        </div>
        
        <div className="modal-body">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="name">Name *</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g., Netflix"
              />
              {errors.name && <span className="error-text">{errors.name}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="category">Category</label>
              <select
                id="category"
                name="category"
                value={formData.category}
                onChange={handleChange}
              >
                <optgroup label="Recurring Bills">
                  <option value="Housing">🏠 Housing</option>
                  <option value="Auto & Transportation">🚗 Auto & Transportation</option>
                  <option value="Credit Cards & Loans">💳 Credit Cards & Loans</option>
                  <option value="Utilities & Home Services">💡 Utilities & Home Services</option>
                  <option value="Phone & Internet">📱 Phone & Internet</option>
                  <option value="Insurance & Healthcare">🏥 Insurance & Healthcare</option>
                  <option value="Personal Care">💅 Personal Care</option>
                  <option value="Financial Services">💰 Financial Services</option>
                </optgroup>
                <optgroup label="Subscriptions">
                  <option value="Subscriptions & Entertainment">🎬 Subscriptions & Entertainment</option>
                  <option value="Software & Technology">💻 Software & Technology</option>
                  <option value="Fitness & Gym">💪 Fitness & Gym</option>
                </optgroup>
                <optgroup label="Other">
                  <option value="Food">🍔 Food</option>
                  <option value="Shopping">🛍️ Shopping</option>
                  <option value="Storage">☁️ Storage</option>
                  <option value="Other">📦 Other</option>
                </optgroup>
              </select>
              <small style={{ display: 'block', marginTop: '4px', color: '#888', fontSize: '12px' }}>
                Type: {formData.type === 'subscription' ? '💳 Subscription' : '🧾 Recurring Bill'}
              </small>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="cost">Cost *</label>
                <input
                  type="number"
                  id="cost"
                  name="cost"
                  value={formData.cost}
                  onChange={handleChange}
                  placeholder="15.99"
                  step="0.01"
                  min="0"
                />
                {errors.cost && <span className="error-text">{errors.cost}</span>}
              </div>

              <div className="form-group">
                <label htmlFor="billingCycle">Billing Cycle</label>
                <select
                  id="billingCycle"
                  name="billingCycle"
                  value={formData.billingCycle}
                  onChange={handleChange}
                >
                  {BILLING_CYCLES.map(cycle => (
                    <option key={cycle} value={cycle}>{cycle}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="paymentMethodId">Payment Method</label>
              <select
                id="paymentMethodId"
                name="paymentMethodId"
                value={formData.paymentMethodId}
                onChange={handlePaymentMethodChange}
              >
                <option value="">Select an account</option>
                {accounts && accounts.map(acc => (
                  <option key={acc.account_id} value={acc.account_id}>
                    {acc.official_name || acc.name} {acc.mask ? `(...${acc.mask})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="nextRenewal">Next Renewal Date *</label>
              <input
                type="date"
                id="nextRenewal"
                name="nextRenewal"
                value={formData.nextRenewal}
                onChange={handleChange}
              />
              {errors.nextRenewal && <span className="error-text">{errors.nextRenewal}</span>}
            </div>

            <div className="form-row">
              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    name="autoRenew"
                    checked={formData.autoRenew}
                    onChange={handleChange}
                  />
                  <span>Auto-Renew</span>
                </label>
              </div>

              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    name="essential"
                    checked={formData.essential}
                    onChange={handleChange}
                  />
                  <span>Essential ⭐</span>
                </label>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                placeholder="e.g., Shared family plan"
                rows="3"
              />
            </div>

            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={onCancel}>
                Cancel
              </button>
              <button type="submit" className="btn-primary">
                {subscription ? 'Update' : 'Add'} Recurring Bill
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AddSubscriptionForm;
