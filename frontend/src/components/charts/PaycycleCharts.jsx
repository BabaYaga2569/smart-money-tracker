// PaycycleCharts.jsx - Charts specific to paycycle management
import React from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  Filler
);

// Electric color palette for paycycle charts
const COLORS = {
  income: '#00ff88',
  expenses: '#ff073a',
  surplus: '#00b4ff',
  warning: '#ffdd00',
  critical: '#ff6b00',
  background: 'rgba(0, 255, 136, 0.1)',
  border: 'rgba(0, 255, 136, 0.8)'
};

/**
 * Income Timeline Chart - Shows all paychecks over time
 */
export const IncomeTimelineChart = ({ data, title = "Income Timeline" }) => {
  const chartData = {
    labels: data.dates || [],
    datasets: [
      {
        label: 'Salary',
        data: data.salary || [],
        backgroundColor: COLORS.income,
        borderColor: COLORS.income,
        borderWidth: 2,
        borderRadius: 4,
        borderSkipped: false,
      },
      {
        label: 'Side Income',
        data: data.sideIncome || [],
        backgroundColor: COLORS.surplus,
        borderColor: COLORS.surplus,
        borderWidth: 2,
        borderRadius: 4,
        borderSkipped: false,
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#fff',
          font: { family: 'Arial', size: 12 }
        }
      },
      title: {
        display: true,
        text: title,
        color: COLORS.income,
        font: { size: 16, weight: 'bold' }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: COLORS.income,
        bodyColor: '#fff',
        borderColor: COLORS.income,
        borderWidth: 1,
        displayColors: true,
        callbacks: {
          label: function(context) {
            return `${context.dataset.label}: $${context.parsed.y.toLocaleString()}`;
          }
        }
      }
    },
    scales: {
      x: {
        ticks: { color: '#ccc' },
        grid: { color: 'rgba(255, 255, 255, 0.1)' }
      },
      y: {
        ticks: { 
          color: '#ccc',
          callback: function(value) {
            return '$' + value.toLocaleString();
          }
        },
        grid: { color: 'rgba(255, 255, 255, 0.1)' }
      }
    }
  };

  return (
    <div style={{ height: '300px', width: '100%' }}>
      <Bar data={chartData} options={options} />
    </div>
  );
};

/**
 * Cash Flow Forecast Chart - Shows projected balance over time
 */
export const CashFlowForecastChart = ({ data, title = "Cash Flow Forecast" }) => {
  const chartData = {
    labels: data.dates || [],
    datasets: [
      {
        label: 'Projected Balance',
        data: data.balance || [],
        borderColor: COLORS.surplus,
        backgroundColor: COLORS.background,
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: COLORS.surplus,
        pointBorderColor: COLORS.surplus,
        pointRadius: 4,
        pointHoverRadius: 6
      },
      {
        label: 'Critical Threshold',
        data: data.dates?.map(() => 0) || [],
        borderColor: COLORS.critical,
        borderWidth: 2,
        borderDash: [5, 5],
        fill: false,
        pointRadius: 0
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: '#fff',
          font: { family: 'Arial', size: 12 }
        }
      },
      title: {
        display: true,
        text: title,
        color: COLORS.surplus,
        font: { size: 16, weight: 'bold' }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: COLORS.surplus,
        bodyColor: '#fff',
        borderColor: COLORS.surplus,
        borderWidth: 1,
        callbacks: {
          label: function(context) {
            const value = context.parsed.y;
            return `Balance: $${value.toLocaleString()}`;
          }
        }
      }
    },
    scales: {
      x: {
        type: 'time',
        time: {
          unit: 'day',
          displayFormats: {
            day: 'MMM dd'
          }
        },
        ticks: { color: '#ccc' },
        grid: { color: 'rgba(255, 255, 255, 0.1)' }
      },
      y: {
        ticks: { 
          color: '#ccc',
          callback: function(value) {
            return '$' + value.toLocaleString();
          }
        },
        grid: { color: 'rgba(255, 255, 255, 0.1)' }
      }
    }
  };

  return (
    <div style={{ height: '350px', width: '100%' }}>
      <Line data={chartData} options={options} />
    </div>
  );
};

/**
 * Payment Risk Assessment Chart - Shows bill payment risks
 */
