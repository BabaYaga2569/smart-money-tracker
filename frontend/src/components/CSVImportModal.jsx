import React, { useState } from 'react';
import { CSVImporter } from '../utils/CSVImporter';
import { RecurringManager } from '../utils/RecurringManager';
import { TRANSACTION_CATEGORIES, getCategoryIcon } from '../constants/categories';
import './CSVImportModal.css';

const CSVImportModal = ({ existingItems, onImport, onCancel }) => {
  const [step, setStep] = useState('upload'); // upload, preview, conflicts, complete
  const [importData, setImportData] = useState(null);
  const [duplicates, setDuplicates] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [previewItems, setPreviewItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFileSelect = async (event) => {
    const selectedFile = event.target.files[0];
    if (!selectedFile) return;

    if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
      setError('Please select a CSV file');
      return;
    }

    setError('');
    
    try {
      setLoading(true);
      const data = await CSVImporter.parseCSVFile(selectedFile);
      setImportData(data);
      
      if (data.errors.length > 0) {
        setError(`${data.errors.length} rows had errors. They will be skipped.`);
      }
      
      // Check for duplicates
      const duplicateCheck = RecurringManager.detectDuplicates(existingItems, data.items);
      setDuplicates(duplicateCheck);
      
      setPreviewItems(data.items);
      setStep('preview');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryChange = (index, newCategory) => {
    const updated = [...previewItems];
    updated[index] = { ...updated[index], category: newCategory };
    setPreviewItems(updated);
  };

  const handleTypeChange = (index, newType) => {
    const updated = [...previewItems];
    updated[index] = { ...updated[index], type: newType };
    setPreviewItems(updated);
  };

  const handleRemoveItem = (index) => {
    const updated = previewItems.filter((_, i) => i !== index);
    setPreviewItems(updated);
  };

  const handleProceedToConflicts = () => {
    if (duplicates.length > 0) {
      setConflicts(duplicates.map(dup => ({ ...dup, resolution: 'keep_both' })));
      setStep('conflicts');
    } else {
      handleFinalImport();
    }
  };

  const handleConflictResolution = (index, resolution) => {
    const updated = [...conflicts];
    updated[index] = { ...updated[index], resolution };
    setConflicts(updated);
  };

  const handleFinalImport = async () => {
    setLoading(true);
    
    try {
      let finalItems = [...previewItems];
      
      // Apply conflict resolutions
      conflicts.forEach(conflict => {
        switch (conflict.resolution) {
          case 'skip':
            finalItems = finalItems.filter(item => item.id !== conflict.incoming.id);
            break;
          case 'merge': {
            // Update existing item with new data
            const existingIndex = existingItems.findIndex(item => item.id === conflict.existing.id);
            if (existingIndex !== -1) {
              // Remove incoming item from finalItems
              finalItems = finalItems.filter(item => item.id !== conflict.incoming.id);
            }
            break;
          }
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

  const renderUploadStep = () => (
    <div className="csv-upload-step">
      <h3>Import Recurring Items from CSV</h3>
      <div className="upload-area">
        <input
          type="file"
          accept=".csv"
          onChange={handleFileSelect}
          className="file-input"
          id="csv-file-input"
        />
        <label htmlFor="csv-file-input" className="file-input-label">
          <div className="upload-icon">📄</div>
          <div className="upload-text">
            <strong>Choose CSV file</strong> or drag and drop
          </div>
          <div className="upload-hint">Supports common CSV formats from banks and spreadsheets</div>
        </label>
      </div>
      
      <div className="format-info">
        <h4>Supported CSV Formats:</h4>
        <ul>
          <li><strong>Name/Description:</strong> Bill name, merchant, or description</li>
          <li><strong>Amount:</strong> Payment amount (required)</li>
          <li><strong>Date:</strong> Due date or next occurrence (optional)</li>
          <li><strong>Frequency:</strong> Payment schedule (optional, defaults to monthly)</li>
          <li><strong>Category:</strong> Transaction category (optional, auto-suggested)</li>
        </ul>
      </div>
      
      {error && <div className="error-message">{error}</div>}
      {loading && <div className="loading">Processing CSV file...</div>}
    </div>
  );

  const renderPreviewStep = () => (
    <div className="csv-preview-step">
      <h3>Preview & Edit Items ({previewItems.length} items)</h3>
      
      {importData?.errors && importData.errors.length > 0 && (
        <div className="import-errors">
          <h4>Import Errors ({importData.errors.length}):</h4>
          <div className="error-list">
            {importData.errors.slice(0, 5).map((error, index) => (
              <div key={index} className="error-item">
                Row {error.row}: {error.error}
              </div>
            ))}
            {importData.errors.length > 5 && (
              <div className="error-more">... and {importData.errors.length - 5} more errors</div>
            )}
          </div>
        </div>
      )}
      
      <div className="preview-items">
        {previewItems.map((item, index) => (
          <div key={index} className="preview-item">
            <div className="item-info">
              <div className="item-icon">{getCategoryIcon(item.category)}</div>
              <div className="item-details">
                <h4>{item.name}</h4>
                <div className="item-amount">{formatCurrency(item.amount)} - {item.frequency}</div>
              </div>
            </div>
            
            <div className="item-controls">
              <select
                value={item.type}
                onChange={(e) => handleTypeChange(index, e.target.value)}
                className="type-select"
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
              
              <select
                value={item.category}
                onChange={(e) => handleCategoryChange(index, e.target.value)}
                className="category-select"
              >
                {TRANSACTION_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              
              <button
                onClick={() => handleRemoveItem(index)}
                className="remove-btn"
                title="Remove item"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
      
      <div className="preview-actions">
        <button onClick={() => setStep('upload')} className="back-btn">
          ← Back
        </button>
        <button 
          onClick={handleProceedToConflicts}
          className="continue-btn"
          disabled={previewItems.length === 0}
        >
          Continue → ({duplicates.length > 0 ? `${duplicates.length} conflicts to resolve` : 'Import items'})
        </button>
      </div>
    </div>
  );

  const renderConflictsStep = () => (
    <div className="csv-conflicts-step">
      <h3>Resolve Duplicates ({conflicts.length} conflicts)</h3>
      <p>We found potential duplicates. Please choose how to handle each one:</p>
      
      <div className="conflicts-list">
        {conflicts.map((conflict, index) => (
          <div key={index} className="conflict-item">
            <div className="conflict-header">
              <span className="similarity-score">{conflict.similarity}% match</span>
              <span className="confidence">Confidence: {conflict.confidence}%</span>
            </div>
            
            <div className="conflict-comparison">
              <div className="existing-item">
                <h4>Existing: {conflict.existing.name}</h4>
                <div className="item-details">
                  <span>{formatCurrency(conflict.existing.amount)}</span>
                  <span>{conflict.existing.frequency}</span>
                  <span>{conflict.existing.category}</span>
                </div>
              </div>
              
              <div className="vs-indicator">vs</div>
              
              <div className="incoming-item">
                <h4>New: {conflict.incoming.name}</h4>
                <div className="item-details">
                  <span>{formatCurrency(conflict.incoming.amount)}</span>
                  <span>{conflict.incoming.frequency}</span>
                  <span>{conflict.incoming.category}</span>
                </div>
              </div>
            </div>
            
            <div className="conflict-reasons">
              <strong>Match reasons:</strong> {conflict.reasons.join(', ')}
            </div>
            
            <div className="resolution-options">
              {conflict.recommendations.map((rec, recIndex) => (
                <label key={recIndex} className="resolution-option">
                  <input
                    type="radio"
                    name={`conflict-${index}`}
                    value={rec.action}
                    checked={conflicts[index].resolution === rec.action}
                    onChange={(e) => handleConflictResolution(index, e.target.value)}
                  />
                  <span className="option-label">
                    {rec.label}
                    {rec.confidence === 'high' && <span className="recommended">⭐ Recommended</span>}
                  </span>
                  <span className="option-description">{rec.description}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      <div className="conflicts-actions">
        <button onClick={() => setStep('preview')} className="back-btn">
          ← Back to Preview
        </button>
        <button 
          onClick={handleFinalImport}
          className="import-btn"
          disabled={loading}
        >
          {loading ? 'Importing...' : `Import Items`}
        </button>
      </div>
    </div>
  );

  const renderCompleteStep = () => (
    <div className="csv-complete-step">
      <div className="success-icon">✅</div>
      <h3>Import Complete!</h3>
      <p>Successfully imported {previewItems.length} recurring items.</p>
      
      <div className="import-summary">
        <div className="summary-item">
          <span className="label">Total Items:</span>
          <span className="value">{previewItems.length}</span>
        </div>
        <div className="summary-item">
          <span className="label">Conflicts Resolved:</span>
          <span className="value">{conflicts.length}</span>
        </div>
        <div className="summary-item">
          <span className="label">Errors Skipped:</span>
          <span className="value">{importData?.errors?.length || 0}</span>
        </div>
      </div>
      
      <button onClick={onCancel} className="done-btn">
        Done
      </button>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal csv-import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="step-indicator">
            <div className={`step ${step === 'upload' ? 'active' : step !== 'upload' ? 'completed' : ''}`}>1</div>
            <div className={`step ${step === 'preview' ? 'active' : step === 'conflicts' || step === 'complete' ? 'completed' : ''}`}>2</div>
            <div className={`step ${step === 'conflicts' ? 'active' : step === 'complete' ? 'completed' : ''}`}>3</div>
            <div className={`step ${step === 'complete' ? 'active' : ''}`}>4</div>
          </div>
          <button className="close-btn" onClick={onCancel}>×</button>
        </div>
        
        <div className="modal-body">
          {step === 'upload' && renderUploadStep()}
          {step === 'preview' && renderPreviewStep()}
          {step === 'conflicts' && renderConflictsStep()}
          {step === 'complete' && renderCompleteStep()}
        </div>
      </div>
    </div>
  );
};

export default CSVImportModal;