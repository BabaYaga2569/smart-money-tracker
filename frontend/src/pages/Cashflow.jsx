import React, { useState, useEffect } from 'react';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { CashFlowAnalytics } from '../utils/CashFlowAnalytics';
import { mockTransactions, mockAccounts } from '../utils/MockCashFlowData';
import {
  CashFlowTrendChart,
  WaterfallChart,
  IncomeStreamsChart,
  ExpenseCategoriesChart,
  MonthlyComparisonChart,
  ForecastChart,
  VelocityChart
} from '../components/charts/CashFlowCharts';
import './Cashflow.css';

const CashFlow = () => {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState({});
  const [cashFlowData, setCashFlowData] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('current'); // current, 3month, 6month, 12month
  const [selectedTab, setSelectedTab] = useState('overview'); // overview, trends, forecast, insights
  const [insights, setInsights] = useState([]);
  const [forecast, setForecast] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (transactions.length > 0) {
      calculateCashFlowAnalytics();
    }
  }, [transactions, selectedPeriod]);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([loadAccounts(), loadTransactions()]);
    } catch (error) {
      console.error('Error loading cash flow data:', error);
      // Use mock data if Firebase is offline
      console.log('Using mock data for demo purposes');
      setTransactions(mockTransactions);
      setAccounts(mockAccounts);
    } finally {
      setLoading(false);
    }
  };

  const loadAccounts = async () => {
    try {
      const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
      const settingsDocSnap = await getDoc(settingsDocRef);
      
      if (settingsDocSnap.exists()) {
        const data = settingsDocSnap.data();
        setAccounts(data.bankAccounts || {});
      } else {
        setAccounts(mockAccounts);
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
      setAccounts(mockAccounts);
    }
  };

  const loadTransactions = async () => {
    try {
      const transactionsRef = collection(db, 'users', 'steve-colburn', 'transactions');
      const querySnapshot = await getDocs(transactionsRef);
      
      const transactionsList = [];
      querySnapshot.forEach((doc) => {
        transactionsList.push({
          id: doc.id,
          ...doc.data()
        });
      });

      if (transactionsList.length === 0) {
        // Use mock data if no transactions found
        setTransactions(mockTransactions);
      } else {
        // Sort by date (newest first)
        transactionsList.sort((a, b) => new Date(b.date) - new Date(a.date));
        setTransactions(transactionsList);
      }
    } catch (error) {
      console.error('Error loading transactions:', error);
      setTransactions(mockTransactions);
    }
  };

  const calculateCashFlowAnalytics = () => {
    const now = new Date();
    let startDate, endDate;

    // Determine date range based on selected period
    switch (selectedPeriod) {
      case '3month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case '6month':
        startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case '12month':
        startDate = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      default: // current month
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }

    // Calculate comprehensive cash flow metrics
    const metrics = CashFlowAnalytics.calculateCashFlowMetrics(transactions, startDate, endDate);
    setCashFlowData(metrics);

    // Generate insights
    const generatedInsights = CashFlowAnalytics.generateInsights(metrics, transactions);
    setInsights(generatedInsights);

    // Generate forecast
    const forecastData = CashFlowAnalytics.generateForecast(transactions, 6);
    setForecast(forecastData);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getPeriodLabel = () => {
    switch (selectedPeriod) {
      case '3month': return 'Last 3 Months';
      case '6month': return 'Last 6 Months';
      case '12month': return 'Last 12 Months';
      default: return 'This Month';
    }
  };

  // Prepare chart data
  const prepareChartData = () => {
    if (!cashFlowData) return null;

    // Generate monthly data for trends
    const monthlyData = generateMonthlyData();
    
    return {
      trend: {
        labels: monthlyData.labels,
        income: monthlyData.income,
        expenses: monthlyData.expenses,
        netFlow: monthlyData.netFlow
      },
      waterfall: {
        labels: ['Starting', 'Income', 'Expenses', 'Net Flow'],
        starting: [0, 0, 0, 0],
        income: [0, cashFlowData.income.total, 0, 0],
        expenses: [0, 0, -cashFlowData.expenses.total, 0],
        ending: [0, 0, 0, cashFlowData.netFlow]
      },
      monthly: {
        labels: monthlyData.labels,
        income: monthlyData.income,
        expenses: monthlyData.expenses
      },
      velocity: {
        labels: monthlyData.labels,
        velocity: monthlyData.velocity
      },
      forecast: generateForecastData()
    };
  };

  const generateMonthlyData = () => {
    const months = [];
    const income = [];
    const expenses = [];
    const netFlow = [];
    const velocity = [];
    
    const now = new Date();
    const monthsToShow = selectedPeriod === '12month' ? 12 : selectedPeriod === '6month' ? 6 : 6;
    
    for (let i = monthsToShow - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      
      const monthTransactions = transactions.filter(t => {
        const transactionDate = new Date(t.date);
        return transactionDate >= monthStart && transactionDate <= monthEnd;
      });
      
      const monthIncome = monthTransactions
        .filter(t => t.amount > 0)
        .reduce((sum, t) => sum + t.amount, 0);
        
      const monthExpenses = Math.abs(monthTransactions
        .filter(t => t.amount < 0)
        .reduce((sum, t) => sum + t.amount, 0));
      
      const monthVelocity = monthTransactions.length / monthEnd.getDate();
      
      months.push(date.toLocaleString('default', { month: 'short', year: '2-digit' }));
      income.push(monthIncome);
      expenses.push(monthExpenses);
      netFlow.push(monthIncome - monthExpenses);
      velocity.push(monthVelocity);
    }
    
    return { labels: months, income, expenses, netFlow, velocity };
  };

  const generateForecastData = () => {
    if (!forecast) return null;
    
    const labels = [];
    const historical = [];
    const forecastLine = [];
    const upperBound = [];
    const lowerBound = [];
    
    // Generate labels for next 6 months
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
      labels.push(date.toLocaleString('default', { month: 'short', year: '2-digit' }));
      
      if (i === 0) {
        // Current month (historical)
        historical.push(cashFlowData?.netFlow || 0);
        forecastLine.push(null);
        upperBound.push(null);
        lowerBound.push(null);
      } else {
        // Future months (forecast)
        historical.push(null);
        forecastLine.push(forecast.historicalAverage);
        
        const margin = forecast.volatility * 1.96; // 95% confidence interval
        upperBound.push(forecast.historicalAverage + margin);
        lowerBound.push(forecast.historicalAverage - margin);
      }
    }
    
    return { labels, historical, forecast: forecastLine, upperBound, lowerBound };
  };

  const renderOverviewTab = () => {
    if (!cashFlowData) return null;
    
    const chartData = prepareChartData();
    
    return (
      <div className="overview-tab">
        {/* Cash Flow Summary Cards */}
        <div className="cashflow-summary">
          <div className="summary-card">
            <h3>💰 Net Cash Flow</h3>
            <div className={`total-amount ${cashFlowData.netFlow >= 0 ? 'positive' : 'expense'}`}>
              {formatCurrency(cashFlowData.netFlow)}
            </div>
            <small>{getPeriodLabel()}</small>
          </div>
          
          <div className="summary-card">
            <h3>📈 Total Income</h3>
            <div className="total-amount positive">
              {formatCurrency(cashFlowData.income.total)}
            </div>
            <small>{getPeriodLabel()}</small>
          </div>
          
          <div className="summary-card">
            <h3>📉 Total Expenses</h3>
            <div className="total-amount expense">
              {formatCurrency(cashFlowData.expenses.total)}
            </div>
            <small>{getPeriodLabel()}</small>
          </div>
          
          <div className="summary-card">
            <h3>🎯 Savings Rate</h3>
            <div className="total-amount">
              {cashFlowData.efficiency.toFixed(1)}%
            </div>
            <small>Income utilization</small>
          </div>
          
          <div className="summary-card">
            <h3>🔄 Cash Velocity</h3>
            <div className="total-amount">
              {cashFlowData.velocity.toFixed(1)}
            </div>
            <small>Transactions/day</small>
          </div>
          
          <div className="summary-card">
            <h3>📊 Total Transactions</h3>
            <div className="total-amount">
              {cashFlowData.transactionCount}
            </div>
            <small>{getPeriodLabel()}</small>
          </div>
        </div>

        {/* Main Charts */}
        <div className="charts-grid">
          <div className="chart-container large">
            <CashFlowTrendChart 
              data={chartData.trend} 
              title="💹 Cash Flow Trend Analysis"
            />
          </div>
          
          <div className="chart-container">
            <IncomeStreamsChart 
              data={cashFlowData.income.streams} 
              title="💰 Income Sources Breakdown"
            />
          </div>
          
          <div className="chart-container">
            <ExpenseCategoriesChart 
              data={cashFlowData.expenses.categories} 
              title="💸 Expense Categories"
            />
          </div>
          
          <div className="chart-container large">
            <MonthlyComparisonChart 
              data={chartData.monthly} 
              title="📊 Monthly Income vs Expenses"
            />
          </div>
        </div>
      </div>
    );
  };

  const renderTrendsTab = () => {
    if (!cashFlowData) return null;
    
    const chartData = prepareChartData();
    
    return (
      <div className="trends-tab">
        <div className="trends-summary">
          <div className="summary-card">
            <h3>📈 3-Month Avg</h3>
            <div className="total-amount">
              {formatCurrency(cashFlowData.trends.threeMonth)}
            </div>
            <small>Monthly average</small>
          </div>
          
          <div className="summary-card">
            <h3>📊 6-Month Avg</h3>
            <div className="total-amount">
              {formatCurrency(cashFlowData.trends.sixMonth)}
            </div>
            <small>Monthly average</small>
          </div>
          
          <div className="summary-card">
            <h3>📅 12-Month Avg</h3>
            <div className="total-amount">
              {formatCurrency(cashFlowData.trends.twelveMonth)}
            </div>
            <small>Monthly average</small>
          </div>
          
          <div className="summary-card">
            <h3>🔄 Year-over-Year</h3>
            <div className={`total-amount ${cashFlowData.trends.yearOverYear >= 0 ? 'positive' : 'expense'}`}>
              {cashFlowData.trends.yearOverYear > 0 ? '+' : ''}{cashFlowData.trends.yearOverYear.toFixed(1)}%
            </div>
            <small>Change from last year</small>
          </div>
        </div>
        
        <div className="charts-grid">
          <div className="chart-container large">
            <WaterfallChart 
              data={chartData.waterfall} 
              title="🌊 Cash Flow Waterfall Analysis"
            />
          </div>
          
          <div className="chart-container large">
            <VelocityChart 
              data={chartData.velocity} 
              title="⚡ Transaction Activity Trends"
            />
          </div>
        </div>
      </div>
    );
  };

  const renderForecastTab = () => {
    if (!forecast) return null;
    
    const chartData = prepareChartData();
    
    return (
      <div className="forecast-tab">
        <div className="forecast-summary">
          <div className="summary-card">
            <h3>🔮 Next Month</h3>
            <div className="total-amount">
              {formatCurrency(forecast.nextMonth)}
            </div>
            <small>{forecast.confidence}% confidence</small>
          </div>
          
          <div className="summary-card">
            <h3>📈 6-Month Outlook</h3>
            <div className="total-amount">
              {formatCurrency(forecast.sixMonth)}
            </div>
            <small>Projected total</small>
          </div>
          
          <div className="summary-card">
            <h3>📊 12-Month Projection</h3>
            <div className="total-amount">
              {formatCurrency(forecast.twelveMonth)}
            </div>
            <small>Annual forecast</small>
          </div>
          
          <div className="summary-card">
            <h3>📉 Volatility</h3>
            <div className="total-amount">
              {formatCurrency(forecast.volatility)}
            </div>
            <small>Standard deviation</small>
          </div>
        </div>
        
        <div className="charts-grid">
          <div className="chart-container mega">
            <ForecastChart 
              data={chartData.forecast} 
              title="🔮 Cash Flow Forecast with Confidence Intervals"
            />
          </div>
        </div>
        
        <div className="forecast-factors">
          <h3>🧠 Forecast Factors</h3>
          <div className="factors-list">
            {forecast.factors.map((factor, index) => (
              <div key={index} className="factor-item">
                <span className="factor-icon">
                  {factor === 'seasonal_variation' && '🌍'}
                  {factor === 'recurring_bills' && '🔄'}
                  {factor === 'positive_trend' && '📈'}
                  {factor === 'negative_trend' && '📉'}
                </span>
                <span className="factor-text">
                  {factor.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </span>
              </div>
            ))}
            {forecast.factors.length === 0 && (
              <p className="no-factors">No significant patterns detected</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderInsightsTab = () => {
    return (
      <div className="insights-tab">
        <div className="insights-grid">
          {insights.map((insight, index) => (
            <div key={index} className={`insight-card ${insight.type}`}>
              <div className="insight-header">
                <span className="insight-icon">{insight.icon}</span>
                <h3>{insight.title}</h3>
              </div>
              <p className="insight-message">{insight.message}</p>
              <div className={`insight-priority ${insight.priority}`}>
                {insight.priority} priority
              </div>
            </div>
          ))}
          
          {insights.length === 0 && (
            <div className="no-insights">
              <h3>🤖 AI Insights</h3>
              <p>Add more transactions to get personalized cash flow insights and recommendations.</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="cashflow-container">
        <div className="loading">
          <h3>💹 Loading Cash Flow Analytics...</h3>
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="cashflow-container">
      <div className="page-header">
        <h2>💹 Cash Flow Analytics</h2>
        <p>Advanced financial analysis, forecasting, and intelligent insights</p>
      </div>

      {/* Period and Tab Controls */}
      <div className="controls-section">
        <div className="period-selector">
          <button 
            className={selectedPeriod === 'current' ? 'active' : ''}
            onClick={() => setSelectedPeriod('current')}
          >
            This Month
          </button>
          <button 
            className={selectedPeriod === '3month' ? 'active' : ''}
            onClick={() => setSelectedPeriod('3month')}
          >
            3 Months
          </button>
          <button 
            className={selectedPeriod === '6month' ? 'active' : ''}
            onClick={() => setSelectedPeriod('6month')}
          >
            6 Months
          </button>
          <button 
            className={selectedPeriod === '12month' ? 'active' : ''}
            onClick={() => setSelectedPeriod('12month')}
          >
            12 Months
          </button>
        </div>

        <div className="tab-selector">
          <button 
            className={selectedTab === 'overview' ? 'active' : ''}
            onClick={() => setSelectedTab('overview')}
          >
            📊 Overview
          </button>
          <button 
            className={selectedTab === 'trends' ? 'active' : ''}
            onClick={() => setSelectedTab('trends')}
          >
            📈 Trends
          </button>
          <button 
            className={selectedTab === 'forecast' ? 'active' : ''}
            onClick={() => setSelectedTab('forecast')}
          >
            🔮 Forecast
          </button>
          <button 
            className={selectedTab === 'insights' ? 'active' : ''}
            onClick={() => setSelectedTab('insights')}
          >
            🧠 Insights
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {selectedTab === 'overview' && renderOverviewTab()}
        {selectedTab === 'trends' && renderTrendsTab()}
        {selectedTab === 'forecast' && renderForecastTab()}
        {selectedTab === 'insights' && renderInsightsTab()}
      </div>

      {transactions.length === 0 && (
        <div className="empty-state">
          <h3>📊 No Transaction Data</h3>
          <p>Add transactions to start analyzing your cash flow patterns and get intelligent insights.</p>
        </div>
      )}
    </div>
  );
};

export default CashFlow;