export const PaymentRiskChart = ({ data, title = "Payment Risk Assessment" }) => {
  const riskCounts = data.reduce((acc, bill) => {
    acc[bill.riskLevel] = (acc[bill.riskLevel] || 0) + 1;
    return acc;
  }, {});

  const chartData = {
    labels: ['Low Risk', 'Medium Risk', 'High Risk', 'Critical'],
    datasets: [
      {
        data: [
          riskCounts.low || 0,
          riskCounts.medium || 0,
          riskCounts.high || 0,
          riskCounts.critical || 0
        ],
        backgroundColor: [
          COLORS.income,
          COLORS.warning,
          '#ff9500',
          COLORS.critical
        ],
        borderColor: [
          COLORS.income,
          COLORS.warning,
          '#ff9500',
          COLORS.critical
        ],
        borderWidth: 2
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: '#fff',
          font: { family: 'Arial', size: 12 },
          padding: 20
        }
      },
      title: {
        display: true,
        text: title,
        color: COLORS.warning,
        font: { size: 16, weight: 'bold' }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: COLORS.warning,
        bodyColor: '#fff',
        borderColor: COLORS.warning,
        borderWidth: 1,
        callbacks: {
          label: function(context) {
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = ((context.parsed / total) * 100).toFixed(1);
            return `${context.label}: ${context.parsed} bills (${percentage}%)`;
          }
        }
      }
    }
  };

  return (
    <div style={{ height: '300px', width: '100%' }}>
      <Doughnut data={chartData} options={options} />
    </div>
  );
};

/**
 * Income Sources Breakdown Chart
 */
export const IncomeSourcesChart = ({ data, title = "Income Sources" }) => {
  const chartData = {
    labels: data.map(source => source.name),
    datasets: [
      {
        data: data.map(source => source.monthlyAmount),
        backgroundColor: [
          COLORS.income,
          COLORS.surplus,
          COLORS.warning,
          '#bf00ff',
          '#00ffff',
          '#ff6b00'
        ],
        borderColor: [
          COLORS.income,
          COLORS.surplus,
          COLORS.warning,
          '#bf00ff',
          '#00ffff',
          '#ff6b00'
        ],
        borderWidth: 2
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          color: '#fff',
          font: { family: 'Arial', size: 12 },
          padding: 15
        }
      },
      title: {
        display: true,
        text: title,
        color: COLORS.income,
        font: { size: 16, weight: 'bold' }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: COLORS.income,
        bodyColor: '#fff',
        borderColor: COLORS.income,
        borderWidth: 1,
        callbacks: {
          label: function(context) {
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = ((context.parsed / total) * 100).toFixed(1);
            return `${context.label}: $${context.parsed.toLocaleString()} (${percentage}%)`;
          }
        }
      }
    }
  };

  return (
    <div style={{ height: '300px', width: '100%' }}>
      <Doughnut data={chartData} options={options} />
    </div>
  );
};

/**
 * Pay Frequency Analysis Chart
 */
export const PayFrequencyChart = ({ data, title = "Pay Frequency Distribution" }) => {
  const chartData = {
    labels: data.labels || [],
    datasets: [
      {
        label: 'Income Amount',
        data: data.amounts || [],
        backgroundColor: data.amounts?.map((_, index) => 
          index % 2 === 0 ? COLORS.income : COLORS.surplus
        ) || [],
        borderColor: COLORS.income,
        borderWidth: 2,
        borderRadius: 6,
        borderSkipped: false,
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      },
      title: {
        display: true,
        text: title,
        color: COLORS.income,
        font: { size: 16, weight: 'bold' }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: COLORS.income,
        bodyColor: '#fff',
        borderColor: COLORS.income,
        borderWidth: 1,
        callbacks: {
          label: function(context) {
            return `${context.label}: $${context.parsed.y.toLocaleString()}`;
          }
        }
      }
    },
    scales: {
      x: {
        ticks: { color: '#ccc' },
        grid: { color: 'rgba(255, 255, 255, 0.1)' }
      },
      y: {
        ticks: { 
          color: '#ccc',
          callback: function(value) {
            return '$' + value.toLocaleString();
          }
        },
        grid: { color: 'rgba(255, 255, 255, 0.1)' }
      }
    }
  };

  return (
    <div style={{ height: '250px', width: '100%' }}>
      <Bar data={chartData} options={options} />
    </div>
  );
};
