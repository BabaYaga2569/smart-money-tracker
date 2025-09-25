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

  // Pay Schedule Information
  const [paySchedule, setPaySchedule] = useState({
    yourPayAmount: '',
    lastPayDate: '', // For dynamic calculation
    sofiFixedAmount: '400', // Fixed $400 to SoFi (2 days early)
    remainderBank: 'Bank of America', // Remainder goes to BofA on payday
    spousePayAmount: ''
  });

  // Bank Accounts
  const [bankAccounts, setBankAccounts] = useState({
    bofa: { name: 'Bank of America', type: 'Checking', balance: '' },
    sofi: { name: 'SoFi', type: 'Savings', balance: '' },
    usaa: { name: 'USAA', type: 'Checking', balance: '' },
    cap1: { name: 'Capital One', type: 'Credit', balance: '' }
  });

  // Bills
  const [bills, setBills] = useState([]);
  const [newBill, setNewBill] = useState({
    name: '',
    amount: '',
    dueDate: '',
    recurrence: 'monthly'
  });

  // Preferences
  const [preferences, setPreferences] = useState({
    safetyBuffer: 200,
    weeklyEssentials: 150
  });

  // CSV Upload State
  const [csvPreview, setCsvPreview] = useState([]);
  const [showPreview, setShowPreview] = useState(false);

  // Load settings from Firebase
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
        
        if (data.personalInfo) setPersonalInfo(data.personalInfo);
        if (data.paySchedules) {
          setPaySchedule({
            yourPayAmount: data.paySchedules.yours?.amount || '',
            lastPayDate: data.paySchedules.yours?.lastPaydate || '',
            sofiFixedAmount: data.paySchedules.yours?.bankSplit?.fixedAmount?.amount || '400',
            remainderBank: data.paySchedules.yours?.bankSplit?.remainder?.bank || 'Bank of America',
            spousePayAmount: data.paySchedules.spouse?.amount || ''
          });
        }
        if (data.bankAccounts) setBankAccounts(data.bankAccounts);
        if (data.bills) setBills(data.bills);
        if (data.preferences) setPreferences(data.preferences);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      setMessage('Error loading settings');
    } finally {
      setLoading(false);
    }
  };

  // Handle CSV file upload
  const handleCSVUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        setMessage('CSV file must have a header row and at least one data row');
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

      const nameColumn = headers.find(h => 
        h.includes('name') || h.includes('bill') || h.includes('payee')
      );
      const amountColumn = headers.find(h => 
        h.includes('amount') || h.includes('cost') || h.includes('payment')
      );
      const dateColumn = headers.find(h => 
        h.includes('date') || h.includes('due') || h.includes('day')
      );

      if (!nameColumn || !amountColumn) {
        setMessage('CSV must have columns for bill name and amount');
        return;
      }

      const processedBills = data.map(row => ({
        name: row[nameColumn] || '',
        amount: parseFloat(row[amountColumn]) || 0,
        dueDate: dateColumn ? smartFormatDate(row[dateColumn]) : '',
        recurrence: 'monthly'
      })).filter(bill => bill.name && bill.amount > 0);

      setCsvPreview(processedBills);
      setShowPreview(true);
      setMessage(`Found ${processedBills.length} bills in CSV file`);
    };

    reader.readAsText(file);
  };

  const smartFormatDate = (dateInput) => {
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

  const importBillsFromCSV = () => {
    setBills(csvPreview);
    setShowPreview(false);
    setCsvPreview([]);
    setMessage('Bills imported successfully!');
  };

  const addBill = () => {
    if (newBill.name && newBill.amount) {
      setBills([...bills, { ...newBill }]);
      setNewBill({ name: '', amount: '', dueDate: '', recurrence: 'monthly' });
    }
  };

  const removeBill = (index) => {
    setBills(bills.filter((_, i) => i !== index));
  };

  const updateBill = (index, field, value) => {
    const updatedBills = [...bills];
    updatedBills[index][field] = value;
    setBills(updatedBills);
  };

  // Save settings
  const saveSettings = async () => {
    setSaving(true);
    setMessage('');

    try {
      const settingsData = {
        personalInfo,
        paySchedules: {
          yours: {
            type: "bi-weekly",
            amount: paySchedule.yourPayAmount,
            lastPaydate: paySchedule.lastPayDate,
            bankSplit: {
              fixedAmount: { 
                bank: "SoFi", 
                amount: paySchedule.sofiFixedAmount,
                note: "Deposits 2 days early"
              },
              remainder: { 
                bank: paySchedule.remainderBank,
                note: "Remainder on payday"
              }
            }
          },
          spouse: {
            type: "bi-monthly", 
            amount: paySchedule.spousePayAmount,
            dates: [15, 30],
            note: "15th and 30th of each month, adjusted to Friday if weekend"
          }
        },
        bankAccounts,
        bills: bills.filter(bill => bill.name && bill.amount),
        preferences,
        lastUpdated: new Date().toISOString()
      };

      await setDoc(doc(db, 'users', 'steve-colburn', 'settings', 'personal'), settingsData);
      await updateFinancialData(settingsData);
      setMessage('Settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage('Error saving settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Update financial data using PayCycleCalculator
  const updateFinancialData = async (settings) => {
    try {
      const totalBalance = Object.values(settings.bankAccounts)
        .reduce((sum, account) => sum + (parseFloat(account.balance) || 0), 0);

      // Use PayCycleCalculator for dynamic payday calculation
      let nextPaydayInfo = null;
      if (settings.paySchedules.yours.lastPaydate) {
        const yoursSchedule = {
          lastPaydate: settings.paySchedules.yours.lastPaydate,
          amount: settings.paySchedules.yours.amount
        };
        const spouseSchedule = {
          amount: settings.paySchedules.spouse.amount
        };
        
        nextPaydayInfo = PayCycleCalculator.calculateNextPayday(yoursSchedule, spouseSchedule);
      }

      const payCycleData = nextPaydayInfo ? {
        date: nextPaydayInfo.date,
        daysUntilPay: nextPaydayInfo.daysUntil,
        source: nextPaydayInfo.source,
        amount: nextPaydayInfo.amount
      } : {
        date: new Date().toISOString().split('T')[0],
        daysUntilPay: 0,
        source: "unknown",
        amount: 0
      };

      await setDoc(doc(db, 'users', 'steve-colburn', 'financial', 'payCycle'), payCycleData);
      await setDoc(doc(db, 'users', 'steve-colburn', 'financial', 'accounts'), {
        total: totalBalance,
        lastUpdated: new Date().toISOString()
      });

    } catch (error) {
      console.error('Error updating financial data:', error);
    }
  };

  if (loading) {
    return <div className="settings-container">Loading settings...</div>;
  }

  return (
    <div className="settings-container">
      <div className="page-header">
        <h2>⚙️ Financial Settings</h2>
        <p>Configure your pay schedules, bank accounts, and bills</p>
      </div>
      
      {message && (
        <div className={`message ${message.includes('Error') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

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

        {/* Tile 2: Your Pay Schedule (Bi-Weekly) - Updated */}
        <div className="settings-tile">
          <h3>💰 Your Pay Schedule (Bi-Weekly)</h3>
          <div className="tile-content">
            <div className="form-group">
              <label>Pay Amount</label>
              <input
                type="number"
                value={paySchedule.yourPayAmount}
                onChange={(e) => setPaySchedule({...paySchedule, yourPayAmount: e.target.value})}
                placeholder="Total bi-weekly amount"
              />
            </div>
            <div className="form-group">
              <label>Last Pay Date</label>
              <input
                type="date"
                value={paySchedule.lastPayDate}
                onChange={(e) => setPaySchedule({...paySchedule, lastPayDate: e.target.value})}
              />
              <small>Used for next payday calculation</small>
            </div>
            <div className="form-group">
              <label>SoFi Fixed Amount (Early Deposit)</label>
              <input
                type="number"
                value={paySchedule.sofiFixedAmount}
                onChange={(e) => setPaySchedule({...paySchedule, sofiFixedAmount: e.target.value})}
                placeholder="400"
              />
              <small>Deposits to SoFi 2 days before payday</small>
            </div>
            <div className="form-group">
              <label>Remainder Bank</label>
              <select
                value={paySchedule.remainderBank}
                onChange={(e) => setPaySchedule({...paySchedule, remainderBank: e.target.value})}
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
                value={paySchedule.spousePayAmount}
                onChange={(e) => setPaySchedule({...paySchedule, spousePayAmount: e.target.value})}
                placeholder="Bi-monthly amount"
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

        {/* Tile 4: Spending Preferences - Moved up */}
        <div className="settings-tile">
          <h3>💡 Spending Preferences</h3>
          <div className="tile-content">
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
                  value={account.balance}
                  onChange={(e) => setBankAccounts({
                    ...bankAccounts,
                    [key]: { ...account, balance: e.target.value }
                  })}
                  placeholder="Current balance"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Tile 6: Recurring Bills - Made larger */}
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

            {/* CSV Preview */}
            {showPreview && (
              <div className="csv-preview">
                <h4>Preview Bills:</h4>
                <div className="preview-bills">
                  {csvPreview.map((bill, index) => (
                    <div key={index} className="preview-bill">
                      <span>{bill.name}</span>
                      <span>${bill.amount.toFixed(2)}</span>
                      <span>Due: {bill.dueDate}</span>
                    </div>
                  ))}
                </div>
                <div className="preview-actions">
                  <button onClick={importBillsFromCSV} className="import-btn">
                    Import All Bills
                  </button>
                  <button onClick={() => setShowPreview(false)} className="cancel-btn">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Add New Bill */}
            <div className="add-bill-section">
              <h4>Add Bill</h4>
              <div className="add-bill-form">
                <input
                  type="text"
                  value={newBill.name}
                  onChange={(e) => setNewBill({...newBill, name: e.target.value})}
                  placeholder="Bill name"
                />
                <input
                  type="number"
                  value={newBill.amount}
                  onChange={(e) => setNewBill({...newBill, amount: e.target.value})}
                  placeholder="Amount"
                />
                <input
                  type="date"
                  value={newBill.dueDate}
                  onChange={(e) => setNewBill({...newBill, dueDate: e.target.value})}
                />
                <select
                  value={newBill.recurrence}
                  onChange={(e) => setNewBill({...newBill, recurrence: e.target.value})}
                >
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="bi-weekly">Bi-weekly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="one-time">One-time</option>
                </select>
                <button onClick={addBill} className="add-btn">Add Bill</button>
              </div>
            </div>

            {/* Bills List */}
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
                    value={bill.recurrence || 'monthly'}
                    onChange={(e) => updateBill(index, 'recurrence', e.target.value)}
                  >
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                    <option value="bi-weekly">Bi-weekly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="one-time">One-time</option>
                  </select>
                  <button onClick={() => removeBill(index)} className="remove-btn">
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Settings;