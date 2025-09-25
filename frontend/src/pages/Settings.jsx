import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { PayCycleCalculator } from '../utils/PayCycleCalculator';
import './Settings.css';

const Settings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  
  // Personal Information
  const [personalInfo, setPersonalInfo] = useState({
    yourName: '',
    spouseName: ''
  });

  // Pay schedules
  const [paySchedules, setPaySchedules] = useState({
    yours: {
      type: 'bi-weekly',
      amount: '',
      lastPaydate: '',
      bankSplit: {
        fixedAmount: { bank: 'SoFi', amount: '' },
        remainder: { bank: 'BofA' }
      }
    },
    spouse: {
      type: 'bi-monthly',
      amount: '',
      dates: [15, 30]
    }
  });

  // Bank accounts
  const [bankAccounts, setBankAccounts] = useState({
    bofa: { name: 'Bank of America', type: 'Checking', balance: '' },
    sofi: { name: 'SoFi', type: 'Savings', balance: '' },
    usaa: { name: 'USAA', type: 'Checking', balance: '' },
    cap1: { name: 'Capital One', type: 'Credit', balance: '' }
  });

  // Bills
  const [bills, setBills] = useState([]);

  // Preferences
  const [preferences, setPreferences] = useState({
    safetyBuffer: 200,
    weeklyEssentials: 150
  });

  // CSV upload state
  const [csvFile, setCsvFile] = useState(null);
  const [csvPreview, setCsvPreview] = useState([]);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      
      const settingsDocRef = doc(db, 'users', 'steve-colburn', 'settings', 'personal');
      const settingsDocSnap = await getDoc(settingsDocRef);

      if (settingsDocSnap.exists()) {
        const data = settingsDocSnap.data();
        
        setPersonalInfo(data.personalInfo || personalInfo);
        setPaySchedules(data.paySchedules || paySchedules);
        setBankAccounts(data.bankAccounts || bankAccounts);
        setBills(data.bills || []);
        setPreferences(data.preferences || preferences);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      setMessage('Error loading settings');
    } finally {
      setLoading(false);
    }
  };

  const handleCSVUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        setMessage('CSV file must have header and data rows');
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const data = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim());
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        return row;
      });

      const nameColumn = headers.find(h => h.includes('name') || h.includes('bill'));
      const amountColumn = headers.find(h => h.includes('amount') || h.includes('cost'));
      const dateColumn = headers.find(h => h.includes('date') || h.includes('due'));

      if (!nameColumn || !amountColumn) {
        setMessage('CSV must have name and amount columns');
        return;
      }

      const processedBills = data.map(row => ({
        name: row[nameColumn] || '',
        amount: parseFloat(row[amountColumn]) || 0,
        dueDate: dateColumn ? formatDate(row[dateColumn]) : '',
        recurrence: 'monthly'
      })).filter(bill => bill.name && bill.amount > 0);

      setCsvPreview(processedBills);
      setMessage(`Found ${processedBills.length} bills in CSV`);
    };

    reader.readAsText(file);
  };

  const importCSVBills = () => {
    setBills([...bills, ...csvPreview]);
    setCsvPreview([]);
    setCsvFile(null);
    setMessage('Bills imported successfully!');
  };

  const formatDate = (dateInput) => {
    if (!dateInput) return '';
    
    if (/^\d{1,2}$/.test(dateInput.toString())) {
      const day = parseInt(dateInput);
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth();
      const thisMonth = new Date(year, month, day);
      
      if (thisMonth < today) {
        const nextMonth = new Date(year, month + 1, day);
        return `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      } else {
        return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
    
    const date = new Date(dateInput);
    if (!isNaN(date.getTime())) {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }
    
    return dateInput;
  };

  const addBill = () => {
    setBills([...bills, { name: '', amount: '', dueDate: '', recurrence: 'monthly' }]);
  };

  const updateBill = (index, field, value) => {
    const updatedBills = [...bills];
    updatedBills[index][field] = value;
    setBills(updatedBills);
  };

  const removeBill = (index) => {
    setBills(bills.filter((_, i) => i !== index));
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      setMessage('');

      const settingsData = {
        personalInfo,
        paySchedules,
        bankAccounts,
        bills: bills.filter(bill => bill.name && bill.amount),
        preferences,
        lastUpdated: new Date().toISOString()
      };

      await setDoc(doc(db, 'users', 'steve-colburn', 'settings', 'personal'), settingsData);

      // Calculate and save pay cycle data
      const nextPaydayInfo = PayCycleCalculator.calculateNextPayday(
        paySchedules.yours,
        paySchedules.spouse
      );

      if (nextPaydayInfo) {
        await setDoc(doc(db, 'users', 'steve-colburn', 'financial', 'payCycle'), nextPaydayInfo);
      }

      setMessage('Settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage('Error saving settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="settings-container">
        <div className="page-header">
          <h2>⚙️ Financial Settings</h2>
          <p>Loading your settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-container">
      <div className="page-header">
        <h2>⚙️ Financial Settings</h2>
        <p>Configure your pay schedules, bank accounts, and bills</p>
        {message && (
          <div className={`message ${message.includes('Error') ? 'error' : 'success'}`}>
            {message}
          </div>
        )}
      </div>

      <div className="settings-tiles-grid">
        
        {/* Tile 1: Personal Information */}
        <div className="settings-tile">
          <h3>👤 Personal Information</h3>
          <div className="tile-content">
            <div className="form-group">
              <label>Your Name</label>
              <input
                type="text"
                value={personalInfo.yourName}
                onChange={(e) => setPersonalInfo({...personalInfo, yourName: e.target.value})}
                placeholder="Enter your name"
              />
            </div>
            <div className="form-group">
              <label>Spouse Name</label>
              <input
                type="text"
                value={personalInfo.spouseName}
                onChange={(e) => setPersonalInfo({...personalInfo, spouseName: e.target.value})}
                placeholder="Enter spouse name"
              />
            </div>
          </div>
        </div>

        {/* Tile 2: Your Pay Schedule */}
        <div className="settings-tile">
          <h3>💰 Your Pay Schedule (Bi-Weekly)</h3>
          <div className="tile-content">
            <div className="form-group">
              <label>Pay Amount</label>
              <input
                type="number"
                value={paySchedules.yours.amount}
                onChange={(e) => setPaySchedules({
                  ...paySchedules,
                  yours: {...paySchedules.yours, amount: e.target.value}
                })}
                placeholder="2500.00"
              />
            </div>
            <div className="form-group">
              <label>Last Pay Date</label>
              <input
                type="date"
                value={paySchedules.yours.lastPaydate}
                onChange={(e) => setPaySchedules({
                  ...paySchedules,
                  yours: {...paySchedules.yours, lastPaydate: e.target.value}
                })}
              />
              <small>System calculates next payday automatically</small>
            </div>
            <div className="form-group">
              <label>Primary Bank Split (80%)</label>
              <select
                value={paySchedules.yours.bankSplit?.remainder?.bank || 'BofA'}
                onChange={(e) => setPaySchedules({
                  ...paySchedules,
                  yours: {
                    ...paySchedules.yours,
                    bankSplit: {
                      ...paySchedules.yours.bankSplit,
                      remainder: {bank: e.target.value}
                    }
                  }
                })}
              >
                <option value="BofA">Bank of America</option>
                <option value="USAA">USAA</option>
              </select>
            </div>
            <div className="form-group">
              <label>Secondary Bank Split (20%)</label>
              <select
                value={paySchedules.yours.bankSplit?.fixedAmount?.bank || 'SoFi'}
                onChange={(e) => setPaySchedules({
                  ...paySchedules,
                  yours: {
                    ...paySchedules.yours,
                    bankSplit: {
                      ...paySchedules.yours.bankSplit,
                      fixedAmount: {
                        ...paySchedules.yours.bankSplit?.fixedAmount,
                        bank: e.target.value
                      }
                    }
                  }
                })}
              >
                <option value="SoFi">SoFi</option>
                <option value="USAA">USAA</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tile 3: Spouse Pay Schedule */}
        <div className="settings-tile">
          <h3>💳 Spouse Pay Schedule (15th & 30th)</h3>
          <div className="tile-content">
            <div className="form-group">
              <label>Pay Amount</label>
              <input
                type="number"
                value={paySchedules.spouse.amount}
                onChange={(e) => setPaySchedules({
                  ...paySchedules,
                  spouse: {...paySchedules.spouse, amount: e.target.value}
                })}
                placeholder="3000.00"
              />
            </div>
            <div className="pay-schedule-note">
              <p><strong>Automatic Schedule:</strong></p>
              <p>• Pays on the 15th and 30th of each month</p>
              <p>• Friday adjustment rule applies for weekends</p>
              <p>• System calculates next payday automatically</p>
            </div>
          </div>
        </div>

        {/* Tile 4: Bank Accounts */}
        <div className="settings-tile">
          <h3>🏦 Bank Accounts</h3>
          <div className="tile-content">
            {Object.entries(bankAccounts).map(([key, account]) => (
              <div key={key} className="form-group">
                <label>{account.name} ({account.type})</label>
                <input
                  type="number"
                  value={account.balance}
                  onChange={(e) => setBankAccounts({
                    ...bankAccounts,
                    [key]: {...account, balance: e.target.value}
                  })}
                  placeholder="0.00"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Tile 5: Recurring Bills */}
        <div className="settings-tile bills-tile">
          <h3>📄 Recurring Bills</h3>
          <div className="tile-content">
            
            {/* CSV Upload Section */}
            <div className="csv-upload-section">
              <label>Import from CSV</label>
              <input
                type="file"
                accept=".csv"
                onChange={handleCSVUpload}
              />
              <small>CSV should have: Name, Amount, Due Date columns</small>
            </div>

            {/* CSV Preview */}
            {csvPreview.length > 0 && (
              <div className="csv-preview">
                <h4>Preview ({csvPreview.length} bills found):</h4>
                <div className="preview-list">
                  {csvPreview.slice(0, 3).map((bill, index) => (
                    <div key={index} className="preview-item">
                      {bill.name} - ${bill.amount} - Due: {bill.dueDate}
                    </div>
                  ))}
                  {csvPreview.length > 3 && <div>...and {csvPreview.length - 3} more</div>}
                </div>
                <button onClick={importCSVBills} className="import-btn">
                  Import All Bills
                </button>
              </div>
            )}

            {/* Current Bills */}
            <div className="bills-list">
              {bills.map((bill, index) => (
                <div key={index} className="bill-row">
                  <input
                    type="text"
                    value={bill.name}
                    onChange={(e) => updateBill(index, 'name', e.target.value)}
                    placeholder="Bill name"
                  />
                  <input
                    type="number"
                    value={bill.amount}
                    onChange={(e) => updateBill(index, 'amount', e.target.value)}
                    placeholder="Amount"
                  />
                  <input
                    type="date"
                    value={bill.dueDate}
                    onChange={(e) => updateBill(index, 'dueDate', e.target.value)}
                  />
                  <select
                    value={bill.recurrence}
                    onChange={(e) => updateBill(index, 'recurrence', e.target.value)}
                  >
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                    <option value="bi-weekly">Bi-weekly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annually">Annually</option>
                  </select>
                  <button onClick={() => removeBill(index)} className="remove-btn">
                    ✕
                  </button>
                </div>
              ))}
            </div>
            
            <button onClick={addBill} className="add-bill-btn">
              + Add Bill
            </button>
          </div>
        </div>

        {/* Tile 6: Spending Preferences */}
        <div className="settings-tile">
          <h3>🎯 Spending Preferences</h3>
          <div className="tile-content">
            <div className="form-group">
              <label>Safety Buffer</label>
              <input
                type="number"
                value={preferences.safetyBuffer}
                onChange={(e) => setPreferences({
                  ...preferences,
                  safetyBuffer: parseInt(e.target.value)
                })}
                placeholder="200"
              />
              <small>Emergency cushion amount</small>
            </div>
            <div className="form-group">
              <label>Weekly Essentials</label>
              <input
                type="number"
                value={preferences.weeklyEssentials}
                onChange={(e) => setPreferences({
                  ...preferences,
                  weeklyEssentials: parseInt(e.target.value)
                })}
                placeholder="150"
              />
              <small>Groceries, gas, basic needs per week</small>
            </div>
            
            <button 
              onClick={saveSettings} 
              disabled={saving}
              className="save-btn"
            >
              {saving ? 'Saving...' : '💾 Save Settings'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Settings;