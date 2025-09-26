import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { TRANSACTION_CATEGORIES, getCategoryIcon } from '../constants/categories';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
} from 'chart.js';
import { Pie, Bar, Line } from 'react-chartjs-2';
import './Categories.css';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement
);

const Categories = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState({});
  const [notification, setNotification] = useState({ message: '', type: '' });
  
  // View state
  const [activeView, setActiveView] = useState('overview'); // overview, analytics, management, budgets
  const [showAddBudgetForm, setShowAddBudgetForm] = useState(false);
  
  // Analytics state
  const [categoryAnalytics, setCategoryAnalytics] = useState({});
  const [spendingTrends, setSpendingTrends] = useState({});
  const [budgetAlerts, setBudgetAlerts] = useState([]);
  const [insights, setInsights] = useState([]);
  
  // Form state
  const [newBudget, setNewBudget] = useState({
    category: '',
    amount: '',
    period: 'monthly',
    rollover: false,
    alerts: {
      fifty: true,
      seventyFive: true,
      ninety: true,
      hundred: true
    }
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        await Promise.all([
          loadTransactions(),
          loadBudgets()
        ]);
      } catch (error) {
        console.error('Error loading initial data:', error);
        showNotification('Error loading data', 'error');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (transactions.length > 0) {
      const calculateAnalytics = () => {
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth();
        const currentYear = currentDate.getFullYear();
        
        // Calculate this month's data
        const thisMonthTransactions = transactions.filter(t => {
          const transactionDate = new Date(t.date);
          return transactionDate.getMonth() === currentMonth && 
                 transactionDate.getFullYear() === currentYear &&
                 t.amount < 0; // Only expenses
        });
        
        // Calculate category breakdown
        const categoryBreakdown = {};
        const categoryTransactionCounts = {};
        
        thisMonthTransactions.forEach(t => {
          const category = t.category || 'Uncategorized';
          const amount = Math.abs(t.amount);
          
          if (!categoryBreakdown[category]) {
            categoryBreakdown[category] = 0;
            categoryTransactionCounts[category] = 0;
          }
          
          categoryBreakdown[category] += amount;
          categoryTransactionCounts[category]++;
        });
        
        // Calculate trends (compare with previous months)
        const trends = {};
        TRANSACTION_CATEGORIES.forEach(category => {
          const thisMonth = categoryBreakdown[category] || 0;
          
          // Calculate last month
          const lastMonthTransactions = transactions.filter(t => {
            const transactionDate = new Date(t.date);
            const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
            const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
            return transactionDate.getMonth() === lastMonth && 
                   transactionDate.getFullYear() === lastMonthYear &&
                   t.category === category &&
                   t.amount < 0;
          });
          
          const lastMonth = lastMonthTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
          
          trends[category] = {
            thisMonth,
            lastMonth,
            change: thisMonth - lastMonth,
            changePercent: lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : 0,
            transactionCount: categoryTransactionCounts[category] || 0,
            avgTransactionSize: categoryTransactionCounts[category] > 0 ? thisMonth / categoryTransactionCounts[category] : 0
          };
        });
        
        setCategoryAnalytics(categoryBreakdown);
        setSpendingTrends(trends);
        
        // Calculate budget alerts
        const alerts = [];
        Object.entries(budgets).forEach(([category, budget]) => {
          const spent = categoryBreakdown[category] || 0;
          const percentage = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
          
          if (percentage >= 100) {
            alerts.push({
              category,
              type: 'over',
              message: `You've exceeded your ${category} budget by ${formatCurrency(spent - budget.amount)}`,
              severity: 'high'
            });
          } else if (percentage >= 90) {
            alerts.push({
              category,
              type: 'warning',
              message: `You're at ${percentage.toFixed(0)}% of your ${category} budget`,
              severity: 'medium'
            });
          } else if (percentage >= 75) {
            alerts.push({
              category,
              type: 'caution',
              message: `You've used ${percentage.toFixed(0)}% of your ${category} budget`,
              severity: 'low'
            });
          }
        });
        
        setBudgetAlerts(alerts);
      };

      const generateInsights = () => {
        const insightsList = [];
        
        // Weekend spending analysis
        const weekendTransactions = transactions.filter(t => {
          const transactionDate = new Date(t.date);
          const dayOfWeek = transactionDate.getDay();
          return (dayOfWeek === 0 || dayOfWeek === 6) && t.amount < 0;
        });
        
        const weekdayTransactions = transactions.filter(t => {
          const transactionDate = new Date(t.date);
          const dayOfWeek = transactionDate.getDay();
          return dayOfWeek >= 1 && dayOfWeek <= 5 && t.amount < 0;
        });
        
        const weekendSpending = weekendTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
        const weekdaySpending = weekdayTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
        
        if (weekendSpending > weekdaySpending * 0.4) {
          insightsList.push({
            type: 'pattern',
            title: 'Weekend Spending Pattern',
            message: `You spend ${((weekendSpending / (weekendSpending + weekdaySpending)) * 100).toFixed(0)}% of your money on weekends`,
            icon: '📈'
          });
        }
        
        setInsights(insightsList.slice(0, 6)); // Limit to 6 insights
      };

      calculateAnalytics();
      generateInsights();
    }
  }, [transactions, budgets]); // Remove spendingTrends dependency to prevent infinite loop


  const loadTransactions = async () => {
    try {
      const transactionsRef = collection(db, 'users', 'steve-colburn', 'transactions');
      const querySnapshot = await getDocs(transactionsRef);
      const transactionsData = [];
      
      querySnapshot.forEach((doc) => {
        transactionsData.push({ id: doc.id, ...doc.data() });
      });
      
      // If no transactions from Firebase, add demo data
      if (transactionsData.length === 0) {
        const demoTransactions = generateDemoTransactions();
        setTransactions(demoTransactions);
      } else {
        setTransactions(transactionsData);
      }
    } catch (error) {
      console.error('Error loading transactions:', error);
      // Fallback to demo data
      setTransactions(generateDemoTransactions());
    }
  };



  const loadBudgets = async () => {
    try {
      const budgetsRef = collection(db, 'users', 'steve-colburn', 'budgets');
      const querySnapshot = await getDocs(budgetsRef);
      const budgetsData = {};
      
      querySnapshot.forEach((doc) => {
        budgetsData[doc.id] = { id: doc.id, ...doc.data() };
      });
      
      // If no budgets from Firebase, add demo budgets
      if (Object.keys(budgetsData).length === 0) {
        const demoBudgets = {
          'Groceries': { amount: 400, spent: 320, period: 'monthly', rollover: false },
          'Food & Dining': { amount: 200, spent: 180, period: 'monthly', rollover: false },
          'Gas & Fuel': { amount: 150, spent: 120, period: 'monthly', rollover: false },
          'Entertainment': { amount: 100, spent: 85, period: 'monthly', rollover: true },
          'Shopping': { amount: 250, spent: 310, period: 'monthly', rollover: false }
        };
        setBudgets(demoBudgets);
      } else {
        setBudgets(budgetsData);
      }
    } catch (error) {
      console.error('Error loading budgets:', error);
      // Set demo budgets as fallback
      const demoBudgets = {
        'Groceries': { amount: 400, spent: 320, period: 'monthly', rollover: false },
        'Food & Dining': { amount: 200, spent: 180, period: 'monthly', rollover: false },
        'Gas & Fuel': { amount: 150, spent: 120, period: 'monthly', rollover: false },
        'Entertainment': { amount: 100, spent: 85, period: 'monthly', rollover: true },
        'Shopping': { amount: 250, spent: 310, period: 'monthly', rollover: false }
      };
      setBudgets(demoBudgets);
    }
  };

  const generateDemoTransactions = () => {
    const currentDate = new Date();
    const demoTransactions = [];
    
    // Generate transactions for the past 3 months
    for (let monthsBack = 0; monthsBack < 3; monthsBack++) {
      const month = new Date(currentDate.getFullYear(), currentDate.getMonth() - monthsBack, 1);
      
      // Groceries transactions
      for (let i = 0; i < 8; i++) {
        demoTransactions.push({
          id: `demo-grocery-${monthsBack}-${i}`,
          amount: -(Math.random() * 80 + 20), // -$20 to -$100
          description: ['Safeway', 'Target', 'Costco', 'Walmart'][Math.floor(Math.random() * 4)],
          category: 'Groceries',
          date: new Date(month.getTime() + Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          account: 'checking'
        });
      }
      
      // Food & Dining transactions
      for (let i = 0; i < 6; i++) {
        demoTransactions.push({
          id: `demo-dining-${monthsBack}-${i}`,
          amount: -(Math.random() * 40 + 10), // -$10 to -$50
          description: ['McDonald\'s', 'Starbucks', 'Chipotle', 'Pizza Hut'][Math.floor(Math.random() * 4)],
          category: 'Food & Dining',
          date: new Date(month.getTime() + Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          account: 'checking'
        });
      }
      
      // Other categories
      const otherCategories = [
        { category: 'Gas & Fuel', merchants: ['Shell', 'Chevron', 'Exxon'], avgAmount: 45 },
        { category: 'Entertainment', merchants: ['Netflix', 'Movie Theater', 'Concert'], avgAmount: 25 },
        { category: 'Shopping', merchants: ['Amazon', 'Best Buy', 'Target'], avgAmount: 75 },
        { category: 'Bills & Utilities', merchants: ['Electric Bill', 'Internet', 'Phone'], avgAmount: 120 }
      ];
      
      otherCategories.forEach(({ category, merchants, avgAmount }) => {
        for (let i = 0; i < 3; i++) {
          demoTransactions.push({
            id: `demo-${category.toLowerCase().replace(/\s+/g, '-')}-${monthsBack}-${i}`,
            amount: -(Math.random() * avgAmount + avgAmount * 0.5),
            description: merchants[Math.floor(Math.random() * merchants.length)],
            category,
            date: new Date(month.getTime() + Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            account: 'checking'
          });
        }
      });
    }
    
    return demoTransactions;
  };



  const showNotification = (message, type) => {
    setNotification({ message, type });
    setTimeout(() => setNotification({ message: '', type: '' }), 3000);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(Math.abs(amount));
  };

  const saveBudget = async () => {
    if (!newBudget.category || !newBudget.amount) {
      showNotification('Please fill in all required fields', 'error');
      return;
    }

    try {
      setSaving(true);
      
      const budgetData = {
        category: newBudget.category,
        amount: parseFloat(newBudget.amount),
        period: newBudget.period,
        rollover: newBudget.rollover,
        alerts: newBudget.alerts,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      // Update local state
      setBudgets(prev => ({
        ...prev,
        [newBudget.category]: budgetData
      }));

      setNewBudget({ category: '', amount: '', period: 'monthly', rollover: false, alerts: { fifty: true, seventyFive: true, ninety: true, hundred: true } });
      setShowAddBudgetForm(false);
      showNotification('Budget saved successfully', 'success');
    } catch (error) {
      console.error('Error saving budget:', error);
      showNotification('Error saving budget', 'error');
    } finally {
      setSaving(false);
    }
  };

  const renderOverviewTab = () => (
    <div className="categories-overview">
      {/* Summary Cards */}
      <div className="categories-summary">
        <div className="summary-card">
          <h3>📊 Total Categories</h3>
          <div className="total-amount">{TRANSACTION_CATEGORIES.length}</div>
          <small>Active categories</small>
        </div>
        <div className="summary-card">
          <h3>💰 Total Spent</h3>
          <div className="total-amount attention">
            {formatCurrency(Object.values(categoryAnalytics).reduce((sum, amount) => sum + amount, 0))}
          </div>
          <small>This month</small>
        </div>
        <div className="summary-card">
          <h3>🎯 Budgets Set</h3>
          <div className="total-amount positive">{Object.keys(budgets).length}</div>
          <small>Categories with budgets</small>
        </div>
        <div className="summary-card">
          <h3>⚠️ Budget Alerts</h3>
          <div className="total-amount attention">{budgetAlerts.length}</div>
          <small>Active alerts</small>
        </div>
      </div>

      {/* Budget Alerts */}
      {budgetAlerts.length > 0 && (
        <div className="budget-alerts">
          <h3>⚠️ Budget Alerts</h3>
          <div className="alerts-list">
            {budgetAlerts.map((alert, index) => (
              <div key={index} className={`alert alert-${alert.severity}`}>
                <span className="alert-icon">
                  {alert.type === 'over' ? '🚨' : alert.type === 'warning' ? '⚠️' : '💡'}
                </span>
                <span className="alert-message">{alert.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Insights */}
      {insights.length > 0 && (
        <div className="spending-insights">
          <h3>🧠 Smart Insights</h3>
          <div className="insights-grid">
            {insights.map((insight, index) => (
              <div key={index} className={`insight insight-${insight.type}`}>
                <span className="insight-icon">{insight.icon}</span>
                <div className="insight-content">
                  <h4>{insight.title}</h4>
                  <p>{insight.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Categories */}
      <div className="top-categories">
        <h3>🏆 Top Spending Categories</h3>
        <div className="categories-list">
          {Object.entries(categoryAnalytics)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 8)
            .map(([category, amount]) => {
              const budget = budgets[category];
              const budgetUsed = budget ? (amount / budget.amount) * 100 : 0;
              
              return (
                <div key={category} className="category-item">
                  <div className="category-header">
                    <span className="category-icon">{getCategoryIcon(category)}</span>
                    <span className="category-name">{category}</span>
                    <span className="category-amount">{formatCurrency(amount)}</span>
                  </div>
                  {budget && (
                    <div className="category-budget">
                      <div className="budget-bar">
                        <div 
                          className={`budget-fill ${budgetUsed > 100 ? 'over-budget' : budgetUsed > 90 ? 'warning' : ''}`}
                          style={{ width: `${Math.min(budgetUsed, 100)}%` }}
                        ></div>
                      </div>
                      <div className="budget-text">
                        {formatCurrency(amount)} / {formatCurrency(budget.amount)} 
                        ({budgetUsed.toFixed(0)}%)
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );

  const renderAnalyticsTab = () => {
    // Prepare chart data
    const pieData = {
      labels: Object.keys(categoryAnalytics),
      datasets: [{
        data: Object.values(categoryAnalytics),
        backgroundColor: [
          '#00ff88', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', 
          '#feca57', '#ff9ff3', '#54a0ff', '#5f27cd', '#00d2d3'
        ],
        borderColor: '#333',
        borderWidth: 2
      }]
    };

    const barData = {
      labels: Object.keys(spendingTrends).slice(0, 10),
      datasets: [
        {
          label: 'This Month',
          data: Object.values(spendingTrends).slice(0, 10).map(trend => trend.thisMonth),
          backgroundColor: '#00ff88'
        },
        {
          label: 'Last Month',
          data: Object.values(spendingTrends).slice(0, 10).map(trend => trend.lastMonth),
          backgroundColor: '#333'
        }
      ]
    };

    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: '#fff'
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#fff' },
          grid: { color: '#333' }
        },
        y: {
          ticks: { color: '#fff' },
          grid: { color: '#333' }
        }
      }
    };

    return (
      <div className="categories-analytics">
        <div className="analytics-charts">
          <div className="chart-container">
            <h3>💰 Spending Distribution</h3>
            <div className="chart-wrapper">
              <Pie data={pieData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#fff' } } } }} />
            </div>
          </div>
          
          <div className="chart-container">
            <h3>📊 Monthly Comparison</h3>
            <div className="chart-wrapper">
              <Bar data={barData} options={chartOptions} />
            </div>
          </div>
        </div>

        {/* Spending Trends */}
        <div className="spending-trends">
          <h3>📈 Spending Trends</h3>
          <div className="trends-list">
            {Object.entries(spendingTrends)
              .filter(([, trend]) => trend.thisMonth > 0)
              .sort(([,a], [,b]) => b.thisMonth - a.thisMonth)
              .map(([category, trend]) => (
                <div key={category} className="trend-item">
                  <div className="trend-header">
                    <span className="category-icon">{getCategoryIcon(category)}</span>
                    <span className="category-name">{category}</span>
                    <span className={`trend-indicator ${trend.changePercent > 0 ? 'up' : 'down'}`}>
                      {trend.changePercent > 0 ? '⬆️' : '⬇️'} {Math.abs(trend.changePercent).toFixed(1)}%
                    </span>
                  </div>
                  <div className="trend-details">
                    <div className="trend-stat">
                      <span>This Month: {formatCurrency(trend.thisMonth)}</span>
                    </div>
                    <div className="trend-stat">
                      <span>Transactions: {trend.transactionCount}</span>
                    </div>
                    <div className="trend-stat">
                      <span>Avg: {formatCurrency(trend.avgTransactionSize)}</span>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    );
  };

  const renderBudgetsTab = () => (
    <div className="categories-budgets">
      <div className="budgets-header">
        <h3>💰 Budget Management</h3>
        <button 
          className="btn btn-primary"
          onClick={() => setShowAddBudgetForm(true)}
        >
          + Add Budget
        </button>
      </div>

      {/* Add Budget Form */}
      {showAddBudgetForm && (
        <div className="add-budget-form">
          <h4>Set Category Budget</h4>
          <div className="form-row">
            <div className="form-group">
              <label>Category *</label>
              <select
                value={newBudget.category}
                onChange={(e) => setNewBudget({ ...newBudget, category: e.target.value })}
              >
                <option value="">Select Category</option>
                {TRANSACTION_CATEGORIES.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Budget Amount *</label>
              <input
                type="number"
                value={newBudget.amount}
                onChange={(e) => setNewBudget({ ...newBudget, amount: e.target.value })}
                placeholder="0.00"
              />
            </div>
          </div>
          <div className="form-actions">
            <button 
              className="btn btn-primary" 
              onClick={saveBudget}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Budget'}
            </button>
            <button 
              className="btn btn-secondary" 
              onClick={() => setShowAddBudgetForm(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Budget List */}
      <div className="budgets-list">
        {Object.entries(budgets).map(([category, budget]) => {
          const spent = categoryAnalytics[category] || 0;
          const remaining = budget.amount - spent;
          const percentage = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
          const daysLeft = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate();
          const dailyAverage = daysLeft > 0 ? remaining / daysLeft : 0;

          return (
            <div key={category} className="budget-item">
              <div className="budget-header">
                <span className="category-icon">{getCategoryIcon(category)}</span>
                <span className="category-name">{category}</span>
                <span className="budget-amount">{formatCurrency(budget.amount)}</span>
              </div>
              
              <div className="budget-progress">
                <div className="progress-bar">
                  <div 
                    className={`progress-fill ${percentage > 100 ? 'over-budget' : percentage > 90 ? 'warning' : ''}`}
                    style={{ width: `${Math.min(percentage, 100)}%` }}
                  ></div>
                </div>
                <div className="progress-text">
                  {formatCurrency(spent)} / {formatCurrency(budget.amount)} ({percentage.toFixed(0)}%)
                </div>
              </div>
              
              <div className="budget-stats">
                <div className="budget-stat">
                  <span className="stat-label">Remaining:</span>
                  <span className={`stat-value ${remaining < 0 ? 'negative' : 'positive'}`}>
                    {formatCurrency(remaining)}
                  </span>
                </div>
                <div className="budget-stat">
                  <span className="stat-label">Days Left:</span>
                  <span className="stat-value">{daysLeft}</span>
                </div>
                {remaining > 0 && (
                  <div className="budget-stat">
                    <span className="stat-label">Daily Budget:</span>
                    <span className="stat-value">{formatCurrency(dailyAverage)}</span>
                  </div>
                )}
              </div>
              
              {percentage > 100 && (
                <div className="budget-alert">
                  🚨 Over budget by {formatCurrency(spent - budget.amount)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderManagementTab = () => (
    <div className="categories-management">
      <div className="management-header">
        <h3>🏷️ Category Management</h3>
        <button 
          className="btn btn-primary"
          onClick={() => showNotification('Add Category feature coming soon!', 'success')}
        >
          + Add Category
        </button>
      </div>

      {/* Categories List */}
      <div className="categories-management-list">
        {TRANSACTION_CATEGORIES.map(category => {
          const spent = categoryAnalytics[category] || 0;
          const transactionCount = spendingTrends[category]?.transactionCount || 0;
          
          return (
            <div key={category} className="management-category-item">
              <div className="category-info">
                <span className="category-icon">{getCategoryIcon(category)}</span>
                <div className="category-details">
                  <span className="category-name">{category}</span>
                  <span className="category-stats">
                    {transactionCount} transactions • {formatCurrency(spent)} this month
                  </span>
                </div>
              </div>
              <div className="category-actions">
                <button className="btn btn-small">Edit</button>
                <button className="btn btn-small">Rules</button>
                <button className="btn btn-small">History</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="categories-container">
        <div className="loading-state">
          <h2>🏷️ Loading Categories...</h2>
          <p>Analyzing your spending patterns...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="categories-container">
      {/* Notification */}
      {notification.message && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}

      {/* Page Header */}
      <div className="page-header">
        <h2>🏷️ Categories</h2>
        <p>Intelligent spending analytics and budget management</p>
      </div>

      {/* Navigation Tabs */}
      <div className="categories-nav">
        <button 
          className={`nav-tab ${activeView === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveView('overview')}
        >
          📊 Overview
        </button>
        <button 
          className={`nav-tab ${activeView === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveView('analytics')}
        >
          📈 Analytics
        </button>
        <button 
          className={`nav-tab ${activeView === 'budgets' ? 'active' : ''}`}
          onClick={() => setActiveView('budgets')}
        >
          💰 Budgets
        </button>
        <button 
          className={`nav-tab ${activeView === 'management' ? 'active' : ''}`}
          onClick={() => setActiveView('management')}
        >
          🏷️ Management
        </button>
      </div>

      {/* Tab Content */}
      <div className="categories-content">
        {activeView === 'overview' && renderOverviewTab()}
        {activeView === 'analytics' && renderAnalyticsTab()}
        {activeView === 'budgets' && renderBudgetsTab()}
        {activeView === 'management' && renderManagementTab()}
      </div>
    </div>
  );
};

export default Categories;