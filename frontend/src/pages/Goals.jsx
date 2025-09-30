import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc, collection, addDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { formatDateForDisplay, formatDateForInput } from '../utils/DateUtils';
import { 
  calculateGoalProgress, 
  calculateRemainingAmount, 
  formatTimelineMessage,
  calculateRequiredMonthlyContribution,
  getGoalStatus,
  calculateGoalMetrics,
  calculateEmergencyFundRecommendation
} from '../utils/GoalUtils';
import { 
  GOAL_CATEGORIES, 
  GOAL_PRIORITIES, 
  GOAL_STATUSES,
  getGoalCategoryIcon, 
  getGoalCategoryColor,
  getPriorityColor,
  getGoalTemplate
} from '../constants/goals';
import { TRANSACTION_CATEGORIES } from '../constants/categories';
import './Goals.css';

const Goals = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [goals, setGoals] = useState([]);
  const [accounts, setAccounts] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [notification, setNotification] = useState({ message: '', type: '' });
  const [monthlyExpenses, setMonthlyExpenses] = useState(0);
  
  // Filters and sorting
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('priority');
  
  // New goal form
  const [newGoal, setNewGoal] = useState({
    name: '',
    category: '',
    targetAmount: '',
    currentAmount: '',
    targetDate: '',
    monthlyContribution: '',
    autoContribute: false,
    autoContributionDay: '1',
    linkedCategory: '',
    priority: 'medium',
    account: '',
    notes: '',
    status: 'active'
  });

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadGoals(),
        loadAccounts(),
        loadMonthlyExpenses()
      ]);
    } catch (error) {
      console.error('Error loading initial data:', error);
      showNotification('Error loading data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadGoals = async () => {
    try {
      const goalsRef = collection(db, 'users', 'steve-colburn', 'goals');
      const querySnapshot = await getDocs(goalsRef);
      const goalsData = [];
      
      querySnapshot.forEach((doc) => {
        goalsData.push({ id: doc.id, ...doc.data() });
      });
      
      // If no goals from Firebase, add demo data for demonstration
      if (goalsData.length === 0) {
        const demoGoals = [
          {
            id: 'demo-1',
            name: 'Emergency Fund',
            category: 'Emergency Fund',
            targetAmount: 6000,
            currentAmount: 2400,
            targetDate: '2025-06-01',
            monthlyContribution: 400,
            priority: 'high',
            account: 'savings',
            notes: 'Build 6 months of expenses for financial security',
            status: 'active',
            createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
            updatedAt: Date.now()
          },
          {
            id: 'demo-2',
            name: 'Hawaii Vacation',
            category: 'Vacation',
            targetAmount: 4500,
            currentAmount: 1350,
            targetDate: '2025-12-15',
            monthlyContribution: 300,
            priority: 'medium',
            account: 'checking',
            notes: 'Dream vacation to Maui with the family',
            status: 'active',
            createdAt: Date.now() - 15 * 24 * 60 * 60 * 1000, // 15 days ago
            updatedAt: Date.now()
          },
          {
            id: 'demo-3',
            name: 'New Car Down Payment',
            category: 'Vehicle',
            targetAmount: 8000,
            currentAmount: 3200,
            targetDate: '2025-09-01',
            monthlyContribution: 500,
            priority: 'medium',
            account: 'savings',
            notes: 'Save for reliable transportation',
            status: 'active',
            createdAt: Date.now() - 60 * 24 * 60 * 60 * 1000, // 60 days ago
            updatedAt: Date.now()
          }
        ];
        setGoals(demoGoals);
        return;
      }
      
      // Sort by priority and creation date
      goalsData.sort((a, b) => {
        const priorityOrder = { high: 1, medium: 2, low: 3 };
        const aPriority = priorityOrder[a.priority] || 2;
        const bPriority = priorityOrder[b.priority] || 2;
        
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }
        
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      });
      
      setGoals(goalsData);
    } catch (error) {
      console.error('Error loading goals:', error);
      // Fallback to demo goals on error
      const demoGoals = [
        {
          id: 'demo-1',
          name: 'Emergency Fund',
          category: 'Emergency Fund',
          targetAmount: 6000,
          currentAmount: 2400,
          targetDate: '2025-06-01',
          monthlyContribution: 400,
          priority: 'high',
          account: 'savings',
          notes: 'Build 6 months of expenses for financial security',
          status: 'active',
          createdAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
          updatedAt: Date.now()
        },
        {
          id: 'demo-2',
          name: 'Hawaii Vacation',
          category: 'Vacation',
          targetAmount: 4500,
          currentAmount: 1350,
          targetDate: '2025-12-15',
          monthlyContribution: 300,
          priority: 'medium',
          account: 'checking',
          notes: 'Dream vacation to Maui with the family',
          status: 'active',
          createdAt: Date.now() - 15 * 24 * 60 * 60 * 1000,
          updatedAt: Date.now()
        },
        {
          id: 'demo-3',
          name: 'New Car Down Payment',
          category: 'Vehicle',
          targetAmount: 8000,
          currentAmount: 3200,
          targetDate: '2025-09-01',
          monthlyContribution: 500,
          priority: 'medium',
          account: 'savings',
          notes: 'Save for reliable transportation',
          status: 'active',
          createdAt: Date.now() - 60 * 24 * 60 * 60 * 1000,
          updatedAt: Date.now()
        }
      ];
      setGoals(demoGoals);
    }
  };

  const loadAccounts = async () => {
    try {
      const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
      const settingsDocSnap = await getDoc(settingsDocRef);
      
      if (settingsDocSnap.exists()) {
        const data = settingsDocSnap.data();
        setAccounts(data.bankAccounts || {});
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
    }
  };

  const loadMonthlyExpenses = async () => {
    try {
      // Load bills to calculate monthly expenses for emergency fund recommendations
      const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
      const settingsDocSnap = await getDoc(settingsDocRef);
      
      if (settingsDocSnap.exists()) {
        const data = settingsDocSnap.data();
        const bills = data.bills || [];
        const totalMonthlyBills = bills.reduce((sum, bill) => sum + (parseFloat(bill.amount) || 0), 0);
        setMonthlyExpenses(totalMonthlyBills + 300); // Add estimated other expenses
      }
    } catch (error) {
      console.error('Error loading monthly expenses:', error);
    }
  };

  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification({ message: '', type: '' }), 3000);
  };

  const formatCurrency = (amount) => {
    if (amount === null || amount === undefined) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const handleAddGoal = () => {
    setEditingGoal(null);
    setNewGoal({
      name: '',
      category: '',
      targetAmount: '',
      currentAmount: '',
      targetDate: '',
      monthlyContribution: '',
      autoContribute: false,
      autoContributionDay: '1',
      linkedCategory: '',
      priority: 'medium',
      account: '',
      notes: '',
      status: 'active'
    });
    setShowModal(true);
  };

  const handleEditGoal = (goal) => {
    setEditingGoal(goal);
    setNewGoal({
      name: goal.name || '',
      category: goal.category || '',
      targetAmount: goal.targetAmount?.toString() || '',
      currentAmount: goal.currentAmount?.toString() || '',
      targetDate: goal.targetDate || '',
      monthlyContribution: goal.monthlyContribution?.toString() || '',
      autoContribute: goal.autoContribute || false,
      autoContributionDay: goal.autoContributionDay?.toString() || '1',
      linkedCategory: goal.linkedCategory || '',
      priority: goal.priority || 'medium',
      account: goal.account || '',
      notes: goal.notes || '',
      status: goal.status || 'active'
    });
    setShowModal(true);
  };

  const handleCategoryChange = (category) => {
    const template = getGoalTemplate(category);
    setNewGoal(prev => ({
      ...prev,
      category,
      name: prev.name || template.name,
      notes: prev.notes || template.description,
      priority: prev.priority || template.priority,
      ...(category === 'Emergency Fund' && monthlyExpenses > 0 && {
        targetAmount: calculateEmergencyFundRecommendation(monthlyExpenses).toString()
      })
    }));
  };

  const saveGoal = async () => {
    if (!newGoal.name.trim() || !newGoal.category || !newGoal.targetAmount) {
      showNotification('Please fill in all required fields', 'error');
      return;
    }

    const targetAmount = parseFloat(newGoal.targetAmount);
    const currentAmount = parseFloat(newGoal.currentAmount) || 0;
    const monthlyContribution = parseFloat(newGoal.monthlyContribution) || 0;

    if (isNaN(targetAmount) || targetAmount <= 0) {
      showNotification('Please enter a valid target amount', 'error');
      return;
    }

    if (currentAmount < 0) {
      showNotification('Current amount cannot be negative', 'error');
      return;
    }

    if (monthlyContribution < 0) {
      showNotification('Monthly contribution cannot be negative', 'error');
      return;
    }

    try {
      setSaving(true);
      
      const goalData = {
        name: newGoal.name.trim(),
        category: newGoal.category,
        targetAmount,
        currentAmount,
        targetDate: newGoal.targetDate || null,
        monthlyContribution,
        priority: newGoal.priority,
        account: newGoal.account || null,
        notes: newGoal.notes.trim(),
        status: newGoal.status,
        contributions: [],
        milestones: [],
        updatedAt: Date.now()
      };

      if (editingGoal) {
        // Update existing goal
        const goalRef = doc(db, 'users', 'steve-colburn', 'goals', editingGoal.id);
        await updateDoc(goalRef, goalData);
        showNotification('Goal updated successfully!', 'success');
      } else {
        // Add new goal
        goalData.createdAt = Date.now();
        const goalsRef = collection(db, 'users', 'steve-colburn', 'goals');
        await addDoc(goalsRef, goalData);
        showNotification('Goal created successfully!', 'success');
      }

      setShowModal(false);
      setEditingGoal(null);
      await loadGoals();
    } catch (error) {
      console.error('Error saving goal:', error);
      showNotification('Error saving goal', 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteGoal = async (goalId) => {
    if (!window.confirm('Are you sure you want to delete this goal?')) {
      return;
    }

    try {
      const goalRef = doc(db, 'users', 'steve-colburn', 'goals', goalId);
      await deleteDoc(goalRef);
      showNotification('Goal deleted successfully', 'success');
      await loadGoals();
    } catch (error) {
      console.error('Error deleting goal:', error);
      showNotification('Error deleting goal', 'error');
    }
  };

  // Calculate dashboard metrics
  const metrics = calculateGoalMetrics(goals);

  // Filter and sort goals
  const filteredGoals = goals
    .filter(goal => {
      if (filterCategory !== 'all' && goal.category !== filterCategory) return false;
      if (filterStatus !== 'all' && goal.status !== filterStatus) return false;
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'priority':
          const priorityOrder = { high: 1, medium: 2, low: 3 };
          return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
        case 'progress':
          const progressA = calculateGoalProgress(a.currentAmount, a.targetAmount);
          const progressB = calculateGoalProgress(b.currentAmount, b.targetAmount);
          return progressB - progressA;
        case 'amount':
          return (b.targetAmount || 0) - (a.targetAmount || 0);
        case 'name':
          return (a.name || '').localeCompare(b.name || '');
        default:
          return 0;
      }
    });

  if (loading) {
    return (
      <div className="goals-container">
        <div className="page-header">
          <h2>🎯 Goals</h2>
          <p>Loading your financial goals...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="goals-container">
      <div className="page-header">
        <h2>🎯 Goals</h2>
        <p>Track your financial goals and build wealth systematically</p>
      </div>

      {/* Goals Overview Dashboard */}
      <div className="goals-summary">
        <div className="summary-card">
          <h3>Active Goals</h3>
          <div className="total-amount positive">{metrics.activeGoalsCount}</div>
          <small>goals in progress</small>
        </div>
        
        <div className="summary-card">
          <h3>Total Target</h3>
          <div className="total-amount">{formatCurrency(metrics.totalTargetAmount)}</div>
          <small>across all goals</small>
        </div>
        
        <div className="summary-card">
          <h3>Total Saved</h3>
          <div className="total-amount positive">{formatCurrency(metrics.totalSavedAmount)}</div>
          <small>{metrics.overallProgress.toFixed(1)}% complete</small>
        </div>
        
        <div className="summary-card">
          <h3>Monthly Contributions</h3>
          <div className="total-amount">{formatCurrency(metrics.totalMonthlyContributions)}</div>
          <small>allocated per month</small>
        </div>
        
        {metrics.nextMilestone && (
          <div className="summary-card">
            <h3>Next Milestone</h3>
            <div className="total-amount attention">{metrics.nextMilestone.name}</div>
            <small>{metrics.nextMilestone.progress.toFixed(1)}% complete</small>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="goals-controls">
        <div className="goals-filters">
          <select 
            value={filterCategory} 
            onChange={(e) => setFilterCategory(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Categories</option>
            {Object.keys(GOAL_CATEGORIES).map(category => (
              <option key={category} value={category}>
                {getGoalCategoryIcon(category)} {category}
              </option>
            ))}
          </select>
          
          <select 
            value={filterStatus} 
            onChange={(e) => setFilterStatus(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Status</option>
            {Object.entries(GOAL_STATUSES).map(([key, status]) => (
              <option key={key} value={key}>{status.label}</option>
            ))}
          </select>
          
          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            className="filter-select"
          >
            <option value="priority">Sort by Priority</option>
            <option value="progress">Sort by Progress</option>
            <option value="amount">Sort by Amount</option>
            <option value="name">Sort by Name</option>
          </select>
        </div>
        
        <button className="btn btn-primary" onClick={handleAddGoal}>
          ➕ Add Goal
        </button>
      </div>

      {/* Goals Grid */}
      {filteredGoals.length === 0 ? (
        <div className="no-goals">
          <h3>🎯 No Goals Yet</h3>
          <p>Start building wealth by creating your first financial goal!</p>
          <button className="btn btn-primary" onClick={handleAddGoal}>
            ➕ Create Your First Goal
          </button>
        </div>
      ) : (
        <div className="goals-grid">
          {filteredGoals.map(goal => {
            const progress = calculateGoalProgress(goal.currentAmount, goal.targetAmount);
            const remaining = calculateRemainingAmount(goal.currentAmount, goal.targetAmount);
            const timeline = formatTimelineMessage(goal.currentAmount, goal.targetAmount, goal.monthlyContribution);
            const requiredContribution = calculateRequiredMonthlyContribution(
              goal.currentAmount, 
              goal.targetAmount, 
              goal.targetDate
            );
            const status = getGoalStatus(
              goal.currentAmount, 
              goal.targetAmount, 
              goal.targetDate, 
              goal.monthlyContribution
            );
            
            return (
              <div key={goal.id} className="goal-card">
                <div className="goal-header">
                  <div className="goal-title">
                    <span className="goal-icon">
                      {getGoalCategoryIcon(goal.category)}
                    </span>
                    <div>
                      <h3>{goal.name}</h3>
                      <span className="goal-category">{goal.category}</span>
                    </div>
                  </div>
                  <div className="goal-actions">
                    <span 
                      className="priority-indicator"
                      style={{ backgroundColor: getPriorityColor(goal.priority) }}
                    >
                      {GOAL_PRIORITIES[goal.priority]?.label}
                    </span>
                    <button 
                      className="btn-icon" 
                      onClick={() => handleEditGoal(goal)}
                      title="Edit goal"
                    >
                      ✏️
                    </button>
                    <button 
                      className="btn-icon" 
                      onClick={() => deleteGoal(goal.id)}
                      title="Delete goal"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                
                <div className="goal-progress">
                  <div className="progress-bar-container">
                    <div 
                      className="progress-bar-fill"
                      style={{ 
                        width: `${Math.min(progress, 100)}%`,
                        backgroundColor: getGoalCategoryColor(goal.category)
                      }}
                    ></div>
                  </div>
                  <div className="progress-text">
                    <span>{formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)}</span>
                    <span className="progress-percentage">{progress.toFixed(1)}%</span>
                  </div>
                </div>
                
                <div className="goal-details">
                  <div className="goal-stat">
                    <span className="stat-label">Remaining:</span>
                    <span className="stat-value">{formatCurrency(remaining)}</span>
                  </div>
                  
                  {goal.monthlyContribution > 0 && (
                    <div className="goal-stat">
                      <span className="stat-label">Monthly:</span>
                      <span className="stat-value">{formatCurrency(goal.monthlyContribution)}</span>
                    </div>
                  )}
                  
                  <div className="goal-timeline">
                    <span className="timeline-text">{timeline}</span>
                  </div>
                  
                  {status.isOnTrack !== null && (
                    <div className={`goal-status ${status.isOnTrack ? 'on-track' : 'behind'}`}>
                      {status.message}
                    </div>
                  )}
                  
                  {goal.targetDate && requiredContribution !== null && (
                    <div className="goal-recommendation">
                      💡 Need {formatCurrency(requiredContribution)}/month to reach by {formatDateForDisplay(goal.targetDate)}
                    </div>
                  )}
                  
                  {goal.notes && (
                    <div className="goal-notes">
                      {goal.notes}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Goal Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingGoal ? 'Edit Goal' : 'Add New Goal'}</h3>
              <button 
                className="close-btn" 
                onClick={() => setShowModal(false)}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Goal Category *</label>
                <select
                  value={newGoal.category}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  required
                >
                  <option value="">Select category...</option>
                  {Object.entries(GOAL_CATEGORIES).map(([key, category]) => (
                    <option key={key} value={key}>
                      {category.icon} {key} - {category.description}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="form-group">
                <label>Goal Name *</label>
                <input
                  type="text"
                  value={newGoal.name}
                  onChange={(e) => setNewGoal({...newGoal, name: e.target.value})}
                  placeholder="e.g., Hawaii Vacation, Emergency Fund"
                  required
                />
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Target Amount *</label>
                  <input
                    type="number"
                    value={newGoal.targetAmount}
                    onChange={(e) => setNewGoal({...newGoal, targetAmount: e.target.value})}
                    placeholder="5000"
                    min="0"
                    step="0.01"
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label>Current Amount</label>
                  <input
                    type="number"
                    value={newGoal.currentAmount}
                    onChange={(e) => setNewGoal({...newGoal, currentAmount: e.target.value})}
                    placeholder="0"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Target Date</label>
                  <input
                    type="date"
                    value={newGoal.targetDate}
                    onChange={(e) => setNewGoal({...newGoal, targetDate: e.target.value})}
                  />
                </div>
                
                <div className="form-group">
                  <label>Monthly Contribution</label>
                  <input
                    type="number"
                    value={newGoal.monthlyContribution}
                    onChange={(e) => setNewGoal({...newGoal, monthlyContribution: e.target.value})}
                    placeholder="400"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Priority</label>
                  <select
                    value={newGoal.priority}
                    onChange={(e) => setNewGoal({...newGoal, priority: e.target.value})}
                  >
                    {Object.entries(GOAL_PRIORITIES).map(([key, priority]) => (
                      <option key={key} value={key}>{priority.label}</option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group">
                  <label>Fund from Account</label>
                  <select
                    value={newGoal.account}
                    onChange={(e) => setNewGoal({...newGoal, account: e.target.value})}
                  >
                    <option value="">Select account...</option>
                    {Object.entries(accounts).map(([key, account]) => (
                      <option key={key} value={key}>{account.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Link to Category (optional)</label>
                  <select
                    value={newGoal.linkedCategory}
                    onChange={(e) => setNewGoal({...newGoal, linkedCategory: e.target.value})}
                  >
                    <option value="">No category link</option>
                    {TRANSACTION_CATEGORIES.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                  <small className="form-help">Track this goal based on transactions in a specific category</small>
                </div>
              </div>
              
              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    checked={newGoal.autoContribute}
                    onChange={(e) => setNewGoal({...newGoal, autoContribute: e.target.checked})}
                  />
                  <span>Enable automatic monthly contributions</span>
                </label>
                {newGoal.autoContribute && (
                  <div className="form-group sub-field">
                    <label>Contribution Day of Month</label>
                    <input
                      type="number"
                      value={newGoal.autoContributionDay}
                      onChange={(e) => setNewGoal({...newGoal, autoContributionDay: e.target.value})}
                      min="1"
                      max="28"
                      placeholder="1"
                    />
                    <small className="form-help">Day of the month to automatically contribute (1-28)</small>
                  </div>
                )}
              </div>
              
              <div className="form-group">
                <label>Notes</label>
                <textarea
                  value={newGoal.notes}
                  onChange={(e) => setNewGoal({...newGoal, notes: e.target.value})}
                  placeholder="Additional details about your goal..."
                  rows="3"
                />
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                className="btn btn-secondary" 
                onClick={() => setShowModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={saveGoal}
                disabled={saving}
              >
                {saving ? 'Saving...' : (editingGoal ? 'Update Goal' : 'Create Goal')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notification */}
      {notification.message && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}
    </div>
  );
};

export default Goals;