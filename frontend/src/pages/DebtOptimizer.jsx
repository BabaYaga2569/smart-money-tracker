import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import { analyzeDebtSituation, calculateDebtFreeTimeline } from '../utils/debtAnalyzer';
import { calculatePayoffDate } from '../utils/payoffCalculator';
import { calculateTotalProjectedBalance } from '../utils/BalanceCalculator';
import { getPacificTime } from '../utils/DateUtils';
import { FinancialAnalyzer } from '../utils/FinancialAnalyzer';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import './DebtOptimizer.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function DebtOptimizer() {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState(null);
  const [extraPayment, setExtraPayment] = useState(0);
  const [timeline, setTimeline] = useState(null);
  const [notification, setNotification] = useState({ message: '', type: '' });
  const [financialAnalysis, setFinancialAnalysis] = useState(null);
  const [smartRecommendations, setSmartRecommendations] = useState(null);
  const [spendingInsights, setSpendingInsights] = useState([]);

  const loadDebtData = useCallback(async () => {
    try {
      setLoading(true);

      // Load credit cards from API
      const apiUrl =
        import.meta.env.VITE_API_URL ||
        'https://smart-money-tracker-09ks.onrender.com';
      const accountsResponse = await fetch(
        `${apiUrl}/api/accounts?userId=${currentUser.uid}&_t=${Date.now()}`
      );
      const accountsData = await accountsResponse.json();

      let creditCards = [];
      if (accountsData.success && accountsData.accounts) {
        creditCards = accountsData.accounts.filter((account) => {
          // Check type
          if (account.type === 'credit') return true;

          // Check subtype exact matches
          if (account.subtype === 'credit') return true;
          if (account.subtype === 'credit card') return true;

          // Check if subtype contains 'credit' (case-insensitive)
          if (account.subtype?.toLowerCase().includes('credit')) return true;

          // Not a credit card
          return false;
        });

        console.log(
          `[Debt Optimizer] Found ${creditCards.length} credit card(s) from ${accountsData.accounts.length} total accounts`
        );

        // Filter out cards with zero or negative balance (they have available credit, not debt)
        creditCards = creditCards.filter((card) => {
          const balance = parseFloat(
            card.balances?.current || card.balance || 0
          );
          return balance > 0;
        });

        console.log(
          `[Debt Optimizer] ${creditCards.length} card(s) have outstanding balances`
        );
      }

      // Initialize default values for optional data
      let totalAvailable = 0;
      let upcomingBills = [];
      let nextPayday = null;
      let recurringPayments = [];

      // Try to load additional data, but don't fail if it errors
      try {
        // Load transactions for balance calculation
        const transactionsRef = collection(
          db,
          'users',
          currentUser.uid,
          'transactions'
        );
        const transactionsSnapshot = await getDocs(transactionsRef);
        const transactions = transactionsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        // Load settings for spendability calculation
        const settingsDocRef = doc(
          db,
          'users',
          currentUser.uid,
          'settings',
          'personal'
        );
        const settingsDoc = await getDoc(settingsDocRef);
        const settingsData = settingsDoc.exists() ? settingsDoc.data() : {};

        const plaidAccounts = settingsData.plaidAccounts || [];
        totalAvailable = calculateTotalProjectedBalance(
          plaidAccounts,
          transactions
        );

        // Load bills
        const billsRef = collection(db, 'users', currentUser.uid, 'billInstances');
        const billsSnapshot = await getDocs(billsRef);
        const allBills = billsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        // Filter upcoming bills (before next payday)
        const payCycleDocRef = doc(
          db,
          'users',
          currentUser.uid,
          'financial',
          'payCycle'
        );
        const payCycleDoc = await getDoc(payCycleDocRef);
        const payCycleData = payCycleDoc.exists() ? payCycleDoc.data() : null;

        nextPayday =
          settingsData.nextPaydayOverride ||
          (payCycleData && payCycleData.date) ||
          null;

        if (nextPayday) {
          const today = getPacificTime();
          const paydayDate = new Date(nextPayday);
          upcomingBills = allBills.filter((bill) => {
            const billDate = new Date(bill.dueDate);
            return billDate >= today && billDate <= paydayDate && !bill.isPaid;
          });
        }

        // Load recurring payments
        const recurringItemsRef = collection(
          db,
          'users',
          currentUser.uid,
          'recurringItems'
        );
        const recurringSnapshot = await getDocs(recurringItemsRef);
        recurringPayments = recurringSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
      } catch (error) {
        console.warn('Error loading additional financial data:', error);
        showNotification(
          'Some financial data could not be loaded, showing basic debt analysis',
          'warning'
        );
      }

      // Analyze debt situation with whatever data we have
      const debtAnalysis = analyzeDebtSituation(
        creditCards,
        totalAvailable,
        upcomingBills,
        nextPayday,
        recurringPayments
      );

      setAnalysis(debtAnalysis);

      // Calculate initial timeline with no extra payment
      if (debtAnalysis.hasDebt) {
        const initialTimeline = calculateDebtFreeTimeline(
          debtAnalysis.cardsPrioritized,
          0
        );
        setTimeline(initialTimeline);
      }
    } catch (error) {
      console.error('Error loading credit card data:', error);
      showNotification('Failed to load credit card data', 'error');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  // Load all financial data
  useEffect(() => {
    if (!currentUser) return;
    loadDebtData();
  }, [currentUser, loadDebtData]);

  // Recalculate timeline when extra payment changes
  useEffect(() => {
    if (analysis && analysis.cardsPrioritized) {
      const newTimeline = calculateDebtFreeTimeline(
        analysis.cardsPrioritized,
        extraPayment
      );
      setTimeline(newTimeline);
    }
  }, [extraPayment, analysis]);

  // Analyze financial situation and generate smart recommendations
  useEffect(() => {
    if (!currentUser || !analysis || !analysis.cardsPrioritized) {
      return;
    }

    console.log('[Debt Optimizer] Running financial analysis...');

    const analyzeFinancials = async () => {
      try {
        // Load transactions for cash flow analysis
        const transactionsRef = collection(db, 'users', currentUser.uid, 'transactions');
        const transactionsSnapshot = await getDocs(transactionsRef);
        const transactions = transactionsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        // Load accounts for available cash
        const apiUrl = import.meta.env.VITE_API_URL || 'https://smart-money-tracker-09ks.onrender.com';
        const accountsResponse = await fetch(`${apiUrl}/api/accounts?userId=${currentUser.uid}&_t=${Date.now()}`);
        const accountsData = await accountsResponse.json();
        const accounts = accountsData.success ? accountsData.accounts : [];

        // Analyze cash flow
        const cashFlow = FinancialAnalyzer.analyzeCashFlow(transactions, accounts);
        
        if (!cashFlow) {
          return;
        }

        console.log('[Debt Optimizer] Cash flow:', cashFlow);

        // Analyze spending patterns
        const spending = FinancialAnalyzer.analyzeSpending(transactions);
        setSpendingInsights(spending);

        // Prepare debt data from existing analysis
        const debts = analysis.cardsPrioritized.map(c => ({
          id: c.account_id,
          name: c.name || c.official_name,
          balance: c.balance,
          interestRate: c.apr,
          minimumPayment: c.balance * 0.02
        }));

        // Calculate optimal strategy
        const strategy = FinancialAnalyzer.calculateStrategy(debts, cashFlow);
        
        if (strategy) {
          console.log('[Debt Optimizer] Strategy generated:', strategy);
          
          // Generate recommendations
          const recs = FinancialAnalyzer.generateRecommendations(strategy, cashFlow);
          
          setFinancialAnalysis({
            cashFlow,
            strategy,
            recommendations: recs
          });
          
          setSmartRecommendations(recs);
        }
      } catch (error) {
        console.warn('[Debt Optimizer] Could not generate smart recommendations:', error);
      }
    };

    analyzeFinancials();
  }, [currentUser, analysis]);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification({ message: '', type: '' }), 5000);
  };

  const handleExtraPaymentChange = (e) => {
    const value = parseFloat(e.target.value) || 0;
    setExtraPayment(Math.max(0, value));
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getChartData = () => {
    if (!timeline || !timeline.breakdown) {
      return null;
    }

    const labels = timeline.breakdown.map((b) => `Month ${b.month}`);
    const data = timeline.breakdown.map((b) => b.totalRemaining);

    return {
      labels,
      datasets: [
        {
          label: 'Remaining Debt',
          data,
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          fill: true,
          tension: 0.4,
        },
      ],
    };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      title: {
        display: true,
        text: 'Debt Payoff Projection',
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            return `Remaining: ${formatCurrency(context.parsed.y)}`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (value) => formatCurrency(value),
        },
      },
    },
  };

  if (loading) {
    return (
      <div className="debt-optimizer-container">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>Analyzing your debt situation...</p>
        </div>
      </div>
    );
  }

  if (!analysis || !analysis.hasDebt) {
    return (
      <div className="debt-optimizer-container">
        <div className="page-header">
          <h1>🧠 Smart Debt Optimizer</h1>
        </div>
        <div className="no-debt-message">
          <div className="celebration-icon">🎉</div>
          <h2>Congratulations! You&apos;re Debt-Free!</h2>
          <p>
            You have no credit card debt. Keep up the great financial habits!
          </p>
        </div>
      </div>
    );
  }

  const chartData = getChartData();

  return (
    <div className="debt-optimizer-container">
      {/* Notification */}
      {notification.message && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}

      {/* Header */}
      <div className="page-header">
        <h1>🧠 Smart Debt Optimizer</h1>
        <p>AI-powered recommendations to eliminate debt faster</p>
      </div>

      {/* Debt Summary Card */}
      <div className="debt-summary-card card">
        <h2>Debt Summary</h2>
        <div className="summary-grid">
          <div className="summary-item">
            <span className="label">Total Debt</span>
            <span className="value debt-amount">
              {formatCurrency(analysis.totalDebt)}
            </span>
          </div>
          <div className="summary-item">
            <span className="label">Average APR</span>
            <span className="value">{analysis.averageAPR.toFixed(2)}%</span>
          </div>
          <div className="summary-item">
            <span className="label">Monthly Interest</span>
            <span className="value interest-amount">
              {formatCurrency(analysis.monthlyInterest)}
            </span>
          </div>
          <div className="summary-item">
            <span className="label">Available Cash</span>
            <span className="value cash-amount">
              {formatCurrency(analysis.availableCash)}
            </span>
          </div>
        </div>
      </div>

      {/* Smart Recommendations Section */}
      {financialAnalysis && (
        <div className="smart-recommendations-section">
          <h3>🤖 AI-Powered Recommendations</h3>
          
          {/* Strategy Info */}
          <div className="strategy-card">
            <div className="strategy-header">
              <span className="strategy-badge">{financialAnalysis.strategy.strategyName}</span>
              <span className="debt-free-date">
                Debt-Free: {financialAnalysis.strategy.debtFreeDate.toLocaleDateString('en-US', {
                  month: 'short',
                  year: 'numeric'
                })}
              </span>
            </div>
            <p className="strategy-reasoning">{financialAnalysis.strategy.reasoning}</p>
          </div>

          {/* Action Items */}
          <div className="action-items">
            <h4>This Month&apos;s Action Plan:</h4>
            {smartRecommendations.map((rec, idx) => (
              <div key={idx} className={`action-item priority-${rec.priority}`}>
                <div className="action-header">
                  <span className="action-title">{rec.title}</span>
                  <span className={`priority-badge ${rec.priority}`}>{rec.priority}</span>
                </div>
                <p className="action-description">{rec.description}</p>
              </div>
            ))}
          </div>

          {/* Cash Flow Summary */}
          <div className="cash-flow-card">
            <h4>💰 Monthly Cash Flow</h4>
            <div className="cash-flow-row">
              <span>Income:</span>
              <span className="positive">${financialAnalysis.cashFlow.monthlyIncome.toFixed(2)}</span>
            </div>
            <div className="cash-flow-row">
              <span>Expenses:</span>
              <span className="negative">-${financialAnalysis.cashFlow.monthlyExpenses.toFixed(2)}</span>
            </div>
            <div className="cash-flow-row total">
              <span>Surplus:</span>
              <span className={financialAnalysis.cashFlow.monthlySurplus > 0 ? 'positive' : 'negative'}>
                ${financialAnalysis.cashFlow.monthlySurplus.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Spending Insights */}
          {spendingInsights.length > 0 && (
            <div className="spending-insights">
              <h4>💡 Spending Optimization</h4>
              {spendingInsights.map((insight, idx) => (
                <div key={idx} className="insight-item">
                  <div className="insight-row">
                    <span className="category">{insight.category}</span>
                    <span className="amount">${insight.amount.toFixed(2)}/mo</span>
                  </div>
                  <p className="insight-suggestion">
                    {insight.suggestion} → Save ${insight.potentialSavings}/mo
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AI Priority Recommendation */}
      {analysis.priorityRecommendation && (
        <div className="recommendation-card card priority-card">
          <div className="card-header">
            <h2>🎯 Priority Recommendation</h2>
            <span className={`priority-badge ${analysis.priorityRecommendation.priority.toLowerCase()}`}>
              {analysis.priorityRecommendation.priority} PRIORITY
            </span>
          </div>

          <div className="recommendation-content">
            <div className="target-card-info">
              <h3>
                {analysis.priorityCard.name || analysis.priorityCard.official_name}
              </h3>
              <div className="card-details">
                <span className="balance">
                  {formatCurrency(analysis.priorityCard.balance)}
                </span>
                <span className="apr-badge">
                  {analysis.priorityCard.apr.toFixed(2)}% APR
                </span>
              </div>
            </div>

            <div className="recommendation-action">
              <div className="action-title">
                {analysis.priorityRecommendation.action}
              </div>
              <p className="reasoning">
                {analysis.priorityRecommendation.reasoning}
              </p>
            </div>

            {analysis.priorityRecommendation.benefits &&
              analysis.priorityRecommendation.benefits.length > 0 && (
                <div className="benefits-list">
                  <h4>Benefits:</h4>
                  <ul>
                    {analysis.priorityRecommendation.benefits.map(
                      (benefit, idx) => (
                        <li key={idx}>✓ {benefit}</li>
                      )
                    )}
                  </ul>
                </div>
              )}
          </div>
        </div>
      )}

      {/* All Cards Priority List */}
      <div className="cards-priority-list card">
        <h2>Card Priority List (Debt Avalanche)</h2>
        <p className="strategy-description">
          Cards ranked by APR - pay highest rate first to minimize interest
        </p>
        <div className="cards-list">
          {analysis.cardsPrioritized.map((card, index) => {
            const recommendation = analysis.recommendations[index];
            return (
              <div key={card.account_id} className="card-item">
                <div className="card-rank">{index + 1}</div>
                <div className="card-info">
                  <h4>{card.name || card.official_name}</h4>
                  <div className="card-stats">
                    <span className="stat">
                      Balance: {formatCurrency(card.balance)}
                    </span>
                    <span className="stat apr-highlight">
                      APR: {card.apr.toFixed(2)}%
                    </span>
                    <span className="stat">
                      Interest/mo: {formatCurrency(card.monthlyInterest)}
                    </span>
                  </div>
                  {recommendation && (
                    <div className="card-recommendation">
                      <span className="recommendation-action">
                        {recommendation.action}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Payoff Timeline Visualizer */}
      <div className="timeline-visualizer card">
        <h2>Payoff Timeline</h2>
        <div className="timeline-controls">
          <label htmlFor="extra-payment">
            Extra payment per month:
            <input
              id="extra-payment"
              type="range"
              min="0"
              max="500"
              step="10"
              value={extraPayment}
              onChange={handleExtraPaymentChange}
            />
            <span className="payment-value">{formatCurrency(extraPayment)}</span>
          </label>
        </div>

        {timeline && (
          <div className="timeline-results">
            <div className="timeline-stats">
              <div className="stat-item">
                <span className="stat-label">Debt-Free In</span>
                <span className="stat-value">
                  {timeline.months} months ({timeline.years} years)
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Total Interest</span>
                <span className="stat-value interest-amount">
                  {formatCurrency(timeline.totalInterest)}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Payoff Date</span>
                <span className="stat-value">
                  {calculatePayoffDate(timeline.months)}
                </span>
              </div>
            </div>

            {chartData && (
              <div className="chart-container">
                <Line data={chartData} options={chartOptions} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Strategy Comparison */}
      <div className="strategy-comparison card">
        <h2>Debt Payoff Strategies</h2>
        <div className="strategies-grid">
          <div className="strategy-item">
            <h4>🎯 Debt Avalanche (Recommended)</h4>
            <p>Pay highest APR first - saves the most money on interest</p>
            <div className="strategy-benefit">
              Most cost-effective approach
            </div>
          </div>
          <div className="strategy-item">
            <h4>❄️ Debt Snowball</h4>
            <p>Pay smallest balance first - provides psychological wins</p>
            <div className="strategy-benefit">
              Better for motivation
            </div>
          </div>
          <div className="strategy-item">
            <h4>⚠️ Minimum Payments Only</h4>
            <p>Pay only minimums - takes longest and costs most</p>
            <div className="strategy-warning">
              Not recommended - maximizes interest paid
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
