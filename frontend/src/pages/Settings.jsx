import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { PayCycleCalculator } from '../utils/PayCycleCalculator';
import { parseLocalDate, formatToLocalISOString } from '../utils/dateUtils';
import './Settings.css';

const Settings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  
  const [personalInfo, setPersonalInfo] = useState({
    yourName: '',
    spouseName: ''
  });

  const [paySchedules, setPaySchedules] = useState({
    yours: {
      type: 'bi-weekly',
      amount: '',
      lastPaydate: '',
      bankSplit: {
        fixedAmount: { bank: 'SoFi', amount: '400' },
        remainder: { bank: 'Bank of America' }
      }
    },
    spouse: {
      type: 'bi-monthly',
      amount: '',
      dates: [15, 30]
    }
  });

  const [bankAccounts, setBankAccounts] = useState({
    bofa: { name: 'Bank of America', type: 'Checking', balance: '' },
    sofi: { name: 'SoFi', type: 'Savings', balance: '' },
    usaa: { name: 'USAA', type: 'Checking', balance: '' },
    cap1: { name: 'Capital One', type: 'Credit', balance: '' }
  });

  const [bills, setBills] = useState([]);

  const [preferences, setPreferences] = useState({
    safetyBuffer: 200,
    weeklyEssentials: 150
  });

  const [nextPaydayOverride, setNextPaydayOverride] = useState('');

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
        setNextPaydayOverride(data.nextPaydayOverride || '');
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      setMessage('Error loading settings');
    } finally {
      setLoading(false);
    }
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
        nextPaydayOverride,
        lastUpdated: new Date().toISOString()
      };

      await setDoc(doc(db, 'users', 'steve-colburn', 'settings', 'personal'), settingsData);

      // Use override date if provided, otherwise calculate next payday
      let nextPaydayInfo;
      if (nextPaydayOverride) {
        const overrideDate = new Date(nextPaydayOverride);
        const today = new Date();
        const daysUntil = Math.ceil((overrideDate - today) / (1000 * 60 * 60 * 24));
        nextPaydayInfo = {
          date: nextPaydayOverride,
          daysUntil: daysUntil,
          source: "manual_override",
          amount: 0
        };
      } else {
        nextPaydayInfo = PayCycleCalculator.calculateNextPayday(
          paySchedules.yours,
          paySchedules.spouse
        );
      }

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

  // Fixed Add Bill function
  const addBill = () => {
    console.log('Adding new bill...'); // Debug log
    const newBill = { 
      name: '', 
      amount: '', 
      dueDate: '', 
      recurrence: 'monthly' 
    };
    setBills(prevBills => [...prevBills, newBill]);
  };

  const updateBill = (index, field, value) => {
    setBills(prevBills => {
      const updatedBills = [...prevBills];
      updatedBills[index] = { ...updatedBills[index], [field]: value };
      return updatedBills;
    });
  };

  const removeBill = (index) => {
    setBills(prevBills => prevBills.filter((_, i) => i !== index));
  };

  const handleCSVUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
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

        setBills(prevBills => [...prevBills, ...processedBills]);
        setMessage(`Imported ${processedBills.length} bills from CSV`);
      } catch (error) {
        console.error('CSV parsing error:', error);
        setMessage('Error parsing CSV file');
      }
    };

    reader.readAsText(file);
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
        return formatToLocalISOString(nextMonth);
      } else {
        return formatToLocalISOString(thisMonth);
      }
    }
    
    // Use parseLocalDate to avoid timezone issues
    const date = parseLocalDate(dateInput);
    if (date && !isNaN(date.getTime())) {
      return formatToLocalISOString(date);
    }
    
    return dateInput;
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
                placeholder="1883.81"
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
              <small>Used for next payday calculation</small>
            </div>
            <div className="pay-split-info">
              <h4>SoFi Fixed Amount (Early Deposit)</h4>
              <input
                type="number"
                value={paySchedules.yours.bankSplit.fixedAmount.amount}
                onChange={(e) => setPaySchedules({
                  ...paySchedules,
                  yours: {
                    ...paySchedules.yours,
                    bankSplit: {
                      ...paySchedules.yours.bankSplit,
                      fixedAmount: {...paySchedules.yours.bankSplit.fixedAmount, amount: e.target.value}
                    }
                  }
                })}
                placeholder="400.00"
              />
              <small>Deposits to SoFi 2 days before payday</small>
              
              <h4>Remainder Bank</h4>
              <select
                value={paySchedules.yours.bankSplit.remainder.bank}
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
                <option value="Bank of America">Bank of America</option>
                <option value="USAA">USAA</option>
                <option value="Capital One">Capital One</option>
              </select>
              <small>Gets remainder on actual payday</small>
            </div>
          </div>
        </div>

        {/* Tile 3: Spouse Pay Schedule */}
        <div className="settings-tile">
          <h3>💝 Spouse Pay Schedule (15th & 30th)</h3>
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
                placeholder="1851.04"
              />
            </div>
            <div className="automatic-schedule">
              <h4>Automatic Schedule</h4>
              <p>• Pays on the 15th and 30th of each month</p>
              <p>• Friday adjustment rule applies for weekends</p>
              <p>• System calculates next payday automatically</p>
            </div>
          </div>
        </div>

        {/* Tile 4: Spending Preferences */}
        <div className="settings-tile">
          <h3>💡 Spending Preferences</h3>
          <div className="tile-content">
            <div className="form-group">
              <label>Next Payday Date (Override)</label>
              <input
                type="date"
                value={nextPaydayOverride}
                onChange={(e) => setNextPaydayOverride(e.target.value)}
                placeholder="Override calculated payday"
              />
              <small>Leave blank to use automatic calculation. Set to 2025-09-30 to fix current issue.</small>
            </div>
            <div className="form-group">
              <label>Safety Buffer</label>
              <input
                type="number"
                value={preferences.safetyBuffer}
                onChange={(e) => setPreferences({...preferences, safetyBuffer: parseInt(e.target.value)})}
                placeholder="200"
              />
              <small>Emergency cushion amount</small>
            </div>
            <div className="form-group">
              <label>Weekly Essentials</label>
              <input
                type="number"
                value={preferences.weeklyEssentials}
                onChange={(e) => setPreferences({...preferences, weeklyEssentials: parseInt(e.target.value)})}
                placeholder="150"
              />
              <small>Groceries, gas, basic needs per week</small>
            </div>
            <button 
              onClick={saveSettings} 
              disabled={saving}
              className="save-btn"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>

        {/* Tile 5: Bank Accounts */}
        <div className="settings-tile">
          <h3>🏦 Bank Accounts</h3>
          <div className="tile-content">
            {Object.entries(bankAccounts).map(([key, account]) => (
              <div key={key} className="form-group">
                <label>{account.name} ({account.type})</label>
                <input
                  type="number"
                  step="0.01"
                  value={account.balance}
                  onChange={(e) => setBankAccounts({
                    ...bankAccounts,
                    [key]: {...account, balance: e.target.value}
                  })}
                  placeholder="Current balance"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Tile 6: Recurring Bills - Made Larger with Working Add Button */}
        <div className="settings-tile bills-tile">
          <h3>📄 Recurring Bills</h3>
          <div className="tile-content">
            
            {/* CSV Upload Section */}
            <div className="csv-upload-section">
              <h4>Import from CSV</h4>
              <input
                type="file"
                accept=".csv"
                onChange={handleCSVUpload}
                className="csv-input"
              />
              <small>CSV format: Bill Name, Amount, Due Date</small>
            </div>

            {/* Add Bill Section with Working Button */}
            <div className="add-bill-section">
              <h4>Add Bill</h4>
              <button 
                type="button"
                onClick={addBill} 
                className="add-bill-btn"
              >
                + Add New Bill
              </button>
            </div>

            {/* Bills List with Large, Readable Inputs */}
            <div className="bills-list">
              {bills.map((bill, index) => (
                <div key={index} className="bill-row">
                  <input
                    type="text"
                    value={bill.name || ''}
                    onChange={(e) => updateBill(index, 'name', e.target.value)}
                    placeholder="Bill name"
                    className="bill-name-input"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={bill.amount || ''}
                    onChange={(e) => updateBill(index, 'amount', e.target.value)}
                    placeholder="Amount"
                    className="bill-amount-input"
                  />
                  <input
                    type="date"
                    value={bill.dueDate || ''}
                    onChange={(e) => updateBill(index, 'dueDate', e.target.value)}
                    className="bill-date-input"
                  />
                  <select
                    value={bill.recurrence || 'monthly'}
                    onChange={(e) => updateBill(index, 'recurrence', e.target.value)}
                    className="bill-recurrence-select"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                    <option value="bi-weekly">Bi-weekly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annually">Annually</option>
                    <option value="one-time">One-time</option>
                  </select>
                  <button 
                    type="button"
                    onClick={() => removeBill(index)} 
                    className="remove-btn"
                  >
                    Remove
                  </button>
                </div>
              ))}
              
              {bills.length === 0 && (
                <div className="no-bills-message">
                  <p>No bills added yet. Click "Add New Bill" to start.</p>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Settings;