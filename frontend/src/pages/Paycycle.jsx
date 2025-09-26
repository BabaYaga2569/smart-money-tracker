import React, { useState, useEffect } from 'react';
import { doc, collection, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { PaycycleManager } from '../utils/PaycycleManager';
import { PayCycleCalculator } from '../utils/PayCycleCalculator';
import { CashFlowAnalytics } from '../utils/CashFlowAnalytics';
import {
  IncomeTimelineChart,
  CashFlowForecastChart,
  PaymentRiskChart,
  IncomeSourcesChart,
  PayFrequencyChart
} from '../components/charts/PaycycleCharts';
import './Paycycle.css';

const PayCycle = () => {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // overview, income, forecast, schedule
  const [incomeSources, setIncomeSources] = useState([]);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [incomeMetrics, setIncomeMetrics] = useState(null);
  const [cashFlowForecast, setCashFlowForecast] = useState([]);
  const [optimizedSchedule, setOptimizedSchedule] = useState([]);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [editingIncome, setEditingIncome] = useState(null);

  // Load all data on component mount
  useEffect(() => {
    loadPaycycleData();
  }, []);

  const loadPaycycleData = async () => {
    try {
      setLoading(true);
      
      // Load income sources
      const incomeSourcesSnap = await getDocs(collection(db, 'incomeSources'));
      const loadedIncomeSources = incomeSourcesSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Load bills
      const billsSnap = await getDocs(collection(db, 'bills'));
      const loadedBills = billsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Load transactions
      const transactionsSnap = await getDocs(collection(db, 'transactions'));
      const loadedTransactions = transactionsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Load current balance
      const accountsSnap = await getDocs(collection(db, 'accounts'));
      let totalBalance = 0;
      accountsSnap.forEach(doc => {
        const account = doc.data();
        totalBalance += account.balance || 0;
      });
      
      setIncomeSources(loadedIncomeSources);
      setCurrentBalance(totalBalance);
      
      // Calculate metrics and forecasts
      calculatePaycycleMetrics(loadedIncomeSources, loadedTransactions, loadedBills, totalBalance);
      
    } catch (error) {
      console.error('Error loading paycycle data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculatePaycycleMetrics = (sources, txns, billsList, balance) => {
    // Calculate income metrics
    const metrics = PaycycleManager.calculateIncomeMetrics(sources, txns);
    setIncomeMetrics(metrics);
    
    // Generate cash flow forecast
    const forecast = PaycycleManager.generateCashFlowForecast(sources, billsList, balance, 90);
    setCashFlowForecast(forecast);
    
    // Optimize payment schedule
    const optimized = PaycycleManager.optimizePaymentSchedule(billsList, sources);
    setOptimizedSchedule(optimized);
  };

  const handleAddIncomeSource = () => {
    setEditingIncome(null);
    setShowIncomeModal(true);
  };

  const handleEditIncomeSource = (source) => {
    setEditingIncome(source);
    setShowIncomeModal(true);
  };

  const handleSaveIncomeSource = async (incomeData) => {
    try {
      if (editingIncome) {
        // Update existing income source
        await updateDoc(doc(db, 'incomeSources', editingIncome.id), incomeData);
      } else {
        // Add new income source
        const newDoc = doc(collection(db, 'incomeSources'));
        await setDoc(newDoc, {
          ...incomeData,
          id: newDoc.id,
          createdAt: new Date().toISOString(),
          active: true
        });
      }
      
      setShowIncomeModal(false);
      setEditingIncome(null);
      loadPaycycleData(); // Reload data
    } catch (error) {
      console.error('Error saving income source:', error);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="paycycle-container">
        <div className="page-header">
          <h2>💰 Pay Cycle Management</h2>
          <p>Loading paycycle data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="paycycle-container">
      {/* Header Section */}
      <div className="paycycle-header">
        <h1>💰 Pay Cycle Management</h1>
        <p>Optimize your cash flow and align expenses with income</p>
        
        {/* Quick Stats */}
        <div className="quick-stats">
          <div className="metric-card electric-green">
            <div className="metric-icon">💸</div>
            <div className="metric-content">
              <div className="metric-value">
                {incomeMetrics?.nextPaycheck ? formatCurrency(incomeMetrics.nextPaycheck.amount) : 'N/A'}
              </div>
              <div className="metric-label">Next Paycheck</div>
              <div className="metric-subtitle">
                {incomeMetrics?.nextPaycheck ? formatDate(incomeMetrics.nextPaycheck.date) : 'No upcoming pay'}
              </div>
            </div>
          </div>
          
          <div className="metric-card electric-blue">
            <div className="metric-icon">📅</div>
            <div className="metric-content">
              <div className="metric-value">
                {incomeMetrics?.nextPaycheck?.daysUntil || 0}
              </div>
              <div className="metric-label">Days Until Pay</div>
              <div className="metric-subtitle">
                {incomeMetrics?.nextPaycheck ? formatDate(incomeMetrics.nextPaycheck.date) : 'TBD'}
              </div>
            </div>
          </div>
          
          <div className="metric-card electric-yellow">
            <div className="metric-icon">💰</div>
            <div className="metric-content">
              <div className="metric-value">{formatCurrency(currentBalance)}</div>
              <div className="metric-label">Current Balance</div>
              <div className="metric-subtitle">Available now</div>
            </div>
          </div>
          
          <div className="metric-card electric-red">
            <div className="metric-icon">📋</div>
            <div className="metric-content">
              <div className="metric-value">
                {optimizedSchedule.filter(bill => {
                  const daysUntil = Math.floor((new Date(bill.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
                  return daysUntil <= (incomeMetrics?.nextPaycheck?.daysUntil || 0);
                }).length}
              </div>
              <div className="metric-label">Bills Before Pay</div>
              <div className="metric-subtitle">
                {formatCurrency(optimizedSchedule
                  .filter(bill => {
                    const daysUntil = Math.floor((new Date(bill.dueDate) - new Date()) / (1000 * 60 * 60 * 24));
                    return daysUntil <= (incomeMetrics?.nextPaycheck?.daysUntil || 0);
                  })
                  .reduce((sum, bill) => sum + bill.amount, 0)
                )} total
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="tab-navigation">
        <button 
          className={activeTab === 'overview' ? 'active' : ''}
          onClick={() => setActiveTab('overview')}
        >
          📊 Overview
        </button>
        <button 
          className={activeTab === 'income' ? 'active' : ''}
          onClick={() => setActiveTab('income')}
        >
          💼 Income Sources
        </button>
        <button 
          className={activeTab === 'forecast' ? 'active' : ''}
          onClick={() => setActiveTab('forecast')}
        >
          🔮 Cash Flow Forecast
        </button>
        <button 
          className={activeTab === 'schedule' ? 'active' : ''}
          onClick={() => setActiveTab('schedule')}
        >
          🎯 Smart Scheduling
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'overview' && <OverviewTab 
          incomeMetrics={incomeMetrics}
          incomeSources={incomeSources}
          cashFlowForecast={cashFlowForecast}
          optimizedSchedule={optimizedSchedule}
        />}
        
        {activeTab === 'income' && <IncomeTab 
          incomeSources={incomeSources}
          onAdd={handleAddIncomeSource}
          onEdit={handleEditIncomeSource}
        />}
        
        {activeTab === 'forecast' && <ForecastTab 
          cashFlowForecast={cashFlowForecast}
          currentBalance={currentBalance}
        />}
        
        {activeTab === 'schedule' && <ScheduleTab 
          optimizedSchedule={optimizedSchedule}
        />}
      </div>

      {/* Income Source Modal */}
      {showIncomeModal && (
        <IncomeSourceModal
          income={editingIncome}
          onSave={handleSaveIncomeSource}
          onClose={() => {
            setShowIncomeModal(false);
            setEditingIncome(null);
          }}
        />
      )}
    </div>
  );
};

// Overview Tab Component
const OverviewTab = ({ incomeMetrics, incomeSources, cashFlowForecast, optimizedSchedule }) => {
  // Prepare chart data
  const incomeTimelineData = {
    dates: incomeSources.map(source => source.name),
    salary: incomeSources.filter(s => s.type === 'SALARY').map(s => PaycycleManager.calculateMonthlyAmount(s)),
    sideIncome: incomeSources.filter(s => s.type !== 'SALARY').map(s => PaycycleManager.calculateMonthlyAmount(s))
  };

  const forecastData = {
    dates: cashFlowForecast.map(day => day.date),
    balance: cashFlowForecast.map(day => day.balance)
  };

  const incomeSourcesData = incomeSources.map(source => ({
    name: source.name,
    monthlyAmount: PaycycleManager.calculateMonthlyAmount(source)
  }));

  return (
    <div className="overview-tab">
      <div className="charts-grid">
        <div className="chart-container large">
          <CashFlowForecastChart 
            data={forecastData} 
            title="📈 90-Day Cash Flow Projection"
          />
        </div>
        
        <div className="chart-container">
          <IncomeSourcesChart 
            data={incomeSourcesData}
            title="💰 Income Sources Breakdown"
          />
        </div>
        
        <div className="chart-container">
          <PaymentRiskChart 
            data={optimizedSchedule}
            title="⚠️ Payment Risk Assessment"
          />
        </div>
        
        <div className="chart-container">
          <IncomeTimelineChart 
            data={incomeTimelineData}
            title="📅 Monthly Income Distribution"
          />
        </div>
      </div>

      {/* Key Insights */}
      <div className="insights-section">
        <h3>🧠 Intelligent Insights</h3>
        <div className="insights-grid">
          <div className="insight-card">
            <div className="insight-icon">💡</div>
            <div className="insight-content">
              <h4>Cash Flow Optimization</h4>
              <p>Your next paycheck arrives in {incomeMetrics?.nextPaycheck?.daysUntil || 0} days. 
                 Consider paying bills 2-3 days after to maintain optimal cash flow.</p>
            </div>
          </div>
          
          <div className="insight-card">
            <div className="insight-icon">⚡</div>
            <div className="insight-content">
              <h4>Risk Mitigation</h4>
              <p>
                {optimizedSchedule.filter(b => b.riskLevel === 'high').length > 0 
                  ? `${optimizedSchedule.filter(b => b.riskLevel === 'high').length} bills have high payment risk. Consider rescheduling or building a buffer.`
                  : 'All bills are well-aligned with your pay schedule. Great job!'
                }
              </p>
            </div>
          </div>
          
          <div className="insight-card">
            <div className="insight-icon">📊</div>
            <div className="insight-content">
              <h4>Income Diversification</h4>
              <p>
                {incomeSources.length === 1 
                  ? 'Consider adding additional income sources to improve financial stability.'
                  : `You have ${incomeSources.length} income sources. This diversification strengthens your financial position.`
                }
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Income Tab Component  
const IncomeTab = ({ incomeSources, onAdd, onEdit }) => {
  return (
    <div className="income-tab">
      <div className="section-header">
        <h3>💼 Income Sources Management</h3>
        <button className="add-button" onClick={onAdd}>
          ➕ Add Income Source
        </button>
      </div>

      <div className="income-sources-grid">
        {incomeSources.map(source => (
          <div key={source.id} className="income-source-card">
            <div className="income-header">
              <div className="income-icon">
                {PaycycleManager.INCOME_SOURCE_TYPES[source.type]?.icon || '💰'}
              </div>
              <div className="income-info">
                <h4>{source.name}</h4>
                <span className="income-type">{source.type}</span>
              </div>
              <button className="edit-button" onClick={() => onEdit(source)}>
                ✏️
              </button>
            </div>
            
            <div className="income-details">
              <div className="detail-row">
                <span>Amount:</span>
                <span className="amount">${source.amount?.toLocaleString()}</span>
              </div>
              <div className="detail-row">
                <span>Frequency:</span>
                <span>{source.frequency}</span>
              </div>
              <div className="detail-row">
                <span>Monthly Equiv:</span>
                <span className="amount">
                  ${PaycycleManager.calculateMonthlyAmount(source).toLocaleString()}
                </span>
              </div>
              <div className="detail-row">
                <span>Next Pay:</span>
                <span>
                  {source.lastPayDate 
                    ? new Date(PaycycleManager.calculateNextPayDate(source)).toLocaleDateString()
                    : 'Not set'
                  }
                </span>
              </div>
            </div>
            
            <div className="income-status">
              <span className={`status-indicator ${source.active ? 'active' : 'inactive'}`}>
                {source.active ? '🟢 Active' : '🔴 Inactive'}
              </span>
            </div>
          </div>
        ))}
        
        {incomeSources.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">💼</div>
            <h4>No Income Sources</h4>
            <p>Add your first income source to start optimizing your pay cycle.</p>
            <button className="add-button primary" onClick={onAdd}>
              ➕ Add Income Source
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Forecast Tab Component
const ForecastTab = ({ cashFlowForecast, currentBalance }) => {
  const riskDays = cashFlowForecast.filter(day => day.riskLevel === 'high' || day.riskLevel === 'critical');
  const surplusDays = cashFlowForecast.filter(day => day.balance > currentBalance * 1.5);

  return (
    <div className="forecast-tab">
      <div className="forecast-summary">
        <div className="summary-card">
          <h4>📊 Forecast Summary</h4>
          <div className="summary-metrics">
            <div className="metric">
              <span className="label">Risk Days:</span>
              <span className="value risk">{riskDays.length}</span>
            </div>
            <div className="metric">
              <span className="label">Surplus Days:</span>
              <span className="value surplus">{surplusDays.length}</span>
            </div>
            <div className="metric">
              <span className="label">Lowest Balance:</span>
              <span className="value">
                ${Math.min(...cashFlowForecast.map(d => d.balance)).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="forecast-chart">
        <CashFlowForecastChart 
          data={{
            dates: cashFlowForecast.map(day => day.date),
            balance: cashFlowForecast.map(day => day.balance)
          }}
          title="📈 Detailed 90-Day Cash Flow Forecast"
        />
      </div>

      <div className="forecast-events">
        <h4>📅 Upcoming Financial Events</h4>
        <div className="events-timeline">
          {cashFlowForecast.slice(0, 14).map((day, index) => (
            <div key={index} className={`event-day ${day.riskLevel}`}>
              <div className="event-date">
                {day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
              <div className="event-details">
                <div className="balance">Balance: ${day.balance.toFixed(2)}</div>
                {day.income > 0 && <div className="income">+${day.income.toFixed(2)} income</div>}
                {day.expenses > 0 && <div className="expenses">-${day.expenses.toFixed(2)} expenses</div>}
              </div>
              <div className="event-events">
                {day.events.map((event, idx) => (
                  <div key={idx} className={`event ${event.type}`}>
                    {event.description}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Schedule Tab Component
const ScheduleTab = ({ optimizedSchedule }) => {
  const riskLevels = {
    low: optimizedSchedule.filter(bill => bill.riskLevel === 'low'),
    medium: optimizedSchedule.filter(bill => bill.riskLevel === 'medium'),
    high: optimizedSchedule.filter(bill => bill.riskLevel === 'high'),
    critical: optimizedSchedule.filter(bill => bill.riskLevel === 'critical')
  };

  return (
    <div className="schedule-tab">
      <div className="schedule-header">
        <h3>🎯 Smart Bill Scheduling</h3>
        <p>Optimized payment schedule aligned with your pay periods</p>
      </div>

      <div className="risk-summary">
        <div className="risk-card low">
          <div className="risk-count">{riskLevels.low.length}</div>
          <div className="risk-label">Low Risk</div>
        </div>
        <div className="risk-card medium">
          <div className="risk-count">{riskLevels.medium.length}</div>
          <div className="risk-label">Medium Risk</div>
        </div>
        <div className="risk-card high">
          <div className="risk-count">{riskLevels.high.length}</div>
          <div className="risk-label">High Risk</div>
        </div>
        <div className="risk-card critical">
          <div className="risk-count">{riskLevels.critical.length}</div>
          <div className="risk-label">Critical</div>
        </div>
      </div>

      <div className="schedule-list">
        {Object.entries(riskLevels).map(([level, bills]) => (
          bills.length > 0 && (
            <div key={level} className={`risk-section ${level}`}>
              <h4>{level.charAt(0).toUpperCase() + level.slice(1)} Risk Bills</h4>
              <div className="bills-grid">
                {bills.map(bill => (
                  <div key={bill.id} className="bill-card">
                    <div className="bill-header">
                      <h5>{bill.name}</h5>
                      <span className="bill-amount">${bill.amount}</span>
                    </div>
                    <div className="bill-details">
                      <div className="detail">
                        <span>Due Date:</span>
                        <span>{new Date(bill.dueDate).toLocaleDateString()}</span>
                      </div>
                      <div className="detail">
                        <span>Suggested Pay Date:</span>
                        <span>{new Date(bill.suggestedPayDate).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="bill-recommendations">
                      <p>{bill.recommendations?.paymentTiming}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        ))}
      </div>
    </div>
  );
};

// Income Source Modal Component
const IncomeSourceModal = ({ income, onSave, onClose }) => {
  const [formData, setFormData] = useState({
    name: income?.name || '',
    type: income?.type || 'SALARY',
    amount: income?.amount || '',
    frequency: income?.frequency || 'bi-weekly',
    lastPayDate: income?.lastPayDate || '',
    active: income?.active ?? true,
    notes: income?.notes || ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...formData,
      amount: parseFloat(formData.amount) || 0
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h3>{income ? 'Edit Income Source' : 'Add Income Source'}</h3>
          <button className="close-button" onClick={onClose}>✕</button>
        </div>
        
        <form onSubmit={handleSubmit} className="income-form">
          <div className="form-group">
            <label>Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              required
            />
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({...formData, type: e.target.value})}
              >
                {Object.keys(PaycycleManager.INCOME_SOURCE_TYPES).map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            
            <div className="form-group">
              <label>Frequency</label>
              <select
                value={formData.frequency}
                onChange={(e) => setFormData({...formData, frequency: e.target.value})}
              >
                <option value="weekly">Weekly</option>
                <option value="bi-weekly">Bi-weekly</option>
                <option value="semi-monthly">Semi-monthly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Amount</label>
              <input
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({...formData, amount: e.target.value})}
                required
              />
            </div>
            
            <div className="form-group">
              <label>Last Pay Date</label>
              <input
                type="date"
                value={formData.lastPayDate}
                onChange={(e) => setFormData({...formData, lastPayDate: e.target.value})}
              />
            </div>
          </div>
          
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={formData.active}
                onChange={(e) => setFormData({...formData, active: e.target.checked})}
              />
              Active
            </label>
          </div>
          
          <div className="form-group">
            <label>Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({...formData, notes: e.target.value})}
              rows="3"
            />
          </div>
          
          <div className="form-actions">
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary">
              {income ? 'Update' : 'Add'} Income Source
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PayCycle;