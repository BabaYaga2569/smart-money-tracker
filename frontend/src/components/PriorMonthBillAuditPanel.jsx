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
  formatCurrency,
  archivePreview,
  archiveConfirmation,
  preparingArchive,
  applyingArchive,
  onPrepareArchive,
  onCancelArchive,
  onArchiveConfirmationChange,
  onApplyArchive
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

      <div className="prior-month-archive-controls">
        {!archivePreview ? (
          <button
            type="button"
            className="prior-month-archive-preview-btn"
            onClick={onPrepareArchive}
            disabled={preparingArchive || report.summary.likelyStale === 0}
          >
            {preparingArchive
              ? 'Re-checking stale bills...'
              : '🛡️ Preview Stale Bill Archive'}
          </button>
        ) : (
          <div className="prior-month-archive-preview">
            <div className="prior-month-audit-summary">
              <span className="bill-integrity-pill">
                Archive candidates: {archivePreview.summary.archiveCandidates}
              </span>
              <span className={`bill-integrity-pill ${archivePreview.summary.blocked ? 'danger' : ''}`}>
                Blocked: {archivePreview.summary.blocked}
              </span>
            </div>

            {archivePreview.archiveCandidates?.map(item => (
              <div className="prior-month-archive-item" key={item.billId}>
                <strong>{item.name}</strong> · {formatCurrency(item.amount)} · {item.dueDate}
                <div>Pattern next: {item.patternNextOccurrence}</div>
                <div>Bill ID: <code>{item.billId}</code></div>
              </div>
            ))}

            {archivePreview.canApply ? (
              <div className="prior-month-archive-confirm">
                <strong>Final confirmation</strong>
                <p>
                  These bills will be backed up and hidden as stale historical occurrences.
                  Recurring templates and payment history will not be changed.
                  Type <strong>ARCHIVE STALE BILLS</strong> exactly to continue.
                </p>
                <input
                  type="text"
                  value={archiveConfirmation}
                  onChange={(e) => onArchiveConfirmationChange(e.target.value)}
                  placeholder="ARCHIVE STALE BILLS"
                  disabled={applyingArchive}
                />
                <div className="prior-month-archive-actions">
                  <button type="button" onClick={onCancelArchive} disabled={applyingArchive}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="prior-month-archive-apply-btn"
                    onClick={onApplyArchive}
                    disabled={
                      applyingArchive ||
                      archiveConfirmation !== 'ARCHIVE STALE BILLS'
                    }
                  >
                    {applyingArchive
                      ? 'Backing Up & Archiving...'
                      : 'Backup & Archive Stale Bills'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bill-cleanup-blocked">
                Archive is blocked because at least one old bill no longer qualifies as safely stale.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
