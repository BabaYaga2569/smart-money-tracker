import { useState, useEffect } from 'react';
import { doc, collection, getDocs, setDoc, updateDoc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { PaycycleManager } from '../utils/PaycycleManager';
import { PayCycleCalculator } from '../utils/PayCycleCalculator';
import { useAuth } from '../contexts/AuthContext';
import { getLocalMidnight, parseDueDateLocal } from '../utils/dateHelpers';
import { getDaysUntilDateInPacific } from '../utils/DateUtils';
import {
  IncomeTimelineChart,
  CashFlowForecastChart,
  PaymentRiskChart,
  IncomeSourcesChart,
  PayFrequencyChart
} from '../components/charts/PaycycleCharts';
import { loadCanonicalFinancialAccounts } from '../utils/financialAccounts';
import { buildFinancialCycle, normalizeFinancialSettings } from '../utils/financialCycleEngine';
import { visibleBillOccurrences } from '../utils/billVisibility';
import './Paycycle.css';

const PayCycle = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview'); // overview, income, forecast, schedule
  const [incomeSources, setIncomeSources] = useState([]);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [incomeMetrics, setIncomeMetrics] = useState(null);
  const [cashFlowForecast, setCashFlowForecast] = useState([]);
  const [optimizedSchedule, setOptimizedSchedule] = useState([]);
  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [editingIncome, setEditingIncome] = useState(null);
  const [billsBeforePay, setBillsBeforePay] = useState([]);
  const [nextPayday, setNextPayday] = useState(null);
  const [daysUntilPayday, setDaysUntilPayday] = useState(0);
  const [billRisks, setBillRisks] = useState({ critical: [], high: [], medium: [], low: [] });
  const [warnings, setWarnings] = useState([]);

  // Auto-sync income sources from Settings
  const syncIncomeSourcesFromSettings = async () => {
    if (!currentUser) return [];
    
    try {
      const settingsRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      const settingsSnap = await getDoc(settingsRef);
      
      if (!settingsSnap.exists()) {
        console.warn('⚠️ Settings not found - user needs to configure pay schedules');
        setWarnings(prev => [...prev, '⚠️ Settings not configured. Go to Settings page to set up your pay schedules.']);
        return [];
      }
      
      const data = normalizeFinancialSettings(settingsSnap.data());
      const cycle = buildFinancialCycle({
        settings: data,
        bills: [],
        currentAvailableBalance: 0,
        horizonDays: 60
      });
      const payEvents = cycle.futurePayEvents;
      const nextRefill = cycle.nextRefill;

      // Group canonical pay events by owner/main payday so charts can still
      // display durable income sources without inventing separate schedules.
      const sources = [];
      const yourAmount = parseFloat(data.paySchedules?.yours?.amount || data.payAmount) || 0;
      const spouseAmount = parseFloat(data.paySchedules?.spouse?.amount || data.spousePayAmount) || 0;
      const nextYourEvent = payEvents.find(event => event.owner === 'yours');
      const nextSpouseEvent = payEvents.find(event => event.owner === 'spouse');

      if (yourAmount > 0 && nextYourEvent) {
        sources.push({
          id: 'yours-paycheck',
          name: `${data.personalInfo?.yourName || 'Your'} Paycheck`,
          amount: yourAmount,
          frequency: 'bi-weekly',
          nextDate: nextYourEvent.mainPaydayDate || nextYourEvent.date,
          type: 'SALARY',
          source: 'settings-auto-sync',
          active: true,
          lastPayDate: data.paySchedules?.yours?.lastPaydate || data.lastPayDate
        });
      }

      if (spouseAmount > 0 && nextSpouseEvent) {
        sources.push({
          id: 'spouse-paycheck',
          name: `${data.personalInfo?.spouseName || 'Spouse'} Paycheck`,
          amount: spouseAmount,
          frequency: 'bi-monthly',
          nextDate: nextSpouseEvent.date,
          type: 'SALARY',
          source: 'settings-auto-sync',
          active: true
        });
      }

      if (nextRefill.date) {
        setNextPayday(nextRefill.date);
        setDaysUntilPayday(getDaysUntilDateInPacific(nextRefill.date));
      }

      // Check for Plaid accounts
      if (!data.plaidAccounts || data.plaidAccounts.length === 0) {
        setWarnings(prev => [...prev, 'ℹ️ No bank accounts connected. Connect via Accounts page for automatic balance tracking.']);
      }
      
      console.log(`✅ Auto-synced ${sources.length} income sources from Settings`);
      return sources;
      
    } catch (error) {
      console.error('Error syncing income sources from Settings:', error);
      return [];
    }
  };

  // Sync current balance from plaidAccounts
  const syncBalancesFromAccounts = async () => {
    if (!currentUser) return { totalBalance: 0, accounts: [] };
    
    try {
      const settingsRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      const settingsSnap = await getDoc(settingsRef);
      
      if (!settingsSnap.exists()) return { totalBalance: 0, accounts: [] };
      
      const settings = normalizeFinancialSettings(settingsSnap.data() || {});
      const canonicalAccounts = await loadCanonicalFinancialAccounts({
        userId: currentUser.uid,
        settings,
        timeoutMs: 5000
      });
      const totalBalance = canonicalAccounts.totalAvailable;
      
      console.log(
        `✅ Synced canonical balance from ${canonicalAccounts.depositoryAccounts.length} accounts: ${totalBalance.toFixed(2)}`
      );
      
      setCurrentBalance(totalBalance);
      return { totalBalance, accounts: canonicalAccounts.depositoryAccounts };
      
    } catch (error) {
      console.error('Error syncing balances from accounts:', error);
      return { totalBalance: 0, accounts: [] };
    }
  };

  // Sync bills from financialEvents
  const syncBillsFromFinancialEvents = async () => {
    if (!currentUser) return [];
    
    try {
      const billsQuery = query(
        collection(db, 'users', currentUser.uid, 'financialEvents'),
        where('type', '==', 'bill'),
        where('isPaid', '==', false)
      );
      
      const billsSnap = await getDocs(billsQuery);
      
      const bills = visibleBillOccurrences(
        billsSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
      ).filter(bill => bill.status !== 'skipped');
      
      console.log(`✅ Synced ${bills.length} unpaid bills from financialEvents`);
      
      setBillsBeforePay(bills);
      return bills;
      
    } catch (error) {
      console.error('Error syncing bills from financialEvents:', error);
      return [];
    }
  };

  // Load next household refill directly from Settings.
  // The old financial/payCycle cache is intentionally ignored because it was
  // a second source of truth and caused cross-page date drift.
  const loadPayCycleInfo = async () => {
    if (!currentUser) return;

    try {
      const settingsRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
      const settingsSnap = await getDoc(settingsRef);
      if (!settingsSnap.exists()) return;

      const data = normalizeFinancialSettings(settingsSnap.data());
      const cycle = buildFinancialCycle({
        settings: data,
        bills: [],
        currentAvailableBalance: 0,
        horizonDays: 45
      });

      if (cycle.nextRefillDate) {
        setNextPayday(cycle.nextRefillDate);
        setDaysUntilPayday(cycle.daysUntilRefill);
      } else {
        setNextPayday(null);
        setDaysUntilPayday(null);
      }
    } catch (error) {
      console.error('Error loading pay cycle info:', error);
    }
  };

  // Calculate bill risks based on payday and balance
  const calculateBillRisks = (bills, balance, nextPaydayDate) => {
    if (!bills || bills.length === 0 || !nextPaydayDate) {
      return { critical: [], high: [], medium: [], low: [] };
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const paydayDate = new Date(nextPaydayDate);
    
    const risks = {
      critical: [],    // Due before payday AND balance too low
      high: [],        // Due soon (< 7 days) before payday
      medium: [],      // Due before payday but balance OK
      low: []          // Due after payday
    };
    
    let runningBalance = balance;
    
    // Sort bills by due date
    const sortedBills = [...bills].sort((a, b) => 
      new Date(a.dueDate) - new Date(b.dueDate)
    );
    
    sortedBills.forEach(bill => {
      const dueDate = new Date(bill.dueDate);
      const daysUntilDue = Math.floor((dueDate - today) / (1000 * 60 * 60 * 24));
      const amount = parseFloat(bill.amount || bill.cost) || 0;
      
      // Critical: overdue OR balance insufficient
      if (daysUntilDue < 0) {
        risks.critical.push({ ...bill, reason: 'Overdue' });
      }
      else if (dueDate < paydayDate && runningBalance < amount) {
        risks.critical.push({ ...bill, reason: 'Insufficient funds' });
      }
      // High: due very soon (< 7 days) before payday
      else if (daysUntilDue < 7 && dueDate < paydayDate) {
        risks.high.push(bill);
      }
      // Medium: due before payday but balance OK
      else if (dueDate < paydayDate) {
        risks.medium.push(bill);
      }
      // Low: due after payday
      else {
        risks.low.push(bill);
      }
      
      // Subtract bill from running balance if due before payday
      if (dueDate < paydayDate) {
        runningBalance -= amount;
      }
    });
    
    console.log('📊 Bill Risk Analysis:', {
      critical: risks.critical.length,
      high: risks.high.length,
      medium: risks.medium.length,
      low: risks.low.length
    });
    
    setBillRisks(risks);
    return risks;
  };

  // Load all paycycle data
  const loadPaycycleData = async () => {
    if (!currentUser) return;
    
    try {
      setLoading(true);
      setWarnings([]); // Clear previous warnings
      
      // ✅ Auto-sync income sources from Settings
      const sources = await syncIncomeSourcesFromSettings();
      setIncomeSources(sources);
      
      // ✅ Load other data in parallel
      const [balanceData, bills] = await Promise.all([
        syncBalancesFromAccounts(),
        syncBillsFromFinancialEvents(),
        loadPayCycleInfo()
      ]);
      
      // Calculate metrics for overview tab (legacy support)
      if (sources.length > 0) {
        const metrics = PaycycleManager.calculateIncomeMetrics(sources, []);
        setIncomeMetrics(metrics);
        
        // Generate cash flow forecast
        const forecast = PaycycleManager.generateCashFlowForecast(sources, bills, balanceData.totalBalance, 90);
        setCashFlowForecast(forecast);
        
        // Optimize payment schedule
        const optimized = PaycycleManager.optimizePaymentSchedule(bills, sources);
        setOptimizedSchedule(optimized);
      }
      
    } catch (error) {
      console.error('Error loading paycycle data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load all data on component mount
  useEffect(() => {
    loadPaycycleData();
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calculate bill risks when data is ready
  useEffect(() => {
    if (billsBeforePay.length > 0 && nextPayday && currentBalance >= 0) {
      calculateBillRisks(billsBeforePay, currentBalance, nextPayday);
    }
  }, [billsBeforePay, nextPayday, currentBalance]);

  // Real-time sync with Settings changes
  useEffect(() => {
    if (!currentUser) return;
    
    const settingsRef = doc(db, 'users', currentUser.uid, 'settings', 'personal');
    
    const unsubscribe = onSnapshot(settingsRef, (snap) => {
      if (snap.exists()) {
        console.log('🔄 Settings changed - refreshing Pay Cycle data');
        
        // Re-sync income sources
        syncIncomeSourcesFromSettings().then(sources => {
          setIncomeSources(sources);
        });
        
        // Re-sync balances
        syncBalancesFromAccounts();
      }
    });
    
    return () => unsubscribe();
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

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
        await updateDoc(doc(db, 'users', currentUser.uid, 'incomeSources', editingIncome.id), incomeData);
      } else {
        // Add new income source
        const newDoc = doc(collection(db, 'users', currentUser.uid, 'incomeSources'));
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
        
        {/* Display warnings if any */}
        {warnings.length > 0 && (
          <div className="warnings-banner">
            {warnings.map((warning, idx) => (
              <div key={idx} className="warning-message">
                {warning}
              </div>
            ))}
          </div>
        )}
        
        {/* Quick Stats */}
        <div className="quick-stats">
          <div className="metric-card electric-green">
            <div className="metric-icon">💸</div>
            <div className="metric-content">
              <div className="metric-value">
                {nextPayday ? formatCurrency(
                  incomeSources.find(s => {
                    const nextDate = new Date(s.nextDate);
                    const payday = new Date(nextPayday);
                    return Math.abs(nextDate - payday) < 86400000; // Within 24 hours
                  })?.amount || 0
                ) : 'N/A'}
              </div>
              <div className="metric-label">Next Paycheck</div>
              <div className="metric-subtitle">
                {nextPayday ? formatDate(nextPayday) : 'No upcoming pay'}
              </div>
            </div>
          </div>
          
          <div className="metric-card electric-blue">
            <div className="metric-icon">📅</div>
            <div className="metric-content">
              <div className="metric-value">
                {daysUntilPayday || 0}
              </div>
              <div className="metric-label">Days Until Pay</div>
              <div className="metric-subtitle">
                {nextPayday ? formatDate(nextPayday) : 'TBD'}
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
                {billsBeforePay.filter(bill => {
                  if (!nextPayday) return false;
                  const today = getLocalMidnight();
                  const dueDate = parseDueDateLocal(bill.dueDate);
                  const payday = new Date(nextPayday);
                  return dueDate && dueDate < payday;
                }).length}
              </div>
              <div className="metric-label">Bills Before Pay</div>
              <div className="metric-subtitle">
                {formatCurrency(billsBeforePay
                  .filter(bill => {
                    if (!nextPayday) return false;
                    const today = getLocalMidnight();
                    const dueDate = parseDueDateLocal(bill.dueDate);
                    const payday = new Date(nextPayday);
                    return dueDate && dueDate < payday;
                  })
                  .reduce((sum, bill) => sum + (parseFloat(bill.amount || bill.cost) || 0), 0)
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
        {incomeSources.length > 0 && incomeSources[0]?.source === 'settings-auto-sync' && (
          <span className="auto-sync-badge">✅ Auto-synced from Settings</span>
        )}
        <button className="add-button" onClick={onAdd}>
          ➕ Add Income Source (Manual)
        </button>
      </div>

      {incomeSources.length > 0 && (
        <div className="auto-sync-notice">
          <p style={{ fontSize: '13px', color: '#10b981', marginBottom: '16px' }}>
            ✅ Auto-synced from Settings - updates automatically when you change pay schedules
          </p>
        </div>
      )}

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
                {source.source === 'settings-auto-sync' && (
                  <span className="sync-badge">🔄 Auto-sync</span>
                )}
              </div>
              {source.source !== 'settings-auto-sync' && (
                <button className="edit-button" onClick={() => onEdit(source)}>
                  ✏️
                </button>
              )}
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
                  {source.nextDate 
                    ? new Date(source.nextDate).toLocaleDateString()
                    : source.lastPayDate 
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
            <p>⚠️ No income sources found in Settings.</p>
            <p>Please configure your pay schedules in Settings, or:</p>
            <button className="add-button primary" onClick={onAdd}>
              ➕ Add Income Source Manually
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
  // Use the component prop if provided, otherwise empty arrays
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
        <div className="risk-card critical">
          <div className="risk-count">{riskLevels.critical.length}</div>
          <div className="risk-label">🔴 Critical</div>
        </div>
        <div className="risk-card high">
          <div className="risk-count">{riskLevels.high.length}</div>
          <div className="risk-label">🟠 High Risk</div>
        </div>
        <div className="risk-card medium">
          <div className="risk-count">{riskLevels.medium.length}</div>
          <div className="risk-label">🟡 Medium Risk</div>
        </div>
        <div className="risk-card low">
          <div className="risk-count">{riskLevels.low.length}</div>
          <div className="risk-label">🟢 Low Risk</div>
        </div>
      </div>

      <div className="schedule-list">
        {Object.entries(riskLevels).reverse().map(([level, bills]) => (
          bills.length > 0 && (
            <div key={level} className={`risk-section ${level}`}>
              <h4>{level.charAt(0).toUpperCase() + level.slice(1)} Risk Bills ({bills.length})</h4>
              <div className="bills-grid">
                {bills.map(bill => (
                  <div key={bill.id} className="bill-card">
                    <div className="bill-header">
                      <h5>{bill.name}</h5>
                      <span className="bill-amount">${parseFloat(bill.amount || bill.cost || 0).toFixed(2)}</span>
                    </div>
                    <div className="bill-details">
                      <div className="detail">
                        <span>Due Date:</span>
                        <span>{new Date(bill.dueDate).toLocaleDateString()}</span>
                      </div>
                      {bill.suggestedPayDate && (
                        <div className="detail">
                          <span>Suggested Pay Date:</span>
                          <span>{new Date(bill.suggestedPayDate).toLocaleDateString()}</span>
                        </div>
                      )}
                      {bill.reason && (
                        <div className="detail">
                          <span>Reason:</span>
                          <span className="reason">{bill.reason}</span>
                        </div>
                      )}
                    </div>
                    {bill.recommendations?.paymentTiming && (
                      <div className="bill-recommendations">
                        <p>{bill.recommendations.paymentTiming}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        ))}
        
        {Object.values(riskLevels).every(arr => arr.length === 0) && (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <h4>No Bills Found</h4>
            <p>No unpaid bills to schedule. Add bills in the Bills page.</p>
          </div>
        )}
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
