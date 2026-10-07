import React from 'react';

const labelFor = recommendation => {
  switch (recommendation) {
    case 'MATCH_REVIEW':
      return '🟦 MATCH REVIEW';
    case 'ARCHIVE_REVIEW':
      return '🟨 ARCHIVE REVIEW';
    case 'REVIEW_PAYMENT_STATE':
      return '🟥 PAYMENT STATE REVIEW';
    case 'MANUAL_REVIEW':
      return '🟪 MANUAL REVIEW';
    default:
      return '🟩 KEEP OPEN';
  }
};

export default function PriorMonthBillAuditPanel({
  report,
  loading,
  onRun,
  formatCurrency
}) {
  if (!report) {
    return (
      <div className="prior-month-audit-controls">
        <button
          type="button"
          className="prior-month-audit-btn"
          onClick={onRun}
          disabled={loading}
        >
          {loading ? 'Auditing old bills...' : '🕵️ Audit Prior-Month Unpaid Bills'}
        </button>
      </div>
    );
  }

  return (
    <div className="prior-month-audit-panel">
      <div className="prior-month-audit-summary">
        <span className="bill-integrity-pill">Old unpaid: {report.summary.total}</span>
        <span className="bill-integrity-pill">Posted matches: {report.summary.postedMatches}</span>
        <span className="bill-integrity-pill">Likely stale: {report.summary.likelyStale}</span>
        <span className="bill-integrity-pill">Keep open: {report.summary.keepOpen}</span>
      </div>

      {report.items.map(item => (
        <div className="prior-month-audit-item" key={item.billId}>
          <div className="prior-month-audit-title">
            <strong>{item.name}</strong>
            <span>{formatCurrency(item.amount)} · {item.dueDate}</span>
          </div>

          <div className="prior-month-audit-recommendation">
            {labelFor(item.recommendation)}
          </div>

          <div className="prior-month-audit-reason">{item.reason}</div>

          <div className="prior-month-audit-meta">
            <span>Bill ID: {item.billId}</span>
            <span>Pattern: {item.recurringPatternName || item.recurringPatternId || 'None'}</span>
            <span>Pattern next: {item.patternNextOccurrence || 'None'}</span>
          </div>

          {item.bestMatch && (
            <div className="prior-month-audit-match">
              <strong>Posted match:</strong>{' '}
              {item.bestMatch.name} · {formatCurrency(item.bestMatch.amount)} · {item.bestMatch.date}
              <div>
                Confidence: {Math.round((item.bestMatch.confidence || 0) * 100)}%
                {' · '}
                Name {item.bestMatch.criteria?.name ? '✓' : '✗'}
                {' · '}
                Amount {item.bestMatch.criteria?.amount ? '✓' : '✗'}
                {' · '}
                Date {item.bestMatch.criteria?.date ? '✓' : '✗'}
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="prior-month-audit-note">
        Read-only audit. No bill was paid, archived, deleted, or advanced.
      </div>
    </div>
  );
}
