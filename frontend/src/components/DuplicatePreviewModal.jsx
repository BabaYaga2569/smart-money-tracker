import React from 'react';
import './DuplicatePreviewModal.css';

const DuplicatePreviewModal = ({ report, onConfirm, onCancel }) => {
  if (!report) return null;

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };
  
  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString();
  };
  
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content duplicate-preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>🧹 Duplicate Bills Found</h2>
          <button className="close-btn" onClick={onCancel}>✕</button>
        </div>
        
        <div className="modal-body">
          <div className="duplicate-summary">
            <h3>Summary:</h3>
            <p>
              <strong>{report.duplicateCount} duplicate bills</strong> will be removed across{' '}
              <strong>{report.totalGroups} groups</strong>
            </p>
            <p className="summary-note">
              The oldest bill in each group will be kept. Review the list below before confirming.
            </p>
          </div>
          
          <div className="duplicate-groups">
            {report.groups.map((group, index) => (
              <div key={index} className="duplicate-group">
                <div className="keep-bill">
                  <h4>✅ KEEP: {group.keepBill.name}</h4>
                  <div className="bill-details">
                    {formatCurrency(group.keepBill.amount)} • Due: {formatDate(group.keepBill.dueDate || group.keepBill.nextDueDate)} • {group.keepBill.recurrence}
                  </div>
                </div>
                
                <div className="remove-bills">
                  <h5>❌ REMOVE ({group.removeBills.length}):</h5>
                  {group.removeBills.map((bill, idx) => (
                    <div key={idx} className="remove-bill">
                      {bill.name} • {formatCurrency(bill.amount)} • Due: {formatDate(bill.dueDate || bill.nextDueDate)} • {bill.recurrence}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn-danger" onClick={onConfirm}>
            Confirm Remove {report.duplicateCount} Duplicates
          </button>
        </div>
      </div>
    </div>
  );
};

export default DuplicatePreviewModal;
