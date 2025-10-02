import React, { useState, useRef } from 'react';
import { TRANSACTION_CATEGORIES, getCategoryIcon } from '../constants/categories';
import { parseLocalDate, formatDateForInput } from '../utils/DateUtils';
import './CSVImportModal.css';

const BillCSVImportModal = ({ existingBills, onImport, onCancel }) => {
  const [step, setStep] = useState('upload'); // upload, mapping, preview, complete
  const [previewBills, setPreviewBills] = useState([]);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [columnMapping, setColumnMapping] = useState({
    name: -1,
    amount: -1,
    category: -1,
    dueDate: -1,
    recurrence: -1,
    institutionName: -1
  });

  // Auto-tagging based on bill name patterns
  const autoDetectCategory = (billName) => {
    const name = billName.toLowerCase();
    
    if (name.includes('electric') || name.includes('power') || name.includes('utility')) return 'Bills & Utilities';
    if (name.includes('internet') || name.includes('cable') || name.includes('phone')) return 'Bills & Utilities';
    if (name.includes('rent') || name.includes('mortgage') || name.includes('hoa')) return 'Housing';
    if (name.includes('insurance') || name.includes('premium')) return 'Insurance';
    if (name.includes('gym') || name.includes('fitness') || name.includes('membership')) return 'Health & Fitness';
    if (name.includes('subscription') || name.includes('netflix') || name.includes('spotify')) return 'Entertainment';
    if (name.includes('loan') || name.includes('credit') || name.includes('debt')) return 'Loans & Debt';
    if (name.includes('gas') || name.includes('fuel') || name.includes('auto')) return 'Transportation';
    
    return 'Bills & Utilities'; // Default
  };

  const downloadTemplate = () => {
    const template = `name,amount,institutionName,dueDate,recurrence,category
Electric Bill,125.50,Pacific Power,15,monthly,Bills & Utilities
Internet Service,89.99,Comcast,20,monthly,Bills & Utilities
Rent,350.00,ABC Properties,15,monthly,Housing
Rent,350.00,ABC Properties,30,monthly,Housing
Car Insurance,450.00,State Farm,2025-03-01,monthly,Insurance`;
    
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'bills_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

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

      const headers = lines[0].split(',').map(h => h.trim());
      setCsvHeaders(headers);

      // Auto-detect column mapping with improved logic
      const lowerHeaders = headers.map(h => h.toLowerCase());
      
      // For institution name, check for "institution name" BEFORE checking for "name"
      const institutionNameCol = lowerHeaders.findIndex(h => 
        h === 'institution name' || h === 'bank name' || h === 'financial institution'
      );
      
      // For bill name, exclude institution name column and prefer specific bill-related terms
      const nameCol = lowerHeaders.findIndex((h, idx) => 
        idx !== institutionNameCol && (h === 'name' || h === 'bill' || h === 'payee' || h.includes('bill name'))
      );
      
      const amountCol = lowerHeaders.findIndex(h => h.includes('amount') || h.includes('cost') || h.includes('price'));
      const dueDateCol = lowerHeaders.findIndex(h => h.includes('due') || h.includes('date') || h === 'day of month' || h === 'day of month due');
      const categoryCol = lowerHeaders.findIndex(h => h.includes('category') || h.includes('type'));
      const recurrenceCol = lowerHeaders.findIndex(h => h.includes('recur') || h.includes('frequency') || h.includes('period'));

      setColumnMapping({
        name: nameCol,
        amount: amountCol,
        category: categoryCol,
        dueDate: dueDateCol,
        recurrence: recurrenceCol,
        institutionName: institutionNameCol
      });

      if (nameCol === -1 || amountCol === -1) {
        // Show mapping step instead of error
        setStep('mapping');
        setLoading(false);
        return;
      }

      // If auto-detection succeeded, parse immediately
      await parseCSVData(text, {
        name: nameCol,
        amount: amountCol,
        category: categoryCol,
        dueDate: dueDateCol,
        recurrence: recurrenceCol,
        institutionName: institutionNameCol
      });
    } catch (err) {
      console.error('Error parsing CSV:', err);
      setErrors([`Failed to parse CSV: ${err.message}`]);
      setLoading(false);
    }
  };

  const parseCSVData = async (text, mapping) => {
    try {
      const lines = text.split('\n').filter(line => line.trim());
      const parsedBills = [];
      const parseErrors = [];

      // Parse data rows
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = line.split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
        
        try {
          const name = mapping.name >= 0 ? values[mapping.name] || '' : '';
          const institutionName = mapping.institutionName >= 0 ? values[mapping.institutionName] || '' : '';
          const amount = mapping.amount >= 0 ? parseFloat(values[mapping.amount]?.replace(/[$,]/g, '')) || 0 : 0;
          
          if (!name || amount <= 0) {
            parseErrors.push(`Row ${i + 1}: Invalid name or amount`);
            continue;
          }

          // Enhanced date parsing with validation
          let dueDate = null;
          let dateError = null;
          let dateWarning = null;
          
          if (mapping.dueDate >= 0 && values[mapping.dueDate]) {
            const dateValue = values[mapping.dueDate].trim();
            const parsedDate = parseLocalDate(dateValue);
            
            if (parsedDate && !isNaN(parsedDate.getTime())) {
              dueDate = formatDateForInput(parsedDate);
            } else {
              dateError = `Invalid date format: "${dateValue}"`;
              parseErrors.push(`Row ${i + 1}: ${dateError}`);
            }
          } else {
            // No date provided - use today as default with warning
            dueDate = formatDateForInput(new Date());
            dateWarning = 'Date not provided, using today';
          }

          // Auto-detect category if not provided in CSV
          const detectedCategory = mapping.category >= 0 && values[mapping.category] 
            ? values[mapping.category] 
            : autoDetectCategory(name);

          const bill = {
            id: `bill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: name,
            institutionName: institutionName,
            amount: amount,
            category: detectedCategory || 'Bills & Utilities',
            dueDate: dueDate || formatDateForInput(new Date()),
            recurrence: mapping.recurrence >= 0 && values[mapping.recurrence] ? values[mapping.recurrence].toLowerCase() : 'monthly',
            status: 'pending',
            autopay: false,
            account: 'bofa',
            dateError: dateError,
            dateWarning: dateWarning,
            rowNumber: i + 1
          };

          // Enhanced duplicate detection: consider name AND due date
          // This allows same bill name with different dates (e.g., rent on 15th and 30th)
          const isDuplicate = existingBills.some(existing => 
            existing.name.toLowerCase() === bill.name.toLowerCase() &&
            Math.abs(parseFloat(existing.amount) - bill.amount) < 0.01 &&
            existing.dueDate === bill.dueDate
          );

          bill.isDuplicate = isDuplicate;
          parsedBills.push(bill);
        } catch (err) {
          parseErrors.push(`Row ${i + 1}: ${err.message}`);
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

  const handleBulkCategoryAssignment = (category) => {
    const updated = previewBills.map(bill => 
      bill.isSkipped ? bill : { ...bill, category }
    );
    setPreviewBills(updated);
  };

  const handleCategoryChange = (index, newCategory) => {
    const updated = [...previewBills];
    updated[index].category = newCategory;
    setPreviewBills(updated);
  };

  const handleDateChange = (index, newDate) => {
    const updated = [...previewBills];
    const parsedDate = parseLocalDate(newDate);
    
    if (parsedDate && !isNaN(parsedDate.getTime())) {
      updated[index].dueDate = formatDateForInput(parsedDate);
      updated[index].dateError = null;
      updated[index].dateWarning = null;
    } else {
      updated[index].dateError = 'Invalid date format';
    }
    
    setPreviewBills(updated);
  };

  const handleInstitutionChange = (index, newInstitution) => {
    const updated = [...previewBills];
    updated[index].institutionName = newInstitution;
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
              <div style={{ marginBottom: '20px', padding: '16px', background: 'rgba(0, 123, 255, 0.1)', borderRadius: '8px', border: '1px solid #007bff' }}>
                <h4 style={{ color: '#007bff', marginBottom: '8px', marginTop: 0 }}>📖 How to Import Bills</h4>
                <ul style={{ color: '#ccc', fontSize: '14px', margin: 0, paddingLeft: '20px' }}>
                  <li>Upload a CSV file with bill information</li>
                  <li>Required columns: <strong>name</strong> and <strong>amount</strong></li>
                  <li>Optional columns: <strong>institutionName</strong>, dueDate, recurrence, category</li>
                  <li>Date formats supported: YYYY-MM-DD, MM/DD/YYYY, or day of month (1-31)</li>
                  <li>Download the template below for proper formatting</li>
                  <li>Review and edit bills before importing (fix dates, categories, etc.)</li>
                  <li>Duplicate detection: same name + amount + date (allows same bill on different dates)</li>
                </ul>
              </div>
              
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h4 style={{ color: '#00ff88', margin: 0 }}>💡 CSV Format Example:</h4>
                  <button
                    onClick={downloadTemplate}
                    style={{
                      padding: '8px 16px',
                      background: '#00ff88',
                      color: '#000',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: '600',
                      fontSize: '14px'
                    }}
                  >
                    📥 Download Template
                  </button>
                </div>
                <pre style={{ fontSize: '12px', color: '#ccc', overflow: 'auto' }}>
{`name,amount,institutionName,dueDate,recurrence,category
Electric Bill,125.50,Pacific Power,15,monthly,Bills & Utilities
Internet Service,89.99,Comcast,20,monthly,Bills & Utilities
Rent,350.00,ABC Properties,15,monthly,Housing
Rent,350.00,ABC Properties,30,monthly,Housing
Car Insurance,450.00,State Farm,2025-03-01,monthly,Insurance`}
                </pre>
              </div>
            </div>
          )}

          {step === 'mapping' && (
            <div className="mapping-section">
              <h4 style={{ marginBottom: '16px', color: '#00ff88' }}>🗂️ Map CSV Columns</h4>
              <p style={{ marginBottom: '20px', color: '#ccc' }}>
                Map your CSV columns to bill fields. Required: Name and Amount
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {[
                  { key: 'name', label: 'Bill Name', required: true, tooltip: 'The name or description of the bill' },
                  { key: 'amount', label: 'Amount', required: true, tooltip: 'The bill amount (numeric value)' },
                  { key: 'institutionName', label: 'Institution Name', required: false, tooltip: 'Bank or company name (e.g., Bank of America)' },
                  { key: 'dueDate', label: 'Due Date', required: false, tooltip: 'Due date or day of month (e.g., 15, 2025-01-15, 01/15/2025)' },
                  { key: 'category', label: 'Category', required: false, tooltip: 'Bill category (auto-detected if not provided)' },
                  { key: 'recurrence', label: 'Recurrence', required: false, tooltip: 'Frequency: monthly, weekly, etc. (defaults to monthly)' }
                ].map(field => (
                  <div key={field.key} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <label 
                      style={{ width: '140px', color: '#fff', fontWeight: '600' }}
                      title={field.tooltip}
                    >
                      {field.label}
                      {field.required && <span style={{ color: '#ff6b6b' }}> *</span>}
                    </label>
                    <select
                      value={columnMapping[field.key]}
                      onChange={(e) => setColumnMapping({ ...columnMapping, [field.key]: parseInt(e.target.value) })}
                      style={{
                        flex: 1,
                        padding: '8px',
                        background: '#2a2a2a',
                        color: '#fff',
                        border: '1px solid #444',
                        borderRadius: '4px',
                        fontSize: '14px'
                      }}
                      title={field.tooltip}
                    >
                      <option value={-1}>-- Not mapped --</option>
                      {csvHeaders.map((header, idx) => (
                        <option key={idx} value={idx}>{header}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setStep('upload')}
                  style={{
                    padding: '10px 20px',
                    background: '#555',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}
                >
                  ← Back
                </button>
                <button
                  onClick={() => {
                    if (columnMapping.name === -1 || columnMapping.amount === -1) {
                      setErrors(['Name and Amount columns are required']);
                      return;
                    }
                    // Re-parse with new mapping
                    fileInputRef.current.files[0].text().then(text => {
                      parseCSVData(text, columnMapping);
                    });
                  }}
                  disabled={columnMapping.name === -1 || columnMapping.amount === -1}
                  style={{
                    padding: '10px 20px',
                    background: columnMapping.name === -1 || columnMapping.amount === -1 ? '#555' : '#00ff88',
                    color: columnMapping.name === -1 || columnMapping.amount === -1 ? '#999' : '#000',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: columnMapping.name === -1 || columnMapping.amount === -1 ? 'not-allowed' : 'pointer',
                    fontWeight: '600'
                  }}
                >
                  Continue to Preview →
                </button>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="preview-section">
              <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <h4 style={{ marginBottom: '8px' }}>
                    Preview: {previewBills.filter(b => !b.isSkipped).length} bills to import
                  </h4>
                  {previewBills.some(b => b.dateError) && (
                    <p style={{ color: '#f44336', fontSize: '14px', marginBottom: '4px' }}>
                      ❌ {previewBills.filter(b => b.dateError).length} bills have date errors
                    </p>
                  )}
                  {previewBills.some(b => b.dateWarning && !b.dateError) && (
                    <p style={{ color: '#ff9800', fontSize: '14px', marginBottom: '4px' }}>
                      ⚠️ {previewBills.filter(b => b.dateWarning && !b.dateError).length} bills have warnings
                    </p>
                  )}
                  {previewBills.some(b => b.isDuplicate) && (
                    <p style={{ color: '#ff9800', fontSize: '14px', marginBottom: '4px' }}>
                      ⚠️ {previewBills.filter(b => b.isDuplicate).length} bills appear to be duplicates
                    </p>
                  )}
                  {errors.length > 0 && (
                    <p style={{ color: '#f44336', fontSize: '14px', marginBottom: '4px' }}>
                      ❌ {errors.length} rows had parsing errors
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    onClick={handleApproveAll}
                    style={{ padding: '8px 16px', background: '#00ff88', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    title="Include all bills for import"
                  >
                    ✓ Approve All
                  </button>
                  <button
                    onClick={handleSkipAll}
                    style={{ padding: '8px 16px', background: '#ff9800', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    title="Skip all bills"
                  >
                    ✕ Skip All
                  </button>
                  {previewBills.some(b => b.dateError) && (
                    <button
                      onClick={() => {
                        const updated = previewBills.map(bill => 
                          bill.dateError ? { ...bill, isSkipped: true } : bill
                        );
                        setPreviewBills(updated);
                      }}
                      style={{ padding: '8px 16px', background: '#f44336', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                      title="Skip all bills with date errors"
                    >
                      ✕ Skip Bills with Errors
                    </button>
                  )}
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          handleBulkCategoryAssignment(e.target.value);
                          e.target.value = '';
                        }
                      }}
                      style={{
                        padding: '8px 12px',
                        background: '#6c757d',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '14px'
                      }}
                      title="Select a category to apply to all non-skipped bills at once. This is useful when importing bills that all belong to the same category."
                    >
                      <option value="">🏷️ Bulk Assign Category</option>
                      {Object.keys(TRANSACTION_CATEGORIES).map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <span 
                      style={{ 
                        marginLeft: '6px', 
                        color: '#00ff88', 
                        cursor: 'help',
                        fontSize: '16px',
                        fontWeight: 'bold'
                      }}
                      title="Bulk Assign Category allows you to set the same category for all bills that haven't been skipped. Simply select a category from the dropdown and it will be applied to all visible (non-skipped) bills at once."
                    >
                      ℹ️
                    </span>
                  </div>
                </div>
              </div>

              {errors.length > 0 && (
                <div style={{ marginBottom: '16px', padding: '12px', background: 'rgba(244, 67, 54, 0.1)', border: '1px solid #f44336', borderRadius: '8px' }}>
                  <details>
                    <summary style={{ color: '#f44336', cursor: 'pointer', fontWeight: '600' }}>
                      View Parsing Errors ({errors.length})
                    </summary>
                    <div style={{ marginTop: '8px', fontSize: '13px', color: '#ff9999' }}>
                      {errors.map((error, idx) => (
                        <div key={idx} style={{ marginBottom: '4px' }}>• {error}</div>
                      ))}
                    </div>
                  </details>
                </div>
              )}

              <div className="preview-items" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {previewBills.map((bill, index) => (
                  <div
                    key={index}
                    className="preview-item"
                    style={{
                      padding: '16px',
                      marginBottom: '12px',
                      background: bill.isSkipped ? '#2a2a2a' : '#1a1a1a',
                      border: `2px solid ${bill.dateError ? '#f44336' : bill.isDuplicate ? '#ff9800' : '#333'}`,
                      borderRadius: '8px',
                      opacity: bill.isSkipped ? 0.5 : 1
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                          <span style={{ fontSize: '24px' }}>{getCategoryIcon(bill.category)}</span>
                          <div style={{ flex: 1 }}>
                            <h4 style={{ margin: 0, color: '#fff' }}>{bill.name}</h4>
                            {bill.institutionName && (
                              <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                                🏦 {bill.institutionName}
                              </div>
                            )}
                            {bill.isDuplicate && (
                              <span style={{ fontSize: '12px', color: '#ff9800', display: 'block', marginTop: '4px' }}>
                                ⚠️ Possible Duplicate (same name, amount, and date)
                              </span>
                            )}
                            {bill.dateError && (
                              <span style={{ fontSize: '12px', color: '#f44336', display: 'block', marginTop: '4px' }}>
                                ❌ {bill.dateError}
                              </span>
                            )}
                            {bill.dateWarning && !bill.dateError && (
                              <span style={{ fontSize: '12px', color: '#ff9800', display: 'block', marginTop: '4px' }}>
                                ⚠️ {bill.dateWarning}
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ fontSize: '14px', color: '#888', display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '8px', alignItems: 'center' }}>
                          <span>💰 ${bill.amount.toFixed(2)}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>📅</span>
                            <input
                              type="date"
                              value={bill.dueDate}
                              onChange={(e) => handleDateChange(index, e.target.value)}
                              disabled={bill.isSkipped}
                              style={{
                                padding: '4px 8px',
                                background: bill.dateError ? '#3a1a1a' : '#2a2a2a',
                                color: bill.dateError ? '#ff6b6b' : '#fff',
                                border: bill.dateError ? '1px solid #f44336' : '1px solid #444',
                                borderRadius: '4px',
                                fontSize: '12px',
                                cursor: bill.isSkipped ? 'not-allowed' : 'pointer'
                              }}
                              title="Edit due date"
                            />
                          </div>
                          <span>🔄 {bill.recurrence}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span>🏷️</span>
                            <select
                              value={bill.category}
                              onChange={(e) => handleCategoryChange(index, e.target.value)}
                              disabled={bill.isSkipped}
                              style={{
                                padding: '4px 8px',
                                background: '#2a2a2a',
                                color: '#fff',
                                border: '1px solid #444',
                                borderRadius: '4px',
                                fontSize: '12px',
                                cursor: bill.isSkipped ? 'not-allowed' : 'pointer'
                              }}
                              title="Change category for this bill"
                            >
                              {Object.keys(TRANSACTION_CATEGORIES).map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </select>
                          </div>
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
                          fontWeight: '600',
                          marginLeft: '12px'
                        }}
                        title={bill.isSkipped ? 'Include this bill' : 'Skip this bill'}
                      >
                        {bill.isSkipped ? '✓ Include' : '✕ Skip'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '13px', color: '#ccc' }}>
                  {previewBills.filter(b => !b.isSkipped && b.dateError).length > 0 && (
                    <span style={{ color: '#f44336' }}>
                      ⚠️ {previewBills.filter(b => !b.isSkipped && b.dateError).length} bills have date errors - fix or skip them before importing
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    onClick={onCancel}
                    style={{ padding: '12px 24px', background: '#555', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={
                      previewBills.filter(b => !b.isSkipped).length === 0 ||
                      previewBills.filter(b => !b.isSkipped && b.dateError).length > 0
                    }
                    style={{
                      padding: '12px 24px',
                      background: 
                        previewBills.filter(b => !b.isSkipped).length === 0 ||
                        previewBills.filter(b => !b.isSkipped && b.dateError).length > 0
                          ? '#555' 
                          : '#00ff88',
                      color: '#000',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 
                        previewBills.filter(b => !b.isSkipped).length === 0 ||
                        previewBills.filter(b => !b.isSkipped && b.dateError).length > 0
                          ? 'not-allowed' 
                          : 'pointer',
                      fontWeight: '600',
                      opacity: 
                        previewBills.filter(b => !b.isSkipped).length === 0 ||
                        previewBills.filter(b => !b.isSkipped && b.dateError).length > 0
                          ? 0.5 
                          : 1
                    }}
                    title={
                      previewBills.filter(b => !b.isSkipped && b.dateError).length > 0
                        ? 'Cannot import bills with date errors. Please fix or skip them.'
                        : ''
                    }
                  >
                    Import {previewBills.filter(b => !b.isSkipped).length} Bills
                  </button>
                </div>
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
