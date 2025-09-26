import React, { useState, useEffect } from 'react';
import { BillMigrationManager } from '../utils/BillMigrationManager';
import { TRANSACTION_CATEGORIES, getCategoryIcon } from '../constants/categories';
import './SettingsMigrationModal.css';

const SettingsMigrationModal = ({ settingsBills, existingItems, onImport, onCancel }) => {
  const [step, setStep] = useState('preview'); // preview, conflicts, importing, complete
  const [migrationPreview, setMigrationPreview] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (settingsBills && settingsBills.length > 0) {
      const preview = BillMigrationManager.createMigrationPreview(settingsBills, existingItems);
      setMigrationPreview(preview);
      setConflicts(preview.conflicts);
      
      if (preview.hasConflicts) {
        setStep('conflicts');
      }
    }
  }, [settingsBills, existingItems]);

  const handleConflictResolution = (conflictIndex, resolution) => {
    const updatedConflicts = [...conflicts];
    updatedConflicts[conflictIndex].resolution = resolution;
    setConflicts(updatedConflicts);
  };

  const handleCategoryChange = (itemIndex, newCategory) => {
    const updated = { ...migrationPreview };
    updated.itemsToMigrate[itemIndex].category = newCategory;
    setMigrationPreview(updated);
  };

  const handleProceedWithMigration = async () => {
    try {
      setLoading(true);
      setStep('importing');
      setError('');

      // Apply conflict resolutions
      let finalItems = [...migrationPreview.itemsToMigrate];
      
      conflicts.forEach(conflict => {
        switch (conflict.resolution) {
          case 'skip':
            finalItems = finalItems.filter(item => item.id !== conflict.incoming.id);
            break;
          case 'replace':
            // Remove existing item (will be handled in parent component)
            break;
          case 'merge':
            // Update existing item with new data (will be handled in parent component)
            break;
          case 'keep_both':
          default:
            // Keep both - no action needed
            break;
        }
      });

      await onImport(finalItems, conflicts);
      setStep('complete');
    } catch (err) {
      setError(err.message);
      setStep('preview');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const renderPreviewStep = () => (
    <div className="migration-preview-step">
      <h3>Import Bills from Settings</h3>
      <p className="preview-description">
        We found <strong>{migrationPreview?.itemsToMigrate?.length || 0} bills</strong> in your Settings page 
        that can be imported to your Recurring page for better management.
      </p>
      
      {migrationPreview?.itemsToMigrate?.length > 0 && (
        <div className="preview-items">
          <h4>Bills to Import:</h4>
          <div className="preview-list">
            {migrationPreview.itemsToMigrate.map((item, index) => (
              <div key={item.id} className="preview-item">
                <div className="item-info">
                  <div className="item-name">{item.name}</div>
                  <div className="item-details">
                    {formatCurrency(item.amount)} • {item.frequency} • Due: {item.nextOccurrence}
                  </div>
                </div>
                <div className="item-category">
                  <select
                    value={item.category}
                    onChange={(e) => handleCategoryChange(index, e.target.value)}
                    className="category-select"
                  >
                    {Object.entries(TRANSACTION_CATEGORIES).map(([key, category]) => (
                      <option key={key} value={category.name}>
                        {getCategoryIcon(category.name)} {category.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {migrationPreview?.hasConflicts && (
        <div className="conflicts-notice">
          <div className="warning-icon">⚠️</div>
          <div>
            <strong>Potential Duplicates Found</strong>
            <p>We found {conflicts.length} potential duplicate(s). Review them on the next step.</p>
          </div>
        </div>
      )}

      <div className="migration-actions">
        <button className="cancel-btn" onClick={onCancel}>
          Cancel
        </button>
        <button 
          className="proceed-btn" 
          onClick={migrationPreview?.hasConflicts ? () => setStep('conflicts') : handleProceedWithMigration}
          disabled={!migrationPreview?.itemsToMigrate?.length}
        >
          {migrationPreview?.hasConflicts ? 'Review Conflicts' : 'Import Bills'}
        </button>
      </div>
    </div>
  );

  const renderConflictsStep = () => (
    <div className="migration-conflicts-step">
      <h3>Resolve Potential Duplicates</h3>
      <p className="conflicts-description">
        We found some bills that might already exist. Please choose how to handle each one:
      </p>
      
      <div className="conflicts-list">
        {conflicts.map((conflict, index) => (
          <div key={index} className="conflict-item">
            <div className="conflict-header">
              <div className="conflict-icon">🔍</div>
              <div className="conflict-title">Potential duplicate: {conflict.incoming.name}</div>
            </div>
            
            <div className="conflict-details">
              <div className="conflict-side">
                <h4>From Settings (New)</h4>
                <div className="bill-details">
                  <div>{conflict.incoming.name}</div>
                  <div>{formatCurrency(conflict.incoming.amount)}</div>
                  <div>Due: {conflict.incoming.nextOccurrence}</div>
                  <div>Frequency: {conflict.incoming.frequency}</div>
                </div>
              </div>
              
              <div className="vs-divider">vs</div>
              
              <div className="conflict-side">
                <h4>Existing Bill</h4>
                <div className="bill-details">
                  <div>{conflict.existing.name}</div>
                  <div>{formatCurrency(conflict.existing.amount)}</div>
                  <div>Due: {conflict.existing.nextOccurrence}</div>
                  <div>Frequency: {conflict.existing.frequency}</div>
                </div>
              </div>
            </div>
            
            <div className="conflict-resolution">
              <h4>Resolution:</h4>
              <div className="resolution-options">
                <label>
                  <input
                    type="radio"
                    name={`conflict-${index}`}
                    value="keep_both"
                    checked={conflict.resolution === 'keep_both'}
                    onChange={(e) => handleConflictResolution(index, e.target.value)}
                  />
                  Keep Both (Recommended)
                </label>
                <label>
                  <input
                    type="radio"
                    name={`conflict-${index}`}
                    value="skip"
                    checked={conflict.resolution === 'skip'}
                    onChange={(e) => handleConflictResolution(index, e.target.value)}
                  />
                  Skip New Bill
                </label>
                <label>
                  <input
                    type="radio"
                    name={`conflict-${index}`}
                    value="replace"
                    checked={conflict.resolution === 'replace'}
                    onChange={(e) => handleConflictResolution(index, e.target.value)}
                  />
                  Replace Existing
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="migration-actions">
        <button className="back-btn" onClick={() => setStep('preview')}>
          Back
        </button>
        <button className="proceed-btn" onClick={handleProceedWithMigration}>
          Import with Resolutions
        </button>
      </div>
    </div>
  );

  const renderImportingStep = () => (
    <div className="migration-importing-step">
      <div className="importing-animation">
        <div className="spinner"></div>
      </div>
      <h3>Importing Bills...</h3>
      <p>Please wait while we import your bills from Settings to Recurring page.</p>
    </div>
  );

  const renderCompleteStep = () => (
    <div className="migration-complete-step">
      <div className="success-icon">✅</div>
      <h3>Import Complete!</h3>
      <p>Successfully imported {migrationPreview?.itemsToMigrate?.length || 0} bills to your Recurring page.</p>
      <p>Your bills are now sorted by due date proximity to help you prioritize payments.</p>
      
      <div className="migration-actions">
        <button className="done-btn" onClick={onCancel}>
          Done
        </button>
      </div>
    </div>
  );

  if (!migrationPreview) {
    return (
      <div className="migration-modal-overlay">
        <div className="migration-modal">
          <div className="loading-step">
            <div className="spinner"></div>
            <p>Analyzing bills for migration...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="migration-modal-overlay">
      <div className="migration-modal">
        {error && (
          <div className="error-message">
            <strong>Error:</strong> {error}
          </div>
        )}
        
        {step === 'preview' && renderPreviewStep()}
        {step === 'conflicts' && renderConflictsStep()}
        {step === 'importing' && renderImportingStep()}
        {step === 'complete' && renderCompleteStep()}
      </div>
    </div>
  );
};

export default SettingsMigrationModal;