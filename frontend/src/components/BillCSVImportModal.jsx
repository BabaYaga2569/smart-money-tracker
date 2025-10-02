import React, { useState, useRef } from 'react';
import { TRANSACTION_CATEGORIES, getCategoryIcon } from '../constants/categories';
import './CSVImportModal.css';

const BillCSVImportModal = ({ existingBills, onImport, onCancel }) => {
  const [step, setStep] = useState('upload'); // upload, preview, complete
  const [previewBills, setPreviewBills] = useState([]);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = async (event) => {
    const selectedFile = event.target.files[0];
    if (!selectedFile) return;

    try {
      setLoading(true);
      setErrors([]);
      
      const text = await selectedFile.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        setErrors(['CSV file must have header and data rows']);
        setLoading(false);
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const parsedBills = [];
      const parseErrors = [];

      // Detect column mapping
      const nameCol = headers.findIndex(h => h.includes('name') || h.includes('bill') || h.includes('payee'));
      const amountCol = headers.findIndex(h => h.includes('amount') || h.includes('cost') || h.includes('price'));
      const dueDateCol = headers.findIndex(h => h.includes('due') || h.includes('date'));
      const categoryCol = headers.findIndex(h => h.includes('category') || h.includes('type'));
      const recurrenceCol = headers.findIndex(h => h.includes('recur') || h.includes('frequency') || h.includes('period'));

      if (nameCol === -1 || amountCol === -1) {
        setErrors(['CSV must have "name" and "amount" columns']);
        setLoading(false);
        return;
      }

      // Parse data rows
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = line.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
        
        try {
          const name = values[nameCol] || '';
          const amount = parseFloat(values[amountCol]?.replace(/[$,]/g, '')) || 0;
          
          if (!name || amount <= 0) {
            parseErrors.push(`Row ${i}: Invalid name or amount`);
            continue;
          }

          const bill = {
            id: `bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: name,
            amount: amount,
            category: categoryCol >= 0 && values[categoryCol] ? values[categoryCol] : 'Bills & Utilities',
            dueDate: dueDateCol >= 0 && values[dueDateCol] ? values[dueDateCol] : new Date().toISOString().split('T')[0],
            recurrence: recurrenceCol >= 0 && values[recurrenceCol] ? values[recurrenceCol].toLowerCase() : 'monthly',
            status: 'pending',
            autopay: false,
            account: 'bofa'
          };

          // Check for duplicates
          const isDuplicate = existingBills.some(existing => 
            existing.name.toLowerCase() === bill.name.toLowerCase() &&
            Math.abs(parseFloat(existing.amount) - bill.amount) < 0.01
          );

          bill.isDuplicate = isDuplicate;
          parsedBills.push(bill);
        } catch (err) {
          parseErrors.push(`Row ${i}: ${err.message}`);
        }
      }

      if (parsedBills.length === 0) {
        setErrors(['No valid bills found in CSV']);
        setLoading(false);
        return;
      }

      setPreviewBills(parsedBills);
      setErrors(parseErrors);
      setStep('preview');
    } catch (err) {
      console.error('Error parsing CSV:', err);
      setErrors([`Failed to parse CSV: ${err.message}`]);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = () => {
    const billsToImport = previewBills.filter(bill => !bill.isSkipped);
    onImport(billsToImport);
    setStep('complete');
  };

  const handleSkipBill = (index) => {
    const updated = [...previewBills];
    updated[index].isSkipped = !updated[index].isSkipped;
    setPreviewBills(updated);
  };

  const handleApproveAll = () => {
    const updated = previewBills.map(bill => ({ ...bill, isSkipped: false }));
    setPreviewBills(updated);
  };

  const handleSkipAll = () => {
    const updated = previewBills.map(bill => ({ ...bill, isSkipped: true }));
    setPreviewBills(updated);
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal csv-import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>📊 Import Bills from CSV</h3>
          <button className="close-btn" onClick={onCancel}>×</button>
        </div>

        <div className="modal-body">
          {step === 'upload' && (
            <div className="upload-section">
              <p style={{ marginBottom: '20px', color: '#ccc' }}>
                Upload a CSV file with bill information. Required columns: name, amount
              </p>
              
              <div className="file-upload-area">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  className="upload-btn"
                  style={{
                    padding: '20px 40px',
                    fontSize: '16px',
                    background: '#00ff88',
                    color: '#000',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontWeight: '600'
                  }}
                >
                  {loading ? '📄 Processing...' : '📁 Choose CSV File'}
                </button>
              </div>

              {errors.length > 0 && (
                <div className="error-section" style={{ marginTop: '20px', padding: '12px', background: 'rgba(244, 67, 54, 0.1)', borderRadius: '8px', border: '1px solid #f44336' }}>
                  <h4 style={{ color: '#f44336', marginBottom: '8px' }}>⚠️ Errors:</h4>
                  {errors.map((err, idx) => (
                    <div key={idx} style={{ color: '#ff9999', fontSize: '14px' }}>{err}</div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: '30px', padding: '16px', background: 'rgba(0, 255, 136, 0.1)', borderRadius: '8px', border: '1px solid #00ff88' }}>
                <h4 style={{ color: '#00ff88', marginBottom: '8px' }}>💡 CSV Format Example:</h4>
                <pre style={{ fontSize: '12px', color: '#ccc', overflow: 'auto' }}>
{`name,amount,category,dueDate,recurrence
Electric Bill,125.50,Bills & Utilities,2025-02-15,monthly
Internet Service,89.99,Bills & Utilities,2025-02-20,monthly
Car Insurance,450.00,Insurance,2025-03-01,monthly`}
                </pre>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="preview-section">
              <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h4 style={{ marginBottom: '8px' }}>
                    Preview: {previewBills.filter(b => !b.isSkipped).length} bills to import
                  </h4>
                  {previewBills.some(b => b.isDuplicate) && (
                    <p style={{ color: '#ff9800', fontSize: '14px' }}>
                      ⚠️ Some bills appear to be duplicates
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={handleApproveAll}
                    style={{ padding: '8px 16px', background: '#00ff88', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    ✓ Approve All
                  </button>
                  <button
                    onClick={handleSkipAll}
                    style={{ padding: '8px 16px', background: '#ff9800', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    ✕ Skip All
                  </button>
                </div>
              </div>

              <div className="preview-items" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {previewBills.map((bill, index) => (
                  <div
                    key={index}
                    className="preview-item"
                    style={{
                      padding: '16px',
                      marginBottom: '12px',
                      background: bill.isSkipped ? '#2a2a2a' : '#1a1a1a',
                      border: `2px solid ${bill.isDuplicate ? '#ff9800' : '#333'}`,
                      borderRadius: '8px',
                      opacity: bill.isSkipped ? 0.5 : 1
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                          <span style={{ fontSize: '24px' }}>{getCategoryIcon(bill.category)}</span>
                          <div>
                            <h4 style={{ margin: 0, color: '#fff' }}>{bill.name}</h4>
                            {bill.isDuplicate && (
                              <span style={{ fontSize: '12px', color: '#ff9800' }}>⚠️ Possible Duplicate</span>
                            )}
                          </div>
                        </div>
                        <div style={{ fontSize: '14px', color: '#888', display: 'flex', gap: '20px' }}>
                          <span>💰 ${bill.amount.toFixed(2)}</span>
                          <span>📅 {bill.dueDate}</span>
                          <span>🔄 {bill.recurrence}</span>
                          <span>🏷️ {bill.category}</span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleSkipBill(index)}
                        style={{
                          padding: '8px 16px',
                          background: bill.isSkipped ? '#00ff88' : '#f44336',
                          color: bill.isSkipped ? '#000' : '#fff',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: '600'
                        }}
                      >
                        {bill.isSkipped ? '✓ Include' : '✕ Skip'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  onClick={onCancel}
                  style={{ padding: '12px 24px', background: '#555', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={previewBills.filter(b => !b.isSkipped).length === 0}
                  style={{
                    padding: '12px 24px',
                    background: previewBills.filter(b => !b.isSkipped).length === 0 ? '#555' : '#00ff88',
                    color: '#000',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: previewBills.filter(b => !b.isSkipped).length === 0 ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                    opacity: previewBills.filter(b => !b.isSkipped).length === 0 ? 0.5 : 1
                  }}
                >
                  Import {previewBills.filter(b => !b.isSkipped).length} Bills
                </button>
              </div>
            </div>
          )}

          {step === 'complete' && (
            <div className="complete-section" style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>✅</div>
              <h3 style={{ color: '#00ff88', marginBottom: '10px' }}>Import Complete!</h3>
              <p style={{ color: '#ccc' }}>
                Successfully imported {previewBills.filter(b => !b.isSkipped).length} bills
              </p>
              <button
                onClick={onCancel}
                style={{
                  marginTop: '20px',
                  padding: '12px 24px',
                  background: '#00ff88',
                  color: '#000',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BillCSVImportModal;
