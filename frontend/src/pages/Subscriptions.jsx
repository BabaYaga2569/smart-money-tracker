import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import SubscriptionCard from '../components/SubscriptionCard';
import AddSubscriptionForm from '../components/AddSubscriptionForm';
import {
  calculateMonthlyTotal,
  calculateAnnualTotal,
  getUpcomingRenewals,
  countActiveSubscriptions
} from '../utils/subscriptionCalculations';
import './Subscriptions.css';

const Subscriptions = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [subscriptions, setSubscriptions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingSubscription, setEditingSubscription] = useState(null);
  const [notification, setNotification] = useState(null);
  
  // Filters
  const [filterCycle, setFilterCycle] = useState('all');
  const [filterEssential, setFilterEssential] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('nextRenewal');

  useEffect(() => {
    if (!currentUser) return;

    loadAccounts();
    
    // Set up real-time listener for subscriptions
    const subscriptionsRef = collection(db, 'users', currentUser.uid, 'subscriptions');
    const unsubscribe = onSnapshot(
      subscriptionsRef,
      (snapshot) => {
        const subs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setSubscriptions(subs);
        setLoading(false);
      },
      (error) => {
        console.error('Error loading subscriptions:', error);
        showNotification('Error loading subscriptions', 'error');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [currentUser]);

  const loadAccounts = async () => {
    try {
      const settingsDocRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      const settingsDocSnap = await getDoc(settingsDocRef);
      
      if (settingsDocSnap.exists()) {
        const data = settingsDocSnap.data();
        const plaidAccountsList = data.plaidAccounts || [];
        setAccounts(plaidAccountsList);
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
    }
  };

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleAddSubscription = () => {
    setEditingSubscription(null);
    setShowForm(true);
  };

  const handleEditSubscription = (subscription) => {
    setEditingSubscription(subscription);
    setShowForm(true);
  };

  const handleSaveSubscription = async (subscriptionData) => {
    try {
      if (editingSubscription) {
        // Update existing subscription
        const subscriptionRef = doc(db, 'users', currentUser.uid, 'subscriptions', editingSubscription.id);
        await updateDoc(subscriptionRef, subscriptionData);
        showNotification('Subscription updated successfully');
      } else {
        // Add new subscription
        const subscriptionsRef = collection(db, 'users', currentUser.uid, 'subscriptions');
        await addDoc(subscriptionsRef, subscriptionData);
        showNotification('Subscription added successfully');
      }
      
      setShowForm(false);
      setEditingSubscription(null);
    } catch (error) {
      console.error('Error saving subscription:', error);
      showNotification('Error saving subscription', 'error');
    }
  };

  const handleDeleteSubscription = async (subscription) => {
    if (!window.confirm(`Are you sure you want to delete ${subscription.name}?`)) {
      return;
    }

    try {
      const subscriptionRef = doc(db, 'users', currentUser.uid, 'subscriptions', subscription.id);
      await deleteDoc(subscriptionRef);
      showNotification('Subscription deleted successfully');
    } catch (error) {
      console.error('Error deleting subscription:', error);
      showNotification('Error deleting subscription', 'error');
    }
  };

  const handleCancelSubscription = async (subscription) => {
    if (!window.confirm(`Mark ${subscription.name} as cancelled?`)) {
      return;
    }

    try {
      const subscriptionRef = doc(db, 'users', currentUser.uid, 'subscriptions', subscription.id);
      await updateDoc(subscriptionRef, {
        status: 'cancelled',
        cancelledDate: new Date().toISOString()
      });
      showNotification('Subscription cancelled successfully');
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      showNotification('Error cancelling subscription', 'error');
    }
  };

  // Filter and sort subscriptions
  const getFilteredSubscriptions = () => {
    let filtered = subscriptions.filter(sub => sub.status === 'active');

    // Filter by billing cycle
    if (filterCycle !== 'all') {
      filtered = filtered.filter(sub => sub.billingCycle === filterCycle);
    }

    // Filter by essential
    if (filterEssential === 'essential') {
      filtered = filtered.filter(sub => sub.essential);
    } else if (filterEssential === 'nonessential') {
      filtered = filtered.filter(sub => !sub.essential);
    }

    // Filter by category
    if (filterCategory !== 'all') {
      filtered = filtered.filter(sub => sub.category === filterCategory);
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(sub =>
        sub.name.toLowerCase().includes(term) ||
        sub.category.toLowerCase().includes(term) ||
        sub.notes?.toLowerCase().includes(term)
      );
    }

    // Sort
    switch (sortBy) {
      case 'cost':
        filtered.sort((a, b) => b.cost - a.cost);
        break;
      case 'name':
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'nextRenewal':
      default:
        filtered.sort((a, b) => new Date(a.nextRenewal) - new Date(b.nextRenewal));
        break;
    }

    return filtered;
  };

  const filteredSubscriptions = getFilteredSubscriptions();
  const activeSubscriptions = subscriptions.filter(sub => sub.status === 'active');
  const monthlyTotal = calculateMonthlyTotal(activeSubscriptions);
  const annualTotal = calculateAnnualTotal(activeSubscriptions);
  const activeCount = countActiveSubscriptions(subscriptions);
  const upcomingRenewals = getUpcomingRenewals(activeSubscriptions, 7);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div className="subscriptions-page">
        <div className="loading">Loading subscriptions...</div>
      </div>
    );
  }

  const categories = [...new Set(activeSubscriptions.map(sub => sub.category))];

  return (
    <div className="subscriptions-page">
      {/* Header */}
      <div className="page-header">
        <h1>💳 Subscriptions</h1>
        <button className="btn-primary add-subscription-btn" onClick={handleAddSubscription}>
          + Add Subscription
        </button>
      </div>

      {/* Summary Section */}
      <div className="subscription-summary">
        <div className="summary-card">
          <div className="summary-label">Monthly Burn</div>
          <div className="summary-value">{formatCurrency(monthlyTotal)}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Annual Cost</div>
          <div className="summary-value">{formatCurrency(annualTotal)}</div>
        </div>
        <div className="summary-card">
          <div className="summary-label">Active Subscriptions</div>
          <div className="summary-value">{activeCount}</div>
        </div>
      </div>

      {/* Upcoming Renewals */}
      {upcomingRenewals.length > 0 && (
        <div className="upcoming-renewals">
          <h3>🔔 Upcoming Renewals (Next 7 Days)</h3>
          <div className="renewals-list">
            {upcomingRenewals.map(sub => (
              <div key={sub.id} className="renewal-item">
                • {sub.name} - {formatCurrency(sub.cost)} on {formatDate(sub.nextRenewal)} ({sub.paymentMethod})
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="subscriptions-filters">
        <button
          className={`filter-btn ${filterCycle === 'all' ? 'active' : ''}`}
          onClick={() => setFilterCycle('all')}
        >
          All
        </button>
        <button
          className={`filter-btn ${filterCycle === 'Monthly' ? 'active' : ''}`}
          onClick={() => setFilterCycle('Monthly')}
        >
          Monthly
        </button>
        <button
          className={`filter-btn ${filterCycle === 'Annual' ? 'active' : ''}`}
          onClick={() => setFilterCycle('Annual')}
        >
          Annual
        </button>
        <button
          className={`filter-btn ${filterEssential === 'essential' ? 'active' : ''}`}
          onClick={() => setFilterEssential('essential')}
        >
          Essential Only
        </button>

        <select
          className="category-filter"
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
        >
          <option value="all">All Categories</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        <select
          className="sort-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="nextRenewal">Sort by: Next Renewal</option>
          <option value="cost">Sort by: Cost</option>
          <option value="name">Sort by: Name</option>
        </select>

        <input
          type="text"
          className="search-input"
          placeholder="🔍 Search subscriptions..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Subscriptions List */}
      <div className="subscriptions-list">
        {filteredSubscriptions.length > 0 ? (
          filteredSubscriptions.map(sub => (
            <SubscriptionCard
              key={sub.id}
              subscription={sub}
              onEdit={handleEditSubscription}
              onDelete={handleDeleteSubscription}
              onCancel={handleCancelSubscription}
            />
          ))
        ) : (
          <div className="no-subscriptions">
            <h3>No subscriptions found</h3>
            <p>Add your first subscription to start tracking your recurring expenses!</p>
            <button className="btn-primary" onClick={handleAddSubscription}>
              + Add Subscription
            </button>
          </div>
        )}
      </div>

      {/* Add/Edit Form Modal */}
      {showForm && (
        <AddSubscriptionForm
          subscription={editingSubscription}
          accounts={accounts}
          onSave={handleSaveSubscription}
          onCancel={() => {
            setShowForm(false);
            setEditingSubscription(null);
          }}
        />
      )}

      {/* Notification */}
      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}
    </div>
  );
};

export default Subscriptions;
