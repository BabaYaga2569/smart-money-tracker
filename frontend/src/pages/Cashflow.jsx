import React from 'react';
import './CashFlow.css';

const CashFlow = () => {
  return (
    <div className="cashflow-container">
      <div className="page-header">
        <h2>📈 Cash Flow</h2>
        <p>Analyze your income vs expenses over time</p>
      </div>

      <div className="cashflow-summary">
        <div className="summary-card">
          <h3>This Month</h3>
          <div className="total-amount positive">+$543</div>
          <small>Net cash flow</small>
        </div>
      </div>

      <div className="coming-soon">
        <h3>🚧 Coming Soon</h3>
        <p>Cash flow analysis and visualization will be available after Phase 3 (Plaid Integration).</p>
      </div>
    </div>
  );
};

export default CashFlow;