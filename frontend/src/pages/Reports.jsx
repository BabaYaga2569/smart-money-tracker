import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Line, Pie } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
} from 'chart.js';
import { 
  generateFinancialInsights, 
  generateCategoryInsights,
  generateMonthlyTrend,
  calculateYearSummary
} from '../utils/financialInsights';
import './Reports.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

export default function Reports() {
  const { currentUser } = useAuth();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [payments, setPayments] = useState([]);
  const [yearPayments, setYearPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [yearSummary, setYearSummary] = useState(null);
  const [insights, setInsights] = useState([]);

  // Available years (2023, 2024, 2025)
  const availableYears = [2023, 2024, 2025];

  // Load all payments
  useEffect(() => {
    if (!currentUser) return;
    
    const loadPayments = async () => {
      try {
        setLoading(true);
        const paymentsRef = collection(db, 'users', currentUser.uid, 'bill_payments');
        const snapshot = await getDocs(paymentsRef);
        
        const paymentsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        setPayments(paymentsData);
        console.log(`✅ Loaded ${paymentsData.length} payments for reports`);
      } catch (error) {
        console.error('Error loading payments:', error);
        setPayments([]);
      } finally {
        setLoading(false);
      }
    };
    
    loadPayments();
  }, [currentUser]);

  // Filter payments by selected year and calculate analytics
  useEffect(() => {
    const filtered = payments.filter(p => {
      const paymentYear = p.year || new Date(p.paidDate).getFullYear();
      return paymentYear === selectedYear;
    });
    
    setYearPayments(filtered);
    
    if (filtered.length > 0) {
      const summary = calculateYearSummary(filtered, selectedYear);
      setYearSummary(summary);
      
      const generatedInsights = generateFinancialInsights(filtered);
      setInsights(generatedInsights);
    } else {
      setYearSummary(null);
      setInsights([]);
    }
  }, [payments, selectedYear]);

  // Prepare chart data
  const monthlyTrendData = yearSummary ? {
    labels: yearSummary.monthlyTotals.map(m => {
      const [year, month] = m.month.split('-');
      return new Date(year, month - 1).toLocaleDateString('en-US', { month: 'short' });
    }),
    datasets: [{
      label: 'Monthly Spending',
      data: yearSummary.monthlyTotals.map(m => m.total),
      borderColor: '#00ff88',
      backgroundColor: 'rgba(0, 255, 136, 0.1)',
      tension: 0.4,
      fill: true,
      pointRadius: 5,
      pointHoverRadius: 7,
      pointBackgroundColor: '#00ff88',
      pointBorderColor: '#fff',
      pointBorderWidth: 2
    }]
  } : null;

  const categoryData = yearSummary ? {
    labels: yearSummary.categoryBreakdown.map(c => c.category),
    datasets: [{
      data: yearSummary.categoryBreakdown.map(c => c.amount),
      backgroundColor: [
        '#00ff88',
        '#00d4ff',
        '#ff6b00',
        '#ffdd00',
        '#ff073a',
        '#9c27b0',
        '#4caf50',
        '#2196f3',
        '#ff9800',
        '#e91e63'
      ],
      borderColor: '#1a1a1a',
      borderWidth: 2
    }]
  } : null;

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: {
          color: '#fff',
          padding: 15,
          font: {
            size: 12
          }
        }
      },
      tooltip: {
        backgroundColor: '#0a0a0a',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: '#00ff88',
        borderWidth: 1,
        padding: 12,
        displayColors: true,
        callbacks: {
          label: (context) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y || context.parsed;
            return `${label}: ${formatCurrency(value)}`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        grid: {
          color: '#333'
        },
        ticks: {
          color: '#888',
          callback: (value) => formatCurrency(value)
        }
      },
      x: {
        grid: {
          color: '#333'
        },
        ticks: {
          color: '#888'
        }
      }
    }
  };

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'right',
        labels: {
          color: '#fff',
          padding: 15,
          font: {
            size: 12
          }
        }
      },
      tooltip: {
        backgroundColor: '#0a0a0a',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: '#00ff88',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: (context) => {
            const label = context.label || '';
            const value = context.parsed;
            const percentage = ((value / yearSummary.total) * 100).toFixed(1);
            return `${label}: ${formatCurrency(value)} (${percentage}%)`;
          }
        }
      }
    }
  };

  // Export year report to CSV
  const handleExportYearReport = () => {
    if (!yearSummary || yearPayments.length === 0) {
      alert('No data to export for this year');
      return;
    }
    
    // Summary section
    let csvContent = `Year ${selectedYear} Financial Report\n\n`;
    csvContent += `Total Spent,${yearSummary.total}\n`;
    csvContent += `Monthly Average,${yearSummary.monthlyAverage.toFixed(2)}\n`;
    csvContent += `Total Payments,${yearSummary.paymentCount}\n`;
    csvContent += `Most Expensive Month,${yearSummary.mostExpensiveMonth.month},${yearSummary.mostExpensiveMonth.amount}\n`;
    csvContent += `Least Expensive Month,${yearSummary.leastExpensiveMonth.month},${yearSummary.leastExpensiveMonth.amount}\n\n`;
    
    // Monthly breakdown
    csvContent += `Monthly Breakdown\n`;
    csvContent += `Month,Total Spent,Payment Count,Average Payment\n`;
    yearSummary.monthlyTotals.forEach(m => {
      csvContent += `${m.month},${m.total},${m.count},${m.average.toFixed(2)}\n`;
    });
    csvContent += `\n`;
    
    // Category breakdown
    csvContent += `Category Breakdown\n`;
    csvContent += `Category,Amount,Percentage,Payment Count\n`;
    yearSummary.categoryBreakdown.forEach(c => {
      csvContent += `${c.category},${c.amount},${c.percentage}%,${c.count}\n`;
    });
    csvContent += `\n`;
    
    // All payments
    csvContent += `All Payments\n`;
    csvContent += `Bill Name,Amount,Category,Paid Date,Payment Method\n`;
    yearPayments.forEach(p => {
      csvContent += `"${p.billName}",${p.amount},"${p.category}",${p.paidDate},"${p.paymentMethod}"\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financial-report-${selectedYear}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatMonth = (monthStr) => {
    if (!monthStr) return '--';
    const [year, month] = monthStr.split('-');
    return new Date(year, month - 1).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long' 
    });
  };

  const getInsightColor = (type) => {
    switch (type) {
      case 'success': return '#00ff88';
      case 'warning': return '#ffdd00';
      case 'info': return '#00d4ff';
      default: return '#888';
    }
  };

  if (loading) {
    return (
      <div className="reports-container">
        <div className="page-header">
          <h2>📊 Financial Reports</h2>
          <p>Loading your financial data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="reports-container">
      <div className="page-header">
        <div className="header-content">
          <div>
            <h2>📊 Financial Reports</h2>
            <p>Comprehensive financial analytics and insights</p>
          </div>
          <div className="header-actions">
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="year-selector"
            >
              {availableYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            <button 
              onClick={handleExportYearReport}
              disabled={!yearSummary || yearPayments.length === 0}
              className="export-btn"
            >
              📊 Export Report
            </button>
          </div>
        </div>
      </div>

      {yearSummary ? (
        <>
          {/* Year Overview Stats */}
          <div className="stats-grid">
            <div className="stat-card">
              <h3>Total Spent in {selectedYear}</h3>
              <div className="stat-value">{formatCurrency(yearSummary.total)}</div>
              <div className="stat-label">{yearSummary.paymentCount} payments made</div>
            </div>
            <div className="stat-card">
              <h3>Monthly Average</h3>
              <div className="stat-value">{formatCurrency(yearSummary.monthlyAverage)}</div>
              <div className="stat-label">Per month</div>
            </div>
            <div className="stat-card">
              <h3>Most Expensive Month</h3>
              <div className="stat-value">{formatCurrency(yearSummary.mostExpensiveMonth.amount)}</div>
              <div className="stat-label">{formatMonth(yearSummary.mostExpensiveMonth.month)}</div>
            </div>
            <div className="stat-card">
              <h3>Least Expensive Month</h3>
              <div className="stat-value">{formatCurrency(yearSummary.leastExpensiveMonth.amount)}</div>
              <div className="stat-label">{formatMonth(yearSummary.leastExpensiveMonth.month)}</div>
            </div>
          </div>

          {/* Charts Section */}
          <div className="charts-grid">
            <div className="chart-card">
              <h3>📈 Monthly Spending Trend</h3>
              <div className="chart-container">
                {monthlyTrendData && (
                  <Line data={monthlyTrendData} options={chartOptions} />
                )}
              </div>
            </div>
            <div className="chart-card">
              <h3>🥧 Category Breakdown</h3>
              <div className="chart-container">
                {categoryData && (
                  <Pie data={categoryData} options={pieOptions} />
                )}
              </div>
            </div>
          </div>

          {/* Category Table */}
          <div className="category-table-section">
            <h3>Category Spending Details</h3>
            <table className="category-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Total Amount</th>
                  <th>Percentage</th>
                  <th>Payment Count</th>
                  <th>Average Payment</th>
                </tr>
              </thead>
              <tbody>
                {yearSummary.categoryBreakdown.map((cat, index) => (
                  <tr key={index}>
                    <td>{cat.category}</td>
                    <td className="amount-cell">{formatCurrency(cat.amount)}</td>
                    <td>{cat.percentage}%</td>
                    <td>{cat.count}</td>
                    <td>{formatCurrency(cat.amount / cat.count)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top 10 Expenses */}
          <div className="top-expenses-section">
            <h3>💰 Top 10 Expenses</h3>
            <div className="top-expenses-list">
              {yearPayments
                .sort((a, b) => b.amount - a.amount)
                .slice(0, 10)
                .map((payment, index) => (
                  <div key={payment.id} className="expense-item">
                    <div className="expense-rank">#{index + 1}</div>
                    <div className="expense-details">
                      <div className="expense-name">{payment.billName}</div>
                      <div className="expense-meta">
                        {payment.category} • {new Date(payment.paidDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                      </div>
                    </div>
                    <div className="expense-amount">{formatCurrency(payment.amount)}</div>
                  </div>
                ))}
            </div>
          </div>

          {/* Smart Insights */}
          {insights.length > 0 && (
            <div className="insights-section">
              <h3>💡 Smart Insights</h3>
              <div className="insights-grid">
                {insights.map((insight, index) => (
                  <div 
                    key={index} 
                    className={`insight-card ${insight.type}`}
                    style={{ borderColor: getInsightColor(insight.type) }}
                  >
                    <div className="insight-icon">{insight.icon}</div>
                    <div className="insight-content">
                      <h4>{insight.title}</h4>
                      <p>{insight.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="no-data-message">
          <h3>📭 No Data Available</h3>
          <p>No bill payments found for {selectedYear}. Start paying bills to see your financial reports!</p>
        </div>
      )}
    </div>
  );
}
