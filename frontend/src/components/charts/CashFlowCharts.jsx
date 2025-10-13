// CashFlowCharts.jsx - Advanced chart components for cash flow visualization
import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
} from 'chart.js';
import { Bar, Line, Pie, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  Filler
);

// Common chart options for dark theme
const darkThemeOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        color: '#fff',
        font: {
          size: 12
        }
      }
    },
    tooltip: {
      backgroundColor: '#1a1a1a',
      titleColor: '#00ff88',
      bodyColor: '#fff',
      borderColor: '#333',
      borderWidth: 1
    }
  },
  scales: {
    x: {
      ticks: { 
        color: '#fff',
        font: {
          size: 11
        }
      },
      grid: { 
        color: '#333',
        borderColor: '#333'
      }
    },
    y: {
      ticks: { 
        color: '#fff',
        font: {
          size: 11
        },
        callback: function(value) {
          return '$' + Math.abs(value).toLocaleString();
        }
      },
      grid: { 
        color: '#333',
        borderColor: '#333'
      }
    }
  }
};

/**
 * Cash Flow Trend Line Chart
 */
export const CashFlowTrendChart = ({ data, title = "Cash Flow Trend" }) => {
  const chartData = {
    labels: data.labels,
    datasets: [
      {
        label: 'Income',
        data: data.income,
        borderColor: '#00ff88',
        backgroundColor: 'rgba(0, 255, 136, 0.1)',
        fill: true,
        tension: 0.4
      },
      {
        label: 'Expenses',
        data: data.expenses,
        borderColor: '#ff6b6b',
        backgroundColor: 'rgba(255, 107, 107, 0.1)',
        fill: true,
        tension: 0.4
      },
      {
        label: 'Net Flow',
        data: data.netFlow,
        borderColor: '#4ecdc4',
        backgroundColor: 'rgba(78, 205, 196, 0.1)',
        fill: false,
        tension: 0.4,
        borderWidth: 3
      }
    ]
  };

  const options = {
    ...darkThemeOptions,
    plugins: {
      ...darkThemeOptions.plugins,
      title: {
        display: true,
        text: title,
        color: '#00ff88',
        font: {
          size: 16,
          weight: 'bold'
        }
      }
    }
  };

  return <Line data={chartData} options={options} />;
};

/**
 * Income vs Expense Waterfall Chart (using Bar chart)
 */
export const WaterfallChart = ({ data, title = "Cash Flow Waterfall" }) => {
  const chartData = {
    labels: data.labels,
    datasets: [
      {
        label: 'Starting Balance',
        data: data.starting,
        backgroundColor: '#4ecdc4',
        borderColor: '#4ecdc4',
        borderWidth: 2
      },
      {
        label: 'Income',
        data: data.income,
        backgroundColor: '#00ff88',
        borderColor: '#00ff88',
        borderWidth: 2
      },
      {
        label: 'Expenses',
        data: data.expenses,
        backgroundColor: '#ff6b6b',
        borderColor: '#ff6b6b',
        borderWidth: 2
      },
      {
        label: 'Ending Balance',
        data: data.ending,
        backgroundColor: '#45b7d1',
        borderColor: '#45b7d1',
        borderWidth: 2
      }
    ]
  };

  const options = {
    ...darkThemeOptions,
    plugins: {
      ...darkThemeOptions.plugins,
      title: {
        display: true,
        text: title,
        color: '#00ff88',
        font: {
          size: 16,
          weight: 'bold'
        }
      }
    },
    scales: {
      ...darkThemeOptions.scales,
      x: {
        ...darkThemeOptions.scales.x,
        stacked: false
      },
      y: {
        ...darkThemeOptions.scales.y,
        stacked: false
      }
    }
  };

  return <Bar data={chartData} options={options} />;
};

/**
 * Income Streams Pie Chart
 */
export const IncomeStreamsChart = ({ data, title = "Income Sources" }) => {
  const chartData = {
    labels: ['Primary Income', 'Secondary Income', 'Investment Income', 'Other Income'],
    datasets: [{
      data: [data.primary, data.secondary, data.investment, data.other],
      backgroundColor: [
        '#00ff88',
        '#4ecdc4', 
        '#45b7d1',
        '#96ceb4'
      ],
      borderColor: '#333',
      borderWidth: 2
    }]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: '#fff',
          font: {
            size: 12
          },
          padding: 20
        }
      },
      title: {
        display: true,
        text: title,
        color: '#00ff88',
        font: {
          size: 16,
          weight: 'bold'
        }
      },
      tooltip: {
        backgroundColor: '#1a1a1a',
        titleColor: '#00ff88',
        bodyColor: '#fff',
        borderColor: '#333',
        borderWidth: 1,
        callbacks: {
          label: function(context) {
            const value = context.parsed;
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
            return `${context.label}: $${value.toLocaleString()} (${percentage}%)`;
          }
        }
      }
    }
  };

  return <Pie data={chartData} options={options} />;
};

/**
 * Expense Categories Doughnut Chart
 */
