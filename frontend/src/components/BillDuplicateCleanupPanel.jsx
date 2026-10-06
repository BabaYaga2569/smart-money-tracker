import React from 'react';

export default function BillDuplicateCleanupPanel({
  preview,
  confirmation,
  preparing,
  applying,
  hasDuplicates,
  onPrepare,
  onCancel,
  onConfirmationChange,
  onApply,
  formatCurrency
}) {
  if (!preview) {
    return (
      <div className="bill-cleanup-controls">
        <button
          type="button"
          className="bill-cleanup-preview-btn"
          onClick={onPrepare}
          disabled={preparing || !hasDuplicates}
        >
          {preparing ? 'Checking live duplicates...' : '🛡️ Preview Duplicate Cleanup'}
        </button>
      </div>
    );
  }

  return (
    <div className="bill-cleanup-controls">
      <div className="bill-cleanup-preview">
        <div className="bill-cleanup-preview-summary">
          <span className="bill-integrity-pill">
            Safe groups: {preview.summary.safeGroups}
          </span>
          <span className="bill-integrity-pill">
            Archive: {preview.summary.duplicatesToArchive}
          </span>
          <span className={`bill-integrity-pill ${preview.summary.reviewGroups ? 'danger' : ''}`}>
            Review: {preview.summary.reviewGroups}
          </span>
        </div>

        {preview.safeGroups?.map((group) => (
          <div
            key={`${group.recurringPatternId}-${group.dueDate}`}
            className="bill-cleanup-group"
          >
            <strong>{group.name}</strong> · {formatCurrency(group.amount)} · {group.dueDate}
            <div>Keep: <code>{group.keeperBillId}</code></div>
            <div>Archive: <code>{group.duplicateBillIds.join(', ')}</code></div>
            {group.keeperReasons?.length > 0 && (
              <div className="bill-cleanup-reasons">
                Keeper evidence: {group.keeperReasons.join(', ')}
              </div>
            )}
          </div>
        ))}

        {preview.reviewGroups?.map((group) => (
          <div
            key={`review-${group.recurringPatternId}-${group.dueDate}`}
            className="bill-cleanup-group review"
          >
            <strong>REVIEW REQUIRED:</strong> {group.name} · {formatCurrency(group.amount)} · {group.dueDate}
          </div>
        ))}

        {preview.canApply ? (
          <div className="bill-cleanup-confirm">
            <strong>Final confirmation</strong>
            <p>
              This archives only the extra duplicate copy and keeps a backup.
              Type <strong>ARCHIVE DUPLICATE BILLS</strong> exactly to enable the live cleanup.
            </p>
            <input
              type="text"
              value={confirmation}
              onChange={(e) => onConfirmationChange(e.target.value)}
              placeholder="ARCHIVE DUPLICATE BILLS"
              disabled={applying}
            />
            <div className="bill-cleanup-confirm-actions">
              <button type="button" onClick={onCancel} disabled={applying}>
                Cancel
              </button>
              <button
                type="button"
                className="bill-cleanup-apply-btn"
                onClick={onApply}
                disabled={applying || confirmation !== 'ARCHIVE DUPLICATE BILLS'}
              >
                {applying ? 'Backing Up & Archiving...' : 'Backup & Archive Safe Duplicates'}
              </button>
            </div>
          </div>
        ) : (
          <div className="bill-cleanup-blocked">
            Live cleanup is blocked because at least one duplicate group needs manual review.
          </div>
        )}
      </div>
    </div>
  );
}