export const ExpenseCategoriesChart = ({ data, title = "Expense Breakdown" }) => {
  const chartData = {
    labels: ['Fixed Expenses', 'Variable Expenses', 'Discretionary Spending'],
    datasets: [{
      data: [data.fixed, data.variable, data.discretionary],
      backgroundColor: [
        '#ff6b6b',
        '#feca57',
        '#ff9ff3'
      ],
      borderColor: '#333',
      borderWidth: 2
    }]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: '#fff',
          font: {
            size: 12
          },
          padding: 20
        }
      },
      title: {
        display: true,
        text: title,
        color: '#00ff88',
        font: {
          size: 16,
          weight: 'bold'
        }
      },
      tooltip: {
        backgroundColor: '#1a1a1a',
        titleColor: '#00ff88',
        bodyColor: '#fff',
        borderColor: '#333',
        borderWidth: 1,
        callbacks: {
          label: function(context) {
            const value = context.parsed;
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
            return `${context.label}: $${value.toLocaleString()} (${percentage}%)`;
          }
        }
      }
    }
  };

  return <Doughnut data={chartData} options={options} />;
};

/**
 * Monthly Comparison Bar Chart
 */
export const MonthlyComparisonChart = ({ data, title = "Monthly Comparison" }) => {
  const chartData = {
    labels: data.labels,
    datasets: [
      {
        label: 'Income',
        data: data.income,
        backgroundColor: 'rgba(0, 255, 136, 0.8)',
        borderColor: '#00ff88',
        borderWidth: 2
      },
      {
        label: 'Expenses',
        data: data.expenses,
        backgroundColor: 'rgba(255, 107, 107, 0.8)',
        borderColor: '#ff6b6b',
        borderWidth: 2
      }
    ]
  };

  const options = {
    ...darkThemeOptions,
    plugins: {
      ...darkThemeOptions.plugins,
      title: {
        display: true,
        text: title,
        color: '#00ff88',
        font: {
          size: 16,
          weight: 'bold'
        }
      }
    },
    scales: {
      ...darkThemeOptions.scales,
      x: {
        ...darkThemeOptions.scales.x,
        stacked: false
      },
      y: {
        ...darkThemeOptions.scales.y,
        stacked: false
      }
    }
  };

  return <Bar data={chartData} options={options} />;
};

/**
 * Forecast Chart with Confidence Intervals
 */
export const ForecastChart = ({ data, title = "Cash Flow Forecast" }) => {
  const chartData = {
    labels: data.labels,
    datasets: [
      {
        label: 'Historical',
        data: data.historical,
        borderColor: '#00ff88',
        backgroundColor: 'rgba(0, 255, 136, 0.1)',
        fill: false,
        tension: 0.4,
        borderWidth: 2
      },
      {
        label: 'Forecast',
        data: data.forecast,
        borderColor: '#4ecdc4',
        backgroundColor: 'rgba(78, 205, 196, 0.1)',
        fill: false,
        tension: 0.4,
        borderWidth: 2,
        borderDash: [5, 5]
      },
      {
        label: 'Upper Bound',
        data: data.upperBound,
        borderColor: 'rgba(78, 205, 196, 0.3)',
        backgroundColor: 'rgba(78, 205, 196, 0.1)',
        fill: '+1',
        tension: 0.4,
        borderWidth: 1,
        pointRadius: 0
      },
      {
        label: 'Lower Bound',
        data: data.lowerBound,
        borderColor: 'rgba(78, 205, 196, 0.3)',
        backgroundColor: 'rgba(78, 205, 196, 0.1)',
        fill: false,
        tension: 0.4,
        borderWidth: 1,
        pointRadius: 0
      }
    ]
  };

  const options = {
    ...darkThemeOptions,
    plugins: {
      ...darkThemeOptions.plugins,
      title: {
        display: true,
        text: title,
        color: '#00ff88',
        font: {
          size: 16,
          weight: 'bold'
        }
      },
      legend: {
        ...darkThemeOptions.plugins.legend,
        filter: function(legendItem) {
          // Hide upper and lower bound from legend
          return !['Upper Bound', 'Lower Bound'].includes(legendItem.text);
        }
      }
    },
    interaction: {
      intersect: false,
      mode: 'index'
    }
  };

  return <Line data={chartData} options={options} />;
};

/**
 * Cash Flow Velocity Chart (Activity Level)
 */
export const VelocityChart = ({ data, title = "Transaction Activity" }) => {
  const chartData = {
    labels: data.labels,
    datasets: [{
      label: 'Daily Transactions',
      data: data.velocity,
      borderColor: '#feca57',
      backgroundColor: 'rgba(254, 202, 87, 0.1)',
      fill: true,
      tension: 0.4,
      borderWidth: 2
    }]
  };

  const options = {
    ...darkThemeOptions,
    plugins: {
      ...darkThemeOptions.plugins,
      title: {
        display: true,
        text: title,
        color: '#00ff88',
        font: {
          size: 16,
          weight: 'bold'
        }
      }
    },
    scales: {
      ...darkThemeOptions.scales,
      y: {
        ...darkThemeOptions.scales.y,
        ticks: {
          ...darkThemeOptions.scales.y.ticks,
          callback: function(value) {
            return value.toFixed(1);
          }
        }
      }
    }
  };

  return <Line data={chartData} options={options} />;
};
